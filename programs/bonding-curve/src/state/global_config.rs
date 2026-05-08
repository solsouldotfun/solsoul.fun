use pinocchio::{error::ProgramError, AccountView, Address, ProgramResult};
use shared::geppetto::assert_owned_by;

pub const GLOBAL_CONFIG_SEED: &[u8] = b"global_config";
pub const BPF_LOADER_UPGRADEABLE_ID: Address = Address::new_from_array(pinocchio_pubkey::pubkey!(
    "BPFLoaderUpgradeab1e11111111111111111111111"
));

const UPGRADEABLE_LOADER_PROGRAMDATA_TAG: u32 = 3;
const PROGRAMDATA_MIN_METADATA_LEN: usize = 13;
const PROGRAMDATA_UPGRADE_AUTHORITY_OPTION_OFFSET: usize = 12;
const PROGRAMDATA_UPGRADE_AUTHORITY_OFFSET: usize = 13;

/// Simplified GlobalConfig for the exponential bonding curve.
///
/// Fields (confirmed after curve refactor, commit 8d78729 + 6ee250b):
///   - `admin`  (32 bytes): single hot key; zeroed out upon `renounce_admin` (irrevocable)
///   - `paused` (1 byte):   0 = active, 1 = paused (emergency stop)
///
/// No fee-recipient, fee-bps, launch-fee, admin-transfer, migration, or AMM fields.
/// Total = 33 bytes.
///
/// Surviving instructions: initialize_global_config, pause, unpause, renounce_admin.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct GlobalConfig {
    /// The admin key.  All-zeros means the admin has been irrevocably renounced.
    pub authority: Address,
    /// 0 = active, 1 = paused (emergency stop).
    pub paused: u8,
}

impl GlobalConfig {
    pub const AUTHORITY_OFFSET: usize = 0;
    pub const PAUSED_OFFSET: usize = 32;
    pub const LEN: usize = Self::PAUSED_OFFSET + 1; // 33 bytes total

    pub const fn new(authority: Address) -> Self {
        Self {
            authority,
            paused: 0,
        }
    }

    pub fn unpack(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let mut authority = [0u8; 32];
        authority.copy_from_slice(&data[Self::AUTHORITY_OFFSET..Self::PAUSED_OFFSET]);
        let paused = data[Self::PAUSED_OFFSET];
        if paused > 1 {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(Self {
            authority: Address::new_from_array(authority),
            paused,
        })
    }

    pub fn pack(&self, data: &mut [u8]) -> Result<(), ProgramError> {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        data[Self::AUTHORITY_OFFSET..Self::PAUSED_OFFSET].copy_from_slice(self.authority.as_ref());
        data[Self::PAUSED_OFFSET] = self.paused;
        Ok(())
    }

    pub fn assert_authority(&self, signer: &Address) -> ProgramResult {
        // All-zeros authority means admin was irrevocably renounced.
        if self.authority == Address::new_from_array([0u8; 32]) {
            return Err(ProgramError::Immutable);
        }
        if signer != &self.authority {
            return Err(ProgramError::MissingRequiredSignature);
        }
        Ok(())
    }

    /// Irrevocably renounce admin by zeroing out the authority field.
    pub fn renounce(&mut self) {
        self.authority = Address::new_from_array([0u8; 32]);
    }
}

pub fn derive_global_config_address(program_id: &Address) -> Address {
    derive_global_config_address_and_bump(program_id).0
}

pub fn derive_global_config_address_and_bump(program_id: &Address) -> (Address, u8) {
    Address::derive_program_address(&[GLOBAL_CONFIG_SEED], program_id)
        .expect("global_config PDA derivation must succeed")
}

pub fn assert_global_config_not_paused(
    global_config: &AccountView,
    program_id: &Address,
) -> ProgramResult {
    assert_owned_by(global_config, program_id)?;
    if global_config.address() != &derive_global_config_address(program_id) {
        return Err(ProgramError::InvalidSeeds);
    }
    let data = global_config.try_borrow()?;
    let config = GlobalConfig::unpack(&data[..])?;
    if config.paused != 0 {
        return Err(ProgramError::Custom(0xA10));
    }
    Ok(())
}

pub fn parse_programdata_upgrade_authority(data: &[u8]) -> Result<Address, ProgramError> {
    if data.len() < PROGRAMDATA_MIN_METADATA_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }

