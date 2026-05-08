# Liquidity Migration

> **Historical / deferred reference.** The active SolSoul product no longer exposes graduation or
> AMM migration. Tokens trade on the exponential curve forever. This document is retained for legacy
> fail-closed adapter evidence and future optional research only.

## Historical behavior (SEC.F2 fail-closed)

The retired `bonding-curve::migrate` path was historically gated to fixed Raydium target metadata.
It required the curve to be `graduated == true` and `migrated == false`, then dispatched through the
`AmmAdapter` trait to the configured `target_amm` adapter (Raydium=0 / Pump=1 / Meteora=2). When
the adapter could not run because remaining accounts were missing or the adapter was deferred
(`AMM_ADAPTER_NOT_IMPLEMENTED` / `0xA00`), the handler **failed closed** with custom error `0xA0F`
and did not mutate vault SOL, vault token reserves, the migration target, the migration token
account, or the `migrated` flag. The previous behavior — silently falling through to a placeholder
transfer that drained the vault — was removed as part of the SEC user-reported hotfix track.

`migration_target` fields on legacy accounts are retained for decoding only. There is no active
production migration scope unless a future product decision explicitly reopens AMM work.

## Historical graduation-to-migration flow

1. `buy` applies fees and records net SOL received by the curve.
2. When real SOL reserves reach `graduation_threshold_lamports`, the curve sets
   `graduated = true`.
3. Subsequent `buy` and `sell` calls reject through the shared graduated guard.
4. `generate_soul` remains callable directly through Soul Generator, so the art
   path is decoupled from post-graduation trading.
5. `migrate` can be called once after graduation, but only when the configured
   `target_amm` adapter is supplied with all of its required remaining accounts
   and verified vault/PDA identities. Raydium requires the 21-account Raydium
   CP-Swap remaining-account list (see `programs/bonding-curve/src/amm/raydium.rs`).
6. If the adapter accounts are missing, wrong, or the adapter is deferred,
   `migrate` rejects with `0xA0F` (`MIGRATE_ADAPTER_FAIL_CLOSED`) and leaves
   curve/vault/migration-target balances untouched. A second `migrate` attempt
   without verified accounts also rejects.

## Deferred Raydium CPI research roadmap

This deferred research would replace the placeholder asset transfer with Raydium CPI calls that
create the pool, initialize liquidity accounts, deposit graduated SOL and remaining meme tokens, and
lock or hand off LP authority according to the launch policy. It is not part of the current
curve-only execution scope.

### Phase 1 — Raydium interface pinning

- Use Raydium only as fixed historical/deferred venue metadata if migration research is reopened.
- Pin the Raydium program IDs for devnet and mainnet in SDK configuration rather than hardcoding experimental IDs into on-chain logic.
- Document the Raydium instruction ABI, required accounts, signer model, and any Token-2022 support caveats.

### Phase 2 — Account model

Expected production accounts for the Raydium path include:

- AMM program account and pool state account.
- Base and quote vault accounts.
- LP mint and LP token destination/lock account.
- OpenBook/observation/config accounts if required by the Raydium path.
- Token-2022 meme mint, wrapped SOL/native SOL handling account, and token
  program accounts.
- Curve PDA signer, vault PDA, and `migration_target`/LP authority account.

The curve PDA should remain the protocol signer for releasing graduated assets.
If LP tokens are minted, the destination policy must be explicit: burn, lock,
send to a governance/multisig PDA, or vest to a configured authority.

### Phase 3 — Safety gates

- Require `graduated == true` and `migrated == false`.
- Re-validate curve, vault, mint, token program, and venue program IDs before
  every CPI.
- Compute every token/SOL amount with checked arithmetic and preserve the
  launch-fee/trading-fee accounting invariants.
- Release mutable account borrows before the AMM CPI, mirroring the existing
  buy → Soul Generator CPI pattern.
- Record the exact pool address and LP destination in state or an event/log once
  the CPI succeeds.

### Phase 4 — Verification plan

- Unit tests for account validation, one-shot migration, and amount splitting.
- `solana-program-test` scenario for graduated → migrate → second migrate
  rejection with deterministic fake venue accounts.
- Devnet rehearsal against Raydium with small liquidity, followed by
  `solana program show` and pool explorer verification.
- Documentation update with the final venue accounts and rollback policy before
  mainnet consideration.

## Open production risks

- Raydium Token-2022 support and account requirements must be verified against the exact deployment used for launch.
- Pool initialization may require more compute than the current placeholder path.
- LP authority policy is a product/security decision, not only an implementation detail.
- Devnet venue deployments may not match mainnet behavior exactly, so final launch needs a separate pre-mainnet audit.

## Deferred AMM research

- PumpSwap validation remains historical/local research and is not an active migration target.
- Meteora DLMM validation remains historical/deferred research and is not an active migration target.
- Do not use the deferred docs as operator instructions unless the user explicitly reopens that scope.

```rust
// TODO: M4 real Raydium IDL / CPI integration.
```
