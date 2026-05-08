#!/usr/bin/env bash
set -euo pipefail

# SolSoul M11.F3 Squads V4 upgrade-authority drill.
# Default mode is intentionally read-only/plan-only so validators can run it
# without consuming devnet SOL or changing program authorities. Pass --execute
# to submit the devnet drill transactions.

SQDS_PROGRAM_ID="${SQDS_PROGRAM_ID:-SQDS4ep65T869zMMBKyuUq6aD6EgTu3pNW18NuhdvdEr}"
DEVNET_RPC="${DEVNET_RPC:-https://api.devnet.solana.com}"
WALLET="${WALLET:-$HOME/.config/solana/id.json}"
DEPLOYMENTS_FILE="${DEPLOYMENTS_FILE:-deployments/devnet.json}"
WORKDIR="${MULTISIG_DRILL_DIR:-tmp/multisig-drill}"
BUDGET_SOL="${BUDGET_SOL:-1}"
VAULT_INDEX="${VAULT_INDEX:-0}"
EXECUTE=0

usage() {
  cat <<USAGE
Usage: bash scripts/multisig-rotate.sh [--execute]

Plan-only (default):
  - verifies devnet + Squads V4 deployment
  - generates/reuses three local test member keypairs in tmp/multisig-drill
  - loads devnet program ids from deployments/devnet.json
  - emits sign-only dry-run transaction-message files when MULTISIG_VAULT_PDA is set
  - never submits transactions and never changes upgrade authority

Execute mode (--execute):
  - creates a Squads V4 2-of-3 multisig from the generated members
  - rotates both devnet program upgrade authorities to the vault PDA
  - creates a future-upgrade sign-only dry-run message
  - proposes/approves/executes set-upgrade-authority transactions to rotate both programs back to $WALLET
  - verifies repo state is stable: both authorities equal the original single-key authority

Environment overrides:
  WALLET=$WALLET
  DEVNET_RPC=$DEVNET_RPC
  DEPLOYMENTS_FILE=$DEPLOYMENTS_FILE
  MULTISIG_DRILL_DIR=$WORKDIR
  MULTISIG_PDA=<existing Squads multisig PDA, optional>
  MULTISIG_VAULT_PDA=<vault PDA, optional for plan-only and accepted for execute>
  SQDS_CLI_BIN=<squads-multisig-cli binary, optional>
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute)
      EXECUTE=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "[multisig] unknown argument: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