    let mut tag = [0u8; 4];
    tag.copy_from_slice(&data[..4]);
    if u32::from_le_bytes(tag) != UPGRADEABLE_LOADER_PROGRAMDATA_TAG {
        return Err(ProgramError::InvalidAccountData);
    }

    match data[PROGRAMDATA_UPGRADE_AUTHORITY_OPTION_OFFSET] {
        0 => Err(ProgramError::Immutable),
        1 => {
            if data.len() < PROGRAMDATA_UPGRADE_AUTHORITY_OFFSET + 32 {
                return Err(ProgramError::AccountDataTooSmall);
            }
            let mut authority = [0u8; 32];
            authority.copy_from_slice(
                &data[PROGRAMDATA_UPGRADE_AUTHORITY_OFFSET
                    ..PROGRAMDATA_UPGRADE_AUTHORITY_OFFSET + 32],
            );
            Ok(Address::new_from_array(authority))
        }
        _ => Err(ProgramError::InvalidAccountData),
    }
}

pub fn assert_upgrade_authority_for_program(
    program_id: &Address,
    signer: &Address,
    programdata: &AccountView,
) -> ProgramResult {
    assert_owned_by(programdata, &BPF_LOADER_UPGRADEABLE_ID)?;

    let (expected_programdata, _) =
        Address::derive_program_address(&[program_id.as_ref()], &BPF_LOADER_UPGRADEABLE_ID)
            .ok_or(ProgramError::InvalidSeeds)?;
    if programdata.address() != &expected_programdata {
        return Err(ProgramError::InvalidArgument);
    }

    let data = programdata.try_borrow()?;
    let upgrade_authority = parse_programdata_upgrade_authority(&data)?;
    if upgrade_authority != *signer {
        return Err(ProgramError::IncorrectAuthority);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout() {
        assert_eq!(GlobalConfig::LEN, 33);
    }

    #[test]
    fn roundtrip() {
        let authority = Address::new_from_array([7; 32]);
        let config = GlobalConfig::new(authority);
        let mut data = [0u8; GlobalConfig::LEN];
        config.pack(&mut data).unwrap();
        let unpacked = GlobalConfig::unpack(&data).unwrap();
        assert_eq!(unpacked, config);
    }

    #[test]
    fn roundtrip_paused() {
        let authority = Address::new_from_array([3; 32]);
        let mut config = GlobalConfig::new(authority);
        config.paused = 1;
        let mut data = [0u8; GlobalConfig::LEN];
        config.pack(&mut data).unwrap();
        let unpacked = GlobalConfig::unpack(&data).unwrap();
        assert_eq!(unpacked.paused, 1);
        assert_eq!(unpacked.authority, authority);
    }

    #[test]
    fn unpack_rejects_invalid_paused_flag() {
        let authority = Address::new_from_array([3; 32]);
        let config = GlobalConfig::new(authority);
        let mut data = [0u8; GlobalConfig::LEN];
        config.pack(&mut data).unwrap();
        data[GlobalConfig::PAUSED_OFFSET] = 2;

        assert_eq!(
            GlobalConfig::unpack(&data),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn programdata_upgrade_authority_parser_reads_loader_metadata() {
        let authority = Address::new_from_array([9; 32]);
        let mut data = [0u8; PROGRAMDATA_UPGRADE_AUTHORITY_OFFSET + 32];
        data[..4].copy_from_slice(&UPGRADEABLE_LOADER_PROGRAMDATA_TAG.to_le_bytes());
        data[PROGRAMDATA_UPGRADE_AUTHORITY_OPTION_OFFSET] = 1;
        data[PROGRAMDATA_UPGRADE_AUTHORITY_OFFSET..PROGRAMDATA_UPGRADE_AUTHORITY_OFFSET + 32]
            .copy_from_slice(authority.as_ref());

        assert_eq!(parse_programdata_upgrade_authority(&data), Ok(authority));
    }

    #[test]
    fn renounce_makes_immutable() {
        let authority = Address::new_from_array([7; 32]);
        let mut config = GlobalConfig::new(authority);
        config.renounce();
        // After renounce, authority is all-zeros.
        assert_eq!(config.authority, Address::new_from_array([0u8; 32]));
        assert_eq!(
            config.assert_authority(&authority),
            Err(ProgramError::Immutable)
        );
    }
}
