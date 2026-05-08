use crate::state::{
    global_config::{derive_global_config_address, GlobalConfig},
    TREASURY_SEED,
};
use pinocchio::{error::ProgramError, AccountView, Address, ProgramResult};
use shared::geppetto::{assert_owned_by, assert_pda, assert_signer, assert_writable};

pub const WITHDRAW_TREASURY_ARGS_LEN: usize = 8;

pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.len() != WITHDRAW_TREASURY_ARGS_LEN {
        return Err(ProgramError::InvalidInstructionData);
    }
    if accounts.len() < 4 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let (treasury_slice, rest) = accounts.split_at_mut(1);
    let treasury = &mut treasury_slice[0];
    let (config_slice, rest) = rest.split_at_mut(1);
    let global_config = &config_slice[0];
    let (authority_slice, recipient_slice) = rest.split_at_mut(1);
    let authority = &authority_slice[0];
    let recipient = &mut recipient_slice[0];

    assert_writable(treasury)?;
    assert_pda(treasury, &[TREASURY_SEED], program_id)?;
    assert_owned_by(treasury, program_id)?;
    assert_owned_by(global_config, program_id)?;
    if global_config.address() != &derive_global_config_address(program_id) {
        return Err(ProgramError::InvalidSeeds);
    }
    assert_signer(authority)?;
    assert_writable(recipient)?;

    let config = {
        let data = global_config.try_borrow()?;
        GlobalConfig::unpack(&data[..])?
    };
    config.assert_authority(authority.address())?;

    let mut amount = [0u8; 8];
    amount.copy_from_slice(instruction_data);
    let requested_amount = u64::from_le_bytes(amount);
    let amount = if requested_amount == 0 {
        treasury.lamports()
    } else {
        requested_amount
    };
    if amount > treasury.lamports() {
        return Err(ProgramError::InsufficientFunds);
    }

    treasury.set_lamports(
        treasury
            .lamports()
            .checked_sub(amount)
            .ok_or(ProgramError::ArithmeticOverflow)?,
    );
    recipient.set_lamports(
        recipient
            .lamports()
            .checked_add(amount)
            .ok_or(ProgramError::ArithmeticOverflow)?,
    );

    Ok(())
}