log() { printf '[multisig] %s\n' "$*"; }
fail() { printf '[multisig] ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"; }

need solana
need solana-keygen
need python3
need curl
need node

[[ "$DEVNET_RPC" == *"devnet"* ]] || fail "DEVNET_RPC must point at devnet; got '$DEVNET_RPC'"
[[ -f "$WALLET" ]] || fail "wallet keypair not found: $WALLET"
[[ -f "$DEPLOYMENTS_FILE" ]] || fail "deployment file not found: $DEPLOYMENTS_FILE"

mkdir -p "$WORKDIR"
chmod 700 "$WORKDIR"

wallet_pubkey="$(solana-keygen pubkey "$WALLET")"
log "wallet: $wallet_pubkey"
log "rpc: $DEVNET_RPC"

sqds_owner="$(solana account "$SQDS_PROGRAM_ID" --url "$DEVNET_RPC" 2>/dev/null | awk '/^Owner:/ {print $2}')"
[[ "$sqds_owner" == "BPFLoaderUpgradeab1e11111111111111111111111" ]] || fail "Squads V4 program $SQDS_PROGRAM_ID not found as executable BPF program on devnet"
log "confirmed Squads V4 program on devnet: $SQDS_PROGRAM_ID"

balance_sol="$(solana balance "$wallet_pubkey" --url "$DEVNET_RPC" | awk '{print $1}')"
python3 - "$balance_sol" "$BUDGET_SOL" <<'PY'
import sys
balance = float(sys.argv[1])
budget = float(sys.argv[2])
if balance < budget:
    raise SystemExit(f"devnet wallet balance {balance} SOL is below budget floor {budget} SOL")
PY
log "budget guard: wallet has ${balance_sol} SOL; drill cap is ${BUDGET_SOL} SOL"

read_json_field() {
  python3 - "$DEPLOYMENTS_FILE" "$1" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
key = sys.argv[2]
print(data.get(key) or data.get(key.replace("_program_id", "ProgramId")) or "")
PY
}

bonding_program="$(read_json_field bonding_curve_program_id)"
soul_program="$(read_json_field soul_generator_program_id)"
original_authority="$(read_json_field upgrade_authority)"
[[ -n "$bonding_program" ]] || fail "missing bonding_curve_program_id in $DEPLOYMENTS_FILE"
[[ -n "$soul_program" ]] || fail "missing soul_generator_program_id in $DEPLOYMENTS_FILE"
[[ -n "$original_authority" ]] || fail "missing upgrade_authority in $DEPLOYMENTS_FILE"
[[ "$original_authority" == "$wallet_pubkey" ]] || fail "deployment authority $original_authority does not match wallet $wallet_pubkey"

programs=("$bonding_program" "$soul_program")
program_names=("bonding_curve" "soul_generator")

show_authority() {
  local program="$1"
  solana program show "$program" --url "$DEVNET_RPC" | awk '/^Authority:/ {print $2}'
}

for i in "${!programs[@]}"; do
  authority="$(show_authority "${programs[$i]}")"
  log "${program_names[$i]} authority before drill: $authority"
  [[ "$authority" == "$original_authority" ]] || fail "${program_names[$i]} authority is not the expected original single key"
done

members=()
member_pubs=()
for i in 1 2 3; do
  kp="$WORKDIR/member-$i.json"
  if [[ ! -f "$kp" ]]; then
    solana-keygen new --no-bip39-passphrase --silent --outfile "$kp" >/dev/null
    chmod 600 "$kp"
  fi
  members+=("$kp")
  member_pubs+=("$(solana-keygen pubkey "$kp")")
  log "member $i: ${member_pubs[$((i - 1))]} ($kp)"
done

latest_blockhash() {
  python3 - "$DEVNET_RPC" <<'PY'
import json, sys, urllib.request
rpc = sys.argv[1]
body = {"jsonrpc":"2.0","id":1,"method":"getLatestBlockhash","params":[{"commitment":"confirmed"}]}
request = urllib.request.Request(rpc, data=json.dumps(body).encode(), headers={"Content-Type":"application/json"})
with urllib.request.urlopen(request, timeout=20) as response:
    print(json.load(response)["result"]["value"]["blockhash"])
PY
}

derive_vault_pda() {
  local multisig_pda="$1"
  node - "$SQDS_PROGRAM_ID" "$multisig_pda" "$VAULT_INDEX" <<'NODE'
const { PublicKey } = require("./sdk/node_modules/@solana/web3.js");

const programId = new PublicKey(process.argv[2]);
const multisigPda = new PublicKey(process.argv[3]);
const index = Number(process.argv[4]);
if (!Number.isInteger(index) || index < 0 || index > 255) {
  throw new Error(`invalid Squads vault index: ${process.argv[4]}`);
}
const [vaultPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("multisig"),
    multisigPda.toBuffer(),
    Buffer.from("vault"),
    Buffer.from([index]),
  ],
  programId,
);
console.log(vaultPda.toBase58());
NODE
}

write_upgrade_dry_run_message() {
  local program="$1"
  local name="$2"
  local vault="$3"
  local buffer_keypair="$WORKDIR/${name}-future-upgrade-buffer.json"
  if [[ ! -f "$buffer_keypair" ]]; then
    solana-keygen new --no-bip39-passphrase --silent --outfile "$buffer_keypair" >/dev/null
    chmod 600 "$buffer_keypair"
  fi
  local buffer_pubkey
  buffer_pubkey="$(solana-keygen pubkey "$buffer_keypair")"
  local blockhash
  blockhash="$(latest_blockhash)"
  solana program upgrade "$buffer_pubkey" "$program" \
    --upgrade-authority "$vault" \
    --fee-payer "$WALLET" \
    --sign-only \
    --dump-transaction-message \
    --blockhash "$blockhash" \
    --url "$DEVNET_RPC" > "$WORKDIR/${name}-future-upgrade-message.b64"
  log "future upgrade dry-run message for $name: $WORKDIR/${name}-future-upgrade-message.b64"
}

