use pinocchio::{error::ProgramError, AccountView, Address, ProgramResult};

pub mod claim_soul;
pub mod generate_soul;
pub mod initialize_soul;
pub mod pause;
pub mod receipt_lifecycle;
pub mod register_renderer;
pub mod settle_receipts;
pub mod unpause;
pub mod unregister_renderer;
pub mod upload_template;

pub const INITIALIZE_SOUL_DISCRIMINATOR: u8 = 0;
pub const GENERATE_SOUL_DISCRIMINATOR: u8 = 1;
pub const UPLOAD_TEMPLATE_DISCRIMINATOR: u8 = 2;
pub const CLAIM_SOUL_DISCRIMINATOR: u8 = 3;
pub const PAUSE_DISCRIMINATOR: u8 = 4;
pub const UNPAUSE_DISCRIMINATOR: u8 = 5;
pub const RECEIPT_LIFECYCLE_DISCRIMINATOR: u8 = 6;
pub const SETTLE_RECEIPTS_DISCRIMINATOR: u8 = 7;
pub const REGISTER_RENDERER_DISCRIMINATOR: u8 = 8;
pub const UNREGISTER_RENDERER_DISCRIMINATOR: u8 = 9;

pub fn dispatch(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let (discriminator, args) = instruction_data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;

    match *discriminator {
        INITIALIZE_SOUL_DISCRIMINATOR => initialize_soul::process(program_id, accounts, args),
        GENERATE_SOUL_DISCRIMINATOR => generate_soul::process(program_id, accounts, args),
        UPLOAD_TEMPLATE_DISCRIMINATOR => upload_template::process(program_id, accounts, args),
        CLAIM_SOUL_DISCRIMINATOR => claim_soul::process(program_id, accounts, args),
        PAUSE_DISCRIMINATOR => pause::process(program_id, accounts, args),
        UNPAUSE_DISCRIMINATOR => unpause::process(program_id, accounts, args),
        RECEIPT_LIFECYCLE_DISCRIMINATOR => receipt_lifecycle::process(program_id, accounts, args),
        SETTLE_RECEIPTS_DISCRIMINATOR => settle_receipts::process(program_id, accounts, args),
        REGISTER_RENDERER_DISCRIMINATOR => register_renderer::process(program_id, accounts, args),
        UNREGISTER_RENDERER_DISCRIMINATOR => {
            unregister_renderer::process(program_id, accounts, args)
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
