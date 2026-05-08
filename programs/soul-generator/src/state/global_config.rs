use pinocchio::{error::ProgramError, AccountView, Address, ProgramResult};
use shared::{geppetto::assert_owned_by, pause::assert_not_paused};

pub type Pubkey = Address;

pub const GLOBAL_CONFIG_SEED: &[u8] = b"global_config";
pub const BPF_LOADER_UPGRADEABLE_ID: Pubkey = Pubkey::new_from_array(pinocchio_pubkey::pubkey!(
    "BPFLoaderUpgradeab1e11111111111111111111111"
));

const UPGRADEABLE_LOADER_PROGRAMDATA_TAG: u32 = 3;
const PROGRAMDATA_MIN_METADATA_LEN: usize = 13;
const PROGRAMDATA_UPGRADE_AUTHORITY_OPTION_OFFSET: usize = 12;
const PROGRAMDATA_UPGRADE_AUTHORITY_OFFSET: usize = 13;

#[repr(C)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct GlobalConfig {
    pub admin: Pubkey,
    pub paused: u8,
    pub _padding: [u8; 95],
}

impl GlobalConfig {
    pub const ADMIN_OFFSET: usize = 0;
    pub const PAUSED_OFFSET: usize = Self::ADMIN_OFFSET + 32;
    pub const PADDING_OFFSET: usize = Self::PAUSED_OFFSET + 1;
    pub const LEN: usize = Self::PADDING_OFFSET + 95;

    pub const fn new(admin: Pubkey, paused: u8) -> Self {
        Self {
            admin,
            paused,
            _padding: [0; 95],
        }
    }

    pub fn pack(&self, data: &mut [u8]) -> ProgramResult {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        if self.paused > 1 {
            return Err(ProgramError::InvalidAccountData);
        }

        data[..Self::LEN].fill(0);
        data[Self::ADMIN_OFFSET..Self::PAUSED_OFFSET].copy_from_slice(self.admin.as_ref());
        data[Self::PAUSED_OFFSET] = self.paused;

        Ok(())
    }

    pub fn unpack(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }

        let mut admin = [0u8; 32];
        admin.copy_from_slice(&data[Self::ADMIN_OFFSET..Self::PAUSED_OFFSET]);

        let paused = data[Self::PAUSED_OFFSET];
        if paused > 1 {
            return Err(ProgramError::InvalidAccountData);
        }

        let mut padding = [0u8; 95];
        padding.copy_from_slice(&data[Self::PADDING_OFFSET..Self::LEN]);

        Ok(Self {
            admin: Pubkey::new_from_array(admin),
            paused,
            _padding: padding,
        })
    }

    pub fn assert_admin(&self, signer: &Pubkey) -> ProgramResult {
        if self.admin != *signer {
            return Err(ProgramError::IncorrectAuthority);
        }

        Ok(())
    }
}

pub fn derive_global_config_address(program_id: &Pubkey) -> Pubkey {
    derive_global_config_address_and_bump(program_id).0
}

pub fn derive_global_config_address_and_bump(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::derive_program_address(&[GLOBAL_CONFIG_SEED], program_id)
        .expect("global_config PDA derivation must succeed")
}

pub fn assert_global_config_pda(global_config: &AccountView, program_id: &Pubkey) -> ProgramResult {
    let (expected, _) = derive_global_config_address_and_bump(program_id);
    if global_config.address() != &expected {
        return Err(ProgramError::InvalidSeeds);
    }

    Ok(())
}

pub fn assert_global_config_not_paused(
    global_config: &AccountView,
    program_id: &Pubkey,
) -> ProgramResult {
    assert_global_config_pda(global_config, program_id)?;
    assert_owned_by(global_config, program_id)?;
    assert_not_paused(global_config)
}

pub fn parse_programdata_upgrade_authority(data: &[u8]) -> Result<Pubkey, ProgramError> {
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
            Ok(Pubkey::new_from_array(authority))
        }
        _ => Err(ProgramError::InvalidAccountData),
    }
}

