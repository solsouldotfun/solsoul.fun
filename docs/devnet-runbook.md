# SolSoul Devnet Runbook

This is the canonical Milestone D artifact: another engineer should be able to read only this file and reproduce the devnet deploy, SDK end-to-end run, and frontend smoke evidence.

## 0. Status & Scope (read first)

> **Status (PD13 → PD18 update):** SolSoul public devnet writes are **wallet-signed only**. The legacy server-signed `/api/devnet-smoke` route is **retired and returns HTTP 410** (`cache-control: no-store`) on both public Vercel and local `:3100`. Any historical `SOLSOUL_DEVNET_SMOKE_SIGNER` server-signer instructions in this document are kept for archival traceability; **do not use them** — they will not produce a transaction signature.
>
> **Current curve scope:** the active product uses an exponential bonding curve that runs forever:
> no graduation, no AMM migration, and no liquidity extraction. Raydium CP-Swap, Meteora, and
> PumpSwap references in this runbook are historical/deferred adapter evidence only unless the scope
> is explicitly reopened. External Soul NFT marketplace listing/sell/buy-now/orderbook flows
> (Tensor, Magic Eden, etc.) are **out of scope** for this product.
>
> **Active devnet program IDs (PD13 fresh deployment):** bonding-curve `CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un`, soul-generator `34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ`, transfer hook `Gccbqia51Z8qpdeWvp1yGTrTwoyJX6WNGhFyH5pnPW66`, Raydium CP-Swap `CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW`. The `HuSRC…` and `5wGU…` IDs that appear later in this runbook (sections 2, 3, 4, 5) are **historical PD12 / pre-PD13 IDs** retained only for provenance reference under fields such as `previousPublicDevnet` and `oldVsNewProgramIds`. Do not redeploy or smoke-test against them as if they were current — see `deployments/devnet.json` and `deployments/public-devnet.json` for authoritative current values.
>
> **Wallet:** Phantom only for connected-wallet flows in this product scope.
>
> **Traceability:** This runbook fulfills the validation contract assertions tracked in mission `28e8c5a1-19eb-4009-90ad-17b50a016960` (`~/.factory/missions/28e8c5a1-19eb-4009-90ad-17b50a016960/validation-contract.md`), specifically:
> - `VAL-RUNTIME-009` — public `/api/devnet-smoke` returns 410 wallet-signed-only retirement copy
> - `VAL-RUNTIME-010` — local `:3100/api/devnet-smoke` matches the same 410 contract
> - `VAL-PHANTOM-*` — Phantom wallet-signed launch/buy/claim/transfer/sell/settlement evidence
> - `PD15.A1..A4` — historical/deferred AMM scope, no NFT marketplace exposure
>
> Sections 1–3 below remain valid for **on-chain re-deploy and SDK reproduction by an authorized operator with a deployer keypair** (Section 1 prerequisites). Section 4 has been rewritten as a wallet-signed-only flow; the legacy `SOLSOUL_DEVNET_SMOKE_SIGNER` block in Section 4 is preserved as a struck-through historical reference only. Section 5 records both the original D.F3 artifacts (historical) and points readers to current public/local devnet evidence under `deployments/` and `deployments/evidence/`.

## 1. Prerequisites

- Repository root: `/Users/davirian/dev/active/ideas/solsouldotfun`.
- Toolchain: Rust/Cargo with Solana SBF support, Solana CLI, Node 20+, and pnpm 9+.
- Use the devnet deploy keypair at `~/.config/solana/id.json`.
- Expected deployer / upgrade authority pubkey: `8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i`.
- Confirm devnet balance is at least `5 SOL` before any deploy or e2e run:

```bash
solana balance 8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i --url https://api.devnet.solana.com
```

- Do not run with a mainnet Solana CLI config. Check before starting:

```bash
solana config get
```

The RPC URL must be devnet for deploy/e2e work, and it must not be mainnet. At the end of the run, restore the worker default localnet config:

```bash
solana config set --url http://127.0.0.1:8899
```

## 2. On-chain re-deploy step-by-step

