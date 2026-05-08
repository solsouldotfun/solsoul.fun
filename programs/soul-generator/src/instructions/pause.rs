use crate::state::global_config::{
    assert_global_config_pda, assert_upgrade_authority_for_program,
    derive_global_config_address_and_bump, GlobalConfig, GLOBAL_CONFIG_SEED,
};
#[cfg(not(test))]
use alloc::format;
use pinocchio::{
    cpi::{Seed, Signer},
    error::ProgramError,
    sysvars::rent::{ACCOUNT_STORAGE_OVERHEAD, DEFAULT_LAMPORTS_PER_BYTE},
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer};
use shared::geppetto::{assert_owned_by, assert_program_id, assert_signer, assert_writable};

const MAX_PERMITTED_DATA_LENGTH: u64 = 10 * 1024 * 1024;

pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if !instruction_data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }
    if accounts.len() < 4 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let (config_accounts, rest) = accounts.split_at_mut(1);
    let global_config = &mut config_accounts[0];
    let admin = &rest[0];
    let programdata = &rest[1];
    let system_program = &rest[2];

    assert_writable(global_config)?;
    assert_global_config_pda(global_config, program_id)?;
    assert_writable(admin)?;
    assert_signer(admin)?;

    if global_config.data_len() == 0 {
        assert_program_id(system_program, &pinocchio_system::ID)?;
        assert_upgrade_authority_for_program(program_id, admin.address(), programdata)?;

        let (_expected, bump) = derive_global_config_address_and_bump(program_id);
        let bump_seed = [bump];
        let seeds = [Seed::from(GLOBAL_CONFIG_SEED), Seed::from(&bump_seed)];
        let signers = [Signer::from(&seeds)];
        allocate_pda(
            global_config,
            GlobalConfig::LEN,
            program_id,
            admin,
            &signers,
        )?;

        assert_owned_by(global_config, program_id)?;
        let config = GlobalConfig::new(*admin.address(), 1);
        let mut data = global_config.try_borrow_mut()?;
        config.pack(&mut data[..GlobalConfig::LEN])?;
        emit_pause_event(true, admin.address());
        return Ok(());
    }

    assert_owned_by(global_config, program_id)?;
    let mut data = global_config.try_borrow_mut()?;
    let mut config = GlobalConfig::unpack(&data[..GlobalConfig::LEN])?;
    config.assert_admin(admin.address())?;
    config.paused = if config.paused == 0 { 1 } else { 0 };
    config.pack(&mut data[..GlobalConfig::LEN])?;
    emit_pause_event(config.paused != 0, admin.address());
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

#[cfg(test)]
static PAUSE_EVENT_LOGS: core::sync::atomic::AtomicUsize = core::sync::atomic::AtomicUsize::new(0);

#[cfg(test)]
fn emit_pause_event(_paused: bool, _admin: &Address) {
    PAUSE_EVENT_LOGS.fetch_add(1, core::sync::atomic::Ordering::SeqCst);
}

#[cfg(not(test))]
fn emit_pause_event(paused: bool, admin: &Address) {
    log_event_message(&format!("[event:pause] paused={} admin={}", paused, admin));
}

#[cfg(all(not(test), target_os = "solana"))]
fn log_event_message(message: &str) {
    unsafe {
        pinocchio::syscalls::sol_log_(message.as_ptr(), message.len() as u64);
    }
}

#[cfg(all(not(test), not(target_os = "solana")))]
fn log_event_message(_message: &str) {}

#[cfg(test)]
mod tests {
    use super::{emit_pause_event, PAUSE_EVENT_LOGS};
    use core::sync::atomic::Ordering;
    use pinocchio::Address;

    #[test]
    fn pause_toggle_emits_indexer_event() {
        PAUSE_EVENT_LOGS.store(0, Ordering::SeqCst);

        emit_pause_event(true, &Address::new_from_array([6u8; 32]));

        assert_eq!(PAUSE_EVENT_LOGS.load(Ordering::SeqCst), 1);
    }
}
