# SolSoul Protocol Vision

This document records long-term protocol direction. It is not a product promise
and does not describe current on-chain behavior unless explicitly stated.

## Documentation boundary

Use this file as the registry for future protocol mechanics, economic design,
and product narrative. Keep `docs/architecture.md` focused on current
implemented behavior, and keep `docs/security-checklist.md` focused on concrete
security checks against current code.

For a concise implementation snapshot as of 2026-05-01, see
`docs/vision-status.md`.

Future design changes should be added here first, then promoted into
architecture, security, SDK, and test docs only after implementation decisions
are made.

## Current implementation status

### Implemented

- Single-swap whole-token claim gating via `provenance_token_amount`.
- Receipt binding state created by claims.
- Bonding-curve `sell` hard-binding rejection around protected whole-token
  boundaries.
- Dust dominance raw stat tracking.
- Devnet lifecycle validation for the receipt binding and transfer-hook
  prototype paths.

### Prototype

- Token-2022 Transfer Hook prototype that rejects boundary-breaking direct
  transfers in the controlled lifecycle path.

### Remaining

- Historical/deferred Raydium AMM and wallet compatibility research for Transfer Hook receipt rules, if the product scope is reopened.
- Any future replacement of today's reject-only hook with hook-internal receipt
  burn or forfeit behavior; this is not implemented or claimed today.
- Historical/deferred post-graduation Raydium dust accounting hardening / edge-case validation, if migration research is reopened.
- Official single dust dominance ratio.

### Current product boundaries

- The active product has no AMM migration path: tokens trade on the forever curve.
- Raydium, PumpSwap, and Meteora references in this document are historical/deferred research unless explicitly marked as current implementation.
- External NFT marketplaces are out of the MVP and current roadmap. SolSoul does not list, trade, route, or operate marketplace flows for Soul NFTs.

### Deferred / research-only

- PumpSwap and Meteora AMM paths.
- External marketplace/indexer interoperability research.
- Group / Member collection semantics.
- Token Wrap-style generalized receipt wrappers.
- Permanent Delegate paths.

## Liquid receipts

SolSoul explores a primitive where fungible liquidity can crystallize into a
non-fungible receipt:

```text
integer token balance  --> receipt form
fractional balance     --> fungible liquidity
claim                  --> receipt creation
burn / sell coupling   --> receipt destruction
```

The near-term domain is meme, art, and community assets. The broader design
question is whether "fungible liquidity + non-fungible receipt" can become a
durable on-chain primitive.

## uPEG observation

uPEG demonstrates a hard-binding model:

- A whole token balance can mint a non-fungible receipt.
- Fractional balances remain purely fungible.
- Selling the whole-token position burns the receipt.
- Rare receipts tend to move into cold storage, carrying whole tokens out of
  the AMM.
- Common receipts tend to be sold back and destroyed.

This turns the AMM into both a liquidity layer and a selection machine. Over
time, whole tokens become scarcer in the pool while fractional dust dominates.

## Dust dominance stats

Dust dominance raw components are implemented as market analytics. They should
be interpreted as protocol state components, not as a single official scarcity
ratio. A single public ratio should wait until hard-binding burn or forfeit
mechanics and post-graduation AMM accounting are specified.

The metric suite distinguishes three layers:

1. **Liquidity dust.** Fractional token units held by the active liquidity
   venue, first the bonding curve and later the migrated AMM pool.
2. **Claimable whole liquidity.** Whole-token units still available in the
   active liquidity venue and therefore capable of creating new receipts.
3. **Receipt selection state.** Active, burned, and externally held receipts,
   derived from Soul claim/burn events and token holder distribution.

Candidate pre-graduation inputs:

```text
pool_token_balance = BondingCurveAccount.real_token_reserves
token_unit = 1_000_000
whole_units_in_pool = floor(pool_token_balance / token_unit)
fractional_remainder = pool_token_balance % token_unit
fractional_fill_ratio = fractional_remainder / token_unit
```

Candidate post-graduation inputs:

