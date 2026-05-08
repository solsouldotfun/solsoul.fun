use crate::{
    math::{calculate_lock_fee, quote_buy, CurveError},
    soul_generator_cpi::{generate_soul_signed, SOUL_GENERATOR_ID, SOUL_SEED},
    state::{
        global_config::assert_global_config_not_paused, BondingCurveAccount, CURVE_SEED, VAULT_SEED,
    },
    token_2022::{mint_to_signed, TOKEN_2022_ID},
};
use pinocchio::{
    cpi::Seed,
    error::ProgramError,
    sysvars::{clock::Clock, Sysvar},
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::Transfer;
use shared::geppetto::{
    assert_owned_by, assert_pda, assert_program_id, assert_signer, assert_writable,
};

pub const BUY_ARGS_LEN: usize = 16;

pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.len() != BUY_ARGS_LEN {
        return Err(ProgramError::InvalidInstructionData);
    }
    if accounts.len() < 12 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let (curve_account, rest) = accounts.split_at_mut(1);
    let curve = &mut curve_account[0];
    let vault = &rest[0];
    let mint = &rest[1];
    let buyer_token_account = &rest[2];
    let buyer = &rest[3];
    let token_program = &rest[4];
    let system_program = &rest[5];
    let soul = &rest[6];
    let soul_generator_program = &rest[7];
    let recent_blockhash_sysvar = &rest[8];
    let soul_global_config = &rest[9];
    let global_config = &rest[10];

    assert_writable(curve)?;
    assert_owned_by(curve, program_id)?;
    assert_writable(vault)?;
    assert_pda(vault, &[VAULT_SEED, mint.address().as_ref()], program_id)?;
    assert_writable(mint)?;
    assert_owned_by(mint, &TOKEN_2022_ID)?;
    assert_writable(buyer_token_account)?;
    assert_owned_by(buyer_token_account, &TOKEN_2022_ID)?;
    assert_writable(buyer)?;
    assert_signer(buyer)?;
    assert_program_id(token_program, &TOKEN_2022_ID)?;
    assert_program_id(system_program, &pinocchio_system::ID)?;
    assert_writable(soul)?;
    assert_owned_by(soul, &SOUL_GENERATOR_ID)?;
    assert_pda(
        soul,
        &[SOUL_SEED, mint.address().as_ref()],
        &SOUL_GENERATOR_ID,
    )?;
    assert_program_id(soul_generator_program, &SOUL_GENERATOR_ID)?;
    assert_global_config_not_paused(global_config, program_id)?;

    let mut sol_in = [0u8; 8];
    sol_in.copy_from_slice(&instruction_data[..8]);
    let sol_in = u64::from_le_bytes(sol_in);

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

    state.reject_if_self_deprecated()?;

    let clock = Clock::get()?;
    let current_slot = clock.slot;
    if state.last_interaction_slot == current_slot {
        return Err(CurveError::SameSlotArbitrage.into());
    }

    let lock_fee = calculate_lock_fee(sol_in)?;
    let net_sol_in = sol_in
        .checked_sub(lock_fee)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    let quote = quote_buy(
        state.cumulative_sol,
        state.total_minted,
        net_sol_in,
        min_amount_out,
    )?;

    if lock_fee > 0 {
        Transfer {
            from: buyer,
            to: curve,
            lamports: lock_fee,
        }
        .invoke()?;
    }

    Transfer {
        from: buyer,
        to: vault,
        lamports: net_sol_in,
    }
    .invoke()?;

    let mint_pubkey = state.mint;
    let curve_signer_seeds = [Seed::from(CURVE_SEED), Seed::from(mint_pubkey.as_ref())];
    mint_to_signed(
        mint,
        buyer_token_account,
        curve,
        quote.token_out,
        &curve_signer_seeds,
    )?;

    state.record_buy(net_sol_in, quote.token_out)?;
    state.update_interaction_slot(current_slot);

    let mut data = curve.try_borrow_mut()?;
    state.pack(&mut data[..BondingCurveAccount::LEN])?;
    drop(data);

    generate_soul_signed(
        soul,
        curve,
        recent_blockhash_sysvar,
        buyer_token_account,
        buyer,
        net_sol_in,
        quote.token_out,
        true,
        soul_global_config,
        &curve_signer_seeds,
    )
}
