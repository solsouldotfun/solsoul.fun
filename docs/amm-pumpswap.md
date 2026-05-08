# PumpSwap AMM Integration

> **Deferred research / historical validation.** PumpSwap is not part of SolSoul's current execution
> scope or near-term roadmap. The active product has no AMM migration path; keep this document as
> historical validation context unless the user explicitly reopens AMM work.

## Program ID and Snapshot

- Mainnet PumpSwap program: `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`
- Local snapshot path: `tests/snapshots/pumpswap.so`
- SHA256 fixture: `tests/snapshots/pumpswap.sha256.txt`

`tests/snapshots/pumpswap.so` is intentionally gitignored because it is a binary snapshot. The
committed SHA256 fixture is the reviewable contract for the exact mainnet program binary that local
M10 verification loads.

## Snapshot Procurement

Run snapshot procurement from the repository root:

```bash
bash scripts/dump-pumpswap.sh
```

The script first checks `solana config get` and refuses to continue if the current CLI config points
at mainnet. It then performs a single explicit read-only dump against mainnet RPC:

```bash
solana program dump pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA tests/snapshots/pumpswap.so --url https://api.mainnet-beta.solana.com
```

After the dump, the script computes `shasum -a 256 tests/snapshots/pumpswap.so`. On a first run with
no `tests/snapshots/pumpswap.sha256.txt`, it creates the fixture. On later runs, it compares the new
hash against the committed fixture. A mismatch means the mainnet PumpSwap program has changed; the
script prints:

```text
MAINNET PROGRAM UPGRADED — orchestrator decision required before proceeding
```

and exits `65` so the worker stops before treating a changed binary as verified.

## Local-Only Verification Rationale

M10 verification was conducted only on a local validator loaded with a mainnet PumpSwap program snapshot. If PumpSwap research is reactivated, inspect an actual mainnet PumpSwap transaction before any user-approved rehearsal.

The local validator is started with the PumpSwap snapshot plus SolSoul programs, for example:

```bash
solana-test-validator --reset --quiet --rpc-port 8899 \
  --bpf-program pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA tests/snapshots/pumpswap.so \
  --bpf-program HuSRC61oy9qyRDH21sHD8kmkuVsB5Jd9tdJMkbk4zNjQ target/deploy/bonding_curve.so \
  --bpf-program 5wGUMWySAafwgTpGNgSaTMh1kiejnEGVTZj9x7wWJftk target/deploy/soul_generator.so
```

`scripts/local-pumpswap-e2e.ts` is the milestone driver that loads this environment and writes
`deployments/local-pumpswap-trace.json`.

## Why No Devnet or Mainnet Live Run

PumpSwap does not have an official devnet deployment that can exercise the same CPI surface, so a
devnet live run would not prove compatibility with the real program. Mainnet live testing would use
real funds and would violate the M10 mission boundary against PumpSwap live e2e on devnet/mainnet.
The snapshot validator gives deterministic, repeatable verification of SolSoul's CPI construction
without submitting any mainnet write transaction.

## IDL Sources Used

M10 uses the public Pump AMM IDL published by Pump:

- `https://raw.githubusercontent.com/pump-fun/pump-public-docs/main/idl/pump_amm.json`
- Repository revision inspected during M10.F1:
  `pump-fun/pump-public-docs@7de0b959fa2bdab379a2f75f5433d3de1e35d229`
- Observed IDL SHA256:
  `5a15060f412974e53068bae7e89aa6004defbb70ef0c56e3902ce75d124accb6`

Because the public IDL was available, no mainnet transaction reverse-engineering was required for
M10.F1. The mission library notes still record the discriminators, account orders, PDA seeds, and
snapshot hash: [`library/pumpswap-reverse-engineering.md`](library/pumpswap-reverse-engineering.md).

## SolSoul CPI Interpretation

The deferred PumpSwap adapter research used `target_amm = 1` and prepared PumpSwap `create_pool` with the Token-2022 meme mint as `base_mint`, WSOL as `quote_mint`, and pool index `0`. Initial liquidity used the same 84/16 reserve split as the historical AMM adapter work: 84% of reserves seeded liquidity, then 84% of the resulting LP balance was burned while the remaining 16% stayed with the creator / soul authority according to Pump's default ownership rule.
