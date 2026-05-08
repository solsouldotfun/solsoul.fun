use pinocchio::error::ProgramError;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum CurveError {
    ZeroAmount = 0x4300,
    SlippageExceeded = 0x4301,
    InsufficientLiquidity = 0x4302,
    SelfDeprecated = 0x4303,
    MaxBuyExceeded = 0x4304,
    SameSlotArbitrage = 0x4305,
    SellTooLarge = 0x4306,
    HardBindingAccountMissing = 0x4307,
    HardBindingActiveReceipt = 0x4308,
    InvalidReceiptBinding = 0x4309,
    NonCanonicalTokenAccount = 0x430a,
    UnsafeFeeRecipient = 0x430b,
}

impl From<CurveError> for ProgramError {
    fn from(error: CurveError) -> Self {
        ProgramError::Custom(error as u32)
    }
}

pub const CURVE_S: u64 = 500_000_000_000;
pub const CURVE_K: u64 = 21_000_000_000_000;
pub const SELF_DEPRECATED_THRESHOLD: u64 = CURVE_K * 99 / 100;
pub const MAX_BUY_SOL: u64 = 5_000_000_000;
pub const LOCK_FEE_BASIS_POINTS: u64 = 10;
pub const LAUNCH_FEE_LAMPORTS: u64 = 30_000_000;
pub const BASIS_POINTS_DENOMINATOR: u64 = 10_000;
pub const MAX_SELL_RATIO_NUM: u64 = 2;
pub const MAX_SELL_RATIO_DEN: u64 = 1;

const SCALE: u128 = 1_000_000_000_000;
const MAX_EXP_X: u128 = 4_605_170_000_000;

const EXP_NEG_INT: [u128; 5] = [
    SCALE,
    367_879_441_171,
    135_335_283_237,
    49_787_068_368,
    18_315_638_889,
];

fn exp_neg(x_fixed: u128) -> Result<u128, ProgramError> {
    if x_fixed == 0 {
        return Ok(SCALE);
    }
    if x_fixed >= MAX_EXP_X {
        return Ok(0);
    }
    let n = (x_fixed / SCALE) as usize;
    let f = x_fixed % SCALE;
    if n >= EXP_NEG_INT.len() {
        return Ok(0);
    }
    let f2 = f.saturating_mul(f) / SCALE;
    let f3 = f2.saturating_mul(f) / SCALE;
    let f4 = f3.saturating_mul(f) / SCALE;
    let f5 = f4.saturating_mul(f) / SCALE;
    let f6 = f5.saturating_mul(f) / SCALE;
    let f7 = f6.saturating_mul(f) / SCALE;
    let f8 = f7.saturating_mul(f) / SCALE;
    let exp_f = SCALE
        .saturating_sub(f)
        .saturating_add(f2 / 2)
        .saturating_sub(f3 / 6)
        .saturating_add(f4 / 24)
        .saturating_sub(f5 / 120)
        .saturating_add(f6 / 720)
        .saturating_sub(f7 / 5040)
        .saturating_add(f8 / 40320);
    Ok(EXP_NEG_INT[n].saturating_mul(exp_f) / SCALE)
}

fn solve_exp_inverse(target: u128) -> Result<u128, ProgramError> {
    if target >= SCALE {
        return Ok(0);
    }
    if target == 0 {
        return Ok(MAX_EXP_X);
    }
    let mut low: u128 = 0;
    let mut high: u128 = MAX_EXP_X;
    for _ in 0..30 {
        let mid = (low + high) / 2;
        let exp_mid = exp_neg(mid)?;
        if exp_mid > target {
            low = mid;
        } else {
            high = mid;
        }
    }
    Ok((low + high) / 2)
}