write_set_authority_message() {
  local program="$1"
  local name="$2"
  local current_authority="$3"
  local new_authority="$4"
  local output="$5"
  local blockhash
  blockhash="$(latest_blockhash)"
  solana program set-upgrade-authority "$program" \
    --new-upgrade-authority "$new_authority" \
    --upgrade-authority "$current_authority" \
    --skip-new-upgrade-authority-signer-check \
    --sign-only \
    --dump-transaction-message \
    --blockhash "$blockhash" \
    --url "$DEVNET_RPC" > "$output"
  log "set-authority sign-only message for $name: $output"
}

squads_cli() {
  if [[ -n "${SQDS_CLI_BIN:-}" ]]; then
    "$SQDS_CLI_BIN" "$@"
  elif command -v squads-multisig-cli >/dev/null 2>&1; then
    squads-multisig-cli "$@"
  elif [[ "${1:-}" != -* ]] && command -v "$1" >/dev/null 2>&1; then
    local subcommand="$1"
    shift
    "$subcommand" "$@"
  else
    return 127
  fi
}

if [[ "$EXECUTE" -eq 0 ]]; then
  log "plan-only mode: no transactions will be submitted"
  plan_vault="${MULTISIG_VAULT_PDA:-}"
  if [[ -z "$plan_vault" && -n "${MULTISIG_PDA:-}" ]]; then
    plan_vault="$(derive_vault_pda "$MULTISIG_PDA")"
    log "derived vault PDA from MULTISIG_PDA at index $VAULT_INDEX: $plan_vault"
  fi
  if [[ -n "$plan_vault" ]]; then
    for i in "${!programs[@]}"; do
      write_upgrade_dry_run_message "${programs[$i]}" "${program_names[$i]}" "$plan_vault"
      write_set_authority_message "${programs[$i]}" "${program_names[$i]}" "$plan_vault" "$original_authority" "$WORKDIR/${program_names[$i]}-emergency-revert-message.b64"
    done
  else
    log "set MULTISIG_PDA=<multisig> or MULTISIG_VAULT_PDA=<vault> to emit sign-only future-upgrade and emergency-revert messages"
  fi
  cat <<PLAN
[multisig] execution plan (devnet only):
  1. Create Squads V4 multisig with members:
     - ${member_pubs[0]},7
     - ${member_pubs[1]},7
     - ${member_pubs[2]},7
     threshold: 2
  2. Derive vault index $VAULT_INDEX and rotate both programs to that vault.
  3. Generate future-upgrade message(s), propose as vault transaction(s), approve with member 1 and member 2, and do not execute the program upgrade in this dry-run.
  4. Generate emergency-revert set-upgrade-authority message(s), propose, approve with member 1 and member 2, execute, then verify both programs are back to $original_authority.
PLAN
  exit 0
fi

if ! squads_cli --help >/dev/null 2>&1; then
  fail "Squads CLI not found. Install squads-multisig-cli (cargo install squads-multisig-cli) or set SQDS_CLI_BIN. Refusing to submit a partial authority rotation."
fi

log "EXECUTE mode: submitting devnet transactions only"

multisig_pda="${MULTISIG_PDA:-}"
multisig_vault="${MULTISIG_VAULT_PDA:-}"

for i in "${!members[@]}"; do
  member_balance="$(solana balance "${member_pubs[$i]}" --url "$DEVNET_RPC" | awk '{print $1}')"
  if ! python3 - "${member_balance}" <<'PY'