- AMM token-vault balance for the launched mint.
- Whole units available from the AMM vault balance.
- Fractional remainder in the AMM vault.
- Active and burned Soul counts from claim/burn events.
- Token accounts outside the AMM to estimate whole-token supply removed from
  active liquidity.

The exact public formula should be finalized with the hard-binding design. A
safe default is to display multiple raw components instead of one opaque number:

```text
whole_units_in_pool
fractional_remainder
fractional_fill_ratio
active_receipts
burned_receipts
whole_units_outside_liquidity
```

Only once sell/claim burn or forfeit mechanics enforce receipt destruction
across the relevant liquidity venues should SolSoul present a single "dust
dominance ratio" as a scarcity signal.

## Future requirements registry

These requirements track design targets and current status. Some entries are now
implemented or prototyped; remaining bullets describe the work still needed
before the mechanics become production-grade protocol standards.

### R1. Single-swap whole-token claim gate

**Status: implemented.** Claim eligibility depends on the token amount produced
by the specific swap that generated the Soul, not only on the claimer's wallet
balance at claim time.

Current behavior:

- A buy that outputs less than 1 whole token (`1_000_000` base units) does not
  create a claimable receipt.
- Aggregator-split routes whose individual legs fall below the whole-token
  threshold do not become claimable simply because the wallet accumulates a whole
  token afterward.
- The bonding-curve CPI carries token output provenance, not only SOL input
  amount.

Implemented path:

- Add `provenance_token_amount: u64` to `SoulAccount`.
- Expand `generate_soul` CPI args to include `token_amount`.
- `buy` passes `quote.token_out`; `sell` passes `token_in` or zero depending on
  whether sells remain receipt-eligible.
- `claim_soul` rejects when `provenance_token_amount < MIN_CLAIM_BALANCE`.

### R2. Hard-binding receipt destruction

**Status: partially implemented.** Receipt binding state is created at claim
time, and bonding-curve sells reject lifecycle paths that would cross protected
whole-token boundaries without the required receipt binding accounts. This
implements sell-side hard-binding rejection for the current lifecycle path. The
Transfer Hook decision is intentionally **reject-only**: boundary-breaking
direct transfers reject in the hook and receipt lifecycle changes happen only
through explicit owner-signed settlement instructions placed before the
dependent sell or transfer. Full Raydium AMM and wallet compatibility remain
bounded work. External marketplace listing/trading is outside the MVP/current
roadmap.

To approximate uPEG-style one-way scarcity beyond rejection, receipt ownership
must become coupled to whole-token ownership across all relevant transfer paths.
Today, selling or transferring below the whole-token threshold must either use
the explicit settlement path to burn/forfeit the deterministically selected
receipt set before movement, or revert under the hook/sell boundary policy.

Candidate paths:

1. **Claim burns tokens.** `claim_soul` consumes 1 whole token from the claimer.
   This is simple and creates claim-driven token scarcity, but it does not make
   later sells burn already claimed NFTs.
2. **Sell burns receipts.** `sell` checks the seller's post-sell balance. If it
   crosses below a whole-token boundary, the transaction must burn one or more
   Soul receipts atomically via explicit settlement or revert.

Open design questions:

- Whether future non-hook paths should broaden explicit burn/forfeit settlement
  beyond the current controlled sell/transfer flows.
- Whether any future protocol version should replace the current reject-only
  hook invariant with hook-internal mutation; this is not implemented now and
  must not be claimed without fresh tests and validation.
- Whether ClaimAccount should add a `burned` flag or leave burned state to
  token/NFT supply observation.
- Whether hard-binding should apply only pre-graduation or also after AMM
  migration.

### R3. Official dust dominance stats

**Status: raw metrics implemented; official single ratio remains future and is
explicitly gated.** Dust dominance raw fields can be displayed as analytics,
but a single official ratio should not be framed as proof of contract-enforced
scarcity until hard-binding burn or forfeit mechanics cover the relevant
liquidity paths.

PD18.F5 wires the gate concretely: `OFFICIAL_DUST_DOMINANCE_RATIO_GATE` in
`sdk/src/index.ts` defaults to `enabled=false` and
`isOfficialDustDominanceRatioEnabled(...)` returns `false` until all three
prerequisites are validated:

