use pinocchio::{error::ProgramError, Address, ProgramResult};

pub const RENDERER_REGISTRY_SEED: &[u8] = b"renderer_registry";

/// Registration fee to prevent spam registrations.
pub const RENDERER_REGISTRATION_FEE_LAMPORTS: u64 = 100_000_000; // 0.1 SOL

/// Renderer namespace constants.
pub const NAMESPACE_BUILTIN: u16 = 0x0000;
pub const NAMESPACE_COMMUNITY: u16 = 0x0001;

/// Maximum renderer ID per namespace.
pub const MAX_RENDERER_ID_PER_NAMESPACE: u16 = 999;

#[repr(C, packed)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RendererRegistryEntry {
    pub renderer_id: u32,    // namespace(16) + local_id(16)
    pub program_id: Address, // rendering program (self for built-in)
    pub author: Address,     // registrant / author wallet
    pub is_active: u8,       // 0 = inactive, 1 = active
    pub created_at: i64,     // unix timestamp
    pub total_renders: u64,  // cumulative render count
}

impl RendererRegistryEntry {
    pub const RENDERER_ID_OFFSET: usize = 0;
    pub const PROGRAM_ID_OFFSET: usize = Self::RENDERER_ID_OFFSET + 4;
    pub const AUTHOR_OFFSET: usize = Self::PROGRAM_ID_OFFSET + 32;
    pub const IS_ACTIVE_OFFSET: usize = Self::AUTHOR_OFFSET + 32;
    pub const CREATED_AT_OFFSET: usize = Self::IS_ACTIVE_OFFSET + 1;
    pub const TOTAL_RENDERS_OFFSET: usize = Self::CREATED_AT_OFFSET + 8;
    pub const LEN: usize = Self::TOTAL_RENDERS_OFFSET + 8;

    pub fn new(renderer_id: u32, program_id: Address, author: Address, created_at: i64) -> Self {
        Self {
            renderer_id,
            program_id,
            author,
            is_active: 1,
            created_at,
            total_renders: 0,
        }
    }

    pub fn unpack(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }

        let mut renderer_id = [0u8; 4];
        renderer_id.copy_from_slice(&data[Self::RENDERER_ID_OFFSET..Self::PROGRAM_ID_OFFSET]);
        let renderer_id = u32::from_le_bytes(renderer_id);

        let mut program_id = [0u8; 32];
        program_id.copy_from_slice(&data[Self::PROGRAM_ID_OFFSET..Self::AUTHOR_OFFSET]);

        let mut author = [0u8; 32];
        author.copy_from_slice(&data[Self::AUTHOR_OFFSET..Self::IS_ACTIVE_OFFSET]);

        let is_active = data[Self::IS_ACTIVE_OFFSET];
        if is_active != 0 && is_active != 1 {
            return Err(ProgramError::InvalidAccountData);
        }

        let mut created_at = [0u8; 8];
        created_at.copy_from_slice(&data[Self::CREATED_AT_OFFSET..Self::TOTAL_RENDERS_OFFSET]);

        let mut total_renders = [0u8; 8];
        total_renders.copy_from_slice(&data[Self::TOTAL_RENDERS_OFFSET..Self::LEN]);

        Ok(Self {
            renderer_id,
            program_id: Address::new_from_array(program_id),
            author: Address::new_from_array(author),
            is_active,
            created_at: i64::from_le_bytes(created_at),
            total_renders: u64::from_le_bytes(total_renders),
        })
    }

    pub fn pack(&self, data: &mut [u8]) -> ProgramResult {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }

        data[..Self::LEN].fill(0);
        data[Self::RENDERER_ID_OFFSET..Self::PROGRAM_ID_OFFSET]
            .copy_from_slice(&self.renderer_id.to_le_bytes());
        data[Self::PROGRAM_ID_OFFSET..Self::AUTHOR_OFFSET]
            .copy_from_slice(self.program_id.as_ref());
        data[Self::AUTHOR_OFFSET..Self::IS_ACTIVE_OFFSET].copy_from_slice(self.author.as_ref());
        data[Self::IS_ACTIVE_OFFSET] = self.is_active;
        data[Self::CREATED_AT_OFFSET..Self::TOTAL_RENDERS_OFFSET]
            .copy_from_slice(&self.created_at.to_le_bytes());
        data[Self::TOTAL_RENDERS_OFFSET..Self::LEN]
            .copy_from_slice(&self.total_renders.to_le_bytes());
        Ok(())
    }

    pub fn namespace(&self) -> u16 {
        (self.renderer_id >> 16) as u16
    }

    pub fn local_id(&self) -> u16 {
        self.renderer_id as u16
    }

    pub fn is_builtin(&self) -> bool {
        self.namespace() == NAMESPACE_BUILTIN
    }

    pub fn is_community(&self) -> bool {
        self.namespace() == NAMESPACE_COMMUNITY
    }
}

pub fn derive_renderer_registry_address(renderer_id: u32, program_id: &Address) -> Address {
    Address::derive_address(
        &[RENDERER_REGISTRY_SEED, &renderer_id.to_le_bytes()],
        None,
        program_id,
    )
}

pub fn validate_renderer_id(renderer_id: u32) -> Result<(), ProgramError> {
    let namespace = (renderer_id >> 16) as u16;
    let local_id = renderer_id as u16;
    if namespace == NAMESPACE_BUILTIN {
        // Built-in namespace is reserved; cannot be registered externally.
        return Err(ProgramError::InvalidArgument);
    }
    if local_id > MAX_RENDERER_ID_PER_NAMESPACE {
        return Err(ProgramError::InvalidArgument);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout_size() {
        assert_eq!(RendererRegistryEntry::LEN, 4 + 32 + 32 + 1 + 8 + 8);
        assert_eq!(RendererRegistryEntry::LEN, 85);
    }

    #[test]
    fn roundtrip() {
        let entry = RendererRegistryEntry::new(
            0x0001_0001,
            Address::new_from_array([1; 32]),
            Address::new_from_array([2; 32]),
            1_714_200_000,
        );
        let mut data = [0u8; RendererRegistryEntry::LEN];
        entry.pack(&mut data).unwrap();
        let unpacked = RendererRegistryEntry::unpack(&data).unwrap();
        assert_eq!(unpacked, entry);
        assert!(unpacked.is_community());
        assert!(!unpacked.is_builtin());
    }

    #[test]
    fn validate_rejects_builtin_namespace() {
        assert_eq!(
            validate_renderer_id(0x0000_0001),
            Err(ProgramError::InvalidArgument)
        );
        assert!(validate_renderer_id(0x0001_0001).is_ok());
    }

    #[test]
    fn derive_address_is_deterministic() {
        let program_id = Address::new_from_array([9; 32]);
        let a = derive_renderer_registry_address(0x0001_0001, &program_id);
        let b = derive_renderer_registry_address(0x0001_0001, &program_id);
        assert_eq!(a, b);
    }
}
