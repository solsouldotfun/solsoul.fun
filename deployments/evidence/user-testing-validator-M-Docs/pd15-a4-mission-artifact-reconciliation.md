# PD15.A4 — Mission artifact reconciliation

Cross-checks that mission docs, library plan, features.json, and validation contract / state agree on PD15 Raydium-only + no-NFT-marketplace scope and the M-Docs runbook alignment.

## mission.md

> **Milestone M-Docs: Devnet Runbook 对齐**
> - **deferred-devnet-runbook-wallet-signed-doc-fix**: 刷新或退役 `docs/devnet-runbook.md` 中过时的 server-signed `/api/devnet-smoke` 指引，与 wallet-signed-only / retired-410 现状对齐（用户已批准本次执行）

> Wallet: **Phantom only**（Solflare 等不在范围内）
> AMM: **Raydium only active**；Meteora/PumpSwap 仅 deferred/historical
> 外部 NFT marketplace listing/trading **out of scope**

mission.md explicitly authorizes the runbook fix and reiterates Phantom-only / Raydium-only / no-marketplace, matching PD15 boundaries.

## AGENTS.md

> **Scope:** Raydium is the only active AMM target. Meteora/PumpSwap are deferred/historical only. External NFT marketplace listing/trading is out of scope.
> **Wallet:** Phantom only for this mission. Solflare and other wallets are out of scope.

> **`deferred-devnet-runbook-wallet-signed-doc-fix`**: documentation edits to `docs/devnet-runbook.md` are approved for this run. Align stale server-signed `/api/devnet-smoke` instructions with current wallet-signed-only and retired-410 behavior.

> Predecessor guidance still binding: PD13 fresh devnet metadata, wallet-signed-only public writes, retired `/api/devnet-smoke` 410 behavior, no server signer fallback, no mainnet writes, PD14 NeonPuff visual identity. The worker-facing PD15 plan lives at `library/pd15-raydium-no-nft-market.md` and must stay consistent with `features.json`, `validation-contract.md`, and `validation-state.json`.

> Soul NFTs remain claim/view/Profile/gallery/rarity/provenance assets only — do NOT add listing, sell, buy-now, orderbook, marketplace, Tensor, Magic Eden, or external marketplace flows.

AGENTS.md is consistent with PD15 plan and the runbook's wallet-signed-only / retired-410 scope.

## library/pd15-raydium-no-nft-market.md

Active scope:
- Raydium only; PumpSwap/Meteora deferred research/historical.
- Soul NFT marketplace/listing/trading out of MVP scope.
- Soul NFTs remain claim, view, Profile/gallery, rarity, provenance only.

Predecessor alignment:
- PD13 fresh devnet binding: wallet-signed public writes, `/api/devnet-smoke` retired with HTTP 410, no server signer fallback, no mainnet writes.
- PD14 NeonPuff identity preserved.

Task plan (PD15.F1, PD15.F2, PD15.F3) and validation-checklist match PD15.A1..A4 expectations. Library plan explicitly fulfills PD15.A4 via PD15.F3 roadmap/mission consistency audit.

## features.json (filtered)

- `deferred-devnet-runbook-wallet-signed-doc-fix`:
  - `milestone`: `M-Docs`
  - `status`: `completed`
  - `fulfills`: `["VAL-RUNTIME-009", "VAL-RUNTIME-010", "PD15.A4"]`
  - Description explicitly cites: replace with wallet-signed Phantom-only flow OR mark legacy sections retired/historical; reflect 410 retirement; align with PD15 Raydium-only + no-marketplace; link runbook to validation contract.

- `PD18.F3`:
  - `fulfills`: includes `PD15.A1`, `PD15.A2`, `PD15.A3` (in addition to `PD18.A3`).
  - `status`: `completed`.
  - PD15.A1/A2/A3 coverage is owned by PD18.F3 in this completion mission, while PD15.A4 is owned by `deferred-devnet-runbook-wallet-signed-doc-fix`.

- `docs-cleanup-readme-and-runbook-historical-evidence` (M-Docs-Cleanup): retroactively dropped `SOLSOUL_DEVNET_SMOKE_SIGNER` / `NEXT_PUBLIC_DEVNET_SMOKE` from README and historical `evidence/devnet/*.png` references, no contradiction with PD15.A4 scope.

Each PD15 assertion is claimed exactly once across the active feature set.

## validation-contract.md (PD15 section)

PD15.A1 — Raydium-only AMM scope (Browser/App tests/Files).
PD15.A2 — Non-Raydium guarded (App/SDK tests/Files).
PD15.A3 — Soul NFT marketplace out of scope (Browser/App tests/Files).
PD15.A4 — Future roadmap tasks ready for execution; behavior cites mission library plan, features.json entries, contract coverage audit.

VAL-RUNTIME-009 / VAL-RUNTIME-010 specify the same retired-410, `cache-control: no-store`, wallet-signed-only retirement copy that the runbook documents and the curl evidence captured this run confirmed.

## Reconciliation conclusion

| Surface | Wallet-signed-only | Retired 410 documented | Raydium-only active scope | No Soul NFT marketplace | Traceability link |
| --- | --- | --- | --- | --- | --- |
| `docs/devnet-runbook.md` | §0, §4 | §0, §4, §6 | §0, §7 | §0 | §0 |
| `library/pd15-raydium-no-nft-market.md` | (predecessor alignment) | (predecessor alignment) | scope decision | boundary list | n/a |
| `mission.md` | yes | implied via M-Docs feature | yes | yes | yes |
| `AGENTS.md` | yes | yes | yes | yes | yes |
| `features.json` (`deferred-devnet-runbook-wallet-signed-doc-fix`) | yes (description) | yes (description) | yes (description) | yes (description) | yes (`fulfills`) |
| `validation-contract.md` (`VAL-RUNTIME-009`, `VAL-RUNTIME-010`, `PD15.A4`) | yes | yes | yes | yes | yes |

No contradictions found. The M-Docs feature `deferred-devnet-runbook-wallet-signed-doc-fix` is internally consistent with PD15 plan, mission boundaries, and validation contract.
