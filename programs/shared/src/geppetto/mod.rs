use pinocchio::{address, error::ProgramError, AccountView, Address, ProgramResult};

pub type AccountInfo = AccountView;
pub type Pubkey = Address;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum GeppettoError {
    MissingRequiredSignature = 0x4700,
    AccountNotWritable = 0x4701,
    InvalidOwner = 0x4702,
    InvalidPda = 0x4703,
    IncorrectProgramId = 0x4704,
    InvalidSeeds = 0x4705,
}

impl GeppettoError {
    pub const fn code(self) -> u32 {
        self as u32
    }
}

impl From<GeppettoError> for ProgramError {
    fn from(error: GeppettoError) -> Self {
        ProgramError::Custom(error.code())
    }
}

pub fn assert_signer(account: &AccountInfo) -> ProgramResult {
    if !account.is_signer() {
        return Err(GeppettoError::MissingRequiredSignature.into());
    }

    Ok(())
}

pub fn assert_writable(account: &AccountInfo) -> ProgramResult {
    if !account.is_writable() {
        return Err(GeppettoError::AccountNotWritable.into());
    }

    Ok(())
}

pub fn assert_owned_by(account: &AccountInfo, owner: &Pubkey) -> ProgramResult {
    if !account.owned_by(owner) {
        return Err(GeppettoError::InvalidOwner.into());
    }

    Ok(())
}

pub fn assert_pda<const N: usize>(
    account: &AccountInfo,
    expected_seeds: &[&[u8]; N],
    program_id: &Pubkey,
) -> ProgramResult {
    if N >= address::MAX_SEEDS {
        return Err(GeppettoError::InvalidSeeds.into());
    }

    let mut seed_index = 0usize;
    while seed_index < N {
        if expected_seeds[seed_index].len() > address::MAX_SEED_LEN {
            return Err(GeppettoError::InvalidSeeds.into());
        }

        seed_index = seed_index
            .checked_add(1)
            .ok_or(GeppettoError::InvalidSeeds)?;
    }

    #[cfg(any(target_os = "solana", target_arch = "bpf"))]
    let expected_pda = match Pubkey::create_program_address(expected_seeds, program_id) {
        Ok(pda) => pda,
        Err(_) => return Err(GeppettoError::InvalidSeeds.into()),
    };

    #[cfg(not(any(target_os = "solana", target_arch = "bpf")))]
    let expected_pda = Pubkey::derive_address(expected_seeds, None, program_id);

    if account.address() != &expected_pda {
        return Err(GeppettoError::InvalidPda.into());
    }

    Ok(())
}

pub fn assert_program_id(account: &AccountInfo, program_id: &Pubkey) -> ProgramResult {
    if account.address() != program_id {
        return Err(GeppettoError::IncorrectProgramId.into());
    }

    Ok(())
}

#[cfg(test)]
mod tests;
