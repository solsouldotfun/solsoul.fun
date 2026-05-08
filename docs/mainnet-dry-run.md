# Mainnet Dry-Run Runbook

This runbook is a dry-run checklist for a future SolSoul.fun mainnet launch. It records the exact operator steps, but this mission must not execute mainnet writes. Mainnet deployment remains a user decision, and every step below is gated accordingly.

**AUDIT NOT DONE — proceed at your own risk.** Do not treat this document as an audit substitute, a launch approval, or a guarantee that the AMM integrations are safe for user funds.

## Non-negotiable launch gates

- Use a dedicated mainnet deployer keypair that is different from the devnet keypair.
- Build production artifacts without `--features devnet`.
- Record every transaction signature, slot, artifact hash, program id, multisig authority, and operator identity in `deployments/mainnet.json` before opening launches.
- Stop immediately if any command output differs from the expected output in the relevant step.
- **AUDIT NOT DONE — proceed at your own risk.**

## 1. [USER DECISION REQUIRED] Build production SBF artifacts without devnet features

**AUDIT NOT DONE — proceed at your own risk.**

### Prerequisites

- Repository is on the exact commit approved for mainnet dry-run.
- `cargo`, `cargo build-sbf`, `solana`, `node`, and `pnpm` are installed.
- No uncommitted source changes except operator-owned local notes.
- Raydium AMM docs and SDK account fixtures have already been reviewed against the current commit.

### Exact CLI commands

```bash
cd /Users/davirian/dev/active/ideas/solsouldotfun
export PATH="$HOME/.cargo/bin:$PATH"
git status --short
git rev-parse HEAD
cargo build-sbf --workspace
shasum -a 256 target/deploy/bonding_curve.so target/deploy/soul_generator.so
```

### Expected outputs

- `git status --short` prints no tracked-file changes that would affect the build.
- `cargo build-sbf --workspace` exits `0` and produces:
  - `target/deploy/bonding_curve.so`
  - `target/deploy/soul_generator.so`
- `shasum -a 256` prints two SHA256 hashes that are copied into the operator's launch notes and later into `deployments/mainnet.json`.

### Rollback procedure

- If the build fails, do not deploy. Return to the last known-good commit and rerun this step.
- If hashes do not match the approved build record, delete the local `target/deploy/*.so` artifacts and rebuild from the approved commit.
- If any command was accidentally run with `--features devnet`, rerun `cargo build-sbf --workspace` without feature flags before continuing.

## 2. [USER DECISION REQUIRED] Fund a dedicated mainnet keypair that is not the devnet keypair

**AUDIT NOT DONE — proceed at your own risk.**

### Prerequisites

- A production custody plan exists for the deployer keypair and funding source.
- The mainnet deployer is not `~/.config/solana/id.json` if that file is used for devnet.
- The operator has independently estimated rent and deployment fees for both upgradeable programs plus the first low-value Raydium launch test.

### Exact CLI commands

```bash
cd /Users/davirian/dev/active/ideas/solsouldotfun
solana-keygen new --outfile ~/.config/solana/solsoul-mainnet.json
MAINNET_DEPLOYER="$(solana-keygen pubkey ~/.config/solana/solsoul-mainnet.json)"
DEVNET_DEPLOYER="$(solana-keygen pubkey ~/.config/solana/id.json)"
test "$MAINNET_DEPLOYER" != "$DEVNET_DEPLOYER"
solana balance "$MAINNET_DEPLOYER" --url mainnet-beta

# Execute only after the user chooses the funding source and amount.
solana transfer "$MAINNET_DEPLOYER" <SOL_AMOUNT> \
  --from <SECURE_FUNDING_KEYPAIR> \
  --url mainnet-beta \
  --allow-unfunded-recipient

solana balance "$MAINNET_DEPLOYER" --url mainnet-beta
```

### Expected outputs

- `test "$MAINNET_DEPLOYER" != "$DEVNET_DEPLOYER"` exits `0`.
- The first balance command shows the current mainnet balance, commonly `0 SOL` for a new keypair.
- `solana transfer` prints a confirmed mainnet transaction signature only when the user intentionally executes funding.
- The final balance is sufficient for both program deployments, upgrade authority rotation, monitoring smoke reads, and the first low-value launch test.

