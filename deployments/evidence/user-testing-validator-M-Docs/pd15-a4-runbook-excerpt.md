# PD15.A4 — docs/devnet-runbook.md alignment evidence

Verification that `docs/devnet-runbook.md` aligns with current wallet-signed-only / retired-410 behavior, Raydium-only active AMM scope, and no Soul NFT marketplace promises. Captured 2026-05-02.

## (a) §0 Status & Scope — wallet-signed-only + retired 410 + Raydium-only + no marketplace

> **Status (PD13 → PD18 update):** SolSoul public devnet writes are **wallet-signed only**. The legacy server-signed `/api/devnet-smoke` route is **retired and returns HTTP 410** (`cache-control: no-store`) on both public Vercel and local `:3100`. Any historical `SOLSOUL_DEVNET_SMOKE_SIGNER` server-signer instructions in this document are kept for archival traceability; **do not use them** — they will not produce a transaction signature.

> **Active AMM scope:** Raydium CP-Swap is the **only** active migration target. Meteora and PumpSwap remain deferred / historical research only and are not on the active mainnet-readiness path. External Soul NFT marketplace listing/sell/buy-now/orderbook flows (Tensor, Magic Eden, etc.) are **out of scope** for this product.

> **Wallet:** Phantom only for connected-wallet flows in this product scope.

## (b) §0 Traceability link to validation contract

> **Traceability:** This runbook fulfills the validation contract assertions tracked in mission `28e8c5a1-19eb-4009-90ad-17b50a016960` (`~/.factory/missions/28e8c5a1-19eb-4009-90ad-17b50a016960/validation-contract.md`), specifically:
> - `VAL-RUNTIME-009` — public `/api/devnet-smoke` returns 410 wallet-signed-only retirement copy
> - `VAL-RUNTIME-010` — local `:3100/api/devnet-smoke` matches the same 410 contract
> - `VAL-PHANTOM-*` — Phantom wallet-signed launch/buy/claim/transfer/sell/settlement evidence
> - `PD15.A1..A4` — Raydium-only active scope, no NFT marketplace exposure

## (c) §4 Frontend reproduce wallet-signed-only

Section title is "4. Frontend reproduce (wallet-signed only)". Quoted body:

> All public writes (launch / buy / sell / generate Soul / claim Soul / hook-aware transfer / settlement) are **wallet-signed by Phantom**.

> If Phantom is not installed, locked, on the wrong network, or unfunded, the UI must surface a localized wallet-not-ready state. **Do not** retry through any server signer, script signer, or other wallet — public writes in this product are wallet-signed only (see `VAL-PHANTOM-*` in the mission validation contract).

## (d) §4 /api/devnet-smoke retired (HTTP 410) — matches curl evidence

Subsection "`/api/devnet-smoke` is retired (HTTP 410)":

> The legacy `POST /api/devnet-smoke` route is permanently retired. Both public (`https://solsoul-devnet.vercel.app/api/devnet-smoke`) and local (`http://127.0.0.1:3100/api/devnet-smoke`) endpoints respond with:
> - HTTP `410 Gone`
> - `cache-control: no-store`
> - JSON body whose `error` names the corresponding wallet-signed flow (e.g. `claim Soul`, `launch`, `buy`, `sell`, `generate Soul`) and the phrase `wallet-signed only`

> This route must remain 410 in **all** builds — production, public devnet, and local. There is no longer a `SOLSOUL_DEVNET_SMOKE_SIGNER` opt-in; the server signer has been removed. The behavior contract is enforced by `app/src/app/api/devnet-smoke/route.ts` and `app/src/app/api/devnet-smoke/route.test.ts`, and is asserted by `VAL-RUNTIME-009` (public) and `VAL-RUNTIME-010` (local) in the mission validation contract.

Curl evidence captured this run (matches the documented contract):

