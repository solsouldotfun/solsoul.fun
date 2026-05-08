use pinocchio::{error::ProgramError, AccountView, Address, ProgramResult};

#[repr(u32)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReceiptLifecycleError {
    UnauthorizedReceiptTransition = 0x320,
    InvalidReceiptState = 0x321,
    InvalidReceiptBinding = 0x322,
    LegacyReceiptLifecycleDisabled = 0x323,
}

impl From<ReceiptLifecycleError> for ProgramError {
    fn from(value: ReceiptLifecycleError) -> Self {
        ProgramError::Custom(value as u32)
    }
}

pub fn process(
    _program_id: &Address,
    _accounts: &mut [AccountView],
    _instruction_data: &[u8],
) -> ProgramResult {
    Err(ReceiptLifecycleError::LegacyReceiptLifecycleDisabled.into())
}
