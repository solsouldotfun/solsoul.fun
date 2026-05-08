use crate::{
    math::{quote_sell, CurveError},
    soul_generator_cpi::{generate_soul_signed, SOUL_GENERATOR_ID, SOUL_SEED},
    state::{
        global_config::assert_global_config_not_paused, BondingCurveAccount, CURVE_SEED, VAULT_SEED,
    },
    token_2022::{burn, TOKEN_2022_ID},
};
use pinocchio::{
    cpi::{Seed, Signer},
    error::ProgramError,
    sysvars::{clock::Clock, Sysvar},
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::Transfer;
use shared::{
    boundary::{balance_for_whole_units, crossed_down_boundaries},
    geppetto::{
        assert_owned_by, assert_pda, assert_program_id, assert_signer, assert_writable,
        GeppettoError,
    },
};

pub const SELL_ARGS_LEN: usize = 16;
const ASSOCIATED_TOKEN_PROGRAM_ID: Address = Address::new_from_array(pinocchio_pubkey::pubkey!(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
));
const RECEIPT_REGISTRY_SEED: &[u8] = b"receipt_registry";
const RECEIPT_SEED: &[u8] = b"receipt";
const RECEIPT_REGISTRY_LEN: usize = 88;
const RECEIPT_REGISTRY_CLAIMANT_OFFSET: usize = 0;
const RECEIPT_REGISTRY_TOKEN_MINT_OFFSET: usize = RECEIPT_REGISTRY_CLAIMANT_OFFSET + 32;
const RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET: usize = RECEIPT_REGISTRY_TOKEN_MINT_OFFSET + 32;
const RECEIPT_ACCOUNT_LEN: usize = 161;
const RECEIPT_CLAIMANT_OFFSET: usize = 32;
const RECEIPT_TOKEN_MINT_OFFSET: usize = 64;
const RECEIPT_SEQUENCE_OFFSET: usize = 128;
const RECEIPT_BOUND_BOUNDARY_OFFSET: usize = 152;
const RECEIPT_LIFECYCLE_STATE_OFFSET: usize = 160;
const RECEIPT_STATE_ACTIVE: u8 = 1;
const TOKEN_ACCOUNT_MINT_OFFSET: usize = 0;
const TOKEN_ACCOUNT_OWNER_OFFSET: usize = 32;
const TOKEN_ACCOUNT_AMOUNT_OFFSET: usize = 64;
const TOKEN_ACCOUNT_AMOUNT_END: usize = TOKEN_ACCOUNT_AMOUNT_OFFSET + 8;
const TOKEN_ACCOUNT_MIN_LEN: usize = 165;

pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.len() != SELL_ARGS_LEN {
        return Err(ProgramError::InvalidInstructionData);
    }
    if accounts.len() < 8 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let (curve_account, rest) = accounts.split_at_mut(1);
    let curve = &mut curve_account[0];
    let vault = &rest[0];
    let mint = &rest[1];
    let seller_token_account = &rest[2];
    let seller = &rest[3];
    let token_program = &rest[4];
    let system_program = &rest[5];
    let global_config = &rest[6];
    let remaining = &rest[7..];

    // Detect optional Soul accounts.
    // Accounts layout when Soul is present:
    //   7: soul, 8: soul_generator_program, 9: recent_blockhash_sysvar, 10: soul_global_config
    let has_soul_accounts = remaining.len() >= 4 && remaining[1].address() == &SOUL_GENERATOR_ID;
    let (
        soul,
        soul_generator_program,
        recent_blockhash_sysvar,
        soul_global_config,
        hard_binding_accounts,
    ) = if has_soul_accounts {
        (
            Some(&remaining[0]),
            Some(&remaining[1]),
            Some(&remaining[2]),
            Some(&remaining[3]),
            &remaining[4..],
        )
    } else {
        (None, None, None, None, remaining)
    };

    assert_writable(curve)?;
    assert_owned_by(curve, program_id)?;
    assert_writable(vault)?;
    assert_pda(vault, &[VAULT_SEED, mint.address().as_ref()], program_id)?;
    assert_writable(mint)?;
    assert_owned_by(mint, &TOKEN_2022_ID)?;
    assert_writable(seller_token_account)?;
    assert_owned_by(seller_token_account, &TOKEN_2022_ID)?;
    assert_writable(seller)?;
    assert_signer(seller)?;
    assert_program_id(token_program, &TOKEN_2022_ID)?;
    assert_program_id(system_program, &pinocchio_system::ID)?;
    assert_global_config_not_paused(global_config, program_id)?;

    if let (Some(soul), Some(soul_generator_program)) = (soul, soul_generator_program) {
        assert_writable(soul)?;
        assert_owned_by(soul, &SOUL_GENERATOR_ID)?;
        assert_pda(
            soul,
            &[SOUL_SEED, mint.address().as_ref()],
            &SOUL_GENERATOR_ID,
        )?;
        assert_program_id(soul_generator_program, &SOUL_GENERATOR_ID)?;
    }

    let mut token_in = [0u8; 8];
    token_in.copy_from_slice(&instruction_data[..8]);
    let token_in = u64::from_le_bytes(token_in);

    let mut min_amount_out = [0u8; 8];
    min_amount_out.copy_from_slice(&instruction_data[8..16]);
    let min_amount_out = u64::from_le_bytes(min_amount_out);

    let mut state = {
        let data = curve.try_borrow()?;
        BondingCurveAccount::unpack(&data[..])?
    };

    assert_pda(curve, &[CURVE_SEED, state.mint.as_ref()], program_id)?;
    if mint.address() != &state.mint {
        return Err(ProgramError::InvalidAccountData);
    }

    let clock = Clock::get()?;
    let current_slot = clock.slot;
    if state.last_interaction_slot == current_slot {
        return Err(CurveError::SameSlotArbitrage.into());
    }

    let quote = quote_sell(
        state.cumulative_sol,
        state.total_minted,
        token_in,
        min_amount_out,
    )?;

    if vault.lamports() < quote.sol_out {
        return Err(CurveError::InsufficientLiquidity.into());
    }

    // ── Hard binding check ───────────────────────────────────────────────
    let seller_pre_balance = read_token_amount(seller_token_account)?;
    let crossing = crossed_down_boundaries(seller_pre_balance, token_in)?;
    if crossing.crossed_down > 0 {
        if hard_binding_accounts.is_empty() {
            return Err(CurveError::HardBindingAccountMissing.into());
        } else {
            let token_account_is_canonical = is_canonical_associated_token_account(
                seller_token_account,
                seller.address(),
                mint.address(),
            )?;
            if !token_account_is_canonical {
                return Err(CurveError::NonCanonicalTokenAccount.into());
            }
            enforce_sell_hard_binding(
                hard_binding_accounts,
                seller.address(),
                mint.address(),
                crossing.post_whole_units,
            )?;
        }
    }

    burn(seller_token_account, mint, seller, token_in)?;

    let vault_signer_seeds = [Seed::from(VAULT_SEED), Seed::from(state.mint.as_ref())];
    let vault_signer = Signer::from(&vault_signer_seeds);

    Transfer {
        from: vault,
        to: seller,
        lamports: quote.sol_out,
    }
    .invoke_signed(&[vault_signer])?;

    state.record_sell(quote.sol_out, token_in)?;
    state.update_interaction_slot(current_slot);

    let mut data = curve.try_borrow_mut()?;
    state.pack(&mut data[..BondingCurveAccount::LEN])?;
    drop(data);

    if let (Some(soul), Some(recent_blockhash_sysvar), Some(soul_global_config)) =
        (soul, recent_blockhash_sysvar, soul_global_config)
    {
        let curve_signer_seeds = [Seed::from(CURVE_SEED), Seed::from(state.mint.as_ref())];
        generate_soul_signed(
            soul,
            curve,
            recent_blockhash_sysvar,
            seller_token_account,
            seller,
            token_in,
            0,
            false,
            soul_global_config,
            &curve_signer_seeds,
        )?;
    }

    Ok(())
}

