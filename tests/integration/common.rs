use solana_program_test::ProgramTest;
use solana_sdk::{account::Account, pubkey::Pubkey, rent::Rent};

// Soul-generator program config PDA seed (soul-generator still has admin control).
pub const SOUL_CONFIG_SEED: &[u8] = b"global_config";
pub const SOUL_CONFIG_LEN: usize = 128;
pub const SOUL_CONFIG_PAUSED_OFFSET: usize = 32;
pub const BONDING_CONFIG_LEN: usize = 33;
pub const BONDING_CONFIG_PAUSED_OFFSET: usize = 32;

pub fn soul_config_pda(program_id: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[SOUL_CONFIG_SEED], program_id).0
}

pub fn soul_config_account(admin: Pubkey, paused: u8, owner: Pubkey) -> Account {
    let mut data = vec![0u8; SOUL_CONFIG_LEN];
    data[..32].copy_from_slice(admin.as_ref());
    data[SOUL_CONFIG_PAUSED_OFFSET] = paused;

    Account {
        lamports: Rent::default().minimum_balance(SOUL_CONFIG_LEN),
        data,
        owner,
        executable: false,
        rent_epoch: 0,
    }
}

pub fn add_unpaused_soul_config(program_test: &mut ProgramTest, program_id: Pubkey, admin: Pubkey) {
    program_test.add_account(
        soul_config_pda(&program_id),
        soul_config_account(admin, 0, program_id),
    );
}

pub fn bonding_config_pda(program_id: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[SOUL_CONFIG_SEED], program_id).0
}

pub fn bonding_config_account(admin: Pubkey, paused: u8, owner: Pubkey) -> Account {
    let mut data = vec![0u8; BONDING_CONFIG_LEN];
    data[..32].copy_from_slice(admin.as_ref());
    data[BONDING_CONFIG_PAUSED_OFFSET] = paused;

    Account {
        lamports: Rent::default().minimum_balance(BONDING_CONFIG_LEN),
        data,
        owner,
        executable: false,
        rent_epoch: 0,
    }
}

pub fn add_unpaused_bonding_config(
    program_test: &mut ProgramTest,
    program_id: Pubkey,
    admin: Pubkey,
) {
    program_test.add_account(
        bonding_config_pda(&program_id),
        bonding_config_account(admin, 0, program_id),
    );
}
