# SolSoul Vision Status

This document is the concise status view for the long-term protocol ideas in
`docs/protocol-vision.md`.

Date of this snapshot: **2026-05-01**

## Reading guide

- Use `docs/protocol-vision.md` for long-term protocol direction and open design
  questions.
- Use this file for the simpler question: "what is actually implemented now?"
- Use `README.md` and `docs/architecture.md` for current product scope and
  concrete runtime behavior.

## Current product scope

- The active MVP path is the exponential bonding curve running forever: **no graduation, no AMM migration, no liquidity extraction**.
- Soul NFTs are claim, gallery, provenance, and rarity artifacts, not a
  marketplace product.
- Raydium, PumpSwap, and Meteora remain research / historical validation paths, not active
  launch scope.
- Mainnet deployment and audit are still deferred operator decisions.

## Vision Status Matrix

| Vision item | Status | Current implementation | Remaining gap |
| --- | --- | --- | --- |
| R1. Single-swap whole-token claim gate | Implemented | Claim eligibility uses buy provenance and `provenance_token_amount`, not just wallet balance. Sub-whole outputs are not claimable. | None for the current lifecycle path. |
| R2. Hard-binding receipt destruction | Implemented (PD18.F2 reject-only invariant) | Claims create `receipt` and `receipt_registry` state. Bonding-curve sells and supported direct transfers that cross protected whole-token boundaries reject unless the explicit settlement path has already marked the deterministic receipt set burned or forfeited. Transfer Hook behavior is **explicitly reject-only**: `TRANSFER_HOOK_INVARIANT = "REJECT_ONLY"`, the hook never burns, never forfeits, and never mutates receipt lifecycle internally. Receipt lifecycle transitions (Active→Burned/Forfeited) happen only through soul-generator settlement. See `programs/transfer-hook/src/lib.rs` inline invariant docs. 16 unit tests cover boundary-crossing, multi-boundary, missing/wrong receipt, and repeated-attempt scenarios. Historical/deferred post-graduation Raydium evidence is retained only as adapter validation context. | Broader wallet coverage still needs hardening before any universal scarcity claim. |
| R3. Official dust dominance stats | Implemented (gated — PD18.F4+F5) | Raw dust components exist in the stats pipeline: whole units in liquidity, fractional remainder, receipt counts, and whole units outside liquidity. App, docs, and APIs surface these as raw/liquidity dust metrics only with explicit "not an official scarcity signal" disclaimers. Historical/deferred Raydium receipt invariant evidence is retained for validation context but is not an active migration promise. 90+ combined stats/dust/gate tests pass. | The gate may be opened in a future PD after a full production audit; no public "official scarcity proof" / "official dominance ratio" surface ships before that. |
| R4. Liquid receipt narrative | Active framing | The app and docs already frame SolSoul as a token lifecycle with claimable receipts, not only a dynamic NFT toy. | The protocol is not yet a generalized receipt primitive outside the current cultural/community asset framing. |
| R5. Token-2022 transfer-hook path | Implemented (PD18.F2+F3) | Transfer Hook enforces REJECT-ONLY invariant for boundary-breaking direct transfers (PD18.F2, 16 unit + 4 integration tests). Historical/deferred Raydium receipt invariant validation rejects hook-enabled mints at the adapter boundary with stable error 0xA03; this is retained as validation evidence, not as an active migration path. Wallet direct transfers remain the only supported path for receipt-bound tokens. | Broader wallet compatibility and RPC/account-resolution failure-mode hardening remain future work. |
| PumpSwap path | Deferred / historical validation | Local snapshot validation and documentation exist. | Not part of the active MVP or current execution scope. |
| Meteora path | Deferred / partial validation | Program/local coverage and documented devnet evidence exist. | Not part of the active MVP. Direct real devnet DLMM CPI remains limited. |
| External NFT marketplace interoperability | Deferred | Compatibility research and docs exist. | Marketplace listing and trading flows are intentionally out of scope. |
| Group / Member, wrappers, permanent delegate | Research-only | No production implementation. | Still future design space only. |

## What is solid today

- Buy-triggered soul generation is implemented.
- Claim gating depends on the specific qualifying swap, not later wallet
  accumulation.
- Claims create explicit receipt-binding state.
- Bonding-curve sell flows enforce protected whole-token boundaries.
- Atomic settlement can move receipts from active to burned / forfeited state
  during the controlled lifecycle path.
- Dust analytics are already present as auditable raw components.
- Transfer Hook behavior exists as a prototype for direct transfers.
- The frontend, SDK, indexer, and tests already understand the receipt / dust /
  provenance model.

## What is not finished yet

- A universal hard-binding rule that behaves consistently across all wallets
  and direct transfers.
- A production-standard Transfer Hook rollout.
- A single public "dust dominance ratio" that can honestly be marketed as
  contract-enforced scarcity. Until then `OFFICIAL_DUST_DOMINANCE_RATIO_GATE`
  stays closed and any current dust value is surfaced as raw/liquidity dust
  only — see `sdk/src/index.ts` and `app/src/lib/dustDominanceGate.ts`.
- Production use of AMM migration paths.
- Marketplace flows for Soul NFTs.
- Mainnet audit and final deployment.

## Practical interpretation

Today SolSoul is best described as:

- a forever-curve meme launch flow,
- with on-chain Soul generation,
- with single-swap provenance-based Soul claims,
- with receipt binding and sell-side boundary enforcement,
- plus prototype transfer-hook enforcement and dust analytics.

It is **not** yet best described as:

- a generalized liquid-receipt token standard,
- an AMM-migration production protocol,
- or a fully mainnet-complete, audited receipt system.

## Primary references

- `README.md`
- `docs/protocol-vision.md`
- `docs/architecture.md`
- `programs/soul-generator/src/instructions/claim_soul.rs`
- `programs/soul-generator/src/instructions/settle_receipts.rs`
- `programs/bonding-curve/src/instructions/sell.rs`
- `programs/transfer-hook/src/lib.rs`
- `app/src/lib/stats.ts`
- `app/src/lib/statsRoute.ts`
