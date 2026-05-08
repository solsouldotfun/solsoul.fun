use crate::state::{
    global_config::{assert_global_config_pda, GlobalConfig},
    renderer_registry::{
        derive_renderer_registry_address, validate_renderer_id, RendererRegistryEntry,
        RENDERER_REGISTRATION_FEE_LAMPORTS, RENDERER_REGISTRY_SEED,
    },
};
use pinocchio::{
    cpi::{Seed, Signer},
    error::ProgramError,
    sysvars::clock::Clock,
    sysvars::rent::{ACCOUNT_STORAGE_OVERHEAD, DEFAULT_LAMPORTS_PER_BYTE},
    sysvars::Sysvar,
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer};
use shared::geppetto::{assert_owned_by, assert_signer, assert_writable};

pub const REGISTER_RENDERER_ARGS_LEN: usize = 4;

pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.len() != REGISTER_RENDERER_ARGS_LEN {
        return Err(ProgramError::InvalidInstructionData);
    }
    if accounts.len() < 6 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let (registry_entry, rest) = accounts.split_at_mut(1);
    let registry_entry = &mut registry_entry[0];
    let (author, rest) = rest.split_at_mut(1);
    let author = &mut author[0];
    let (fee_recipient, rest) = rest.split_at_mut(1);
    let fee_recipient = &mut fee_recipient[0];
    let global_config = &rest[0];
    let _system_program = &rest[1];
    let renderer_program_id = &rest[2];

    assert_writable(registry_entry)?;
    assert_writable(author)?;
    assert_signer(author)?;
    assert_writable(fee_recipient)?;
    assert_global_config_pda(global_config, program_id)?;
    assert_owned_by(global_config, program_id)?;

    let config = {
        let data = global_config.try_borrow()?;
        GlobalConfig::unpack(&data[..])?
    };
    if fee_recipient.address() != &config.admin {
        return Err(ProgramError::InvalidAccountData);
    }

    let mut renderer_id = [0u8; 4];
    renderer_id.copy_from_slice(instruction_data);
    let renderer_id = u32::from_le_bytes(renderer_id);

    validate_renderer_id(renderer_id)?;

    let expected_address = derive_renderer_registry_address(renderer_id, program_id);
    if registry_entry.address() != &expected_address {
        return Err(ProgramError::InvalidSeeds);
    }

    if registry_entry.data_len() != 0 {
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    let clock = Clock::get()?;
    let created_at = clock.unix_timestamp;

    let entry = RendererRegistryEntry::new(
        renderer_id,
        *renderer_program_id.address(),
        *author.address(),
        created_at,
    );

    // Pay registration fee
    Transfer {
        from: author,
        to: fee_recipient,
        lamports: RENDERER_REGISTRATION_FEE_LAMPORTS,
    }
    .invoke()?;

    // Allocate and assign registry entry PDA
    let renderer_id_bytes = renderer_id.to_le_bytes();
    let seeds = [
        Seed::from(RENDERER_REGISTRY_SEED),
        Seed::from(&renderer_id_bytes),
    ];
    let signers = [Signer::from(&seeds)];
    allocate_registry_entry(registry_entry, program_id, author, &signers)?;

    let mut data = registry_entry.try_borrow_mut()?;
    entry.pack(&mut data[..RendererRegistryEntry::LEN])
}

fn allocate_registry_entry(
    registry_entry: &mut AccountView,
    program_id: &Address,
    payer: &AccountView,
    signers: &[Signer],
) -> ProgramResult {
    let lamports = rent_exempt_lamports(RendererRegistryEntry::LEN)?;
    if registry_entry.lamports() == 0 {
        return CreateAccount {
            from: payer,
            to: registry_entry,
            lamports,
            space: RendererRegistryEntry::LEN as u64,
            owner: program_id,
        }
        .invoke_signed(signers);
    }
    if !registry_entry.owned_by(&pinocchio_system::ID) {
        return Err(ProgramError::InvalidAccountData);
    }
    let required_lamports = lamports.saturating_sub(registry_entry.lamports());
    if required_lamports > 0 {
        Transfer {
            from: payer,
            to: registry_entry,
            lamports: required_lamports,
        }
        .invoke()?;
    }
    Allocate {
        account: registry_entry,
        space: RendererRegistryEntry::LEN as u64,
    }
    .invoke_signed(signers)?;
    Assign {
        account: registry_entry,
        owner: program_id,
    }
    .invoke_signed(signers)
}

fn rent_exempt_lamports(space: usize) -> Result<u64, ProgramError> {
    let space = u64::try_from(space).map_err(|_| ProgramError::ArithmeticOverflow)?;
    space
        .checked_add(ACCOUNT_STORAGE_OVERHEAD)
        .and_then(|bytes| bytes.checked_mul(DEFAULT_LAMPORTS_PER_BYTE))
        .ok_or(ProgramError::ArithmeticOverflow)
}