### Rollback procedure

- If the keypair path is wrong or matches the devnet keypair, stop and generate a new mainnet-only keypair.
- If too little SOL is funded, do not start deployment; top up only after explicit user approval.
- If too much SOL is funded, move the excess back to the approved custody wallet after confirming no deployment is in progress.

## 3. [USER DECISION REQUIRED] Deploy the programs to mainnet-beta

**AUDIT NOT DONE — proceed at your own risk.**

### Prerequisites

- Steps 1 and 2 completed successfully.
- `target/deploy/bonding_curve.so` and `target/deploy/soul_generator.so` are production builds without devnet features.
- Program-id keypairs or final program addresses are approved and stored outside public logs if they contain secrets.
- The user has explicitly decided when to execute the deployment.

### Exact CLI commands

```bash
cd /Users/davirian/dev/active/ideas/solsouldotfun
MAINNET_KEYPAIR="$HOME/.config/solana/solsoul-mainnet.json"

solana program deploy target/deploy/bonding_curve.so \
  --url mainnet-beta \
  --keypair "$MAINNET_KEYPAIR" \
  --upgrade-authority "$MAINNET_KEYPAIR" \
  --program-id target/deploy/bonding_curve-keypair.json

solana program deploy target/deploy/soul_generator.so \
  --url mainnet-beta \
  --keypair "$MAINNET_KEYPAIR" \
  --upgrade-authority "$MAINNET_KEYPAIR" \
  --program-id target/deploy/soul_generator-keypair.json

BONDING_CURVE_PROGRAM_ID="$(solana address -k target/deploy/bonding_curve-keypair.json)"
SOUL_GENERATOR_PROGRAM_ID="$(solana address -k target/deploy/soul_generator-keypair.json)"
solana program show "$BONDING_CURVE_PROGRAM_ID" --url mainnet-beta
solana program show "$SOUL_GENERATOR_PROGRAM_ID" --url mainnet-beta
```

### Expected outputs

- Each `solana program deploy` exits `0` and prints a `Program Id`.
- Each `solana program show` displays `Owner: BPFLoaderUpgradeab1e11111111111111111111111`.
- Each program's upgrade authority is the mainnet deployer until Step 4 rotates it to multisig.
- Deployment transaction signatures, slots, explorer URLs, program ids, commit SHA, and artifact SHA256 values are recorded in `deployments/mainnet.json`.

### Rollback procedure

- If one deployment fails before confirmation, do not retry blindly; inspect the transaction error and rebuild if artifact integrity is in doubt.
- If an incorrect program is deployed but the upgrade authority is still controlled, rebuild the approved artifact and redeploy to the same program id.
- If the wrong upgrade authority is set, perform Step 4 immediately with the correct authority before opening launches.
- If an irrecoverable deployment mistake occurs, abandon the incorrect program ids and publish replacement program ids only after user approval.

## 4. [USER DECISION REQUIRED] Rotate upgrade authority to the approved multisig

**AUDIT NOT DONE — proceed at your own risk.**

### Prerequisites

- Mainnet multisig address and threshold are approved out-of-band.
- At least the required threshold of signers is available.
- Both program ids from Step 3 are verified on mainnet-beta.
- The operator understands that `--final` is irreversible and must not be used unless immutability is explicitly approved.

### Exact CLI commands

```bash
cd /Users/davirian/dev/active/ideas/solsouldotfun
MAINNET_KEYPAIR="$HOME/.config/solana/solsoul-mainnet.json"
BONDING_CURVE_PROGRAM_ID="<MAINNET_BONDING_CURVE_PROGRAM_ID>"
SOUL_GENERATOR_PROGRAM_ID="<MAINNET_SOUL_GENERATOR_PROGRAM_ID>"
MULTISIG_AUTHORITY="<APPROVED_MAINNET_MULTISIG_AUTHORITY>"

solana program set-upgrade-authority "$BONDING_CURVE_PROGRAM_ID" \
  --upgrade-authority "$MAINNET_KEYPAIR" \
  --new-upgrade-authority "$MULTISIG_AUTHORITY" \
  --url mainnet-beta

solana program set-upgrade-authority "$SOUL_GENERATOR_PROGRAM_ID" \
  --upgrade-authority "$MAINNET_KEYPAIR" \
  --new-upgrade-authority "$MULTISIG_AUTHORITY" \
  --url mainnet-beta

solana program show "$BONDING_CURVE_PROGRAM_ID" --url mainnet-beta
solana program show "$SOUL_GENERATOR_PROGRAM_ID" --url mainnet-beta
```

