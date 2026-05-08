use crate::{
    math::{reject_if_insufficient_launch_funds, LAUNCH_FEE_LAMPORTS},
    state::{
        global_config::assert_global_config_not_paused, BondingCurveAccount, CURVE_SEED,
        TOKEN_DECIMALS, TREASURY_SEED, VAULT_SEED,
    },
    token_2022::{assert_canonical_transfer_hook_extension, initialize_mint2, TOKEN_2022_ID},
};
use pinocchio::{
    cpi::{Seed, Signer},
    error::ProgramError,
    sysvars::rent::{ACCOUNT_STORAGE_OVERHEAD, DEFAULT_LAMPORTS_PER_BYTE},
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer};
use shared::geppetto::{
    assert_owned_by, assert_pda, assert_program_id, assert_signer, assert_writable,
};

const MAX_PERMITTED_DATA_LENGTH: u64 = 10 * 1024 * 1024;

pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if !instruction_data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }
    if accounts.len() < 8 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let (pda_accounts, rest) = accounts.split_at_mut(4);
    let (curve_account, pda_rest) = pda_accounts.split_at_mut(1);
    let curve = &mut curve_account[0];
    let (vault_account, treasury_account) = pda_rest.split_at_mut(1);
    let vault = &mut vault_account[0];
    let (treasury_account, config_account) = treasury_account.split_at_mut(1);
    let treasury = &mut treasury_account[0];
    let global_config = &config_account[0];
    let mint = &rest[0];
    let payer = &rest[1];
    let token_program = &rest[2];
    let system_program = &rest[3];

    assert_writable(curve)?;
    assert_pda(curve, &[CURVE_SEED, mint.address().as_ref()], program_id)?;
    assert_writable(vault)?;
    assert_pda(vault, &[VAULT_SEED, mint.address().as_ref()], program_id)?;
    assert_writable(treasury)?;
    assert_pda(treasury, &[TREASURY_SEED], program_id)?;
    assert_global_config_not_paused(global_config, program_id)?;
    assert_writable(mint)?;
    assert_owned_by(mint, &TOKEN_2022_ID)?;
    assert_writable(payer)?;
    assert_signer(payer)?;
    assert_program_id(token_program, &TOKEN_2022_ID)?;
    assert_program_id(system_program, &pinocchio_system::ID)?;

    if curve.data_len() != 0 || vault.data_len() != 0 {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    if treasury.lamports() > 0
        && !treasury.owned_by(program_id)
        && !treasury.owned_by(&pinocchio_system::ID)
    {
        return Err(ProgramError::InvalidAccountData);
    }
    if treasury.data_len() != 0 {
        return Err(ProgramError::InvalidAccountData);
    }

    let curve_rent = rent_exempt_lamports(BondingCurveAccount::LEN)?;
    let vault_rent = rent_exempt_lamports(0)?;
    reject_if_insufficient_launch_funds(payer.lamports(), curve_rent, vault_rent)?;

    let curve_seeds = [Seed::from(CURVE_SEED), Seed::from(mint.address().as_ref())];
    let curve_signers = [Signer::from(&curve_seeds)];
    allocate_pda(
        curve,
        BondingCurveAccount::LEN,
        program_id,
        payer,
        &curve_signers,
    )?;

    let vault_seeds = [Seed::from(VAULT_SEED), Seed::from(mint.address().as_ref())];
    let vault_signers = [Signer::from(&vault_seeds)];
    allocate_pda(vault, 0, &pinocchio_system::ID, payer, &vault_signers)?;

    let treasury_seeds = [Seed::from(TREASURY_SEED)];
    let treasury_signers = [Signer::from(&treasury_seeds)];
    fund_treasury(treasury, program_id, payer, &treasury_signers)?;

    assert_owned_by(curve, program_id)?;
    assert_owned_by(vault, &pinocchio_system::ID)?;
    assert_owned_by(treasury, program_id)?;

    assert_canonical_transfer_hook_extension(mint, curve.address())?;
    initialize_mint2(mint, TOKEN_DECIMALS, curve.address())?;

    let state = BondingCurveAccount::initialized(*mint.address());
    let mut data = curve.try_borrow_mut()?;
    state.pack(&mut data[..BondingCurveAccount::LEN])
}

fn fund_treasury(
    treasury: &mut AccountView,
    program_id: &Address,
    payer: &AccountView,
    signers: &[Signer],
) -> ProgramResult {
    if treasury.lamports() == 0 {
        return CreateAccount {
            from: payer,
            to: treasury,
            lamports: LAUNCH_FEE_LAMPORTS,
            space: 0,
            owner: program_id,
        }
        .invoke_signed(signers);
    }
    Transfer {
        from: payer,
        to: treasury,
        lamports: LAUNCH_FEE_LAMPORTS,
    }
    .invoke()?;

    if treasury.owned_by(&pinocchio_system::ID) {
        Assign {
            account: treasury,
            owner: program_id,
        }
        .invoke_signed(signers)?;
    }

    Ok(())
}

fn allocate_pda(
    account: &mut AccountView,
    space: usize,
    owner: &Address,
    payer: &AccountView,
    signers: &[Signer],
) -> ProgramResult {
    let lamports = rent_exempt_lamports(space)?;
    if account.lamports() == 0 {
        return CreateAccount {
            from: payer,
            to: account,
            lamports,
            space: space as u64,
            owner,
        }
        .invoke_signed(signers);
    }
    let required_lamports = lamports.saturating_sub(account.lamports());
    if required_lamports > 0 {
        Transfer {
            from: payer,
            to: account,
            lamports: required_lamports,
        }
        .invoke()?;
    }
    Allocate {
        account,
        space: space as u64,
    }
    .invoke_signed(signers)?;
    Assign { account, owner }.invoke_signed(signers)
}

fn rent_exempt_lamports(space: usize) -> Result<u64, ProgramError> {
    let space = u64::try_from(space).map_err(|_| ProgramError::ArithmeticOverflow)?;
    if space > MAX_PERMITTED_DATA_LENGTH {
        return Err(ProgramError::InvalidArgument);
    }
    space
        .checked_add(ACCOUNT_STORAGE_OVERHEAD)
        .and_then(|bytes| bytes.checked_mul(DEFAULT_LAMPORTS_PER_BYTE))
        .ok_or(ProgramError::ArithmeticOverflow)
}
