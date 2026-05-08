use pinocchio::error::ProgramError;

#[repr(u8)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TargetAmm {
    Raydium = 0,
    Pump = 1,
    Meteora = 2,
}

impl TryFrom<u8> for TargetAmm {
    type Error = ProgramError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Raydium),
            1 => Ok(Self::Pump),
            2 => Ok(Self::Meteora),
            _ => Err(ProgramError::InvalidArgument),
        }
    }
}

pub const fn is_valid_amm(value: u8) -> bool {
    matches!(value, 0..=2)
}

#[cfg(test)]
mod tests {
    use super::{is_valid_amm, TargetAmm};
    use pinocchio::error::ProgramError;

    #[test]
    fn target_amm_discriminants_are_stable() {
        assert_eq!(TargetAmm::Raydium as u8, 0);
        assert_eq!(TargetAmm::Pump as u8, 1);
        assert_eq!(TargetAmm::Meteora as u8, 2);
    }

    #[test]
    fn target_amm_try_from_roundtrips_all_supported_values() {
        for (raw, expected) in [
            (0, TargetAmm::Raydium),
            (1, TargetAmm::Pump),
            (2, TargetAmm::Meteora),
        ] {
            assert_eq!(TargetAmm::try_from(raw), Ok(expected));
            assert_eq!(expected as u8, raw);
        }
    }

    #[test]
    fn target_amm_validation_rejects_out_of_range_values() {
        assert!(is_valid_amm(0));
        assert!(is_valid_amm(1));
        assert!(is_valid_amm(2));

        for raw in 3..=u8::MAX {
            assert!(!is_valid_amm(raw));
            assert_eq!(TargetAmm::try_from(raw), Err(ProgramError::InvalidArgument));
        }
    }
}