> ⚠️ **Use `deployments/devnet.json` as the source of truth for current program IDs.** The table below is the **PD12 / D.F3 historical** snapshot that this runbook was originally written against. Substitute the current active IDs (`CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un` for bonding-curve, `34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ` for soul-generator) when running redeploy commands.

| Program | Historical D.F3 devnet program ID (superseded) | Artifact |
| --- | --- | --- |
| bonding-curve | `HuSRC61oy9qyRDH21sHD8kmkuVsB5Jd9tdJMkbk4zNjQ` | `target/deploy/bonding_curve.so` |
| soul-generator | `5wGUMWySAafwgTpGNgSaTMh1kiejnEGVTZj9x7wWJftk` | `target/deploy/soul_generator.so` |

Build SBF artifacts for the devnet rehearsal profile:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cargo build-sbf --workspace --features devnet
```

`--features devnet` is mandatory for this rehearsal because devnet graduation is intentionally lowered to `0.5 SOL`; the mainnet/default threshold is `85 SOL`, which would make the end-to-end rehearsal expensive and slow. Mainnet must NEVER be built with --features devnet

Re-deploy each program to its existing devnet ID with the same upgrade authority keypair:

```bash
solana program deploy \
  --program-id HuSRC61oy9qyRDH21sHD8kmkuVsB5Jd9tdJMkbk4zNjQ \
  --upgrade-authority ~/.config/solana/id.json \
  --url https://api.devnet.solana.com \
  target/deploy/bonding_curve.so

solana program deploy \
  --program-id 5wGUMWySAafwgTpGNgSaTMh1kiejnEGVTZj9x7wWJftk \
  --upgrade-authority ~/.config/solana/id.json \
  --url https://api.devnet.solana.com \
  target/deploy/soul_generator.so
