# SolSoul.fun Whitepaper

> **On-chain Art from Market Activity**
>
> A universal launchpad where every trade generates a unique, fully on-chain SVG Soul.
> No graduation. No migration. Pure mathematical bonding curves forever.

---

## 1. Abstract

SolSoul.fun is a Solana launchpad protocol that combines an **exponential bonding curve** with **deterministic on-chain SVG generation**. Every buy and sell transaction triggers the creation of a unique "Soul" — a mathematical artwork rendered entirely on-chain. Holders who maintain at least one whole token can claim their Souls as Token-2022 NFTs with full provenance.

The protocol rejects the Pump.fun graduation model. There is no threshold, no migration to external AMMs, and no liquidity extraction. The exponential curve runs forever, backed by permanently locked SOL.

**Key innovations:**
- **Sato-style exponential curve**: `T = K·(1−e^(−R/S))` with permanent 0.1% lock fee
- **Soul Engine**: Extensible three-layer rendering system supporting built-in and community renderers
- **Hard Binding**: Token-2022 Transfer Hook validates receipt-backed whole-token positions
- **Pure on-chain art**: All SVGs generated deterministically from trade entropy, no external storage

---

## 2. The Exponential Bonding Curve

### 2.1 Curve Formula

```
T(R) = K · (1 − e^(−R/S))
```

Where:
- `R` = cumulative SOL deposited (lamports)
- `T` = total tokens minted (base units)
- `S` = 500 SOL — the scale parameter ("halfway" point: at 500 SOL, ~63% of K minted)
- `K` = 21,000,000 tokens — asymptotic supply cap

### 2.2 Why Exponential?

| Property | CPMM (Pump.fun) | Exponential (SolSoul) |
|----------|----------------|----------------------|
| Price behavior | Starts ~zero, explodes near graduation | Smooth, predictable appreciation |
| Graduation | Hard threshold → migration | **None** — runs forever |
| Liquidity extraction | Vault SOL migrated to AMM LP | **Never extracted** — vault holds SOL permanently |
| Late-stage trading | Thin liquidity post-graduation | Same mechanics at any scale |

### 2.3 Fee Economics

| Fee | Rate | Destination | Extractable? |
|-----|------|-------------|--------------|
| Launch fee | 0.03 SOL (flat) | Treasury PDA | Yes — protocol revenue |
| Lock fee | 0.1% of buy SOL | Curve PDA | **No** — permanently locked |

The lock fee creates a **deflationary flywheel**: more buys → more locked SOL → higher effective curve backing → all holders benefit.

### 2.4 Safety Valves

- **`self_deprecated`**: At 99% of K (~20.79M tokens), buys halt. Sells continue.
- **Max buy**: 5 SOL per transaction (whale resistance)
- **Same-slot check**: Flash-loan arbitrage prevention
- **Sell ratio limit**: `token_in / remaining_supply ≤ 2` (curve stability)

---

## 3. The Soul Engine

### 3.1 Architecture

The Soul Engine is a three-layer extensible rendering system:

```
┌─────────────────────────────────────────┐
│  Layer 3: Algorithm Registry            │
│  Built-in + Community renderer registry │
├─────────────────────────────────────────┤
│  Layer 2: Engine Core (soul-generator)  │
│  Seed derivation → Renderer dispatch    │
│  → SVG assembly → Account storage       │
├─────────────────────────────────────────┤
│  Layer 1: Renderer Programs             │
│  Built-in (0x0000) | Community (0x0001+)│
└─────────────────────────────────────────┘
```

### 3.2 Seed Derivation

Every Soul is deterministically generated from:

```
seed = hash(signer_pubkey, recent_slot_hashes, swap_amount, is_buy, token_mint, generation)
```

This ensures:
- **Same trade, same Soul**: Replaying a transaction produces identical art
- **Different trades, different Souls**: Every transaction is unique
- **Verifiable provenance**: The seed links art directly to on-chain trade data

### 3.3 Built-in Renderers (Mathematical Art Only)

All built-in renderers generate beauty from pure mathematics:

| ID | Renderer | Mathematical Basis |
|----|----------|-------------------|
| `0x0000_0000` | **Fractal Structure** | IFS (Iterated Function System) affine transforms |
| `0x0000_0001` | **Vector Field** | Flowing vector field visualization |
| `0x0000_0002` | **Crystal Lattice** | Geometric lattice structures |
| `0x0000_0003` | **Strange Attractor** | Chaos system attractors (Lorenz, Rössler) |
| `0x0000_0004` | **Harmonic Wave** | Sine wave harmonic superposition |
| `0x0000_0005` | **Pixel Fractal** | IFS fractal rendered as 32×32 pixel blocks |
| `0x0000_0006` | **Pixel Art** | Value noise + 8-bit palette pixel compositions |

### 3.4 Community Renderers

External developers can register custom renderers:

1. Deploy a renderer program conforming to the `RenderContext` interface
2. Call `register_renderer` with 0.1 SOL registration fee
3. The renderer receives `RenderContext` via CPI and writes SVG into a `RenderBuffer` PDA
4. The engine copies the buffer into the Soul account