fn ln_inv(y_fixed: u128) -> Result<u128, ProgramError> {
    if y_fixed == 0 {
        return Ok(0);
    }
    let target = SCALE.saturating_sub(y_fixed);
    solve_exp_inverse(target)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BuyQuote {
    pub token_out: u64,
    pub cumulative_sol_after: u64,
    pub total_minted_after: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SellQuote {
    pub sol_out: u64,
    pub cumulative_sol_after: u64,
    pub total_minted_after: u64,
}

pub fn quote_buy(
    cumulative_sol: u64,
    total_minted: u64,
    sol_in: u64,
    min_amount_out: u64,
) -> Result<BuyQuote, ProgramError> {
    if sol_in == 0 {
        return Err(CurveError::ZeroAmount.into());
    }
    if sol_in > MAX_BUY_SOL {
        return Err(CurveError::MaxBuyExceeded.into());
    }
    let r_before = u128::from(cumulative_sol);
    let r_after = r_before + u128::from(sol_in);
    let t_before = u128::from(total_minted);
    let x_after = (r_after * SCALE) / u128::from(CURVE_S);
    let exp_term = exp_neg(x_after)?;
    let one_minus_exp = SCALE.saturating_sub(exp_term);
    let k_scaled = u128::from(CURVE_K) * SCALE;
    let t_after = (k_scaled * one_minus_exp) / (SCALE * SCALE);
    let token_out = t_after.saturating_sub(t_before);
    if token_out == 0 {
        return Err(CurveError::InsufficientLiquidity.into());
    }
    if token_out < u128::from(min_amount_out) {
        return Err(CurveError::SlippageExceeded.into());
    }
    Ok(BuyQuote {
        token_out: u64::try_from(token_out).map_err(|_| ProgramError::ArithmeticOverflow)?,
        cumulative_sol_after: u64::try_from(r_after)
            .map_err(|_| ProgramError::ArithmeticOverflow)?,
        total_minted_after: u64::try_from(t_after).map_err(|_| ProgramError::ArithmeticOverflow)?,
    })
}

pub fn quote_sell(
    cumulative_sol: u64,
    total_minted: u64,
    token_in: u64,
    min_amount_out: u64,
) -> Result<SellQuote, ProgramError> {
    if token_in == 0 {
        return Err(CurveError::ZeroAmount.into());
    }
    let t_before = u128::from(total_minted);
    if u128::from(token_in) > t_before {
        return Err(CurveError::InsufficientLiquidity.into());
    }
    let t_after = t_before.saturating_sub(u128::from(token_in));
    let remaining = u128::from(CURVE_K).saturating_sub(t_before);
    if remaining > 0 {
        let ratio = (u128::from(token_in) * u128::from(MAX_SELL_RATIO_DEN)) / remaining;
        if ratio > u128::from(MAX_SELL_RATIO_NUM) {
            return Err(CurveError::SellTooLarge.into());
        }
    }
    let y_before = (t_before * SCALE) / u128::from(CURVE_K);
    let r_s_before = ln_inv(y_before)?;
    let y_after = (t_after * SCALE) / u128::from(CURVE_K);
    let r_s_after = ln_inv(y_after)?;
    let diff = r_s_before.saturating_sub(r_s_after);
    let sol_out = (u128::from(CURVE_S) * diff) / SCALE;
    if sol_out == 0 {
        return Err(CurveError::InsufficientLiquidity.into());
    }
    if sol_out < u128::from(min_amount_out) {
        return Err(CurveError::SlippageExceeded.into());
    }
    let cum_sol_after = u128::from(cumulative_sol).saturating_sub(sol_out);
    Ok(SellQuote {
        sol_out: u64::try_from(sol_out).map_err(|_| ProgramError::ArithmeticOverflow)?,
        cumulative_sol_after: u64::try_from(cum_sol_after)
            .map_err(|_| ProgramError::ArithmeticOverflow)?,
        total_minted_after: u64::try_from(t_after).map_err(|_| ProgramError::ArithmeticOverflow)?,
    })
}

pub fn calculate_lock_fee(sol_amount: u64) -> Result<u64, ProgramError> {
    sol_amount
        .checked_mul(LOCK_FEE_BASIS_POINTS)
        .and_then(|v| v.checked_div(BASIS_POINTS_DENOMINATOR))
        .ok_or(ProgramError::ArithmeticOverflow)
}

pub fn required_launch_lamports(curve_rent: u64, vault_rent: u64) -> Result<u64, ProgramError> {
    curve_rent
        .checked_add(vault_rent)
        .and_then(|rent| rent.checked_add(LAUNCH_FEE_LAMPORTS))
        .ok_or(ProgramError::ArithmeticOverflow)
}

pub fn reject_if_insufficient_launch_funds(
    payer_lamports: u64,
    curve_rent: u64,
    vault_rent: u64,
) -> Result<(), ProgramError> {
    let required = required_launch_lamports(curve_rent, vault_rent)?;
    if payer_lamports < required {
        return Err(ProgramError::InsufficientFunds);
    }
    Ok(())
}

pub fn assert_fee_recipient_is_not_alias(
    fee_recipient: &[u8; 32],
    forbidden: &[&[u8; 32]],
) -> Result<(), ProgramError> {
    for candidate in forbidden {
        if fee_recipient == *candidate {
            return Err(CurveError::UnsafeFeeRecipient.into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn curve_cap_remains_twenty_one_million_fungible_tokens() {
        assert_eq!(CURVE_K, 21_000_000_000_000);
    }

    #[test]
    fn exp_neg_at_zero_is_one() {
        assert_eq!(exp_neg(0).unwrap(), SCALE);
    }
    #[test]
    fn exp_neg_at_one() {
        let result = exp_neg(SCALE).unwrap();
        let expected = 367_879_441_171u128;
        let err = if result > expected {
            result - expected
        } else {
            expected - result
        };
        assert!(err * 10000 / expected < 10);
    }
    #[test]
    fn exp_neg_saturates_to_zero() {
        assert_eq!(exp_neg(MAX_EXP_X).unwrap(), 0);
        assert_eq!(exp_neg(MAX_EXP_X + SCALE).unwrap(), 0);
    }
    #[test]
    fn ln_inv_smoke() {
        let y = SCALE / 2;
        let result = ln_inv(y).unwrap();
        let expected = 693_147_000_000u128;
        let err = if result > expected {
            result - expected
        } else {
            expected - result
        };
        assert!(err * 10000 / expected < 50);
    }
    #[test]
    fn buy_and_sell_roundtrip() {
        let sol_in = 1_000_000_000u64;
        let net_sol_in = sol_in - calculate_lock_fee(sol_in).unwrap();
        let buy = quote_buy(0, 0, net_sol_in, 1).unwrap();
        assert!(buy.token_out > 0);
        let sell = quote_sell(
            buy.cumulative_sol_after,
            buy.total_minted_after,
            buy.token_out,
            1,
        )
        .unwrap();
        let tolerance = sol_in / 1000; // 0.1% tolerance
        assert!(
            sell.sol_out >= net_sol_in - tolerance && sell.sol_out <= net_sol_in + tolerance,
            "roundtrip: net_sol_in={net_sol_in}, sol_out={}",
            sell.sol_out
        );
    }
    #[test]
    fn max_buy_guard() {
        assert_eq!(
            quote_buy(0, 0, MAX_BUY_SOL + 1, 0),
            Err(ProgramError::Custom(CurveError::MaxBuyExceeded as u32))
        );
    }
    #[test]
    fn sell_too_large_rejected() {
        let t = CURVE_K * 4 / 5;
        let token_in = 3 * (CURVE_K - t) + 1;
        assert_eq!(
            quote_sell(0, t, token_in, 0),
            Err(ProgramError::Custom(CurveError::SellTooLarge as u32))
        );
    }
}
