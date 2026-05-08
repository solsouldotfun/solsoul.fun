use crate::state::renderer_registry::{derive_renderer_registry_address, RendererRegistryEntry};
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

    let (registry_entry, rest) = accounts.split_at_mut(1);
    let registry_entry = &mut registry_entry[0];
    let author = &mut rest[0];

    assert_writable(registry_entry)?;
    assert_owned_by(registry_entry, program_id)?;
    assert_signer(author)?;

    let entry = {
        let data = registry_entry.try_borrow()?;
        RendererRegistryEntry::unpack(&data[..])?
    };

    let expected_address = derive_renderer_registry_address(entry.renderer_id, program_id);
    if registry_entry.address() != &expected_address {
        return Err(ProgramError::InvalidSeeds);
    }

    // Only the original author can unregister their renderer.
    if author.address() != &entry.author {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Soft delete: mark inactive. Hard delete would require realloc to 0.
    let mut data = registry_entry.try_borrow_mut()?;
    data[RendererRegistryEntry::IS_ACTIVE_OFFSET] = 0;

    Ok(())
}
