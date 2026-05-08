use pinocchio::{error::ProgramError, AccountView, Address, ProgramResult};

pub mod buy;
pub mod create_token;
pub mod initialize_global_config;
pub mod pause;
pub mod renounce_admin;
pub mod sell;
pub mod unpause;
pub mod withdraw_treasury;

pub const CREATE_TOKEN_DISCRIMINATOR: u8 = 0;
pub const BUY_DISCRIMINATOR: u8 = 1;
pub const SELL_DISCRIMINATOR: u8 = 2;
pub const INITIALIZE_GLOBAL_CONFIG_DISCRIMINATOR: u8 = 4;
pub const PAUSE_DISCRIMINATOR: u8 = 5;
pub const UNPAUSE_DISCRIMINATOR: u8 = 6;
pub const RENOUNCE_ADMIN_DISCRIMINATOR: u8 = 7;
pub const WITHDRAW_TREASURY_DISCRIMINATOR: u8 = 8;

pub fn dispatch(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let (discriminator, args) = instruction_data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;

    match *discriminator {
        CREATE_TOKEN_DISCRIMINATOR => create_token::process(program_id, accounts, args),
        BUY_DISCRIMINATOR => buy::process(program_id, accounts, args),
        SELL_DISCRIMINATOR => sell::process(program_id, accounts, args),
        INITIALIZE_GLOBAL_CONFIG_DISCRIMINATOR => {
            initialize_global_config::process(program_id, accounts, args)
        }
        PAUSE_DISCRIMINATOR => pause::process(program_id, accounts, args),
        UNPAUSE_DISCRIMINATOR => unpause::process(program_id, accounts, args),
        RENOUNCE_ADMIN_DISCRIMINATOR => renounce_admin::process(program_id, accounts, args),
        WITHDRAW_TREASURY_DISCRIMINATOR => withdraw_treasury::process(program_id, accounts, args),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
