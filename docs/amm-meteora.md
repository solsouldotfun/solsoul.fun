# Meteora DLMM AMM Integration

> **Deferred research / historical validation.** Meteora is not part of SolSoul's current execution
> scope or near-term roadmap. The active product has no AMM migration path; keep this document as
> historical validation context unless the user explicitly reopens AMM work.

## Program IDs

- Devnet / mainnet DLMM program: `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`
- SolSoul target enum: `target_amm = 2` (`Meteora`)

M9 validation uses the devnet DLMM program for live evidence and the ignored local snapshot
`tests/snapshots/meteora-dlmm.so` for ProgramTest smoke coverage.

## PDA Derivation

The bonding-curve adapter and `scripts/devnet-amm-e2e.ts --amm meteora` derive the DLMM accounts from
the sorted pair of WSOL and the Token-2022 meme mint:

- `lb_pair`: `[token_x_mint, token_y_mint, bin_step_le]`
- `preset_parameter`: `[b"preset_parameter", bin_step_le]`
- `reserve_x` / `reserve_y`: `[lb_pair, token_{x,y}_mint]`
- `oracle`: `[b"oracle", lb_pair]`
- `bin_array_bitmap_extension`: `[b"bitmap", lb_pair]`
- `bin_array`: `[b"bin_array", lb_pair, bin_array_index_i64_le]`
- `event_authority`: `[b"__event_authority"]`

The default bin step is 25 bps. The active bin is computed from the 84/16 LP share price using the
same Q64.64 binary-search helper as the Rust adapter.

## Liquidity and LP Lock

In the deferred Meteora research branch, SolSoul sends 84% of real SOL reserves and 84% of real meme reserves through the
Meteora adapter and leaves the remaining 16% for the protocol migration target. The Meteora branch
initializes the active bin arrays as needed, initializes the LB pair if missing, adds liquidity with
a spot-balanced strategy centered on the active bin, then transfers the resulting LP token amount to
an `lp_lock_pda`.

The lock PDA is derived by the bonding-curve program with:

```text
[b"lp_lock", lb_pair]
```

`migrate` writes `lock_end_ts = Clock::get()?.unix_timestamp + 180 * 86_400`. The companion
`release_lp` instruction rejects release before that timestamp and currently uses the curve
`fee_recipient` as the temporary admin source until M11 replaces it with `GlobalConfig.admin`.

## Devnet Live E2E

Historical validation used the live trace command:

```bash
pnpm exec tsx scripts/devnet-amm-e2e.ts --amm meteora
```

The script uses `~/.config/solana/id.json`, launches a fresh Token-2022 mint with `target_amm=2`,
buys until the devnet graduation threshold is crossed, submits `migrate`, and writes:

```text
deployments/devnet-amm-e2e-trace.meteora.json
```

The trace records `lb_pair`, `active_bin_id`, `active_bin_array`, reserve balances, `lp_lock_pda`,
`lp_lock_token_account`, `lp_lock_amount`, `lock_end_ts`, `expected_lock_end_ts`, and every tx sig +
slot + explorer URL. The run is capped at 2.0 SOL and aborts if the measured payer balance delta
exceeds that cap.

## Devnet preset limitation

The live devnet DLMM program currently has no initialized `preset_parameter` account for the common
bin steps checked by the worker (`1, 2, 5, 10, 20, 25, 50, 80, 100, 200, 400`). Direct
`initialize_lb_pair` CPI therefore rejects with Anchor error `AccountNotInitialized` for
`preset_parameter`. To keep the SolSoul devnet graduation/migrate/lock path verifiable without
mainnet writes, the `--features devnet` bonding-curve build records a Meteora receipt account owned
by the bonding-curve program and mints a 1-unit Token-2022 lock receipt into the `lp_lock_pda`'s
Token-2022 ATA. Production/non-devnet builds retain the stricter real DLMM CPI path and SPL LP-token
account checks.
