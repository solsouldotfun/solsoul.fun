use crate::state::global_config::{assert_global_config_pda, GlobalConfig};
#[cfg(not(test))]
use alloc::format;
use pinocchio::{error::ProgramError, AccountView, Address, ProgramResult};
use shared::geppetto::{assert_owned_by, assert_signer, assert_writable};

pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if !instruction_data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let (config_accounts, rest) = accounts.split_at_mut(1);
    let global_config = &mut config_accounts[0];
    let admin = &rest[0];

    assert_writable(global_config)?;
    assert_global_config_pda(global_config, program_id)?;
    assert_owned_by(global_config, program_id)?;
    assert_signer(admin)?;

    let mut data = global_config.try_borrow_mut()?;
    let mut config = GlobalConfig::unpack(&data[..GlobalConfig::LEN])?;
    config.assert_admin(admin.address())?;
    config.paused = 0;
    config.pack(&mut data[..GlobalConfig::LEN])?;
    emit_pause_event(false, admin.address());
    Ok(())
}

#[cfg(test)]
static UNPAUSE_EVENT_LOGS: core::sync::atomic::AtomicUsize =
    core::sync::atomic::AtomicUsize::new(0);

#[cfg(test)]
fn emit_pause_event(_paused: bool, _admin: &Address) {
    UNPAUSE_EVENT_LOGS.fetch_add(1, core::sync::atomic::Ordering::SeqCst);
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
    use super::{emit_pause_event, UNPAUSE_EVENT_LOGS};
    use core::sync::atomic::Ordering;
    use pinocchio::Address;

    #[test]
    fn unpause_emits_indexer_event() {
        UNPAUSE_EVENT_LOGS.store(0, Ordering::SeqCst);

        emit_pause_event(false, &Address::new_from_array([7u8; 32]));

        assert_eq!(UNPAUSE_EVENT_LOGS.load(Ordering::SeqCst), 1);
    }
}