### Expected outputs

- Both authority-rotation commands exit `0` and print confirmed transaction signatures.
- Both `program show` outputs display the approved multisig as the authority.
- The mainnet deployer keypair is no longer the sole upgrade authority.

### Rollback procedure

- If rotation fails for either program, keep launches closed and retry only after confirming the current authority.
- If authority was rotated to the wrong multisig and that multisig is controllable, submit a multisig transaction to rotate to the correct authority.
- If authority was rotated to an uncontrollable address, stop immediately and escalate; do not accept launches on that program id.

## 5. [USER DECISION REQUIRED] Enable monitoring and Sentry for production

**AUDIT NOT DONE — proceed at your own risk.**

### Prerequisites

- Production RPC provider is selected, rate limits are understood, and failover endpoints are documented.
- Sentry project exists, but no real DSN or API key is committed to git.
- Program ids from Step 3 are final and match the frontend environment.
- Monitoring operator has reviewed `docs/production-rpc.md` and the indexer schema.

### Exact CLI commands

```bash
cd /Users/davirian/dev/active/ideas/solsouldotfun
cp .env.production.example .env.production.local

# Edit .env.production.local locally; do not commit it.
$EDITOR .env.production.local

NEXT_PUBLIC_RPC="<HELIUS_OR_TRITON_MAINNET_RPC>" \
NEXT_PUBLIC_SENTRY_DSN="<SENTRY_DSN_FROM_SENTRY_UI>" \
NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID="<MAINNET_BONDING_CURVE_PROGRAM_ID>" \
NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID="<MAINNET_SOUL_GENERATOR_PROGRAM_ID>" \
pnpm --filter app build

pnpm exec tsx services/indexer/src/main.ts \
  --rpc "<HELIUS_OR_TRITON_MAINNET_RPC>" \
  --duration-sec 30
```

### Expected outputs

- `.env.production.local` remains untracked.
- `pnpm --filter app build` exits `0`.
- The indexer starts, connects to mainnet RPC, performs read-only log subscription, and exits after `30` seconds without leaking secrets.
- Sentry receives a test event only if the operator intentionally triggers one in the production Sentry project.

### Rollback procedure

- If the app build fails, unset the production environment variables and fix the build before deploying frontend assets.
- If Sentry is misconfigured, remove `NEXT_PUBLIC_SENTRY_DSN` from the environment and redeploy the frontend with monitoring disabled.
- If the indexer fails or rate limits, stop the indexer process, switch to the documented failover RPC provider, and replay from the last indexed slot.

## 6. [USER DECISION REQUIRED] Publish ToS, privacy, and risk disclosures

**AUDIT NOT DONE — proceed at your own risk.**

### Prerequisites

- Legal counsel has replaced placeholder privacy and ToS text with approved production text.
- Risk disclaimer modal still states that the protocol has not completed an audit.
- Production build environment points at mainnet program ids and production RPC.
- The user has approved the final launch-facing copy.

### Exact CLI commands

```bash
cd /Users/davirian/dev/active/ideas/solsouldotfun
pnpm --filter app test -- RiskDisclaimerModal
pnpm --filter app test -- privacy
NEXT_PUBLIC_RPC="<HELIUS_OR_TRITON_MAINNET_RPC>" \
NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID="<MAINNET_BONDING_CURVE_PROGRAM_ID>" \
NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID="<MAINNET_SOUL_GENERATOR_PROGRAM_ID>" \
pnpm --filter app build

PORT=3001 pnpm --filter app start
# In another shell while the server is running:
curl -fsS http://127.0.0.1:3001/en/launch
curl -fsS http://127.0.0.1:3001/en/privacy
```

