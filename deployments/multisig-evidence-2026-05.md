# MN.F4 Redo — Squads V4 Multisig Upgrade-Authority Rotation Drill

**Date**: 2026-05  
**Feature**: `mn-f4-redo-multisig-drill-cli`  
**Tool required**: `squads-multisig-cli` v0.1.7 (Rust CLI from crates.io — NOT TypeScript SDK)  
**Cluster**: devnet only

## Status: BLOCKED — Devnet Write Operations Require User Confirmation

This evidence file documents the preparation work completed by the mn-f4-redo worker and the blocker preventing full drill execution. The full drill must be re-run in an interactive session (not a delegated auto-session).

---

## What Was Completed

### 1. squads-multisig-cli Installed

```bash
cargo install squads-multisig-cli
# Installed: squads-multisig-cli v0.1.7
# Binary: ~/.cargo/bin/squads-multisig-cli
```

Verified commands available:
- `multisig-create`
- `display-vault`
- `vault-transaction-create`
- `proposal-vote`
- `vault-transaction-execute`
- `vault-transaction-accounts-close`
- `initiate-program-upgrade`
- `program-config-init`

### 2. Member Keypairs Generated

```
Member 1 (original): 8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i
Member 2: Hpw2yKSnChvmu1qSTtTGi14DjSCZ74snHdCzpKsWGAH  (keypair: /tmp/member2.json)
Member 3: EcP5tWutAqwMzz1keWfkgoKemV5KAbYLKiM3CnkBhENM  (keypair: /tmp/member3.json)
```

**Note**: Member 2 and 3 keypairs are stored in `/tmp/` and will not survive machine restarts. Regenerate with `solana-keygen new` if needed.

### 3. Devnet Balance Confirmed

```
Balance before drill: 9.036370098 SOL (wallet: 8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i)
```

### 4. Current Program State (Pre-Drill)

Programs to drill (PD13 fresh IDs):
- **bonding-curve**: `CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un`
  - programData: `D6vr2379jRtXLyoCLsZs4UW9Dm2Ccv1QeR9vXstwiSsn`
  - upgrade-authority: `8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i` (original)
- **soul-generator**: `34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ`
  - programData: `Ck4hqT5uA5svZGqaBRmucdnEPdjbpV1tqUEwXEvtYdGk`
  - upgrade-authority: `8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i` (original)

Solana config at drill time: `http://127.0.0.1:8899` (local default; drill commands use `--url https://api.devnet.solana.com` explicitly).

---

## Blocker: Devnet Writes Require Interactive User Confirmation

The following commands are required to complete the drill but were blocked in the delegated auto-session (no user available to approve network writes):

### Blocked Step 1: Create Multisig

```bash
export SQUADS_PROGRAM="SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr"
export MEMBER1="8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i"
export MEMBER2="Hpw2yKSnChvmu1qSTtTGi14DjSCZ74snHdCzpKsWGAH"
export MEMBER3="EcP5tWutAqwMzz1keWfkgoKemV5KAbYLKiM3CnkBhENM"

squads-multisig-cli multisig-create \
  --rpc-url https://api.devnet.solana.com \
  --program-id "$SQUADS_PROGRAM" \
  --keypair ~/.config/solana/id.json \
  -m "$MEMBER1:7" \
  -m "$MEMBER2:7" \
  -m "$MEMBER3:7" \
  --threshold 2
```

### Blocked Step 2: Get Vault PDA

```bash
squads-multisig-cli display-vault \
  --program-id "$SQUADS_PROGRAM" \
  --multisig-address "<MULTISIG_PDA_FROM_STEP_1>" \
  --vault-index 0 \
  --rpc-url https://api.devnet.solana.com
```

### Blocked Step 3: Rotate Authority to Vault (Rotate-Out)

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

### Blocked Step 4: Build SetAuthority Transaction Message

Build a base64-encoded transaction message with two BPFLoaderUpgradeable::SetAuthority instructions
(vault PDA → original keypair for both programs), then:

```bash
squads-multisig-cli vault-transaction-create \
  --rpc-url https://api.devnet.solana.com \
  --program-id "$SQUADS_PROGRAM" \
  --keypair ~/.config/solana/id.json \
  --multisig-pubkey "$MULTISIG_PDA" \
  --vault-index 0 \
  --transaction-message "<base64-message>" \
  --memo "MN.F4 rotate-back: bonding-curve + soul-generator -> original authority"
```

### Blocked Step 5: Approve with 2 Members

```bash
# Member 1 approve
squads-multisig-cli proposal-vote \
  --rpc-url https://api.devnet.solana.com \
  --program-id "$SQUADS_PROGRAM" \
  --keypair ~/.config/solana/id.json \
  --multisig-pubkey "$MULTISIG_PDA" \
  --transaction-index 1 \
  --action Approve

# Member 2 approve
squads-multisig-cli proposal-vote \
  --rpc-url https://api.devnet.solana.com \
  --program-id "$SQUADS_PROGRAM" \
  --keypair /tmp/member2.json \
  --multisig-pubkey "$MULTISIG_PDA" \
  --transaction-index 1 \
  --action Approve
```

### Blocked Step 6: Execute and Verify

```bash
squads-multisig-cli vault-transaction-execute \
  --rpc-url https://api.devnet.solana.com \
  --program-id "$SQUADS_PROGRAM" \
  --keypair ~/.config/solana/id.json \
  --multisig-pubkey "$MULTISIG_PDA" \
  --transaction-index 1

# Verify restoration
solana program show CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un --url https://api.devnet.solana.com
solana program show 34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ --url https://api.devnet.solana.com
```

---

## Evidence Template (To Be Filled After Interactive Execution)

Once the drill is completed in an interactive session, update `deployments/devnet.json` with:

```json
{
  "multisig_rotation_evidence": {
    "multisigPda": "<squads-multisig-pda>",
    "vaultPda": "<vault-index-0-pda>",
    "members": [
      "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
      "Hpw2yKSnChvmu1qSTtTGi14DjSCZ74snHdCzpKsWGAH",
      "EcP5tWutAqwMzz1keWfkgoKemV5KAbYLKiM3CnkBhENM"
    ],
    "threshold": 2,
    "drillDate": "2026-05",
    "toolUsed": "squads-multisig-cli v0.1.7",
    "squadsProgram": "SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr",
    "rotateOutTxSigs": {
      "bondingCurve": {
        "sig": "<tx-signature>",
        "slot": 0,
        "explorer": "https://explorer.solana.com/tx/<sig>?cluster=devnet"
      },
      "soulGenerator": {
        "sig": "<tx-signature>",
        "slot": 0,
        "explorer": "https://explorer.solana.com/tx/<sig>?cluster=devnet"
      }
    },
    "vaultTxCreateSig": "<sig>",
    "vaultTxApproveSigs": [
      "<member1-approve-sig>",
      "<member2-approve-sig>"
    ],
    "vaultTxExecuteSig": "<sig>",
    "verifiedOriginalAuthority": {
      "bondingCurve": "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
      "soulGenerator": "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i"
    }
  }
}
```

---

## Verification Commands (Re-runnable after drill)

```bash
# Check multisig_rotation_evidence is non-null
jq .multisig_rotation_evidence deployments/devnet.json

# Verify both programs show original authority
solana program show CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un --url https://api.devnet.solana.com
solana program show 34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ --url https://api.devnet.solana.com

# Confirm evidence files exist
test -f docs/multisig-runbook.md && echo "runbook: OK"
ls deployments/multisig-evidence-*.md
```