1. bonding-curve sell hard-binding,
2. direct Token-2022 transfer hook boundary enforcement, and
3. historical/deferred Raydium receipt invariant evidence if AMM work is reopened.

While the gate is closed, the public app, docs, APIs, and mission artifacts
present these values as raw/liquidity dust metrics only — never as an "official
scarcity proof" or "official dominance ratio". An automated copy-audit test
(`app/src/lib/dustDominanceGate.test.ts`) scans `app/messages/{en,zh}.json` and
the StatsDashboard component for affirmative wording.

Current / minimum dashboard fields:

- `whole_units_in_pool`
- `fractional_remainder`
- `fractional_fill_ratio`
- `active_receipts`
- `burned_receipts`
- `whole_units_outside_liquidity`

### R4. Liquid receipt narrative

**Status: active product framing with legal and compliance constraints.**

The long-term narrative is not "dynamic NFT" alone. It is a chain-native receipt
primitive:

- holding = receipt-backed position,
- transfer = position movement,
- burn/sell = receipt destruction,
- fractional balances = fungible liquidity.

This language should stay bounded to cultural and community assets until the
protocol has explicit legal and compliance review for more formal financial
receipt categories.

### R5. Token-2022 transfer-hook path

**Status: prototype implemented; production-grade standard remains future.** The
current prototype rejects boundary-breaking direct transfers in a controlled
lifecycle path. Production use still requires wallet account-resolution and
failure-mode compatibility work; historical/deferred Raydium AMM compatibility
is only relevant if AMM scope is explicitly reopened. External NFT marketplace
listing/trading is not part of the MVP/current roadmap.

Token-2022 Transfer Hook is the Solana-native primitive closest to Uniswap V4
hooks. If SolSoul evolves from bonding-curve-only receipt creation into a
general liquid-receipt token standard, the transfer-hook path should continue to
be evaluated before expanding bespoke `sell`-only coupling.

Potential use cases:

- Reject boundary-breaking direct transfers unless explicit settlement has
  already burned or forfeited the selected receipts.
- Make receipt rules apply to direct wallet transfers and post-graduation AMM
  flows, not only bonding-curve `sell`.
- Keep fractional balances fungible while enforcing receipt behavior around
  integer balances.
- Move the receipt invariant closer to the token transfer layer, similar to how
  uPEG expresses behavior at the exchange layer.

Relevant Token-2022 extensions to evaluate:

- **Transfer Hook:** primary candidate for hard-binding transfer semantics.
- **Metadata Pointer / Metadata:** already aligned with current all-on-chain
  Soul NFT metadata.
- **Group / Member:** possible future collection semantics for Souls under one
  launch.
- **Permanent Delegate:** can force burn/transfer but is high-risk unless the
  delegate is a constrained PDA with immutable, rule-bound behavior.
- **CPI Guard:** user-enabled CPI protections may block program-driven burn or
  transfer flows and must be accounted for in UX and failure handling.

Design caution:

- Transfer Hook introduces compatibility and account-resolution complexity.
- Hook-internal burn/forfeit should not be adopted until deterministic receipt
  mutation and wallet compatibility are specified and tested. Historical/deferred
  Raydium AMM integration must remain out of active product claims unless AMM
  scope is explicitly reopened. The current hook invariant remains reject-only.
- Short-term claim gates can remain in the bonding-curve and soul-generator
  programs; Transfer Hook is the longer-term route for a token-standard-like
  receipt primitive.

### R6. Solana Program docs research backlog

**Status: research backlog; some items adopted in the prototype and current
Token-2022 handling.**

Solana Program docs surfaced several primitives and constraints that should
continue to be evaluated before implementing a production liquid-receipt
standard.

**Transfer Hook account resolution.**

- A transfer-hook program must implement `Execute`.
- The validation account is derived from `["extra-account-metas", mint]`.
- Extra accounts are stored as TLV data and can describe static accounts, PDAs
  off the hook program, and PDAs off other programs.