fn read_token_amount(token_account: &AccountView) -> Result<u64, ProgramError> {
    if token_account.data_len() < TOKEN_ACCOUNT_MIN_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    let data = token_account.try_borrow()?;
    let mut amount = [0u8; 8];
    amount.copy_from_slice(&data[TOKEN_ACCOUNT_AMOUNT_OFFSET..TOKEN_ACCOUNT_AMOUNT_END]);
    Ok(u64::from_le_bytes(amount))
}

fn is_canonical_associated_token_account(
    token_account: &AccountView,
    owner: &Address,
    mint: &Address,
) -> Result<bool, ProgramError> {
    let Some((expected, _bump)) = Address::derive_program_address(
        &[owner.as_ref(), TOKEN_2022_ID.as_ref(), mint.as_ref()],
        &ASSOCIATED_TOKEN_PROGRAM_ID,
    ) else {
        return Err(GeppettoError::InvalidSeeds.into());
    };

    let data = token_account.try_borrow()?;
    if data.len() < TOKEN_ACCOUNT_MIN_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    if &data[TOKEN_ACCOUNT_MINT_OFFSET..TOKEN_ACCOUNT_OWNER_OFFSET] != mint.as_ref()
        || &data[TOKEN_ACCOUNT_OWNER_OFFSET..TOKEN_ACCOUNT_AMOUNT_OFFSET] != owner.as_ref()
    {
        return Err(ProgramError::InvalidAccountData);
    }

    Ok(token_account.address() == &expected)
}

