# Multisig Upgrade Authority Runbook

This runbook is for the SolSoul devnet Squads V4 drill only. Mainnet writes are out of scope for the current mission.

**Mainnet rotation must NEVER be performed until an emergency-revert tx has been multisig-signed and tested on devnet.**

## Scope and Safety Gates

- Cluster: devnet only (`https://api.devnet.solana.com`).
- Squads V4 program on devnet: `SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr`.
- Current PD13 program IDs (2026-05):
  - bonding-curve: `CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un`
  - soul-generator: `34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ`
- Current single-key upgrade authority: `8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i` (the devnet deploy wallet in `~/.config/solana/id.json`).
- Budget cap: `1 SOL` for the complete drill.
- Mainnet operations: forbidden. Do not run these commands with `--url mainnet-beta`.

Before any rotation, verify the Squads V4 program is deployed on devnet:

```bash
solana account SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr --url https://api.devnet.solana.com
```

Expected output includes `Owner: BPFLoaderUpgradeab1e11111111111111111111111` and `Executable: true`.

## 1. Generate Drill Members

`scripts/multisig-rotate.sh` generates three local test member keypairs under `tmp/multisig-drill/`:

```bash
bash scripts/multisig-rotate.sh
```

The default mode is plan-only and safe to run repeatedly. It verifies devnet, confirms the Squads V4 program account, checks the deploy wallet balance is at least `1 SOL`, reads `deployments/devnet.json`, and creates or reuses:

```text
tmp/multisig-drill/member-1.json
tmp/multisig-drill/member-2.json
tmp/multisig-drill/member-3.json
```

Each member is assigned Squads permissions `7` (propose + approve + execute). The multisig threshold is `2`.

## 2. Create the Squads 2-of-3 Multisig

Install or provide the Squads CLI before execute mode:

```bash
cargo install squads-multisig-cli
# or
export SQDS_CLI_BIN=/path/to/squads-multisig-cli
```

Install the Squads CLI (Rust binary from crates.io):

```bash
cargo install squads-multisig-cli   # installs v0.1.7 or later
```

Create the multisig on devnet with three members (permissions=7 = Initiator|Voter|Executor):

```bash
MEMBER1="8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i"  # original keypair
MEMBER2="<generated-member-2-pubkey>"
MEMBER3="<generated-member-3-pubkey>"

squads-multisig-cli multisig-create \
  --rpc-url https://api.devnet.solana.com \
  --program-id SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr \
  --keypair ~/.config/solana/id.json \
  -m "$MEMBER1:7" \
  -m "$MEMBER2:7" \
  -m "$MEMBER3:7" \
  --threshold 2
```

The command outputs the multisig PDA address. Record it:

```bash
export MULTISIG_PDA=<output-multisig-pda>
```

Get the vault PDA using the Squads CLI:

```bash
squads-multisig-cli display-vault \
  --program-id SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr \
  --multisig-address "$MULTISIG_PDA" \
  --vault-index 0 \
  --rpc-url https://api.devnet.solana.com
```

The vault PDA seed derivation: `["multisig", multisig_pda_bytes, "vault", 0u8]` under program `SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr`.

Export the vault address:

```bash
export MULTISIG_VAULT_PDA=<vault-index-0-pda-from-display-vault>
```

## 3. Rotate Upgrade Authority to the Multisig Vault (Rotate-Out)

Record baseline program authorities before rotation:

```bash
solana program show CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un --url https://api.devnet.solana.com
solana program show 34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ --url https://api.devnet.solana.com
```

Rotate upgrade authority from original keypair to vault PDA for both programs:

```bash
# bonding-curve
solana program set-upgrade-authority CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un \
  --new-upgrade-authority "$MULTISIG_VAULT_PDA" \
  --upgrade-authority ~/.config/solana/id.json \
  --skip-new-upgrade-authority-signer-check \
  --url https://api.devnet.solana.com

# soul-generator
solana program set-upgrade-authority 34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ \
  --new-upgrade-authority "$MULTISIG_VAULT_PDA" \
  --upgrade-authority ~/.config/solana/id.json \
  --skip-new-upgrade-authority-signer-check \
  --url https://api.devnet.solana.com
```

Verify after rotation:

