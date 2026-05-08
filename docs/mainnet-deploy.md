# SolSoul.fun — Mainnet Deployment Runbook

> **AUDIT NOT DONE — proceed at your own risk.**
>
> This document is the operator-facing mainnet deployment runbook for SolSoul.fun.
> It covers the full launch lifecycle from a clean repository state so an operator
> working months after the original authors can reproduce a correct mainnet launch
> without guesswork.
>
> **This is a docs-only artifact. Do NOT execute mainnet writes from this document
> until every pre-flight gate is confirmed GREEN and the user has given explicit
> approval to proceed.**

---

## Architecture context

SolSoul.fun runs on a **permanent exponential bonding curve** (sato-style).
Tokens trade on the curve forever; there is no graduation event, no AMM migration,
and no protocol treasury drain. The current programs are:

| Program | Devnet ID (PD13) | Role |
|---|---|---|
| `bonding-curve` | `CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un` | Meme-token launch + perpetual trade |
| `soul-generator` | `34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ` | On-chain SVG Soul NFT generation + claim |
| `transfer-hook` | see `deployments/devnet.json` | Token-2022 transfer hook |

> Devnet IDs are listed for reference. **Mainnet IDs must be freshly generated;
> they will differ from every devnet ID.**

Curve invariants:
- Formula: `T = K × (1 − e^(−R/S))` with K = 21,000,000 tokens, S = 500 SOL
- Single buy cap: `MAX_BUY_SOL = 5 SOL`
- Lock fee: `0.1%` (transferred into the curve PDA — no withdraw path)
- Same-slot flash-loan protection via `last_interaction_slot`
- Self-deprecation: `total_minted ≥ 20,790,000 × 10⁶` trips `self_deprecated = true`, freezes minting

---

## Section (a) — Pre-flight checklist

Run every item below and confirm GREEN before touching mainnet.

### a.1 Read CHANGELOG

```bash
cat CHANGELOG.md | head -80
```

Confirm you are deploying the intended release. Record the git commit SHA.

### a.2 Run all tests

```bash
# Rust workspace unit tests
export PATH="$HOME/.cargo/bin:$PATH"
cargo test --workspace
# Expected: all tests pass, exit 0

# App tests (409 tests as of MN milestone close-out)
pnpm --filter app test
# Expected: 409 passed, exit 0
```

Both commands must exit `0`. Any failure blocks mainnet launch.

### a.3 SBF build and sentinel check

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cargo build-sbf --workspace
# Produces: target/deploy/bonding_curve.so
#           target/deploy/soul_generator.so
#           target/deploy/transfer_hook.so

bash scripts/check-mainnet-build.sh target/deploy/bonding_curve.so
# Expected: [check-mainnet-build] PASS: sentinel 'EXP_CURVE_V1_K_21M_S_500SOL' found
```

If the sentinel check fails (`exit 1`), **do not deploy**. The binary is not from
the canonical exponential-curve model.

Record artifact checksums:

```bash
shasum -a 256 \
  target/deploy/bonding_curve.so \
  target/deploy/soul_generator.so \
  target/deploy/transfer_hook.so
```

Copy these hashes into `deployments/mainnet.json` before deployment.

### a.4 Secret scan

```bash
bash scripts/scan-secrets.sh
# or: bash scripts/scan-secrets.sh docs/
# Expected: exit 0, no secrets found
```

If secrets are detected, abort and rotate the affected credential before continuing.

### a.5 Confirm working tree is on main and clean

```bash
git merge-base --is-ancestor HEAD origin/main
# Expected: exit 0

git status --porcelain
# Expected: empty output (clean working tree)

git log --oneline -3
# Note the top commit SHA; this is the mainnet build commit.
```

If the working tree is dirty or HEAD is not an ancestor of `origin/main`,
stop and resolve before continuing.

---

## Section (b) — Program key generation

> **NEVER commit private key material.** Program keypairs must live outside the
> repository and be stored in a hardware-backed secret manager (1Password / Vault).

### b.1 Generate fresh mainnet keypairs

```bash
mkdir -p keys/

# Bonding curve program keypair
solana-keygen new --no-bip39-passphrase \
  --outfile keys/bonding_curve.json
BONDING_CURVE_PUBKEY="$(solana-keygen pubkey keys/bonding_curve.json)"
echo "bonding_curve:  $BONDING_CURVE_PUBKEY"