Community renderers get **independent 4KB SBF stack frames**, avoiding stack overflow issues that plague monolithic renderers.

---

## 4. Soul NFT Lifecycle

### 4.1 Lifecycle States

```
Launch → Trade → Soul Generated → Holder Claims → NFT in Collection
            ↓                              ↓
      New Soul (unclaimed)          Receipt Created
      (overwrites previous)         (hard-bound to whole token)
```

### 4.2 Claim Requirements

To claim a Soul NFT:
1. The trade that generated the Soul must have produced **≥ 1 whole token** output
2. The claimer must hold **≥ 1 whole token** at claim time
3. Each generation can only be claimed once (ClaimAccount PDA prevents duplicates)

### 4.3 Hard Binding (Receipt System)

When a Soul is claimed:
- A **Receipt** PDA is created, recording the bound quantity and boundary
- A **ReceiptRegistry** tracks active/burned/forfeited receipts per claimant
- Token-2022 Transfer Hook validates transfers against receipt boundaries

**Sell protection**: Selling tokens that would cross a protected whole-token boundary requires explicit receipt settlement (burn/forfeit) before the sell proceeds.

---
## 5. Protocol Parameters

```rust
pub const CURVE_S: u64 = 500_000_000_000;           // 500 SOL
pub const CURVE_K: u64 = 21_000_000_000_000;        // 21M tokens (6 decimals)
pub const SELF_DEPRECATED_THRESHOLD: u64 = CURVE_K * 99 / 100;
pub const MAX_BUY_SOL: u64 = 5_000_000_000;         // 5 SOL
pub const LOCK_FEE_BASIS_POINTS: u64 = 10;            // 0.1%
pub const LAUNCH_FEE_LAMPORTS: u64 = 30_000_000;      // 0.03 SOL
```

---

## 6. Technical Stack

| Layer | Technology |
|-------|-----------|
| Programs | Pinocchio (no-std, zero-allocation) |
| Language | Rust 1.89+ |
| VM | Solana SBF v1.52 |
| Token Standard | Token-2022 (Metadata Pointer, Transfer Hook) |
| Frontend | Next.js 14 + Tailwind CSS + next-intl |
| SDK | TypeScript (tsup) |
| Indexer | Node.js + SQLite + WebSocket subscriptions |
| Renderer SDK | `solsoul-renderer-sdk` crate |

---

## 7. Governance Model

Minimal governance by design:

- **`GlobalConfig`** PDA (33 bytes) stores admin pubkey and pause state
- **`pause` / `unpause`**: Emergency halt of trading (admin-only)
- **`renounce_admin`**: Permanently sets `admin_renounced = true`, making pause immutable
- No DAO, no token governance, no upgrade timelock

The philosophy: protocol rules are encoded in the curve math, not in governance votes.

---

## 8. Security Model

### 8.1 Trust Assumptions

| Component | Trust Level |
|-----------|------------|
| Bonding curve math | Trustless — pure arithmetic, no oracle |
| Soul generation | Trustless — deterministic from on-chain entropy |
| Admin pause | Trusted — can be renounced |
| Renderer registry | Permissioned — admin controls registration |
| Treasury | Trusted — launch fees accumulate, no on-chain disbursement |

### 8.2 Attack Surfaces

- **Flash loans**: Blocked by same-slot check
- **Infinite minting**: Blocked by `self_deprecated` at 99% of K
- **Renderer griefing**: Blocked by registration fee and admin gate
- **Curve manipulation**: Infeasible — price is pure function of cumulative SOL

---

## 9. Comparison with Existing Launchpads

| Feature | Pump.fun | Raydium LaunchPad | SolSoul |
|---------|----------|------------------|---------|
| Curve type | CPMM | Varies | **Exponential** |
| Graduation | Yes → migrate | Varies | **No — runs forever** |
| On-chain art | None | None | **Deterministic SVG Souls** |
| NFT from trading | None | None | **Soul NFT with provenance** |
| Receipt binding | None | None | **Hard-bound whole-token receipts** |
| Lock fee | 1% extractable | Varies | **0.1% permanently locked** |
| Renderer extensibility | N/A | N/A | **Community renderer registry** |

---

## 10. Future Directions

### 10.1 Protocol Extensions
- Per-token curve parameter customization (launch tiers)
- Dynamic lock fee adjustment via governance
- Cross-chain Soul bridges
- Soul NFT fractionalization

### 10.2 Renderer Ecosystem
- Reaction-diffusion systems
- Cellular automata (Conway, Lenia)
- L-systems (plant growth)
- Perlin noise landscapes
- Community renderer marketplace

### 10.3 Product Expansion
- Soul rarity marketplace (after protocol maturity)
- Token-gated communities via receipt ownership
- Cross-token Soul fusions
- Time-decay generative art ( Souls evolve with holding time)

---

## 11. References

- `docs/architecture.md` — Full technical architecture
- `docs/bonding-curve.md` — Curve math and worked examples
- `docs/fee-model.md` — Fee economics deep dive
- `docs/soul-engine.md` — Soul Engine technical specification
- `programs/` — Source code for all on-chain programs

---

*Document version: 2026-05-04*
*Protocol version: EXP_CURVE_V1_K_21M_S_500SOL*