```bash
solana program show CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un --url https://api.devnet.solana.com
solana program show 34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ --url https://api.devnet.solana.com
```

Expected output: `Authority: <MULTISIG_VAULT_PDA>` for both programs.

## 4. Rotate Back via Vault Transaction (Rotate-Back Drill)

This is the core of the authority drill. The vault PDA (now the upgrade authority) proposes and executes a transaction that rotates both program authorities back to the original keypair.

### 4a. Build the Transaction Message

Build a serialized legacy transaction message containing two BPFLoaderUpgradeable SetAuthority instructions (one per program), with the vault PDA as the signer:

```bash
# Use a helper script to construct the base64 transaction message:
pnpm exec tsx scripts/build-authority-rotate-back-message.ts \
  --multisig "$MULTISIG_PDA" \
  --vault "$MULTISIG_VAULT_PDA" \
  --new-authority "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i" \
  --bonding-curve-data "D6vr2379jRtXLyoCLsZs4UW9Dm2Ccv1QeR9vXstwiSsn" \
  --soul-generator-data "Ck4hqT5uA5svZGqaBRmucdnEPdjbpV1tqUEwXEvtYdGk" \
  --rpc-url https://api.devnet.solana.com
```

The BPFLoaderUpgradeable SetAuthority instruction format:
- Program: `BPFLoaderUpgradeab1e11111111111111111111111`
- Instruction index (borsh u32 LE): `[4, 0, 0, 0]`
- Accounts: `[programdata (writable), current_authority (signer=vault), new_authority]`

### 4b. Propose the Vault Transaction

```bash
squads-multisig-cli vault-transaction-create \
  --rpc-url https://api.devnet.solana.com \
  --program-id SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr \
  --keypair ~/.config/solana/id.json \
  --multisig-pubkey "$MULTISIG_PDA" \
  --vault-index 0 \
  --transaction-message "<base64-message-from-above>" \
  --memo "MN.F4 rotate-back: bonding-curve + soul-generator → original authority"
```

Record the transaction index from the output (typically `1` for a new multisig).

### 4c. Approve with Two Distinct Members

```bash
# Approve with member 1 (original keypair)
squads-multisig-cli proposal-vote \
  --rpc-url https://api.devnet.solana.com \
  --program-id SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr \
  --keypair ~/.config/solana/id.json \
  --multisig-pubkey "$MULTISIG_PDA" \
  --transaction-index 1 \
  --action Approve

# Approve with member 2 (second keypair)
squads-multisig-cli proposal-vote \
  --rpc-url https://api.devnet.solana.com \
  --program-id SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr \
  --keypair /tmp/member2.json \
  --multisig-pubkey "$MULTISIG_PDA" \
  --transaction-index 1 \
  --action Approve
```

### 4d. Execute the Vault Transaction

```bash
squads-multisig-cli vault-transaction-execute \
  --rpc-url https://api.devnet.solana.com \
  --program-id SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr \
  --keypair ~/.config/solana/id.json \
  --multisig-pubkey "$MULTISIG_PDA" \
  --transaction-index 1
```

### 4e. Verify On-Chain Restoration

```bash
solana program show CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un --url https://api.devnet.solana.com
solana program show 34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ --url https://api.devnet.solana.com
```

Expected output: `Authority: 8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i` for both programs.

## 5. Future Upgrade Flow (propose -> approve x2 -> execute)

A real future upgrade must be driven through a Squads vault transaction:

1. Build the new SBF artifacts locally.
2. Write the new artifact into a devnet buffer controlled by the multisig vault.
3. Create a sign-only upgrade transaction message:

```bash
solana program upgrade <buffer-pubkey> <program-id> \
  --upgrade-authority "$MULTISIG_VAULT_PDA" \
  --fee-payer ~/.config/solana/id.json \
  --sign-only \
  --dump-transaction-message \
  --blockhash <latest-devnet-blockhash> \
  --url https://api.devnet.solana.com > tmp/multisig-drill/future-upgrade-message.b64
```

4. Propose the vault transaction:

```bash
squads-multisig-cli vault-transaction-create \
  --rpc-url https://api.devnet.solana.com \
  --program-id SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr \
  --keypair ~/.config/solana/id.json \
  --multisig-pubkey "$MULTISIG_PDA" \
  --vault-index 0 \
  --transaction-message "$(cat tmp/multisig-drill/future-upgrade-message.b64)" \
  --memo "SolSoul future upgrade proposal"
```

