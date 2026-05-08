# SolSoul Fee Model

SolSoul uses a **two-fee structure** designed for credible neutrality and long-term token-holder alignment.

## Fee overview

| Fee | Trigger | Rate | Destination | Extractable? | Purpose |
|-----|---------|------|-------------|--------------|---------|
| **Launch Fee** | `create_token` | 0.03 SOL (flat) | Treasury PDA | Yes | Protocol revenue to cover operational costs |
| **Lock Fee** | `buy` | 0.1% of `sol_in` | Curve PDA | **No** | Permanent deflationary lock; increases effective curve backing |

## Launch fee (0.03 SOL)

Paid once per token launch by the launcher. The fee is transferred to the **Treasury PDA** (`[b"treasury"]`).

### Treasury mechanics

- The treasury is a PDA owned by the bonding-curve program with **zero data** (it only holds lamports).
- On `create_token`, if the treasury has zero lamports, it is created with `LAUNCH_FEE_LAMPORTS` lamports.
- If the treasury already exists (from a previous launch), the launch fee is transferred into it.
- There is **no on-chain logic** for spending treasury funds. Distribution is an off-chain operational concern.

### Rationale

The flat 0.03 SOL fee is low enough to not discourage experimentation, but non-zero enough to prevent spam launches. At current SOL prices (~$150), this is approximately **$4.50 per launch**.

## Lock fee (0.1% of buy SOL)

Deducted from every **buy** transaction before the net SOL enters the vault.

### Lock mechanics

```rust
let lock_fee = sol_in * LOCK_FEE_BASIS_POINTS / BASIS_POINTS_DENOMINATOR;
// lock_fee = sol_in * 10 / 10_000 = sol_in * 0.001
let net_sol_in = sol_in - lock_fee;
```

1. `lock_fee` lamports are transferred from buyer to the **Curve PDA**.
2. `net_sol_in` lamports are transferred from buyer to the **Vault PDA**.
3. The curve math uses `net_sol_in` to calculate `token_out`.

### Why "lock"?

The lock fee is **non-extractable** by design:

- The Curve PDA holds the locked SOL as part of its lamport balance.
- There is **no instruction** that transfers SOL out of the Curve PDA.
- The locked SOL increases the total economic backing of the token without increasing redeemable vault SOL.

This creates a **deflationary flywheel**:

```text
More buys → More lock fees → More SOL permanently in curve PDA
         → Higher effective cumulative SOL → Higher token price
         → Existing holders benefit from increased backing
```

### Comparison with trading fees

| Model | Fee on Buy | Fee on Sell | Extractable? | Effect |
|-------|-----------|-------------|--------------|--------|
| Pump.fun | 1% | 1% | Yes — to fee recipient | Extractive; recipient can dump |
| Raydium | 0.25% | 0.25% | Yes — to LPs + protocol | Extractive; LP rewards are farmed |
| **SolSoul** | **0.1%** | **0%** | **No** — permanently locked | **Deflationary; benefits all holders** |

## Sell side

**Sell does not charge any fee.**

When a seller burns tokens, they receive the full SOL amount calculated by the inverse curve. The protocol has already captured its 0.1% during the original buy. Charging a sell fee would:

1. Discourage exit liquidity
2. Create a "spread" that benefits no one (since fees are non-extractable)
3. Violate the principle of symmetric curve access

## Economic impact model

For a token that accumulates **1000 SOL** in buys:

```text
Gross buys:     1,000 SOL
Lock fees:      1.0 SOL  (0.1%)
Net in vault:   999 SOL
Locked in curve: 1.0 SOL

Effective price impact: ~0.1% higher than "fee-free" curve
Token holder benefit: 1 SOL of permanent, non-extractable backing
```

At scale (e.g., 100,000 SOL cumulative buys):

```text
Locked SOL: 100 SOL (~$15,000 at $150/SOL)
This is permanently removed from circulating economic supply.
```

## Future considerations

### Dynamic lock fee

The current 0.1% is fixed. A future protocol version could make `LOCK_FEE_BASIS_POINTS` configurable per-token or governed by protocol DAO. However, any increase would require careful consideration of:

- Early buyer incentive alignment
- Competitive positioning vs other launchpads
- Frontrunning resistance (higher fees = less profitable MEV)

### Treasury usage

The treasury currently accumulates launch fees without on-chain disbursement. A future governance module could:

- Allocate treasury to protocol development
- Distribute to token holders (dividend model)
- Burn treasury SOL (additional deflation)

These decisions are **intentionally left off-chain** for the current protocol version to maintain minimal governance surface area.