```

Verify both programs after deployment:

```bash
solana program show HuSRC61oy9qyRDH21sHD8kmkuVsB5Jd9tdJMkbk4zNjQ --url https://api.devnet.solana.com
solana program show 5wGUMWySAafwgTpGNgSaTMh1kiejnEGVTZj9x7wWJftk --url https://api.devnet.solana.com
```

Expected metadata from the recorded deployment:

| Program | ProgramData address | Upgrade authority | Last recorded redeploy slot | Last recorded redeploy tx |
| --- | --- | --- | --- | --- |
| bonding-curve | `DfB4CvM2eZdy87qbaRJz39ytE7prmpyfHDJ4avRXkRU9` | `8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i` | `458347814` | [`63t4KmTXjZbE3BxHPAw49tKeRGj4XZWC8JGBk2doq3JAFYyW97HanoieAGVFcT3kcfCd6hhsuLdptMpwf9BSJZA1`](https://explorer.solana.com/tx/63t4KmTXjZbE3BxHPAw49tKeRGj4XZWC8JGBk2doq3JAFYyW97HanoieAGVFcT3kcfCd6hhsuLdptMpwf9BSJZA1?cluster=devnet) |
| soul-generator | `GYauQrXWC7awEwMXSE94rSxnRbPDGjYLRpvqztE4MVcT` | `8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i` | `458348884` | [`3jVUGLVBfCwbXpzktg7UcDgGrUii8bLqkKLZWcYkwrZ2m2ZukRsVoL1YMRQmRgkSuMUVEPD3F7VXnHW6X1BNvqoA`](https://explorer.solana.com/tx/3jVUGLVBfCwbXpzktg7UcDgGrUii8bLqkKLZWcYkwrZ2m2ZukRsVoL1YMRQmRgkSuMUVEPD3F7VXnHW6X1BNvqoA?cluster=devnet) |

## 3. End-to-end SDK reproduce

Run the devnet SDK driver from the repository root:

```bash
pnpm exec tsx scripts/devnet-e2e.ts
```

This historical script reads `deployments/devnet.json`, pays with `~/.config/solana/id.json`,
launches a Token-2022 meme mint, buys until the old devnet graduation threshold is crossed, calls
post-graduation `generate_soul`, claims a Soul NFT, exercises the retired fail-closed Raydium
adapter evidence, and writes `deployments/devnet-e2e-trace.json`.

> **Note (SEC.F2 update):** The retired `migrate` instruction is no longer a placeholder transfer.
> It dispatches through the `AmmAdapter` trait to the configured legacy `target_amm` adapter and
> fails closed (`0xA0F`) when required Raydium adapter accounts are missing or the adapter is
> deferred. See `docs/migration.md` for historical fail-closed behavior.

How to read `deployments/devnet-e2e-trace.json`:

- `programs` contains the devnet program IDs: bonding-curve `HuSRC61oy9qyRDH21sHD8kmkuVsB5Jd9tdJMkbk4zNjQ`, soul-generator `5wGUMWySAafwgTpGNgSaTMh1kiejnEGVTZj9x7wWJftk`.
- `launch` contains the meme mint, curve PDA, vault PDA, soul PDA, and launch setup transactions.
- `buys` is ordered; the final buy has `triggered_graduation: true`.
- `graduation` repeats the graduation signature and slot.
- `claim` contains post-grad `generate_soul`, `claim_soul`, NFT mint, NFT supply/decimals, and metadata pointer target.
- `migrate` contains the historical migration transaction result (D.F3 traces show a placeholder lamport flow; SEC.F2 evidence is fail-closed legacy Raydium metadata).
- `frontend_smoke` contains the browser smoke mint/PDA/signature/screenshot evidence from the UI path.

Recorded SDK run summary:

| Field | Value |
| --- | --- |
| Payer | `8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i` |
| Meme symbol | `DEVNETKXJ6MM` |
| Meme mint | `ECGijwCdrYomg9x1rq3pYmC4QeJwqvVGnx4sG8dQEF5i` |
| Curve PDA | `AhywM45KTYdoCgakrDWjWrZTBFQ4HdWgj1LFJskSN2TE` |
| Vault PDA | `HAjB7wzhKXAzp6ZpEExLqCsJkqN9W9MiuY3isXTRYan5` |
| Soul PDA | `FH21aXXXnGcgKfAi9in5fnmrKgBiSpJeR6E48wV2a7YT` |
| Graduation slot | `458349874` |
| SDK claim NFT mint | `C53aA7Rq7vDrvvfSVr7DimgLxP7g8T48K1HptGTLfWEE` |
| SDK claim NFT name | `DEVNETKXJ6MM Soul #1` |
| SDK metadata pointer target | `FH21aXXXnGcgKfAi9in5fnmrKgBiSpJeR6E48wV2a7YT` |
| Migration target | `8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i` |

## 4. Frontend reproduce (wallet-signed only)

The frontend consumes the built SDK package from `sdk/dist`, which is `.gitignored`. Therefore every SDK source change requires a rebuild before starting Next dev:

```bash
pnpm --filter sdk build
```

Start the app against devnet using the **active PD13+ program IDs** (from `deployments/devnet.json`) and the standard mission port `3100`:

```bash
NEXT_PUBLIC_RPC=https://api.devnet.solana.com \
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com \
NEXT_PUBLIC_ENV=devnet \
NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID=CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un \
NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID=34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ \
pnpm --filter app exec next dev -p 3100
```

All public writes (launch / buy / sell / generate Soul / claim Soul / hook-aware transfer / settlement) are **wallet-signed by Phantom**. Before driving the UI:

1. Install Phantom and unlock it.
2. Switch Phantom's network to **Devnet** (Settings → Developer Settings → Testnet Mode → Solana Devnet).
3. Fund the connected wallet with devnet SOL via `solana airdrop` or a public faucet.
4. Navigate to `http://127.0.0.1:3100/en/...` (or `/zh/...`) and approve each transaction in the Phantom prompt.

If Phantom is not installed, locked, on the wrong network, or unfunded, the UI must surface a localized wallet-not-ready state. **Do not** retry through any server signer, script signer, or other wallet — public writes in this product are wallet-signed only (see `VAL-PHANTOM-*` in the mission validation contract).

### `/api/devnet-smoke` is retired (HTTP 410)

The legacy `POST /api/devnet-smoke` route is permanently retired. Both public (`https://solsoul-devnet.vercel.app/api/devnet-smoke`) and local (`http://127.0.0.1:3100/api/devnet-smoke`) endpoints respond with:

- HTTP `410 Gone`
- `cache-control: no-store`
- JSON body whose `error` names the corresponding wallet-signed flow (e.g. `claim Soul`, `launch`, `buy`, `sell`, `generate Soul`) and the phrase `wallet-signed only`

Verify locally:

```bash
curl -i -sS -X POST http://127.0.0.1:3100/api/devnet-smoke \
  -H 'content-type: application/json' \
  -d '{"action":"claim"}'
# HTTP/1.1 410 Gone
# cache-control: no-store
# {"error":"Devnet smoke claim is retired. Use the connected wallet claim Soul flow; SolSoul public writes are wallet-signed only."}
```

This route must remain 410 in **all** builds — production, public devnet, and local. There is no longer a `SOLSOUL_DEVNET_SMOKE_SIGNER` opt-in; the server signer has been removed. The behavior contract is enforced by `app/src/app/api/devnet-smoke/route.ts` and `app/src/app/api/devnet-smoke/route.test.ts`, and is asserted by `VAL-RUNTIME-009` (public) and `VAL-RUNTIME-010` (local) in the mission validation contract.

### Historical (D.F3 era — RETIRED, do not run)

> ⚠️ **Retired / historical only.** The block below documents the original D.F3 server-signed smoke flow before PD13 retirement. It is preserved purely for provenance. The route now returns 410, and the `SOLSOUL_DEVNET_SMOKE_SIGNER`, `NEXT_PUBLIC_DEVNET_SMOKE`, and `~/.config/solana/id.json` server-signing surfaces are **no longer wired to any write path**. Running the legacy command will not produce a transaction; it will just start a dev server with retired-route copy.
>
> ~~For automated agent-browser smoke that previously used the server route, add the server-side signer gate as well:~~
>
> ~~`SOLSOUL_DEVNET_SMOKE_SIGNER=1 NEXT_PUBLIC_RPC=https://api.devnet.solana.com NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID=HuSRC61oy9qyRDH21sHD8kmkuVsB5Jd9tdJMkbk4zNjQ NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID=5wGUMWySAafwgTpGNgSaTMh1kiejnEGVTZj9x7wWJftk NEXT_PUBLIC_DEVNET_SMOKE=1 pnpm --filter app dev`~~
>
> ~~For automated browser smoke only, D.F3 also enabled the server-side signing fallback route `/api/devnet-smoke`. It signed with `~/.config/solana/id.json` only when all of these were true: `NEXT_PUBLIC_DEVNET_SMOKE=1`, `SOLSOUL_DEVNET_SMOKE_SIGNER=1`, `NEXT_PUBLIC_RPC=https://api.devnet.solana.com`, and `NODE_ENV !== "production"`.~~
>
> ~~The D.F3 browser flow visited `/en/launch`, launched a token, opened `/en/token/<mint>`, bought once, claimed once, and saved screenshots under `evidence/devnet/`.~~ Those screenshots are retained as PD12-era evidence; current Phantom-signed evidence lives under `deployments/evidence/m4-phantom-devnet-full-flow-evidence/`.

## 5. Recorded artifacts table

> ⚠️ **Historical (PD12 / D.F3 era).** The tables in this section record the original D.F3 program deployment, SDK trace, and frontend smoke artifacts under the **previous** devnet program IDs (`HuSRC…` bonding-curve, `5wGU…` soul-generator). They are retained for provenance and traceability against `deployments/devnet.json#previousPublicDevnet` / `oldVsNewProgramIds`. **Current active devnet program IDs and evidence** live in:
>
> - `deployments/devnet.json` (active program IDs, current redeploy slot/sig, source provenance)
> - `deployments/public-devnet.json` (Vercel runtime, source provenance, program upgrade evidence)
> - `deployments/evidence/m4-phantom-devnet-full-flow-evidence/` (current Phantom wallet-signed launch/buy/claim/transfer/sell/settlement evidence)
> - `deployments/devnet-amm-e2e-trace.raydium.json` (historical/deferred Raydium trace)
>
> The frontend smoke screenshots referenced under `evidence/devnet/*.png` were produced by the now-retired server-signed flow; they are **not** representative of current wallet-signed-only behavior.

