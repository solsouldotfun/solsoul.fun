use crate::state::global_config::{
    assert_upgrade_authority_for_program, derive_global_config_address_and_bump, GlobalConfig,
    GLOBAL_CONFIG_SEED,
};
use pinocchio::{
    cpi::{Seed, Signer},
    error::ProgramError,
    sysvars::rent::{ACCOUNT_STORAGE_OVERHEAD, DEFAULT_LAMPORTS_PER_BYTE},
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer};
use shared::geppetto::{assert_program_id, assert_signer, assert_writable};

pub const MAX_PERMITTED_DATA_LENGTH: u64 = 10 * 1024 * 1024;

pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    _instruction_data: &[u8],
) -> ProgramResult {
    if accounts.len() < 4 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let (global_config, rest) = accounts.split_at_mut(1);
    let global_config = &mut global_config[0];
    let (authority, rest) = rest.split_at_mut(1);
    let authority = &mut authority[0];
    let programdata = &rest[0];
    let system_program = &rest[1];

    assert_writable(global_config)?;
    assert_writable(authority)?;
    assert_signer(authority)?;
    assert_program_id(system_program, &pinocchio_system::ID)?;
    assert_upgrade_authority_for_program(program_id, authority.address(), programdata)?;

    let (expected_address, bump) = derive_global_config_address_and_bump(program_id);
    if global_config.address() != &expected_address {
        return Err(ProgramError::InvalidSeeds);
    }

    if global_config.data_len() != 0 {
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    let rent = rent_exempt_lamports(GlobalConfig::LEN)?;
    let bump_seed = [bump];
    let seeds = [Seed::from(GLOBAL_CONFIG_SEED), Seed::from(&bump_seed)];
    let signers = [Signer::from(&seeds)];

    allocate_global_config(global_config, program_id, authority, rent, &signers)?;

    let config = GlobalConfig::new(*authority.address());
    let mut data = global_config.try_borrow_mut()?;
    config.pack(&mut data[..GlobalConfig::LEN])
}

fn allocate_global_config(
    global_config: &mut AccountView,
    program_id: &Address,
    payer: &AccountView,
    lamports: u64,
    signers: &[Signer],
) -> ProgramResult {
    if global_config.lamports() == 0 {
        return CreateAccount {
            from: payer,
            to: global_config,
            lamports,
            space: GlobalConfig::LEN as u64,
            owner: program_id,
        }
        .invoke_signed(signers);
    }
    if !global_config.owned_by(&pinocchio_system::ID) {
        return Err(ProgramError::InvalidAccountData);
    }
    let required_lamports = lamports.saturating_sub(global_config.lamports());
    if required_lamports > 0 {
        Transfer {
            from: payer,
            to: global_config,
            lamports: required_lamports,
        }
        .invoke()?;
    }
    Allocate {
        account: global_config,
        space: GlobalConfig::LEN as u64,
    }
    .invoke_signed(signers)?;
    Assign {
        account: global_config,
        owner: program_id,
    }
    .invoke_signed(signers)
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
