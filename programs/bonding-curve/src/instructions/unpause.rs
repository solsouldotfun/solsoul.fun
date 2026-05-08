use crate::state::global_config::{derive_global_config_address, GlobalConfig};
use pinocchio::{error::ProgramError, AccountView, Address, ProgramResult};
use shared::geppetto::{assert_owned_by, assert_signer, assert_writable};

pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    _instruction_data: &[u8],
) -> ProgramResult {
    if accounts.len() < 2 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let (global_config, rest) = accounts.split_at_mut(1);
    let global_config = &mut global_config[0];
    let authority = &mut rest[0];

    assert_writable(global_config)?;
    assert_owned_by(global_config, program_id)?;
    assert_signer(authority)?;

    let expected_address = derive_global_config_address(program_id);
    if global_config.address() != &expected_address {
        return Err(ProgramError::InvalidSeeds);
    }

    let config = {
        let data = global_config.try_borrow()?;
        GlobalConfig::unpack(&data[..])?
    };

    config.assert_authority(authority.address())?;

    let mut config = config;
    config.paused = 0;

    let mut data = global_config.try_borrow_mut()?;
    config.pack(&mut data[..GlobalConfig::LEN])
}