- Future hook-based receipt logic should use this model to resolve SoulAccount,
  receipt registry, global config, claim/burn state, and collection accounts
  instead of requiring every integrator to hand-code account lists.

**Token-2022 base layout and extension parsing.**

- Token accounts retain the legacy first 165 bytes; mints retain the legacy
  first 82 bytes.
- Current fixed-offset reads for mint, owner, and amount are acceptable for base
  fields.
- Future extension-aware logic must use Token-2022 TLV / StateWithExtensions
  semantics rather than assuming exact account sizes.

**Checked token instructions.**

- Future token transfers should prefer `transfer_checked` or
  `transfer_checked_with_fee` where possible.
- Any support for Transfer Fee extension must account for actual received
  amounts, not nominal transfer amounts.

**Associated token accounts.**

- Token-2022 ATA derivation includes the token program id:
  `[wallet, token_program_id, mint]`.
- SDK and app code must preserve this distinction if SolSoul ever supports both
  Token and Token-2022 paths.

**Token Wrap.**

- Token Wrap's escrow-backed `wrap` / `unwrap` pattern is a useful reference for
  receipt-backed forms: deposit underlying asset, mint wrapped representation,
  burn wrapped representation, release underlying asset.
- Backpointer PDAs and permissionless wrapped-mint creation are relevant design
  references if SolSoul creates a generalized receipt wrapper.
- Metadata sync is a useful pattern for bridging Token-2022 metadata and
  Metaplex-compatible surfaces.

**Memo.**

- Memo can annotate launch, claim, burn, or receipt-transfer events in logs.
- Memo is not state and must not be required for protocol correctness.

**Confidential balances.**

- Confidential transfers hide balances and transfer amounts, which conflicts
  with public dust dominance, whole-token eligibility, and provenance.
- Treat confidential receipt mechanics as a separate future privacy track, not
  part of near-term hard-binding.

**Stake-pool design principles.**

- Preserve redeemability / exit safety: complex receipt mechanics should not
  trap holders in states where token or receipt exit is impossible.
- Prefer permissionless cranks or public repair instructions for state that can
  fall behind.
- Be mindful of transaction size and compute limits if hook logic requires many
  extra accounts or multi-receipt burns.

**Mint close authority and pausable mints.**

- Avoid mint close authority for core meme-token and Soul NFT mints because
  closing and recreating mints can break stored mint assumptions.
- Token-2022 Pausable could provide a mint-level emergency brake, but it overlaps
  with SolSoul's global pause and should not be added without a clear operational
  policy.

## Next protocol work

- Specify production Transfer Hook compatibility for wallets; Raydium compatibility is historical/deferred unless AMM work is reopened.
- Preserve the reject-only Transfer Hook invariant unless a future explicit
  feature implements and validates hook-internal burn/forfeit.
- Harden historical/deferred Raydium dust accounting and edge-case validation only if AMM migration work is reopened.
- Finalize the official single dust dominance ratio only after the required
  hard-binding mechanics are enforced.
- Continue Group / Member, Token Wrap, and Permanent Delegate research paths as
  deferred design work.

## SolSoul direction

SolSoul can frame the Soul NFT as a chain-native receipt generated from trading
history:

- The bonding curve is the issuance and price-discovery market.
- One whole token can become a receipt-bearing position.
- The Soul NFT records provenance: trade side, amount, trader, seed hash, mint,
  and generated art.
- Fractional tokens remain liquid.
- Current hard-binding mechanics reject protected bonding-curve sells around
  whole-token boundaries; future burn or forfeit mechanics could extend that
  behavior across broader transfer paths.

The short-term focus remains cultural assets. More formal receipt use cases
such as equity, debt, insurance, or bills of lading are long-term design
references only, not current protocol claims.

## Design constraints

- Do not describe SolSoul as issuing securities, insurance, debt, or legal
  claims.
- Keep the current product language anchored in art, provenance, liquidity, and
  community assets.
- Distinguish implemented hard-binding rejection and raw dust analytics from
  future burn/forfeit mechanics and official scarcity ratios.
- Prefer mechanisms whose rules are enforced on chain rather than by operator
  discretion.