import sys
raise SystemExit(0 if float(sys.argv[1]) >= 0.02 else 1)
PY
  then
    log "funding member $((i + 1)) with 0.03 devnet SOL for Squads vote fees"
    solana transfer "${member_pubs[$i]}" 0.03 --from "$WALLET" --allow-unfunded-recipient --url "$DEVNET_RPC" >/dev/null
  fi
done

if [[ -z "$multisig_pda" ]]; then
  create_log="$WORKDIR/multisig-create.log"
  squads_cli multisig-create \
    --rpc-url "$DEVNET_RPC" \
    --program-id "$SQDS_PROGRAM_ID" \
    --keypair "$WALLET" \
    --members "${member_pubs[0]},7" "${member_pubs[1]},7" "${member_pubs[2]},7" \
    --threshold 2 | tee "$create_log"
  multisig_pda="$(python3 - "$create_log" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
for line in text.splitlines():
    if "multisig" in line.lower():
        matches = re.findall(r"[1-9A-HJ-NP-Za-km-z]{32,44}", line)
        if matches:
            print(matches[-1])
            break
PY
)"
  [[ -n "$multisig_pda" ]] || fail "could not parse multisig PDA from $create_log; rerun with MULTISIG_PDA and MULTISIG_VAULT_PDA set"
fi
log "multisig PDA: $multisig_pda"

if [[ -z "$multisig_vault" ]]; then
  multisig_vault="$(derive_vault_pda "$multisig_pda")"
fi
log "vault PDA: $multisig_vault"

revert_messages=()
for i in "${!programs[@]}"; do
  log "rotating ${program_names[$i]} to multisig vault"
  solana program set-upgrade-authority "${programs[$i]}" \
    --new-upgrade-authority "$multisig_vault" \
    --upgrade-authority "$WALLET" \
    --skip-new-upgrade-authority-signer-check \
    --url "$DEVNET_RPC"
  authority="$(show_authority "${programs[$i]}")"
  [[ "$authority" == "$multisig_vault" ]] || fail "${program_names[$i]} did not rotate to vault; observed $authority"
  write_upgrade_dry_run_message "${programs[$i]}" "${program_names[$i]}" "$multisig_vault"
  revert_msg="$WORKDIR/${program_names[$i]}-emergency-revert-message.b64"
  write_set_authority_message "${programs[$i]}" "${program_names[$i]}" "$multisig_vault" "$original_authority" "$revert_msg"
  revert_messages+=("$revert_msg")
done

for i in "${!revert_messages[@]}"; do
  tx_index=$((i + 1))
  name="${program_names[$i]}"
  message="$(cat "${revert_messages[$i]}")"
  log "proposing emergency revert for $name as Squads vault transaction index $tx_index"
  squads_cli vault-transaction-create \
    --rpc-url "$DEVNET_RPC" \
    --program-id "$SQDS_PROGRAM_ID" \
    --keypair "${members[0]}" \
    --multisig-pubkey "$multisig_pda" \
    --vault-index "$VAULT_INDEX" \
    --transaction-message "$message" \
    --memo "SolSoul M11.F3 emergency revert drill for $name"
  squads_cli proposal-vote --rpc-url "$DEVNET_RPC" --program-id "$SQDS_PROGRAM_ID" --keypair "${members[0]}" --multisig-pubkey "$multisig_pda" --transaction-index "$tx_index" --action Approve
  squads_cli proposal-vote --rpc-url "$DEVNET_RPC" --program-id "$SQDS_PROGRAM_ID" --keypair "${members[1]}" --multisig-pubkey "$multisig_pda" --transaction-index "$tx_index" --action Approve
  squads_cli vault-transaction-execute --rpc-url "$DEVNET_RPC" --program-id "$SQDS_PROGRAM_ID" --keypair "${members[0]}" --multisig-pubkey "$multisig_pda" --transaction-index "$tx_index"
done

for i in "${!programs[@]}"; do
  authority="$(show_authority "${programs[$i]}")"
  log "${program_names[$i]} authority after drill: $authority"
  [[ "$authority" == "$original_authority" ]] || fail "${program_names[$i]} was not restored to original authority"
done

log "completed devnet drill and restored single-key upgrade authority"
