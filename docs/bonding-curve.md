# SolSoul Exponential Bonding Curve

SolSoul uses a **sato-style exponential bonding curve** that runs forever. There is no graduation threshold, no migration to external AMMs, and no liquidity extraction. The curve is parameterized as:

```text
T(R) = K · (1 − e^(−R/S))
```

Where:

- `R` = cumulative SOL deposited into the curve (lamports)
- `T` = total tokens minted (base units, 6 decimals)
- `S` = scale parameter = **500 SOL** (500_000_000_000 lamports)
- `K` = supply cap parameter = **21_000_000 tokens** (21_000_000_000_000 base units)

This is an **exponential saturation curve**. Early buyers receive more tokens per SOL; as `R` grows, marginal minting slows and asymptotically approaches `K`. The curve never reaches `K` exactly, meaning there is always remaining supply to mint.

## Why exponential instead of CPMM?

| Property | CPMM (Pump.fun style) | Exponential (SolSoul) |
|----------|----------------------|----------------------|
| Price behavior | Starts near zero, explodes near graduation | Smooth, predictable appreciation |
| Graduation | Yes — hard threshold triggers migration | **No** — curve runs forever |
| Liquidity extraction | Vault SOL is migrated to AMM LP | **Never extracted** — vault holds SOL permanently |
| Late-stage trading | Thin liquidity post-graduation | Same curve mechanics at any scale |
| Token supply | Fixed at launch | Asymptotically approaches `K` |

The exponential curve aligns with SolSoul’s "**Launch → Curve Forever**" philosophy: every token has perpetual on-chain liquidity without external dependencies.

## Parameters

### Current hardcoded values

```rust
pub const CURVE_S: u64 = 500_000_000_000;      // 500 SOL
pub const CURVE_K: u64 = 21_000_000_000_000;   // 21M tokens (6 decimals)
pub const SELF_DEPRECATED_THRESHOLD: u64 = CURVE_K * 99 / 100;  // 20.79M
pub const MAX_BUY_SOL: u64 = 5_000_000_000;    // 5 SOL per tx
pub const LOCK_FEE_BASIS_POINTS: u64 = 10;       // 0.1%
pub const LAUNCH_FEE_LAMPORTS: u64 = 30_000_000; // 0.03 SOL
```

### Parameter meaning

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `S` | 500 SOL | The "halfway" point: at 500 SOL cumulative, ~63% of `K` has been minted. Doubling `S` makes the curve flatter (more tokens per SOL early). |
| `K` | 21M | Theoretical asymptotic supply cap. At 99% of `K`, the token enters `self_deprecated` mode. |
| `MAX_BUY_SOL` | 5 SOL | Prevents single-transaction whale accumulation and same-slot arbitrage. |
| `LOCK_FEE` | 0.1% | Deducted from `sol_in` on every buy, permanently locked in the curve PDA. Non-extractable. |
| `LAUNCH_FEE` | 0.03 SOL | One-time fee paid by launcher to the treasury PDA. |

### Future: Launch Tiers

While currently hardcoded, the parameterization naturally supports preset tiers:

| Tier | `S` | `K` | Character | Use case |
|------|-----|-----|-----------|----------|
| **Conservative** | 1000 SOL | 21M | Very flat early curve, slow appreciation | Stable community tokens |
| **Standard** *(current)* | 500 SOL | 21M | Balanced appreciation | General meme launches |
| **Aggressive** | 250 SOL | 10.5M | Steep early price, rapid appreciation | High-risk/high-reward |

> These tiers are aspirational — on-chain configurability requires per-token curve parameters in `BondingCurveAccount`, which is planned for a future protocol version.

## Buy mechanics

Given cumulative SOL `R` and total minted `T`, a buyer sends `sol_in` lamports:

1. **Lock fee**: `lock_fee = sol_in * 10 / 10_000` (0.1%) is sent to the curve PDA permanently.
2. **Net SOL**: `net_sol = sol_in - lock_fee` enters the vault.
3. **New cumulative**: `R' = R + net_sol`.
4. **New total minted**: `T' = K · (1 − e^(−R'/S))`.
5. **Token output**: `token_out = T' − T`.

The curve uses 128-bit fixed-point math with `SCALE = 10^12` and an 8-term Taylor expansion for `e^(-x)`, bounded to < 0.001% error for the operational range.

### Worked buy example

```text
R = 0 (first buy)
sol_in = 1_000_000_000 lamports (1 SOL)
lock_fee = 1_000_000 (0.1%)
net_sol = 999_000_000

R' = 999_000_000
x = R' / S = 999_000_000 / 500_000_000_000 = 0.001998
e^(-x) ≈ 0.998004
1 - e^(-x) ≈ 0.001996

T' = 21_000_000_000_000 * 0.001996 ≈ 41_916_000_000
 token_out ≈ 41_916_000_000 base units ≈ 41,916 tokens
```

## Sell mechanics

Given `token_in` tokens to sell:

1. **Check ratio**: `token_in / (K - T) ≤ 2` prevents extreme `ln(1+x)` instability.
2. **New total minted**: `T' = T − token_in`.
3. **Solve inverse**: `R' = −S · ln(1 − T'/K)`.
4. **SOL output**: `sol_out = R − R'`.
5. **Vault transfer**: `sol_out` is transferred from vault PDA to seller.

Sell does **not** charge an additional fee. The only protocol fee on the sell side is the already-locked 0.1% from the original buy.

### Worked sell example (roundtrip)

Continuing from the buy example:

```text
T = 41_916_000_000
token_in = 41_916_000_000 (sell everything)
T' = 0

y = T / K = 41_916_000_000 / 21_000_000_000_000 ≈ 0.001996
ln(y) ≈ −6.215 (in fixed-point)
R_s_before ≈ 6.215 * SCALE

y' = T' / K = 0
ln(y') = 0
R_s_after = 0

diff = R_s_before - R_s_after ≈ 6.215 * SCALE
sol_out = S * diff / SCALE ≈ 999_000_000 lamports

Roundtrip result: ~999M lamports out from 1B in (0.1% lock fee retained)
```

## Self-deprecation (`self_deprecated`)

When `total_minted ≥ K * 99 / 100` (≈20.79M tokens), the curve sets `self_deprecated = true`. Once deprecated:

- **Buys are rejected** (`CurveError::SelfDeprecated`)
- **Sells still work** — holders can exit into the vault

This is a safety valve: as `T` approaches `K`, the marginal token price becomes extreme, and the protocol prevents infinite minting at asymptotic cost. The remaining 1% supply acts as a permanent liquidity buffer.

## Flash-loan protection

Both buy and sell require:

```rust
if state.last_interaction_slot == current_slot {
    return Err(CurveError::SameSlotArbitrage.into());
}
```

This prevents same-transaction flash-loan arbitrage against the curve.

## Fee economics summary

| Fee | Amount | Recipient | Extractable? |
|-----|--------|-----------|--------------|
| Launch fee | 0.03 SOL | Treasury PDA | Yes — protocol revenue |
| Lock fee | 0.1% of buy SOL | Curve PDA | **No** — permanently locked |

The lock fee is the key economic innovation: it creates **deflationary buy pressure** by permanently removing SOL from circulation (locked in the curve PDA) while simultaneously increasing the effective cumulative SOL in the curve. This benefits all token holders by increasing the vault backing per token.

## Program account layout

`BondingCurveAccount` is **57 bytes**:

```text
Offset  Size  Field
0       32    mint (Pubkey)
32      8     cumulative_sol (u64)
40      8     total_minted (u64)
48      1     self_deprecated (u8: 0 or 1)
49      8     last_interaction_slot (u64)
```

There are no virtual reserves, no fee recipient, no migration target, and no graduation flags. The entire state is the two cumulative counters plus safety flags.