- Public claim → `HTTP/2 410`, `cache-control: no-store`, body `{"error":"Devnet smoke claim is retired. Use the connected wallet claim Soul flow; SolSoul public writes are wallet-signed only."}`
- Public launch → `HTTP/2 410`, body `Devnet smoke launch is retired. Use the connected wallet launch flow; SolSoul public writes are wallet-signed only.`
- Public default → `HTTP/2 410`, body `Devnet smoke write is retired. Use the connected wallet write flow; SolSoul public writes are wallet-signed only.`
- Local claim/launch/default on `127.0.0.1:3100` → `HTTP/1.1 410 Gone`, identical bodies, identical wallet-signed-only retirement copy.

## (e) Historical D.F3 server-signed flow correctly retired (no actionable un-retired instructions)

§4 historical block is wrapped in:

> ⚠️ **Retired / historical only.** The block below documents the original D.F3 server-signed smoke flow before PD13 retirement. It is preserved purely for provenance. The route now returns 410, and the `SOLSOUL_DEVNET_SMOKE_SIGNER`, `NEXT_PUBLIC_DEVNET_SMOKE`, and `~/.config/solana/id.json` server-signing surfaces are **no longer wired to any write path**. Running the legacy command will not produce a transaction; it will just start a dev server with retired-route copy.

The legacy server-signed command is presented as struck-through `~~...~~` markdown only (lines 186, 188 of the runbook). No actionable, un-retired smoke-signer command remains.

## (f) §5 historical artifacts notes

§5 opens with:

> ⚠️ **Historical (PD12 / D.F3 era).** ... Current active devnet program IDs and evidence live in:
> - `deployments/devnet.json` (active program IDs, current redeploy slot/sig, source provenance)
> - `deployments/public-devnet.json` (Vercel runtime, source provenance, program upgrade evidence)
> - `deployments/evidence/m4-phantom-devnet-full-flow-evidence/` (current Phantom wallet-signed launch/buy/claim/transfer/sell/settlement evidence)
> - `deployments/devnet-amm-e2e-trace.raydium.json` (active Raydium-only trace)

Frontend smoke historical screenshots (`evidence/devnet/*.png`) are explicitly noted as gitignored / dangling for new clones, replaced by current Phantom evidence.

## (g) §6 Known gotchas — explicit do-not-enable guard

> - **Do not enable `SOLSOUL_DEVNET_SMOKE_SIGNER` or treat `NEXT_PUBLIC_DEVNET_SMOKE` as a write-path gate**: the server-signed `/api/devnet-smoke` route is permanently retired (HTTP 410). All public devnet writes must be Phantom wallet-signed.

## (h) §7 Mainnet warning — Raydium-only

> **Migrate must remain Raydium-only for the active product scope. Do NOT deploy to mainnet unless the Raydium CP-Swap path is verified against the approved commit; PumpSwap and Meteora are deferred / historical research only unless the user explicitly reopens that scope.**

> Raydium CP-Swap migrate evidence must be current; PumpSwap and Meteora remain disabled/deferred unless an explicit future scope change reopens them.

## (i) Marketplace exclusion grep

`rg -i "tensor|magic ?eden|orderbook|marketplace|listing" docs/devnet-runbook.md` produced exactly two hits, both inside §0 guardrail copy explicitly excluding external Soul NFT marketplace flows from scope. No section of the runbook promises or instructs Soul NFT listing/sell/buy-now/orderbook/Tensor/Magic Eden behavior.

## Summary

`docs/devnet-runbook.md` is internally consistent and aligned with current wallet-signed-only / retired-410 behavior, Raydium-only scope, and no Soul NFT marketplace exposure. All historical server-signed artifacts are explicitly labeled "retired / historical only" with strikethrough on the actionable command lines, and there is no actionable un-retired `SOLSOUL_DEVNET_SMOKE_SIGNER` / `NEXT_PUBLIC_DEVNET_SMOKE` instruction anywhere in the runbook.
