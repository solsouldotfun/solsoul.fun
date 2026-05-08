use pinocchio::{error::ProgramError, AccountView, ProgramResult};

pub const PAUSED_ERROR_CODE: u32 = 0xA10;
pub const GLOBAL_CONFIG_LEN: usize = 128;
pub const GLOBAL_CONFIG_PAUSED_OFFSET: usize = 32;

pub fn assert_not_paused(global_config: &AccountView) -> ProgramResult {
    if global_config.data_len() < GLOBAL_CONFIG_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }

    let data = global_config.try_borrow()?;
    assert_not_paused_data(&data[..GLOBAL_CONFIG_LEN])
}

pub fn assert_not_paused_data(data: &[u8]) -> ProgramResult {
    if data.len() < GLOBAL_CONFIG_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }

    match data[GLOBAL_CONFIG_PAUSED_OFFSET] {
        0 => Ok(()),
        1 => Err(ProgramError::Custom(PAUSED_ERROR_CODE)),
        _ => Err(ProgramError::InvalidAccountData),
    }
}

#[cfg(test)]
mod tests {
    use super::{assert_not_paused_data, GLOBAL_CONFIG_LEN, GLOBAL_CONFIG_PAUSED_OFFSET};
    use pinocchio::error::ProgramError;

    #[test]
    fn unpaused_global_config_allows_write_paths() {
        let mut data = [0u8; GLOBAL_CONFIG_LEN];
        data[GLOBAL_CONFIG_PAUSED_OFFSET] = 0;

        assert_not_paused_data(&data).expect("unpaused config is accepted");
    }

    #[test]
    fn paused_global_config_rejects_with_stable_error_code() {
        let mut data = [0u8; GLOBAL_CONFIG_LEN];
        data[GLOBAL_CONFIG_PAUSED_OFFSET] = 1;

        assert_eq!(
            assert_not_paused_data(&data),
            Err(ProgramError::Custom(0xA10))
        );
    }

    #[test]
    fn malformed_or_short_global_config_is_rejected() {
        assert_eq!(
            assert_not_paused_data(&[0u8; GLOBAL_CONFIG_LEN - 1]),
            Err(ProgramError::AccountDataTooSmall)
        );

        let mut data = [0u8; GLOBAL_CONFIG_LEN];
        data[GLOBAL_CONFIG_PAUSED_OFFSET] = 2;
        assert_eq!(
            assert_not_paused_data(&data),
            Err(ProgramError::InvalidAccountData)
        );
    }
}
