# SolSoul.fun — Mainnet Launch Checklist

> **AUDIT NOT DONE — proceed at your own risk.**
> Print this page and check off each item with a pen. Every box must be ticked
> before opening public launches. Detailed instructions for each step are in
> [`docs/mainnet-deploy.md`](mainnet-deploy.md).

**Operator:** _______________________  **Date:** _______________  **Commit SHA:** _______________

---

## (a) Pre-flight

- [ ] Read `CHANGELOG.md` — confirm you are on the intended release
- [ ] `cargo test --workspace` — exit 0, all tests pass
- [ ] `pnpm --filter app test` — exit 0, 409 tests pass
- [ ] `cargo build-sbf --workspace` — exit 0, all `.so` artifacts produced
- [ ] `bash scripts/check-mainnet-build.sh target/deploy/bonding_curve.so` — sentinel PASS
- [ ] SHA256 checksums recorded for all three `.so` files
- [ ] `bash scripts/scan-secrets.sh` — exit 0, no secrets detected
- [ ] `git merge-base --is-ancestor HEAD origin/main` — exit 0
- [ ] `git status --porcelain` — empty (working tree clean)

---

## (b) Program key generation

- [ ] `solana-keygen new --no-bip39-passphrase --outfile keys/bonding_curve.json`
- [ ] `solana-keygen new --no-bip39-passphrase --outfile keys/soul_generator.json`
- [ ] `solana-keygen new --no-bip39-passphrase --outfile keys/transfer_hook.json`
- [ ] All three pubkeys printed and recorded
- [ ] All three keypair files backed up to 1Password / HashiCorp Vault
- [ ] `keys/` directory confirmed not tracked by git (`git status keys/` → untracked)

---

## (c) Update declared program IDs

- [ ] `programs/bonding-curve/src/lib.rs` — `declare_id!` updated to new mainnet pubkey
- [ ] `programs/shared/src/programs.rs` — `BONDING_CURVE_PROGRAM_ID` updated
- [ ] `programs/shared/src/programs.rs` — `SOUL_GENERATOR_PROGRAM_ID` updated
- [ ] Unit test assertions in `programs.rs` updated to match new pubkeys
- [ ] `cargo build-sbf --workspace` — exit 0 after ID update
- [ ] `bash scripts/check-mainnet-build.sh target/deploy/bonding_curve.so` — still PASS
- [ ] `cargo test --workspace` — still exit 0

---

## (d) SBF build for mainnet

- [ ] `cargo build-sbf --workspace` — final production build, exit 0
- [ ] No `--features devnet` flag used (devnet feature was removed in commit 8d78729)
- [ ] Final SHA256 checksums re-recorded after any code changes

---

## (e) Initial mainnet program deploy

> **USER DECISION REQUIRED** — do not execute without explicit approval.

- [ ] Dedicated mainnet deployer keypair created (NOT `~/.config/solana/id.json`)
- [ ] Deployer pubkey ≠ devnet deployer pubkey (verified with `test "$A" != "$B"`)
- [ ] Deployer wallet funded with ≥ 15 SOL
- [ ] `solana config get` confirms `mainnet-beta` RPC (not devnet or localhost)
- [ ] `solana program deploy ... target/deploy/bonding_curve.so` — exit 0
  - Deploy tx sig: _______________________
  - Program ID: _______________________
- [ ] `solana program deploy ... target/deploy/soul_generator.so` — exit 0
  - Deploy tx sig: _______________________
  - Program ID: _______________________
- [ ] `solana program deploy ... target/deploy/transfer_hook.so` — exit 0
  - Deploy tx sig: _______________________
  - Program ID: _______________________
- [ ] `solana program show <BC_ID> --url mainnet-beta` — shows `BPFLoaderUpgradeab1e...` owner
- [ ] `solana program show <SG_ID> --url mainnet-beta` — shows `BPFLoaderUpgradeab1e...` owner
- [ ] `solana program show <TH_ID> --url mainnet-beta` — shows `BPFLoaderUpgradeab1e...` owner

---

## (f) Initial GlobalConfig initialization

- [ ] `initialize_global_config` called on bonding-curve with `admin = <MULTISIG_VAULT_PDA>`
  - Tx sig: _______________________
- [ ] `initialize_global_config` called on soul-generator with `admin = <MULTISIG_VAULT_PDA>`
  - Tx sig: _______________________
- [ ] Confirmed: deployer hot key is NOT the admin (admin is the multisig vault PDA)
- [ ] Confirmed: `paused = 0` on both GlobalConfig PDAs

---

## (g) Soul-generator template / renderer registration

- [ ] Decided: built-in SMTS-v1.0 renderers are sufficient for launch (no external registration)
  - OR: External renderer registered (program ID: _______________________)