5. Approve with two distinct members:

```bash
squads-multisig-cli proposal-vote --rpc-url https://api.devnet.solana.com --program-id SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr --keypair ~/.config/solana/id.json --multisig-pubkey "$MULTISIG_PDA" --transaction-index <tx-index> --action Approve
squads-multisig-cli proposal-vote --rpc-url https://api.devnet.solana.com --program-id SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr --keypair /tmp/member2.json --multisig-pubkey "$MULTISIG_PDA" --transaction-index <tx-index> --action Approve
```

6. Execute after threshold is reached:

```bash
squads-multisig-cli vault-transaction-execute \
  --rpc-url https://api.devnet.solana.com \
  --program-id SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr \
  --keypair ~/.config/solana/id.json \
  --multisig-pubkey "$MULTISIG_PDA" \
  --transaction-index <tx-index>
```

For the M11 drill, the future-upgrade message is generated as a dry-run artifact; do not execute a program upgrade unless a later feature explicitly requires it.

## 6. Emergency Revert

The emergency revert is a Squads-controlled `set-upgrade-authority` back to the devnet deploy wallet. Generate the sign-only message for each program:

```bash
solana program set-upgrade-authority <program-id> \
  --new-upgrade-authority "$(solana-keygen pubkey ~/.config/solana/id.json)" \
  --upgrade-authority "$MULTISIG_VAULT_PDA" \
  --skip-new-upgrade-authority-signer-check \
  --sign-only \
  --dump-transaction-message \
  --blockhash <latest-devnet-blockhash> \
  --url https://api.devnet.solana.com > tmp/multisig-drill/emergency-revert-message.b64
```

Then use the same flow as above: propose -> approve x2 -> execute. After execution, verify both SolSoul programs are restored:

```bash
solana program show CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un --url https://api.devnet.solana.com
solana program show 34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ --url https://api.devnet.solana.com
```

Expected output: `Authority: <devnet deploy wallet pubkey>` for both programs.

## 7. One-Command Drill Wrapper

After exporting `MULTISIG_PDA` and `MULTISIG_VAULT_PDA`, run:

```bash
bash scripts/multisig-rotate.sh --execute
```

The wrapper refuses non-devnet RPC URLs, confirms the Squads V4 program (`SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr`), checks the `1 SOL` budget floor, rotates both programs to the vault, writes future-upgrade dry-run messages, proposes/approves/executes emergency revert transactions, and verifies both authorities are back on the original single-key deploy wallet.

> **Tool note**: All `squads-multisig-cli` commands use the Rust binary from crates.io (`cargo install squads-multisig-cli`), not the `@sqds/multisig` TypeScript SDK. This satisfies the MN.F4 redo requirement for CLI-based execution.

## 8. MN.F4 Redo Evidence Requirements

The following evidence must be captured and stored in `deployments/devnet.json` under `multisig_rotation_evidence` and in `deployments/multisig-evidence-2026-05.md`:

```json
{
  "multisig_rotation_evidence": {
    "multisigPda": "<squads-multisig-pda>",
    "vaultPda": "<vault-index-0-pda>",
    "members": ["<member1>", "<member2>", "<member3>"],
    "threshold": 2,
    "drillDate": "2026-05",
    "rotateOutTxSigs": {
      "bondingCurve": "<sig + slot + explorer>",
      "soulGenerator": "<sig + slot + explorer>"
    },
    "vaultTxCreateSig": "<sig>",
    "vaultTxApproveSigs": ["<member1-approve-sig>", "<member2-approve-sig>"],
    "vaultTxExecuteSig": "<sig>",
    "verifiedOriginalAuthority": {
      "bondingCurve": "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
      "soulGenerator": "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i"
    },
    "toolUsed": "squads-multisig-cli v0.1.7"
  }
}
```

A tamper-evident copy of this evidence (with full command transcript) is stored in `deployments/multisig-evidence-2026-05.md`.

On-chain verification commands (re-runnable):

```bash
solana program show CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un --url https://api.devnet.solana.com
solana program show 34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ --url https://api.devnet.solana.com
# Both should show Authority: 8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i
```