### Expected outputs

- Risk disclaimer and privacy tests exit `0`.
- `pnpm --filter app build` exits `0`.
- `/en/launch` renders the launch page with the risk disclaimer flow available.
- `/en/privacy` renders production-approved legal text, not placeholder copy.
- No frontend bundle contains a private key or secret RPC token beyond intentionally public `NEXT_PUBLIC_*` values.

### Rollback procedure

- If legal copy is still placeholder text, do not publish; revert the production deploy to the previous reviewed frontend build.
- If the risk disclaimer is missing or altered to hide audit status, restore the previous disclaimer text before accepting users.
- If a secret is exposed in frontend output, rotate that secret immediately and redeploy with a public-safe configuration.

## 7. [USER DECISION REQUIRED] Run the first low-value Raydium mainnet launch test

**AUDIT NOT DONE — proceed at your own risk.**

### Prerequisites

- Steps 1-6 completed successfully and all outputs were recorded.
- Launches remain closed to the public except the operator's low-value test mint.
- Mainnet deployer and test wallet are funded only with the amount required for a tiny Raydium verification run.
- AMM migration is historical/deferred for this runbook; Raydium, PumpSwap, and Meteora must not be exercised as active product paths unless scope is explicitly reopened.

### Exact CLI commands

```bash
cd /Users/davirian/dev/active/ideas/solsouldotfun
MAINNET_KEYPAIR="$HOME/.config/solana/solsoul-mainnet.json"
MAINNET_RPC="<HELIUS_OR_TRITON_MAINNET_RPC>"
BONDING_CURVE_PROGRAM_ID="<MAINNET_BONDING_CURVE_PROGRAM_ID>"
SOUL_GENERATOR_PROGRAM_ID="<MAINNET_SOUL_GENERATOR_PROGRAM_ID>"
TARGET_AMM="raydium"

solana balance --keypair "$MAINNET_KEYPAIR" --url "$MAINNET_RPC"
solana program show "$BONDING_CURVE_PROGRAM_ID" --url "$MAINNET_RPC"
solana program show "$SOUL_GENERATOR_PROGRAM_ID" --url "$MAINNET_RPC"

# Execute the low-value launch with an operator-authored script or console
# that calls the committed SDK helpers: initializeSoulIx, createToken,
# buy, fetchBondingCurve, fetchSoul, claimSoul, and migrateIx.
# Keep SOL input tiny and record every signature before opening public launches.
pnpm exec tsx <OPERATOR_MAINNET_LOW_VALUE_LAUNCH_SCRIPT>.ts \
  --rpc "$MAINNET_RPC" \
  --keypair "$MAINNET_KEYPAIR" \
  --bonding-curve-program "$BONDING_CURVE_PROGRAM_ID" \
  --soul-generator-program "$SOUL_GENERATOR_PROGRAM_ID" \
  --target-amm "$TARGET_AMM" \
  --max-sol-in 0.01

solana logs "$BONDING_CURVE_PROGRAM_ID" --url "$MAINNET_RPC"
solana logs "$SOUL_GENERATOR_PROGRAM_ID" --url "$MAINNET_RPC"
```

### Expected outputs

- Balance and `program show` commands confirm the operator is using the intended mainnet wallet and program ids.
- The low-value launch script records signatures for create token, initialize soul, buy, optional graduation/migrate, generate soul, and claim flows that it exercises.
- On-chain state decodes successfully for the meme mint, curve PDA, soul PDA, and any AMM pool or LP lock artifact created.
- Monitoring sees the expected graduation, claim, and pause-related events if those paths are triggered.

### Rollback procedure

- If any instruction fails, keep public launches closed and pause the affected program if pause is already initialized.
- If the Raydium pool or LP custody output is wrong, stop launches and keep frontend configuration closed to public launches.
- If user-facing UI points at the wrong program ids, redeploy the frontend with the correct `NEXT_PUBLIC_*` values and invalidate cached assets.
- If funds remain in a test mint or vault, recover only through documented program instructions and multisig-approved operations; do not patch state manually.