- [ ] Confirmed: `NeonPuff Soul` / `SoulPuff` / built-in themes accessible without extra registration

---

## (h) Squads V4 multisig on mainnet

> **USER DECISION REQUIRED** — authority rotation is ONE-WAY on mainnet. Do NOT rotate back.

- [ ] `squads-multisig-cli` installed (version: _______)
- [ ] Multisig created with threshold _______ of _______
  - Multisig PDA: _______________________
- [ ] Vault PDA retrieved:  _______________________
- [ ] Upgrade authority rotated: bonding-curve → vault PDA
  - Tx sig: _______________________
- [ ] Upgrade authority rotated: soul-generator → vault PDA
  - Tx sig: _______________________
- [ ] Upgrade authority rotated: transfer-hook → vault PDA
  - Tx sig: _______________________
- [ ] `solana program show` for all three confirms vault PDA as authority
- [ ] `deployments/mainnet.json` updated with multisig/vault PDAs and all tx sigs
- [ ] Dated evidence file created: `deployments/mainnet-rotation-evidence-<YYYY-MM-DD>.md`

---

## (i) Renounce admin (OPTIONAL — IRREVERSIBLE)

> Only after ≥ 30 days monitoring and explicit operator approval.

- [ ] Monitoring has been running ≥ 30 days with zero incidents
- [ ] All operators have explicitly approved admin renounce
- [ ] `renounce_admin` called on bonding-curve GlobalConfig
  - Tx sig: _______________________
- [ ] Confirmed: `admin = 11111111111111111111111111111111` (zero pubkey)
- [ ] NOTE: soul-generator admin is NOT renounced (NFT authority still needed)

---

## (j) Front-end mainnet configuration

- [ ] `NEXT_PUBLIC_RPC_URL` set to production RPC (not devnet)
- [ ] `NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID` set to mainnet program ID
- [ ] `NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID` set to mainnet program ID
- [ ] `NEXT_PUBLIC_ENV` = `mainnet`
- [ ] `pnpm --filter app build` — exit 0
- [ ] Local smoke: `PORT=3001 pnpm --filter app start` returns 200 on `/en`
- [ ] Local smoke: `DEVNET TESTNET` banner does NOT appear on mainnet build
- [ ] `vercel --prod` deploy — exit 0
  - Production URL: _______________________
  - Deployment ID: _______________________
- [ ] `curl -sSI https://<mainnet-domain>` — HTTP 200
- [ ] `/en/launch` renders without 5xx errors

---

## (k) Indexer and RPC failover

- [ ] At least 2 paid RPC providers configured (Helius / Triton / QuickNode)
- [ ] Primary RPC confirmed: _______________________
- [ ] Secondary (failover) RPC confirmed: _______________________
- [ ] Indexer deployed with mainnet env vars
- [ ] 30-second indexer smoke: connects + subscribes to both program log streams
- [ ] 429 backoff in `scripts/rpc.ts` confirmed active

---

## (l) Post-launch monitoring (first 24 hours)

- [ ] Indexer logs monitored — no unexpected program errors
- [ ] At least 3 successful launch transactions confirmed
- [ ] At least 3 successful buy transactions confirmed
- [ ] At least 1 successful sell transaction confirmed
- [ ] At least 1 successful claim_soul transaction confirmed
- [ ] Lock-fee accumulation visible in curve PDA lamport balances
- [ ] No MAX_BUY_SOL rejection spikes
- [ ] No SameSlotInteraction rejection spikes
- [ ] self_deprecated field = false on all active curves
- [ ] Sentry: 0 uncaught exceptions in first 24 hours
- [ ] Vercel: no 5xx errors in production analytics

---

## (m) Roll-back guidance (reference only — check as needed)

- [ ] Vercel rollback command ready: `vercel rollback <deployment-id>`
- [ ] Railway indexer redeploy command documented
- [ ] Multisig upgrade procedure documented in `docs/multisig-runbook.md`
- [ ] Confirmed: renounce_admin has NOT been called yet (emergency pause still possible)

---

## Deployment artifact sign-off

All values below must be filled in before the checklist is considered complete:

| Field | Value |
|---|---|
| bonding_curve_program_id | |
| soul_generator_program_id | |
| transfer_hook_program_id | |
| multisig_pda | |
| vault_pda | |
| deployer_pubkey | |
| commit_sha | |
| deployed_at_iso | |
| vercel_production_url | |

**Operator signature:** _______________________  **Date:** _______________

---

*See [`docs/mainnet-deploy.md`](mainnet-deploy.md) for full commands and expected outputs.*
*See [`deployments/mainnet.json.template`](../deployments/mainnet.json.template) for the JSON artifact schema.*
