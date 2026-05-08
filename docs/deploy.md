# Devnet Deployment Runbook

Mainnet deployment is out of scope for this mission. Use this runbook only for Solana devnet.

For the Milestone D canonical reproduction guide, including recorded devnet transaction evidence and frontend smoke steps, see [`docs/devnet-runbook.md`](devnet-runbook.md).

For the public Vercel + Railway devnet test environment, including environment variables and rollback commands, see [`docs/public-devnet-deploy.md`](public-devnet-deploy.md).

For the operator-only mainnet dry-run checklist, see [`docs/mainnet-dry-run.md`](mainnet-dry-run.md). It documents the future mainnet flow but does not authorize or execute mainnet deployment.

## Keypair management

- Create or select a dedicated devnet wallet keypair; do not use a production/mainnet wallet:

```bash
solana-keygen new --outfile ~/.config/solana/solsoul-devnet.json
```

- Keep the keypair out of git and never paste its contents into logs, tickets, or chat.
- The deploy script requires the keypair path as its only positional argument and uses that wallet as both fee payer and upgrade authority.
- If you need stable program addresses across redeploys, provide existing program-id keypairs or addresses:

```bash
BONDING_CURVE_PROGRAM_ID=target/deploy/bonding_curve-keypair.json \
SOUL_GENERATOR_PROGRAM_ID=target/deploy/soul_generator-keypair.json \
TRANSFER_HOOK_PROGRAM_ID=target/deploy/transfer_hook-keypair.json \
bash scripts/deploy-devnet.sh ~/.config/solana/solsoul-devnet.json
```

## Fund expectations

The deploy wallet must have at least `4 SOL` on devnet before deployment starts. The script checks the wallet balance and attempts one devnet airdrop for the missing amount when the faucet is available. If the faucet is rate limited or unavailable, fund the wallet manually and rerun.

## Deployment

Configure the Solana CLI for devnet before running the script:

```bash
solana config set --url devnet
solana config get
bash scripts/deploy-devnet.sh ~/.config/solana/solsoul-devnet.json
```

The script:

1. Refuses to run unless `solana config get` points to devnet.
2. Validates the provided wallet keypair path.
3. Ensures the deploy wallet has at least `4 SOL`, with a devnet airdrop attempt when underfunded.
4. Runs `cargo build-sbf --workspace`.
5. Deploys `target/deploy/bonding_curve.so`, `target/deploy/soul_generator.so`, and `target/deploy/transfer_hook.so` with `--upgrade-authority` set to the wallet keypair.
6. Runs `solana program show` for all three deployed program ids.
7. Writes `deployments/devnet.json` with the resulting program ids, upgrade authority, artifact paths, and verification timestamp.

## Verify

After deployment, inspect the generated deployment file and verify each program directly:

```bash
cat deployments/devnet.json
solana program show <bondingCurveProgramId> --url devnet
solana program show <soulGeneratorProgramId> --url devnet
solana program show <transferHookProgramId> --url devnet
```

All `program show` commands must succeed and display upgradeable program metadata. Confirm the upgrade authority shown by the CLI matches the expected deploy wallet before wiring the IDs into clients or environment variables.

## Upgrade authority rotation

Rotate upgrade authority after a successful devnet deploy if another wallet or multisig should control upgrades:

```bash
solana program set-upgrade-authority <program-id> \
  --upgrade-authority ~/.config/solana/solsoul-devnet.json \
  --new-upgrade-authority <new-authority-keypair-or-pubkey> \
  --url devnet
```

Run the command for all three programs and then re-run `solana program show <program-id> --url devnet` to confirm the new authority. Use `--final` only when intentionally making a program immutable; that action cannot be rolled back.

## Rollback

Solana upgradeable programs do not automatically keep old code on chain. Treat rollback as a controlled redeploy:

1. Identify the last known-good git commit and build artifacts.
2. Check out that commit locally and run `cargo build-sbf --workspace`.
3. Redeploy to the same program ids using the current upgrade authority:

```bash
BONDING_CURVE_PROGRAM_ID=<bondingCurveProgramId> \
SOUL_GENERATOR_PROGRAM_ID=<soulGeneratorProgramId> \
TRANSFER_HOOK_PROGRAM_ID=<transferHookProgramId> \
bash scripts/deploy-devnet.sh ~/.config/solana/solsoul-devnet.json
```

4. Verify all three programs with `solana program show` and update `deployments/devnet.json` from the successful rollback run.

If upgrade authority has been rotated, the rollback operator must use the current authority keypair instead of the original deploy wallet.

## Mainnet binary gate

`scripts/check-mainnet-build.sh` is a binary smoke test that runs in CI on every PR and every push to `main` via `.github/workflows/mainnet-build-gate.yml`.

### What the gate checks

The `devnet` Cargo feature was removed from `programs/bonding-curve/Cargo.toml` after commit 8d78729 because nothing branches on it (the graduation-threshold devnet override was deleted as part of the exponential-curve refactor).  There is now a single canonical build.

The gate asserts:
1. `cargo build-sbf` for both `bonding-curve` and `soul-generator` exits without errors.
2. `bonding_curve.so` contains the sentinel string `EXP_CURVE_V1_K_21M_S_500SOL`, which is embedded via `#[used] static EXP_CURVE_SENTINEL: &[u8] = b"EXP_CURVE_V1_K_21M_S_500SOL"` in `programs/bonding-curve/src/lib.rs`.

The sentinel proves the binary was compiled from the canonical exponential-curve model (`T = K*(1 - e^(-R/S))`, K=21M tokens, S=500 SOL).  A build that somehow omits the sentinel — e.g., a stripped or substituted binary — will fail the gate.

### Running the gate locally

```bash
# Build the artifact first (no --features devnet; the feature has been removed)
PATH="$HOME/.cargo/bin:$PATH" cargo build-sbf --manifest-path programs/bonding-curve/Cargo.toml

# Run the gate check
bash scripts/check-mainnet-build.sh target/deploy/bonding_curve.so
```

Exit code 0 means the sentinel is present.  Exit code 1 means the binary is missing the sentinel — do not deploy.

### Note on devnet feature

The `--features devnet` flag used in older `deploy-devnet.sh` runs and `local-pumpswap-e2e.ts` has been removed.  Those scripts now build without any explicit feature flag.  Historical deployment artifacts that mention `--features devnet` reflect the previous CPMM model; they do not apply to the current exponential-curve codebase.