fn enforce_sell_hard_binding(
    accounts: &[AccountView],
    seller: &Address,
    mint: &Address,
    post_whole_units: u64,
) -> ProgramResult {
    let (receipt_registry, receipts) = accounts
        .split_first()
        .ok_or(CurveError::HardBindingAccountMissing)?;
    assert_canonical_pda(
        receipt_registry,
        &[RECEIPT_REGISTRY_SEED, seller.as_ref(), mint.as_ref()],
        &SOUL_GENERATOR_ID,
    )?;
    if receipt_registry.data_len() == 0 {
        return Ok(());
    }
    assert_owned_by(receipt_registry, &SOUL_GENERATOR_ID)?;
    if receipt_registry.data_len() < RECEIPT_REGISTRY_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }

    let registry_data = receipt_registry.try_borrow()?;
    if &registry_data[RECEIPT_REGISTRY_CLAIMANT_OFFSET..RECEIPT_REGISTRY_TOKEN_MINT_OFFSET]
        != seller.as_ref()
        || &registry_data
            [RECEIPT_REGISTRY_TOKEN_MINT_OFFSET..RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET]
            != mint.as_ref()
    {
        return Err(CurveError::InvalidReceiptBinding.into());
    }
    let mut active_receipts = [0u8; 8];
    active_receipts.copy_from_slice(
        &registry_data
            [RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET..RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET + 8],
    );
    let active_receipts = u64::from_le_bytes(active_receipts);
    drop(registry_data);

    let post_bound_capacity = balance_for_whole_units(post_whole_units)?;
    for receipt in receipts {
        validate_unaffected_receipt(receipt, seller, mint, post_bound_capacity)?;
    }

    if active_receipts > post_whole_units {
        return Err(CurveError::HardBindingActiveReceipt.into());
    }

    Ok(())
}

fn validate_unaffected_receipt(
    receipt: &AccountView,
    seller: &Address,
    mint: &Address,
    post_bound_capacity: u64,
) -> ProgramResult {
    assert_owned_by(receipt, &SOUL_GENERATOR_ID)?;
    if receipt.data_len() < RECEIPT_ACCOUNT_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    let data = receipt.try_borrow()?;
    if &data[RECEIPT_CLAIMANT_OFFSET..RECEIPT_TOKEN_MINT_OFFSET] != seller.as_ref()
        || &data[RECEIPT_TOKEN_MINT_OFFSET..RECEIPT_SEQUENCE_OFFSET] != mint.as_ref()
        || data[RECEIPT_LIFECYCLE_STATE_OFFSET] != RECEIPT_STATE_ACTIVE
    {
        return Err(CurveError::InvalidReceiptBinding.into());
    }
    let mut sequence = [0u8; 8];
    sequence.copy_from_slice(&data[RECEIPT_SEQUENCE_OFFSET..RECEIPT_SEQUENCE_OFFSET + 8]);
    let sequence = u64::from_le_bytes(sequence);
    let sequence_bytes = sequence.to_le_bytes();
    assert_canonical_pda(
        receipt,
        &[RECEIPT_SEED, &data[0..32], &sequence_bytes],
        &SOUL_GENERATOR_ID,
    )?;

    let mut bound_boundary = [0u8; 8];
    bound_boundary
        .copy_from_slice(&data[RECEIPT_BOUND_BOUNDARY_OFFSET..RECEIPT_BOUND_BOUNDARY_OFFSET + 8]);
    let bound_boundary = u64::from_le_bytes(bound_boundary);
    if bound_boundary > post_bound_capacity {
        return Err(CurveError::HardBindingActiveReceipt.into());
    }

    Ok(())
}

fn assert_canonical_pda<const N: usize>(
    account: &AccountView,
    seeds: &[&[u8]; N],
    program_id: &Address,
) -> ProgramResult {
    let Some((pda, _bump)) = Address::derive_program_address(seeds, program_id) else {
        return Err(GeppettoError::InvalidSeeds.into());
    };
    if account.address() != &pda {
        return Err(GeppettoError::InvalidPda.into());
    }
    Ok(())
}