pub fn assert_upgrade_authority_for_program(
    program_id: &Pubkey,
    signer: &Pubkey,
    programdata: &AccountView,
) -> ProgramResult {
    assert_owned_by(programdata, &BPF_LOADER_UPGRADEABLE_ID)?;

    let (expected_programdata, _) =
        Pubkey::derive_program_address(&[program_id.as_ref()], &BPF_LOADER_UPGRADEABLE_ID)
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
    use super::{
        derive_global_config_address, parse_programdata_upgrade_authority, GlobalConfig, Pubkey,
        GLOBAL_CONFIG_SEED,
    };
    use core::mem::size_of;
    use pinocchio::error::ProgramError;
    use std::vec;

    #[test]
    fn global_config_layout_has_expected_size() {
        assert_eq!(GlobalConfig::LEN, 128);
        assert_eq!(GlobalConfig::ADMIN_OFFSET, 0);
        assert_eq!(GlobalConfig::PAUSED_OFFSET, 32);
        assert_eq!(GlobalConfig::PADDING_OFFSET, 33);
        assert_eq!(size_of::<GlobalConfig>(), GlobalConfig::LEN);
    }

    #[test]
    fn global_config_roundtrips_paused_state() {
        let admin = Pubkey::new_from_array([7; 32]);
        for paused in [0, 1] {
            let config = GlobalConfig::new(admin, paused);
            let mut data = vec![0xff; GlobalConfig::LEN];

            config.pack(&mut data).expect("pack succeeds");
            let unpacked = GlobalConfig::unpack(&data).expect("unpack succeeds");

            assert_eq!(unpacked, config);
            assert!(unpacked._padding.iter().all(|byte| *byte == 0));
        }
    }

    #[test]
    fn global_config_rejects_invalid_paused_flag() {
        let admin = Pubkey::new_from_array([7; 32]);
        let mut data = vec![0u8; GlobalConfig::LEN];
        GlobalConfig::new(admin, 0)
            .pack(&mut data)
            .expect("pack succeeds");

        data[GlobalConfig::PAUSED_OFFSET] = 2;

        assert_eq!(
            GlobalConfig::unpack(&data),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn global_config_admin_guard_accepts_only_admin() {
        let admin = Pubkey::new_from_array([7; 32]);
        let non_admin = Pubkey::new_from_array([8; 32]);
        let config = GlobalConfig::new(admin, 1);

        config.assert_admin(&admin).expect("admin accepted");
        assert_eq!(
            config.assert_admin(&non_admin),
            Err(ProgramError::IncorrectAuthority)
        );
    }

    #[test]
    fn global_config_pda_uses_single_seed() {
        let program_id = Pubkey::new_from_array([9; 32]);

        assert_eq!(
            derive_global_config_address(&program_id),
            Pubkey::derive_program_address(&[GLOBAL_CONFIG_SEED], &program_id)
                .expect("global config pda derives")
                .0
        );
    }

    #[test]
    fn programdata_upgrade_authority_parser_reads_bpf_loader_metadata() {
        let authority = Pubkey::new_from_array([42; 32]);
        let mut data = vec![0u8; 45];
        data[..4].copy_from_slice(&3u32.to_le_bytes());
        data[4..12].copy_from_slice(&9u64.to_le_bytes());
        data[12] = 1;
        data[13..45].copy_from_slice(authority.as_ref());

        assert_eq!(
            parse_programdata_upgrade_authority(&data).expect("authority parses"),
            authority
        );
    }

    #[test]
    fn programdata_upgrade_authority_parser_rejects_missing_or_wrong_authority() {
        let mut data = vec![0u8; 45];
        data[..4].copy_from_slice(&3u32.to_le_bytes());
        data[12] = 0;
        assert_eq!(
            parse_programdata_upgrade_authority(&data),
            Err(ProgramError::Immutable)
        );

        data[12] = 2;
        assert_eq!(
            parse_programdata_upgrade_authority(&data),
            Err(ProgramError::InvalidAccountData)
        );

        data[..4].copy_from_slice(&2u32.to_le_bytes());
        data[12] = 1;
        assert_eq!(
            parse_programdata_upgrade_authority(&data),
            Err(ProgramError::InvalidAccountData)
        );
    }
}