# Soul generator program keypair
solana-keygen new --no-bip39-passphrase \
  --outfile keys/soul_generator.json
SOUL_GENERATOR_PUBKEY="$(solana-keygen pubkey keys/soul_generator.json)"
echo "soul_generator: $SOUL_GENERATOR_PUBKEY"

# Transfer hook program keypair (if deploying)
solana-keygen new --no-bip39-passphrase \
  --outfile keys/transfer_hook.json
TRANSFER_HOOK_PUBKEY="$(solana-keygen pubkey keys/transfer_hook.json)"
echo "transfer_hook:  $TRANSFER_HOOK_PUBKEY"
```

### b.2 Verify pubkeys printed correctly

```bash
solana-keygen pubkey keys/bonding_curve.json
solana-keygen pubkey keys/soul_generator.json
solana-keygen pubkey keys/transfer_hook.json
```

### b.3 Backup private keypairs to 1Password / Vault (CRITICAL)

Before continuing:
1. Store `keys/bonding_curve.json`, `keys/soul_generator.json`, and
   `keys/transfer_hook.json` in a hardware-backed secret manager (1Password or
   HashiCorp Vault).
2. Add `keys/` to `.gitignore` if not already present.
3. Verify `git status` does not show `keys/*.json` as tracked.

```bash
grep -qF 'keys/' .gitignore || echo 'keys/' >> .gitignore
git status keys/
# Expected: keys/ files show as untracked (not staged)
```

---

## Section (c) — Update declared program IDs

After generating mainnet keypairs, update the `declare_id!` macros and shared
program ID constants so that `cargo build-sbf` produces binaries for the mainnet
addresses.

### c.1 Update bonding-curve declared ID

Edit `programs/bonding-curve/src/lib.rs`:

```rust
// Before (devnet/PD13 ID — replace with your new mainnet pubkey):
pinocchio_pubkey::declare_id!("CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un");

// After (your new mainnet pubkey from keys/bonding_curve.json):
pinocchio_pubkey::declare_id!("<BONDING_CURVE_MAINNET_PUBKEY>");
```

### c.2 Update soul-generator declared ID

The soul-generator declares its ID via `shared::programs::SOUL_GENERATOR_PROGRAM_ID`.
Edit `programs/shared/src/programs.rs`:

```rust
// Before:
pub const BONDING_CURVE_PROGRAM_ID: [u8; 32] =
    pinocchio_pubkey::pubkey!("CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un");

pub const SOUL_GENERATOR_PROGRAM_ID: [u8; 32] =
    pinocchio_pubkey::pubkey!("34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ");

// After:
pub const BONDING_CURVE_PROGRAM_ID: [u8; 32] =
    pinocchio_pubkey::pubkey!("<BONDING_CURVE_MAINNET_PUBKEY>");

pub const SOUL_GENERATOR_PROGRAM_ID: [u8; 32] =
    pinocchio_pubkey::pubkey!("<SOUL_GENERATOR_MAINNET_PUBKEY>");
```

Also update the test assertions in the same file to match the new pubkeys.

### c.3 Rebuild and verify sentinel still present

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cargo build-sbf --workspace
bash scripts/check-mainnet-build.sh target/deploy/bonding_curve.so
# Expected: PASS — sentinel EXP_CURVE_V1_K_21M_S_500SOL found
cargo test --workspace
# Expected: exit 0
```

---

## Section (d) — SBF build for mainnet

The canonical mainnet build uses no feature flags (the devnet feature was removed
in commit `8d78729`):

```bash
export PATH="$HOME/.cargo/bin:$PATH"

# Full workspace build
cargo build-sbf --workspace

# If you need per-crate explicit builds for verification:
cargo build-sbf --manifest-path programs/bonding-curve/Cargo.toml
cargo build-sbf --manifest-path programs/soul-generator/Cargo.toml
cargo build-sbf --manifest-path programs/transfer-hook/Cargo.toml
cargo build-sbf --manifest-path programs/solsoul-renderer-sdk/Cargo.toml

# Reconfirm artifact checksums
shasum -a 256 \
  target/deploy/bonding_curve.so \
  target/deploy/soul_generator.so \
  target/deploy/transfer_hook.so
```

Expected artifacts (sizes are approximate):

| Artifact | Min size |
|---|---|
| `target/deploy/bonding_curve.so` | > 0 bytes |
| `target/deploy/soul_generator.so` | > 0 bytes |
| `target/deploy/transfer_hook.so` | > 0 bytes |

**Estimated cost context**: Each SBF `.so` file is rented to a program data account.
Program data accounts cost approximately `0.000006644 SOL/byte`. A 200 KB program
costs roughly `1.3 SOL`; a 400 KB program costs roughly `2.6 SOL`. Budget **3–5 SOL
per program** to cover rent plus deployment transaction fees.

---

## Section (e) — Initial mainnet program deploy

> **[USER DECISION REQUIRED]** Execute only when the user explicitly approves.

### e.1 Prepare deployer wallet

Use a dedicated mainnet deployer keypair that is **not** `~/.config/solana/id.json`
(which is the devnet keypair):

```bash
MAINNET_DEPLOYER="$HOME/.config/solana/solsoul-mainnet.json"
solana-keygen new --outfile "$MAINNET_DEPLOYER"
DEPLOYER_PUBKEY="$(solana-keygen pubkey "$MAINNET_DEPLOYER")"
echo "Deployer: $DEPLOYER_PUBKEY"

# Fund the deployer (≥ 15 SOL recommended for 3 programs)
# Do this via a secure funding source — not via airdrop on mainnet.
solana balance "$DEPLOYER_PUBKEY" --url mainnet-beta
```

### e.2 Confirm Solana CLI is NOT pointed at devnet

```bash
solana config get | grep -E 'RPC|Cluster'
# Must NOT contain: devnet or localhost
# Must contain: mainnet-beta

# Temporarily set mainnet if needed:
solana config set --url mainnet-beta
```

### e.3 Deploy programs

```bash
MAINNET_RPC="https://api.mainnet-beta.solana.com"
MAINNET_DEPLOYER="$HOME/.config/solana/solsoul-mainnet.json"

# bonding-curve
solana program deploy \
  --url "$MAINNET_RPC" \
  --keypair "$MAINNET_DEPLOYER" \
  --upgrade-authority "$MAINNET_DEPLOYER" \
  --program-id keys/bonding_curve.json \
  target/deploy/bonding_curve.so

# soul-generator
solana program deploy \
  --url "$MAINNET_RPC" \
  --keypair "$MAINNET_DEPLOYER" \
  --upgrade-authority "$MAINNET_DEPLOYER" \
  --program-id keys/soul_generator.json \
  target/deploy/soul_generator.so

# transfer-hook
solana program deploy \
  --url "$MAINNET_RPC" \
  --keypair "$MAINNET_DEPLOYER" \
  --upgrade-authority "$MAINNET_DEPLOYER" \
  --program-id keys/transfer_hook.json \
  target/deploy/transfer_hook.so
```

### e.4 Verify deployments

```bash
MAINNET_RPC="https://api.mainnet-beta.solana.com"
BC_ID="<BONDING_CURVE_MAINNET_PUBKEY>"
SG_ID="<SOUL_GENERATOR_MAINNET_PUBKEY>"
TH_ID="<TRANSFER_HOOK_MAINNET_PUBKEY>"

solana program show "$BC_ID" --url "$MAINNET_RPC"
solana program show "$SG_ID" --url "$MAINNET_RPC"
solana program show "$TH_ID" --url "$MAINNET_RPC"
```

Expected output for each:
```
Program Id: <program-id>
Owner: BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address: <program-data-pda>
Authority: <deployer-pubkey>
Last Deployed In Slot: <slot>
Data Length: <bytes>
```

Record every program ID, authority, slot, and deploy transaction signature in
`deployments/mainnet.json`.

### e.5 Cost estimates

| Step | Estimated cost |
|---|---|
| `bonding_curve.so` deploy | 3–5 SOL |
| `soul_generator.so` deploy | 3–5 SOL |
| `transfer_hook.so` deploy | 3–5 SOL |
| Upgrade authority rotation (Step h) | ~0.02 SOL total |
| GlobalConfig init (Step f) | ~0.01 SOL each |
| Squads multisig creation (Step h) | ~0.1–0.5 SOL |
| First launch smoke test | ~0.1 SOL |
| **Total budget recommendation** | **≥ 15 SOL** |

---

## Section (f) — Initial GlobalConfig initialization

Both programs require a `GlobalConfig` PDA to be initialized before any user
transactions will succeed.

### f.1 bonding-curve GlobalConfig

Call `initialize_global_config` on the bonding-curve program:

- **admin**: must be the ops multisig vault PDA (NOT a hot deployer key)
- **paused**: `0` (not paused)

```bash
# Using the SDK helper (adapt path to your launch script):
pnpm exec tsx scripts/initialize-mainnet-global-config.ts \
  --rpc "https://api.mainnet-beta.solana.com" \
  --keypair "$HOME/.config/solana/solsoul-mainnet.json" \
  --bonding-curve-program "<BONDING_CURVE_MAINNET_PUBKEY>" \
  --admin-pubkey "<MULTISIG_VAULT_PDA>"
```

The GlobalConfig PDA is derived as `[b"global_config"]` with the program as
owner. After the transaction:

```bash
solana account "$(solana address -k <global-config-pda>)" \
  --url mainnet-beta --output json
# Confirm admin field == multisig vault PDA, paused == 0
```

> **WARNING**: Do not use the hot deployer key as admin. If the deployer key is
> compromised, pause access must flow through the multisig (Steps f → h). Using
> the vault PDA as admin from day 1 forces pause through an approval quorum.

### f.2 soul-generator GlobalConfig / admin initialization

The soul-generator uses a 2-step admin transfer (`set_pending_admin` /
`accept_admin`) for NFT authority management. Initialize it the same way:

```bash
pnpm exec tsx scripts/initialize-mainnet-soul-global-config.ts \
  --rpc "https://api.mainnet-beta.solana.com" \
  --keypair "$HOME/.config/solana/solsoul-mainnet.json" \
  --soul-generator-program "<SOUL_GENERATOR_MAINNET_PUBKEY>" \
  --admin-pubkey "<MULTISIG_VAULT_PDA>"
```

Record the `initialize_global_config` transaction signatures in
`deployments/mainnet.json` under `init_tx_sigs`.

---

## Section (g) — Soul-generator template / renderer registration

The SMTS-v1.0 (SolSoul Mathematical Trait Standard) art engine ships built-in
renderers compiled directly into the `soul_generator.so` binary:

- `Monochrome Soul` (default)
- `NeonPuff Soul`
- `SoulPuff`
- `Hexagram Oracle`
- Mathematical engine modules: Chaos, Field, Fractal, Harmonic, Lattice

No on-chain registration transaction is required for **built-in renderers** —
they are available immediately after the program is deployed.

### g.1 External renderer registration (optional)

If a third-party renderer will be used at launch via the Soul Engine Phase 3 CPI
invocation path, call `register_renderer` with the external renderer's program ID:

```bash
pnpm exec tsx scripts/register-renderer.ts \
  --rpc "https://api.mainnet-beta.solana.com" \
  --keypair "$HOME/.config/solana/solsoul-mainnet.json" \
  --soul-generator-program "<SOUL_GENERATOR_MAINNET_PUBKEY>" \
  --renderer-program-id "<EXTERNAL_RENDERER_PROGRAM_ID>" \
  --renderer-name "MyCustomRenderer"
```

For the first launch, built-in renderers are sufficient. Skip external
registration unless a specific third-party renderer is required at T=0.

---

## Section (h) — Squads V4 multisig on mainnet

> **[USER DECISION REQUIRED]** This step permanently transfers upgrade authority
> to a multi-signer vault. The deployer key will no longer be able to upgrade
> programs unilaterally. Do NOT rotate back after mainnet (unlike the devnet drill).

This section executes the MN.F4 drill pattern on MAINNET. Tool required:
`squads-multisig-cli` (Rust CLI, crates.io). Squads V4 program ID on mainnet:
`SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr`.

### h.1 Install squads-multisig-cli

```bash
cargo install squads-multisig-cli
squads-multisig-cli --version
# Expected: squads-multisig-cli 0.1.7 (or later)
```

### h.2 Create the mainnet multisig

Choose threshold (recommend 2-of-3 or 3-of-5) and member pubkeys. All members
must be hardware-wallet-backed keys held by different authorized operators:

```bash
SQUADS_PROGRAM="SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr"
MAINNET_RPC="https://api.mainnet-beta.solana.com"

squads-multisig-cli multisig-create \
  --rpc-url "$MAINNET_RPC" \
  --program-id "$SQUADS_PROGRAM" \
  --keypair "$HOME/.config/solana/solsoul-mainnet.json" \
  -m "<MEMBER_1_PUBKEY>:7" \
  -m "<MEMBER_2_PUBKEY>:7" \
  -m "<MEMBER_3_PUBKEY>:7" \
  --threshold 2
# Output includes: Multisig PDA
```

Record `MULTISIG_PDA` from the output.

### h.3 Get vault PDA

```bash
squads-multisig-cli display-vault \
  --program-id "$SQUADS_PROGRAM" \
  --multisig-address "<MULTISIG_PDA>" \
  --vault-index 0 \
  --rpc-url "$MAINNET_RPC"
# Output includes: Vault PDA (this is the multisig-vault used as admin in Step f)
```

Record `VAULT_PDA`.

### h.4 Rotate upgrade authority to the multisig vault (ONE-WAY — do NOT rotate back)

```bash
BC_ID="<BONDING_CURVE_MAINNET_PUBKEY>"
SG_ID="<SOUL_GENERATOR_MAINNET_PUBKEY>"
TH_ID="<TRANSFER_HOOK_MAINNET_PUBKEY>"
VAULT_PDA="<MULTISIG_VAULT_PDA>"

# bonding-curve
solana program set-upgrade-authority "$BC_ID" \
  --upgrade-authority "$HOME/.config/solana/solsoul-mainnet.json" \
  --new-upgrade-authority "$VAULT_PDA" \
  --url mainnet-beta

# soul-generator
solana program set-upgrade-authority "$SG_ID" \
  --upgrade-authority "$HOME/.config/solana/solsoul-mainnet.json" \
  --new-upgrade-authority "$VAULT_PDA" \
  --url mainnet-beta

# transfer-hook
solana program set-upgrade-authority "$TH_ID" \
  --upgrade-authority "$HOME/.config/solana/solsoul-mainnet.json" \
  --new-upgrade-authority "$VAULT_PDA" \
  --url mainnet-beta
```

### h.5 Verify authority rotation

```bash
solana program show "$BC_ID" --url mainnet-beta | grep Authority
solana program show "$SG_ID" --url mainnet-beta | grep Authority
solana program show "$TH_ID" --url mainnet-beta | grep Authority
# All three must show VAULT_PDA as authority
```

### h.6 Future upgrades via Squads

All future program upgrades require a multisig vote via `squads-multisig-cli`:
1. `vault-transaction-create` with the upgrade message
2. Members vote via `proposal-vote --action Approve`
3. `vault-transaction-execute` after threshold is reached

### h.7 Persist evidence

Create `deployments/mainnet.json` (see Section j.6) and:

```bash
EVIDENCE_DATE="$(date +%Y-%m-%d)"
cp deployments/mainnet.json.template \
   "deployments/mainnet-rotation-evidence-${EVIDENCE_DATE}.md"
# Edit the .md file to record all tx sigs, authority pubkeys, and timestamps.
```

---

## Section (i) — Renounce admin (optional, IRREVERSIBLE)

> **WARNING**: `renounce_admin` sets `admin = Pubkey::default()` on the
> bonding-curve GlobalConfig. This is irrevocable on-chain. After renounce,
> the bonding-curve program can never be paused again. Only perform this step
> after:
> - Monitoring has been running for ≥ 30 days with no incidents
> - Emergency-pause capability is confirmed no longer needed
> - All operators have explicitly approved this decision

```bash
# Only execute after the above conditions are met and user approval is explicit:
pnpm exec tsx scripts/renounce-admin-mainnet.ts \
  --rpc "https://api.mainnet-beta.solana.com" \
  --multisig-keypair "<OPERATOR_KEY>" \
  --bonding-curve-program "<BONDING_CURVE_MAINNET_PUBKEY>"
```

> The soul-generator **must NOT have admin renounced** — it needs admin for NFT
> authority management (`set_pending_admin` / `accept_admin`).

---

## Section (j) — Front-end mainnet configuration

### j.1 Set production environment variables

```bash
# Never commit these to git. Manage via Vercel dashboard or .env.production.local.
NEXT_PUBLIC_RPC_URL="<HELIUS_OR_TRITON_MAINNET_RPC>"
NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID="<BONDING_CURVE_MAINNET_PUBKEY>"
NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID="<SOUL_GENERATOR_MAINNET_PUBKEY>"
NEXT_PUBLIC_ENV="mainnet"
NEXT_PUBLIC_SENTRY_DSN="<SENTRY_DSN>"
```

### j.2 Build and smoke-test locally

```bash
NEXT_PUBLIC_RPC_URL="<RPC>" \
NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID="<BC_ID>" \
NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID="<SG_ID>" \
NEXT_PUBLIC_ENV="mainnet" \
pnpm --filter app build
# Expected: exit 0

PORT=3001 pnpm --filter app start &
sleep 10
curl -fsS http://127.0.0.1:3001/en | grep -q "SolSoul" && echo "OK"
kill %1
```

### j.3 Verify DevnetBanner is NOT shown on mainnet build

```bash
curl -sS http://127.0.0.1:3001/en | grep -c "DEVNET TESTNET"
# Expected: 0 — banner must not appear on mainnet build
```

### j.4 Deploy to Vercel

```bash
cd app/
vercel --prod
# Record: production URL, deployment ID, git ref, deploy timestamp
```

### j.5 Post-deploy smoke

```bash
curl -sSI https://<your-mainnet-domain>.vercel.app | head -1
# Expected: HTTP/2 200

curl -sS https://<your-mainnet-domain>.vercel.app/en/launch | head -30
# Confirm: launch form visible, no DEVNET banner, no 5xx errors
```

### j.6 Record in deployments/mainnet.json

```json
{
  "bonding_curve_program_id": "<BC_MAINNET_PUBKEY>",
  "soul_generator_program_id": "<SG_MAINNET_PUBKEY>",
  "transfer_hook_program_id": "<TH_MAINNET_PUBKEY>",
  "upgrade_authority": "<MULTISIG_VAULT_PDA>",
  "deploy_slot": 0,
  "deploy_tx_sigs": {
    "bonding_curve": "<sig>",
    "soul_generator": "<sig>",
    "transfer_hook": "<sig>"
  },
  "init_tx_sigs": {
    "bonding_curve_global_config": "<sig>",
    "soul_generator_global_config": "<sig>"
  },
  "multisig_pda": "<MULTISIG_PDA>",
  "vault_pda": "<VAULT_PDA>",
  "vercel_production_url": "<url>",
  "commit_sha": "<git-sha>",
  "deployed_at_iso": "<ISO-8601>"
}
```

---

## Section (k) — Indexer and RPC failover configuration

### k.1 Configure a minimum of two paid RPC providers

Per `docs/production-rpc.md`, the indexer and front-end must pool at least two
paid providers. Recommended (in priority order):

1. **Triton One** — `https://<project>.rpc.triton.one/rpctoken=<key>`
2. **Helius** — `https://mainnet.helius-rpc.com/?api-key=<key>`
3. **QuickNode** — `https://<slug>.solana-mainnet.quiknode.pro/<key>/`

The public Solana endpoint (`https://api.mainnet-beta.solana.com`) may only be
used as a last-resort fallback due to rate limits.

### k.2 Configure the indexer

```bash
# services/indexer — set mainnet env vars (Railway dashboard or .env.production):
RPC_URL="<HELIUS_MAINNET_RPC>,<TRITON_MAINNET_RPC>"
BONDING_CURVE_PROGRAM_ID="<BC_MAINNET_PUBKEY>"
SOUL_GENERATOR_PROGRAM_ID="<SG_MAINNET_PUBKEY>"
DATABASE_URL="sqlite:data/indexer.sqlite"
```

Verify the indexer connects and subscribes to program log events:

```bash
pnpm exec tsx services/indexer/src/main.ts \
  --rpc "<HELIUS_MAINNET_RPC>" \
  --duration-sec 30
# Expected: "subscribe ok" or "[event:..." log lines, exit 0
```

### k.3 429 backoff

`scripts/rpc.ts` implements exponential backoff for 429 responses. The indexer
uses this helper automatically. Confirm the backoff configuration:

```bash
grep -n "429\|backoff\|retry" scripts/rpc.ts | head -20
```

### k.4 RPC failover

If the primary RPC returns persistent errors (not transient 429):
1. Switch `RPC_URL` to the secondary provider.
2. Redeploy indexer service.
3. Verify `curl -fsS "<SECONDARY_RPC>" -X POST -H 'Content-Type: application/json' \
   -d '{"jsonrpc":"2.0","id":1,"method":"getSlot","params":[]}'` returns a slot number.

---

## Section (l) — Post-launch monitoring checklist (first 24 hours)

### l.1 Watch list — check every 2–4 hours

| Signal | How to monitor | Alert threshold |
|---|---|---|
| Curve PDA lamport balance growth | `solana account <curve_pda> --url mainnet-beta \| grep lamports` | Steady growth = healthy (lock fee accumulation) |
| `MAX_BUY_SOL` rejections | Indexer logs for `Custom(0x...MAX_BUY)` program errors | Any spike in rejections |
| Same-slot arbitrage rejections | Indexer logs for `SameSlotInteraction` errors | Any non-zero count |
| `self_deprecated` trips | `solana account <curve_pda> --url mainnet-beta` — decode `self_deprecated` field | Any `true` value = curve frozen |
| Soul generation count growth | Check `SoulAccount.generation_count` on new token mints | Should grow with buys |
| Program errors / panics | Indexer + Sentry error dashboard | Any uncaught program error |

### l.2 Self-deprecation protocol

When `self_deprecated = true` on any curve (total_minted ≥ 20.79M tokens):
- No new buys are accepted for that curve. This is by design.
- The curve's existing holders can still sell.
- Announce on-chain state to users via the front-end.
- No on-chain intervention required.

### l.3 Incident response

If an exploit or critical bug is detected before `renounce_admin` has been called:

```bash
# Step 1: Propose pause via Squads multisig
squads-multisig-cli vault-transaction-create \
  --rpc-url mainnet-beta \
  --program-id "SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr" \
  --keypair "<OPERATOR_KEY>" \
  --multisig-pubkey "<MULTISIG_PDA>" \
  --vault-index 0 \
  --transaction-message "<base64-pause-ix-message>" \
  --memo "EMERGENCY: pause bonding-curve"

# Step 2: Gather threshold of approvals from other signers
squads-multisig-cli proposal-vote \
  --action Approve \
  --transaction-index <TX_INDEX> \
  ...

# Step 3: Execute
squads-multisig-cli vault-transaction-execute ...

# Step 4: Verify paused
pnpm exec tsx scripts/check-global-config.ts \
  --program "<BC_MAINNET_PUBKEY>" \
  --rpc mainnet-beta
# Expected: paused == 1
```

After `renounce_admin`, the program can no longer be paused. Mitigation at that
point is limited to front-end takedown and social communication.

### l.4 First 24-hour checklist

```
[ ] Confirmed at least 3 successful launch transactions
[ ] Confirmed at least 3 successful buy transactions
[ ] Confirmed at least 1 successful sell transaction
[ ] Confirmed at least 1 successful claim_soul transaction
[ ] No unexpected program errors in indexer logs
[ ] No unexpected 429 rate-limit bursts from RPC providers
[ ] Lock-fee accumulation visible in curve PDA lamport balances
[ ] Sentry: 0 uncaught exceptions
[ ] Vercel analytics: no 5xx errors
[ ] All front-end pages return 200 in production
```

---

## Section (m) — Roll-back and re-deploy guidance

### m.1 Reversible changes

| Component | How to roll back |
|---|---|
| Front-end (Vercel) | `vercel rollback <deployment-id>` — instant |
| Indexer config | Update Railway env vars and redeploy — minutes |
| RPC provider | Change `RPC_URL` env var and redeploy indexer |
| Program upgrade (while authority retained) | Build old commit, redeploy to same program IDs via multisig-approved `vault-transaction-execute` |
| GlobalConfig `paused` field | Call `unpause` through multisig |

### m.2 IRREVERSIBLE changes

| Change | Why irreversible | Precaution |
|---|---|---|
| `renounce_admin` on bonding-curve | Sets admin = zero pubkey on-chain | Only call after extended monitoring and explicit approval |
| On-chain token/soul/claim state | Solana state is append-only; launched tokens and claimed Souls cannot be deleted | Test thoroughly before launch |
| Program upgrade authority → `--final` | Permanently removes ability to upgrade | NEVER use `--final` unless fully immutable is the explicit goal |

### m.3 Program re-deploy procedure

If an emergency upgrade is needed while the multisig still controls authority:

```bash
# 1. Build the fixed binary
cargo build-sbf --manifest-path programs/bonding-curve/Cargo.toml

# 2. Prepare the upgrade transaction message (BPFLoader instruction)
# Tool: solana program write-buffer + set-buffer-authority

solana program write-buffer target/deploy/bonding_curve.so \
  --url mainnet-beta \
  --keypair "<BUFFER_AUTHORITY_KEYPAIR>"

BUFFER_ADDRESS="<buffer-pubkey-from-above>"
solana program set-buffer-authority "$BUFFER_ADDRESS" \
  --new-buffer-authority "<MULTISIG_VAULT_PDA>" \
  --url mainnet-beta

# 3. Create and execute the upgrade through Squads
# The upgrade instruction is BPFLoaderUpgradeable::Upgrade with:
#   program_data_account, program_account, buffer_account, spill_account
# Encode as base64 transaction message and submit to squads-multisig-cli

squads-multisig-cli initiate-program-upgrade \
  --rpc-url mainnet-beta \
  --program-id "$SQUADS_PROGRAM" \
  --keypair "<OPERATOR_KEY>" \
  --multisig-pubkey "<MULTISIG_PDA>" \
  --program-address "$BC_ID" \
  --buffer-address "$BUFFER_ADDRESS"
```

---

## Section (n) — Cost estimates per step

| Step | Estimated SOL cost | Notes |
|---|---|---|
| (a) Pre-flight (tests, build) | 0 SOL | Local only |
| (b) Key generation | ~0 SOL | Local only; no on-chain tx |
| (c) Update declare_id and rebuild | 0 SOL | Local only |
| (d) SBF build | 0 SOL | Local only |
| (e) Deploy bonding-curve | 3–5 SOL | Rent for ~200–400 KB program data |
| (e) Deploy soul-generator | 3–5 SOL | Rent for ~200–400 KB program data |
| (e) Deploy transfer-hook | 2–4 SOL | Smaller program |
| (f) initialize_global_config (bonding-curve) | ~0.002 SOL | Rent for small PDA |
| (f) initialize_global_config (soul-generator) | ~0.002 SOL | Rent for small PDA |
| (g) External renderer registration | ~0.005 SOL | Optional; skip if built-ins sufficient |
| (h) Squads multisig create | ~0.1–0.5 SOL | Rent for multisig account |
| (h) Rotate upgrade authority × 3 programs | ~0.01 SOL | Transaction fees only |
| (i) renounce_admin | ~0.001 SOL | Optional; irreversible |
| (j) Vercel deploy | $0 | Hobby/Pro tier; no SOL |
| (k) Indexer (Railway) | $0 | Free tier; $5/month for paid |
| First 30-day RPC (Helius/Triton) | $99–$499/month | Depends on request volume |
| **Total on-chain budget** | **≥ 15 SOL** | Add 5 SOL buffer for re-tries |

> Use `solana balance <MAINNET_DEPLOYER> --url mainnet-beta` before each step
> to confirm sufficient balance.

---

## Appendix: Quick-reference program addresses

After completing deployment, fill in this table and keep it in `deployments/mainnet.json`:

| Field | Value |
|---|---|
| `bonding_curve_program_id` | `<fill>` |
| `soul_generator_program_id` | `<fill>` |
| `transfer_hook_program_id` | `<fill>` |
| `multisig_pda` | `<fill>` |
| `vault_pda` | `<fill>` |
| `deployer_pubkey` | `<fill>` |
| `commit_sha` | `<fill>` |
| `deployed_at_iso` | `<fill>` |

---

## Appendix: Related documents

- `docs/mainnet-checklist.md` — single-page printable checklist
- `docs/mainnet-dry-run.md` — step-by-step dry-run (older CPMM-era reference; adapt to exponential curve)
- `docs/mainnet-risk-assessment.md` — risk tables
- `docs/multisig-runbook.md` — Squads V4 multisig reference
- `docs/devnet-runbook.md` — devnet reproduction guide
- `docs/production-rpc.md` — RPC provider selection and failover
- `docs/security-checklist.md` — security audit checklist
- `deployments/multisig-evidence-2026-05.md` — devnet drill template (adapt for mainnet)
- `deployments/mainnet.json.template` — JSON schema for deployment artifacts

---

*Document version: 2026-05-04. Exponential bonding curve (sato-style) architecture.*
*Sections referencing graduation, AMM migration, or Raydium/Meteora/PumpSwap
liquidity seeding do not apply to the current codebase (those modules were deleted
in commit 8d78729). See mission-cb0b1387-summary.md for the full supersession map.*
