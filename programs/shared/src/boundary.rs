use pinocchio::error::ProgramError;

pub const FUNGIBLE_TOKEN_DECIMALS: u8 = 6;
pub const FUNGIBLE_TOKEN_BASE_UNITS: u64 = 1_000_000;
pub const MT_CLAIM_QUANTUM_TOKENS: u64 = 10_000;
pub const MT_CLAIM_QUANTUM_BASE_UNITS: u64 = MT_CLAIM_QUANTUM_TOKENS * FUNGIBLE_TOKEN_BASE_UNITS;
pub const MAX_MT_SOUL_NFT_CLAIMS: u64 = 2_100;
pub const WHOLE_TOKEN_BASE_UNITS: u64 = MT_CLAIM_QUANTUM_BASE_UNITS;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BoundaryCrossing {
    pub pre_whole_units: u64,
    pub post_whole_units: u64,
    pub crossed_down: u64,
}

pub fn whole_units(balance: u64) -> u64 {
    balance / WHOLE_TOKEN_BASE_UNITS
}

pub fn crossed_down_boundaries(
    pre_balance: u64,
    sell_amount: u64,
) -> Result<BoundaryCrossing, ProgramError> {
    let post_balance = pre_balance
        .checked_sub(sell_amount)
        .ok_or(ProgramError::InsufficientFunds)?;
    let pre_whole_units = whole_units(pre_balance);
    let post_whole_units = whole_units(post_balance);
    let crossed_down = pre_whole_units
        .checked_sub(post_whole_units)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    Ok(BoundaryCrossing {
        pre_whole_units,
        post_whole_units,
        crossed_down,
    })
}

pub fn balance_for_whole_units(units: u64) -> Result<u64, ProgramError> {
    units
        .checked_mul(WHOLE_TOKEN_BASE_UNITS)
        .ok_or(ProgramError::ArithmeticOverflow)
}

#[cfg(test)]
mod tests {
    use super::{balance_for_whole_units, crossed_down_boundaries, whole_units};

    #[test]
    fn exact_boundary_sell_math_is_deterministic() {
        assert_eq!(whole_units(9_999_999_999), 0);
        assert_eq!(whole_units(10_000_000_000), 1);
        assert_eq!(whole_units(10_000_000_001), 1);

        let dust_to_exact = crossed_down_boundaries(10_000_000_001, 1).expect("math succeeds");
        assert_eq!(dust_to_exact.crossed_down, 0);
        assert_eq!(dust_to_exact.post_whole_units, 1);

        let exact_to_dust = crossed_down_boundaries(10_000_000_000, 1).expect("math succeeds");
        assert_eq!(exact_to_dust.crossed_down, 1);
        assert_eq!(exact_to_dust.post_whole_units, 0);
    }

    #[test]
    fn multi_boundary_crossing_counts_each_whole_unit() {
        let crossing =
            crossed_down_boundaries(30_000_000_000, 20_000_000_001).expect("math succeeds");
        assert_eq!(crossing.pre_whole_units, 3);
        assert_eq!(crossing.post_whole_units, 0);
        assert_eq!(crossing.crossed_down, 3);
    }

    #[test]
    fn balance_for_whole_units_uses_exact_base_units() {
        assert_eq!(balance_for_whole_units(0), Ok(0));
        assert_eq!(balance_for_whole_units(7), Ok(70_000_000_000));
    }

    #[test]
    fn mt_supply_constants_preserve_distinct_curve_and_claim_caps() {
        assert_eq!(super::FUNGIBLE_TOKEN_DECIMALS, 6);
        assert_eq!(super::FUNGIBLE_TOKEN_BASE_UNITS, 1_000_000);
        assert_eq!(super::MT_CLAIM_QUANTUM_TOKENS, 10_000);
        assert_eq!(super::MT_CLAIM_QUANTUM_BASE_UNITS, 10_000_000_000);
        assert_eq!(super::MAX_MT_SOUL_NFT_CLAIMS, 2_100);
    }
}