### Program deployment artifacts (historical)

| Artifact | Value | Explorer / evidence |
| --- | --- | --- |
| bonding-curve program ID | `HuSRC61oy9qyRDH21sHD8kmkuVsB5Jd9tdJMkbk4zNjQ` | [`deployments/devnet.json`](../deployments/devnet.json) |
| soul-generator program ID | `5wGUMWySAafwgTpGNgSaTMh1kiejnEGVTZj9x7wWJftk` | [`deployments/devnet.json`](../deployments/devnet.json) |
| bonding-curve initial deploy tx | `4SVFr9JhuE3Q1tE6Pv6uvUPDd8xBym15gUukzJm1LxE5UyzpdARfYj4pKaK8d7kKqcghZNsPX594dT59rxa86eN1` | [explorer](https://explorer.solana.com/tx/4SVFr9JhuE3Q1tE6Pv6uvUPDd8xBym15gUukzJm1LxE5UyzpdARfYj4pKaK8d7kKqcghZNsPX594dT59rxa86eN1?cluster=devnet) |
| soul-generator initial deploy tx | `2eqebZEkBShq7XePQRS5QofUXk3pCCPfzvf42WSpCrDm8mGACSroAAiczvjJYEcJMrwkK99vRajuCFjUSSJ5Ru2Z` | [explorer](https://explorer.solana.com/tx/2eqebZEkBShq7XePQRS5QofUXk3pCCPfzvf42WSpCrDm8mGACSroAAiczvjJYEcJMrwkK99vRajuCFjUSSJ5Ru2Z?cluster=devnet) |
| bonding-curve latest redeploy tx | `63t4KmTXjZbE3BxHPAw49tKeRGj4XZWC8JGBk2doq3JAFYyW97HanoieAGVFcT3kcfCd6hhsuLdptMpwf9BSJZA1` | [explorer](https://explorer.solana.com/tx/63t4KmTXjZbE3BxHPAw49tKeRGj4XZWC8JGBk2doq3JAFYyW97HanoieAGVFcT3kcfCd6hhsuLdptMpwf9BSJZA1?cluster=devnet) |
| soul-generator latest redeploy tx | `3jVUGLVBfCwbXpzktg7UcDgGrUii8bLqkKLZWcYkwrZ2m2ZukRsVoL1YMRQmRgkSuMUVEPD3F7VXnHW6X1BNvqoA` | [explorer](https://explorer.solana.com/tx/3jVUGLVBfCwbXpzktg7UcDgGrUii8bLqkKLZWcYkwrZ2m2ZukRsVoL1YMRQmRgkSuMUVEPD3F7VXnHW6X1BNvqoA?cluster=devnet) |

### SDK trace artifacts (historical)

| Step | Slot | Signature / account | Explorer |
| --- | ---: | --- | --- |
| create mint account | `458349851` | `3UW1VyaiY5Bwf9wgsDbRCVWZDddVub829rcypWvMjivcmSvrJDLcJWd1QZ5Ks3GusHdxcrABCGnDySERFtjB55UV` | [explorer](https://explorer.solana.com/tx/3UW1VyaiY5Bwf9wgsDbRCVWZDddVub829rcypWvMjivcmSvrJDLcJWd1QZ5Ks3GusHdxcrABCGnDySERFtjB55UV?cluster=devnet) |
| create_token / initialize_curve | `458349856` | `4TFSFMzWW643xATbEtLuuKcQ6Rr9hk2P5HVjmUHuQqzt9PujUtr1AYBqqZEmyNzEqYCFdySYVS9e4yQ2k8uWTFR8` | [explorer](https://explorer.solana.com/tx/4TFSFMzWW643xATbEtLuuKcQ6Rr9hk2P5HVjmUHuQqzt9PujUtr1AYBqqZEmyNzEqYCFdySYVS9e4yQ2k8uWTFR8?cluster=devnet) |
| initialize_soul | `458349859` | `3EEw5ZT1yC52rnty3ejJM9z8a4XxP2rLQt7z9vgEopxknz1A1Vmvkh662SFDgpShfRSZPVPZYzZh35kxAJM3tHnz` | [explorer](https://explorer.solana.com/tx/3EEw5ZT1yC52rnty3ejJM9z8a4XxP2rLQt7z9vgEopxknz1A1Vmvkh662SFDgpShfRSZPVPZYzZh35kxAJM3tHnz?cluster=devnet) |
| buy #1, 0.100000000 SOL | `458349863` | `4CA34Vq4w2pYrdEogM1siifyuR5jhovuHQyn7T92QPz4RYKqyb6X1Dsn4zoTyRBJbvbequG9fyG6EHaoVsjmQETy` | [explorer](https://explorer.solana.com/tx/4CA34Vq4w2pYrdEogM1siifyuR5jhovuHQyn7T92QPz4RYKqyb6X1Dsn4zoTyRBJbvbequG9fyG6EHaoVsjmQETy?cluster=devnet) |
| buy #2, 0.125000000 SOL | `458349866` | `5K1LUQfEhS9jnvFAJHH2ogv7MPN5xvq8hZmEhbSEk9N4be7uewiUGFspY1tz1mTRgVjYRDuaPrjZXFD4A1wagwTk` | [explorer](https://explorer.solana.com/tx/5K1LUQfEhS9jnvFAJHH2ogv7MPN5xvq8hZmEhbSEk9N4be7uewiUGFspY1tz1mTRgVjYRDuaPrjZXFD4A1wagwTk?cluster=devnet) |
| buy #3, 0.150000000 SOL | `458349870` | `49AKuoT5USMbY4S18bQpG5NDLD2uzFayrYmvTYarTC7QeG9n8C1jR3xfFK3QL9a4Wf5tj8JyhRjeraxeAxSzrCe1` | [explorer](https://explorer.solana.com/tx/49AKuoT5USMbY4S18bQpG5NDLD2uzFayrYmvTYarTC7QeG9n8C1jR3xfFK3QL9a4Wf5tj8JyhRjeraxeAxSzrCe1?cluster=devnet) |
| buy #4 / graduation, 0.175000000 SOL | `458349874` | `3Rk2XaTW2KC284KRxZQv72aVHUH5jaqzogntiji7CoajfRQNiMoezTr1enegMRRtEuW7CeK1oKSNTmfPHqH7MtBH` | [explorer](https://explorer.solana.com/tx/3Rk2XaTW2KC284KRxZQv72aVHUH5jaqzogntiji7CoajfRQNiMoezTr1enegMRRtEuW7CeK1oKSNTmfPHqH7MtBH?cluster=devnet) |
| post-grad generate_soul | `458349877` | `4Wo8QYcXUmQQtxDz5tZh7wEgV2xne4dHqPRZQj3TgR8txZNyGd5bvDqwg96WxCqxWN7MNSGHN6VipCGJeG46hmF4` | [explorer](https://explorer.solana.com/tx/4Wo8QYcXUmQQtxDz5tZh7wEgV2xne4dHqPRZQj3TgR8txZNyGd5bvDqwg96WxCqxWN7MNSGHN6VipCGJeG46hmF4?cluster=devnet) |
| claim_soul | `458349882` | `4bwm6RZncDFjkxfFqjWeYZzzJnC26jhagUTZRLooupi4dD8Zik8e6wgvtMc8J2EZsPq9te7T7piXbSTyuK5aVCER` | [explorer](https://explorer.solana.com/tx/4bwm6RZncDFjkxfFqjWeYZzzJnC26jhagUTZRLooupi4dD8Zik8e6wgvtMc8J2EZsPq9te7T7piXbSTyuK5aVCER?cluster=devnet) |
| migrate (historical placeholder, pre-SEC.F2) | `458349886` | `4xsTBvKNq97TVbRmDCp8gkq7vmB9sphnW5ZbiRXNDyeSKnQ3iP6MePKn6E36qHxGKkxge91H9mooRS2ZD9LyduMw` | [explorer](https://explorer.solana.com/tx/4xsTBvKNq97TVbRmDCp8gkq7vmB9sphnW5ZbiRXNDyeSKnQ3iP6MePKn6E36qHxGKkxge91H9mooRS2ZD9LyduMw?cluster=devnet) |
| SDK meme mint | n/a | `ECGijwCdrYomg9x1rq3pYmC4QeJwqvVGnx4sG8dQEF5i` | [explorer](https://explorer.solana.com/address/ECGijwCdrYomg9x1rq3pYmC4QeJwqvVGnx4sG8dQEF5i?cluster=devnet) |
| SDK curve PDA | n/a | `AhywM45KTYdoCgakrDWjWrZTBFQ4HdWgj1LFJskSN2TE` | [explorer](https://explorer.solana.com/address/AhywM45KTYdoCgakrDWjWrZTBFQ4HdWgj1LFJskSN2TE?cluster=devnet) |
| SDK soul PDA | n/a | `FH21aXXXnGcgKfAi9in5fnmrKgBiSpJeR6E48wV2a7YT` | [explorer](https://explorer.solana.com/address/FH21aXXXnGcgKfAi9in5fnmrKgBiSpJeR6E48wV2a7YT?cluster=devnet) |
| SDK claim NFT mint | n/a | `C53aA7Rq7vDrvvfSVr7DimgLxP7g8T48K1HptGTLfWEE` | [explorer](https://explorer.solana.com/address/C53aA7Rq7vDrvvfSVr7DimgLxP7g8T48K1HptGTLfWEE?cluster=devnet) |

### Frontend smoke artifacts (historical — server-signed, retired)

> ⚠️ The screenshot links below (`evidence/devnet/*.png`) point to a path covered by `.gitignore` (`evidence/*`). They were captured locally on the original D.F3 worker's filesystem and are **not** included in the tracked repository, so they will be dangling for any new clone. They are kept here as struck-through text for provenance only; current Phantom wallet-signed evidence lives in `deployments/evidence/m4-phantom-devnet-full-flow-evidence/`.

| Step | Slot | Signature / account | Explorer / evidence |
| --- | ---: | --- | --- |
| frontend meme mint | n/a | `7eCNVrx8UKSFhU8MzLUdfmNXMcmbsfaifz3Ag6tArAgy` | [explorer](https://explorer.solana.com/address/7eCNVrx8UKSFhU8MzLUdfmNXMcmbsfaifz3Ag6tArAgy?cluster=devnet) |
| frontend curve PDA | n/a | `2fAQhMvU1Y7xXjMaUHdJ4cVCzShwzRzaAzi4dfVqRTuJ` | [explorer](https://explorer.solana.com/address/2fAQhMvU1Y7xXjMaUHdJ4cVCzShwzRzaAzi4dfVqRTuJ?cluster=devnet) |
| frontend soul PDA | n/a | `BrhDgiRpDusPkSzJBvZZGV6F4UCfmXSQ843BEuPRAwtF` | [explorer](https://explorer.solana.com/address/BrhDgiRpDusPkSzJBvZZGV6F4UCfmXSQ843BEuPRAwtF?cluster=devnet) |
| frontend launch | `458351452` | `3eVpCnuZf94x29PyuFhye2JmjNzHrCy5izMuBUyeqnhMaKKkyoP8RWLMMxhDQG9PFUuZ3FhBKkG7bEU1vPJPZTiH` | [explorer](https://explorer.solana.com/tx/3eVpCnuZf94x29PyuFhye2JmjNzHrCy5izMuBUyeqnhMaKKkyoP8RWLMMxhDQG9PFUuZ3FhBKkG7bEU1vPJPZTiH?cluster=devnet), ~~`evidence/devnet/launch-3eVpCnuZ.png`~~ (gitignored, not tracked) |
| frontend buy | `458351764` | `4fCLi3ePBUHaqbnmGnbW1LzvaS6UXazbvHSfC1phu4RTkfeKxakDHVLtbA3pRhxSrDiaxqGpARfCL4KKR6YN8q6c` | [explorer](https://explorer.solana.com/tx/4fCLi3ePBUHaqbnmGnbW1LzvaS6UXazbvHSfC1phu4RTkfeKxakDHVLtbA3pRhxSrDiaxqGpARfCL4KKR6YN8q6c?cluster=devnet), ~~`evidence/devnet/buy-4fCLi3eP.png`~~ (gitignored, not tracked) |
| frontend claim | `458351804` | `4UjLP9FNXtkBF3vc8ripcDXYXtDr5hu6eaoPA5ikfSjojP4HzgoURGoXV3DMiHM5dKS7SLMxW3sPzPpFRGz5eQG5` | [explorer](https://explorer.solana.com/tx/4UjLP9FNXtkBF3vc8ripcDXYXtDr5hu6eaoPA5ikfSjojP4HzgoURGoXV3DMiHM5dKS7SLMxW3sPzPpFRGz5eQG5?cluster=devnet), ~~`evidence/devnet/claim-4UjLP9FN.png`~~ (gitignored, not tracked) |
| frontend claim NFT mint | n/a | `EFNUEuuL4eUhYkamhU8bidQ7XN3AEJ49PGykH1F4vgjr` | [explorer](https://explorer.solana.com/address/EFNUEuuL4eUhYkamhU8bidQ7XN3AEJ49PGykH1F4vgjr?cluster=devnet) |

## 6. Known gotchas

- **Devnet faucet rate limit**: the deployer currently has enough SOL, so do not airdrop unless necessary. If funding is required, retry devnet faucet at most 3 times with 30 seconds of backoff, then stop and report the blocker.
- **`solana config get` mismatch**: deploy and e2e commands should use explicit `--url https://api.devnet.solana.com` or a devnet CLI config. Before worker exit, restore `solana config set --url http://127.0.0.1:8899`.
- **No mainnet config**: if `solana config get` shows mainnet, stop before running deploy/e2e commands.
- **Phantom devnet network**: this product is Phantom-only; users must switch Phantom to **Devnet** in Settings → Developer Settings before connecting, or wallet-signed flows will reject. Other wallets (Solflare, etc.) are out of scope for the active mission.
- **Stale `sdk/dist` after SDK source change**: because `sdk/dist` is `.gitignored` and the app consumes the built package, run `pnpm --filter sdk build` before `pnpm --filter app dev`.
- **`0x4702` stale soul-generator ID mismatch**: this happens when a non-current program ID is wired into the app or SDK. Ensure `deployments/devnet.json`, `sdk/src/index.ts`, `app/.env.example`, and the dev server env all point at the **current** soul-generator ID `34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ`. The historical `5wGU…` ID must appear only in `previousPublicDevnet` / `oldVsNewProgramIds` provenance fields, not as an active runtime value.
- **Do not enable `SOLSOUL_DEVNET_SMOKE_SIGNER` or treat `NEXT_PUBLIC_DEVNET_SMOKE` as a write-path gate**: the server-signed `/api/devnet-smoke` route is permanently retired (HTTP 410). All public devnet writes must be Phantom wallet-signed.

## 7. MAINNET WARNING

**AMM migration is not part of the active product scope. Do NOT deploy or present Raydium,
PumpSwap, or Meteora migration as mainnet-ready unless the user explicitly reopens that scope. See
docs/migration.md only as a historical/deferred reference.**

**Historical placeholder traces only rehearsed the state transition and placeholder lamport/token
movement on devnet. They must not present Raydium, PumpSwap, or Meteora as active or
mainnet-ready paths.**

**Mainnet must NEVER be built with --features devnet. The devnet feature lowers graduation to `0.5 SOL`; mainnet/default graduation is `85 SOL`.**

### Mainnet readiness checklist (NOT done in this mission)

- Raydium CP-Swap migrate evidence must be current; PumpSwap and Meteora remain disabled/deferred unless an explicit future scope change reopens them.
- No independent audit.
- No admin pause.
- Single-key upgrade authority remains in use.
- No production monitoring / alerting.
- No Terms of Service.
- No production RPC provider plan.
- No LP ownership / lock / burn decision.
- No user-facing risk UI.
- Devnet only; no mainnet rehearsal or deployment.
