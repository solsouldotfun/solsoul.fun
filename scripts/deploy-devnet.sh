#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEVNET_URL="https://api.devnet.solana.com"
MIN_LAMPORTS=4000000000
DEPLOYMENTS_DIR="$ROOT_DIR/deployments"
DEPLOYMENT_FILE="$DEPLOYMENTS_DIR/devnet.json"
BONDING_SO="$ROOT_DIR/target/deploy/bonding_curve.so"
SOUL_SO="$ROOT_DIR/target/deploy/soul_generator.so"
HOOK_SO="$ROOT_DIR/target/deploy/transfer_hook.so"

usage() {
  cat <<'USAGE'
Usage: scripts/deploy-devnet.sh <wallet-keypair-path>

Deploys the bonding-curve, soul-generator, and transfer-hook programs to Solana devnet.

Requirements:
  - `solana config get` must point at a devnet RPC URL.
  - <wallet-keypair-path> must exist and will be used as fee payer and upgrade authority.
  - The wallet must have at least 4 SOL on devnet; the script tries one airdrop if it is underfunded.

Optional environment variables:
  BONDING_CURVE_PROGRAM_ID   Existing program address or program-id keypair for bonding-curve.
  SOUL_GENERATOR_PROGRAM_ID  Existing program address or program-id keypair for soul-generator.
  TRANSFER_HOOK_PROGRAM_ID   Existing program address or program-id keypair for transfer-hook.
USAGE
}

log() {
  printf '[deploy-devnet] %s\n' "$*"
}

die() {
  printf '[deploy-devnet] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found on PATH: $1"
}

parse_program_id() {
  python3 - "$1" <<'PY'
import json
import re
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text()

try:
    data = json.loads(text)
    for key in ("programId", "program_id", "program"):
        value = data.get(key)
        if isinstance(value, str) and value:
            print(value)
            sys.exit(0)
except json.JSONDecodeError:
    pass

match = re.search(r"Program Id:\s*([1-9A-HJ-NP-Za-km-z]{32,44})", text)
if match:
    print(match.group(1))
    sys.exit(0)

sys.exit(1)
PY
}

sol_from_lamports() {
  python3 - "$1" <<'PY'
import sys

lamports = int(sys.argv[1])
sol = lamports / 1_000_000_000
print(f"{sol:.9f}".rstrip("0").rstrip("."))
PY
}

balance_lamports() {
  local wallet_address="$1"
  local raw_balance

  raw_balance="$(solana balance "$wallet_address" --url "$DEVNET_URL" --lamports)"
  printf '%s' "${raw_balance//[^0-9]/}"
}

existing_program_id() {
  local field="$1"
  [[ -f "$DEPLOYMENT_FILE" ]] || return 1
  python3 - "$DEPLOYMENT_FILE" "$field" <<'PY'
import json
import sys
from pathlib import Path

path, field = sys.argv[1:3]
data = json.loads(Path(path).read_text())
programs = data.get("programs", {})
lookup = {
    "bondingCurve": data.get("bondingCurveProgramId")
    or data.get("bonding_curve_program_id")
    or programs.get("bondingCurve", {}).get("programId"),
    "soulGenerator": data.get("soulGeneratorProgramId")
    or data.get("soul_generator_program_id")
    or programs.get("soulGenerator", {}).get("programId"),
    "transferHook": data.get("transferHookProgramId")
    or data.get("transfer_hook_program_id")
    or programs.get("transferHook", {}).get("programId"),
}
value = lookup.get(field)
if value:
    print(value)
else:
    sys.exit(1)
PY
}

ensure_devnet_config() {
  local config rpc_url

  config="$(solana config get)"
  rpc_url="$(printf '%s\n' "$config" | awk -F': ' '/RPC URL/ {print $2; exit}')"

  if [[ -z "$rpc_url" ]]; then
    die "could not read RPC URL from 'solana config get'"
  fi

  if [[ "$rpc_url" != *devnet* ]]; then
    log "Solana CLI RPC is $rpc_url; continuing with explicit --url $DEVNET_URL for every devnet command"
    return
  fi

  log "confirmed Solana CLI RPC points to devnet: $rpc_url"
}

ensure_funded_wallet() {
  local keypair_path="$1"
  local wallet_address="$2"
  local balance required request_sol

  balance="$(balance_lamports "$wallet_address")"
  if [[ -z "$balance" ]]; then
    balance=0
  fi

  log "wallet $wallet_address balance: $(sol_from_lamports "$balance") SOL"

  if (( balance >= MIN_LAMPORTS )); then
    return
  fi

  required=$((MIN_LAMPORTS - balance))
  request_sol="$(sol_from_lamports "$required")"
  log "wallet below 4 SOL; attempting devnet airdrop of $request_sol SOL"

  if ! solana airdrop "$request_sol" "$wallet_address" --url "$DEVNET_URL" --keypair "$keypair_path"; then
    die "devnet faucet airdrop failed or is unavailable; fund $wallet_address to at least 4 SOL and retry"
  fi

  balance="$(balance_lamports "$wallet_address")"
  if [[ -z "$balance" ]]; then
    balance=0
  fi

  if (( balance < MIN_LAMPORTS )); then
    die "wallet balance after airdrop is $(sol_from_lamports "$balance") SOL; at least 4 SOL is required"
  fi

  log "wallet funded after airdrop: $(sol_from_lamports "$balance") SOL"
}

deploy_program() {
  local label="$1"
  local so_path="$2"
  local env_program_id="$3"
  local default_program_keypair="$4"
  local wallet_keypair="$5"
  local output_file
  local -a extra_program_id_args=()
  local -a deploy_cmd=()

  [[ -f "$so_path" ]] || die "missing SBF artifact: $so_path"

  output_file="$(mktemp)"
  if [[ -n "$env_program_id" ]]; then
    extra_program_id_args=(--program-id "$env_program_id")
  elif [[ -f "$default_program_keypair" ]]; then
    extra_program_id_args=(--program-id "$default_program_keypair")
  fi

  log "deploying $label from ${so_path#$ROOT_DIR/}"
  if ((${#extra_program_id_args[@]} > 0)); then
    log "$label program id source: ${extra_program_id_args[1]}"
  else
    log "$label program id source: solana CLI generated address"
  fi

  deploy_cmd=(
    solana program deploy "$so_path"
    --url "$DEVNET_URL"
    --keypair "$wallet_keypair"
    --fee-payer "$wallet_keypair"
    --upgrade-authority "$wallet_keypair"
    --use-rpc
  )
  if ((${#extra_program_id_args[@]} > 0)); then
    deploy_cmd+=("${extra_program_id_args[@]}")
  fi

  if ! "${deploy_cmd[@]}" 2>&1 | tee "$output_file"; then
    die "$label deployment failed"
  fi

  DEPLOYED_PROGRAM_ID="$(parse_program_id "$output_file")" \
    || die "could not parse deployed program id for $label from solana output"

  rm -f "$output_file"
  log "$label deployed program id: $DEPLOYED_PROGRAM_ID"
}

verify_program() {
  local label="$1"
  local program_id="$2"

  log "verifying $label with solana program show"
  solana program show "$program_id" --url "$DEVNET_URL"
}

write_deployment_file() {
  local wallet_address="$1"
  local bonding_program_id="$2"
  local soul_program_id="$3"
  local hook_program_id="$4"

  mkdir -p "$DEPLOYMENTS_DIR"
  python3 - "$DEPLOYMENT_FILE" "$wallet_address" "$bonding_program_id" "$soul_program_id" "$hook_program_id" <<'PY'
import json
import sys
from datetime import datetime, timezone

output_path, wallet, bonding_program_id, soul_program_id, hook_program_id = sys.argv[1:6]
now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

try:
    with open(output_path, "r", encoding="utf-8") as handle:
        deployment = json.load(handle)
except FileNotFoundError:
    deployment = {}

programs = deployment.setdefault("programs", {})
deployment.update(
    {
        "cluster": "devnet",
        "rpcUrl": "https://api.devnet.solana.com",
        "deployedAt": now,
        "verifiedAt": now,
        "upgradeAuthority": wallet,
        "bondingCurveProgramId": bonding_program_id,
        "soulGeneratorProgramId": soul_program_id,
        "transferHookProgramId": hook_program_id,
        "bonding_curve_program_id": bonding_program_id,
        "soul_generator_program_id": soul_program_id,
        "transfer_hook_program_id": hook_program_id,
    }
)
programs["bondingCurve"] = {
    **programs.get("bondingCurve", {}),
    "programId": bonding_program_id,
    "artifact": "target/deploy/bonding_curve.so",
    "verifiedWith": "solana program show",
}
programs["soulGenerator"] = {
    **programs.get("soulGenerator", {}),
    "programId": soul_program_id,
    "artifact": "target/deploy/soul_generator.so",
    "verifiedWith": "solana program show",
}
programs["transferHook"] = {
    **programs.get("transferHook", {}),
    "programId": hook_program_id,
    "artifact": "target/deploy/transfer_hook.so",
    "verifiedWith": "solana program show",
}
deployment["prototypeScope"] = {
    "transferHook": "Controlled Token-2022 prototype path only; production AMM/wallet compatibility is out of scope.",
    "boundaryPolicy": "Boundary-breaking direct transfers reject in the hook; no hook-internal burn or forfeit.",
}
deployment["lastTransferHookDeployment"] = {
    "cluster": "devnet",
    "rpcUrl": "https://api.devnet.solana.com",
    "deployedAt": now,
    "verifiedAt": now,
    "programId": hook_program_id,
    "artifact": "target/deploy/transfer_hook.so",
    "verifiedWith": "solana program show",
    "scope": deployment["prototypeScope"],
}

with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(deployment, handle, indent=2, ensure_ascii=False)
    handle.write("\n")
PY
  log "wrote ${DEPLOYMENT_FILE#$ROOT_DIR/}"
}

main() {
  local keypair_path="${1:-}"
  local wallet_address bonding_program_id soul_program_id hook_program_id
  local default_bonding_id default_soul_id default_hook_id

  if [[ -z "$keypair_path" || "$keypair_path" == "-h" || "$keypair_path" == "--help" ]]; then
    usage
    [[ -n "$keypair_path" ]] && exit 0
    exit 64
  fi

  [[ -f "$keypair_path" ]] || die "wallet keypair file does not exist: $keypair_path"
  [[ -r "$keypair_path" ]] || die "wallet keypair file is not readable: $keypair_path"

  require_command solana
  require_command cargo
  require_command python3

  cd "$ROOT_DIR"
  export PATH="$HOME/.cargo/bin:$PATH"

  ensure_devnet_config

  wallet_address="$(solana address --keypair "$keypair_path")"
  ensure_funded_wallet "$keypair_path" "$wallet_address"

  log "building SBF workspace"
  cargo build-sbf --workspace
  bash "$ROOT_DIR/scripts/sbf-abi-compat.sh" "$BONDING_SO" "$SOUL_SO" "$HOOK_SO"

  default_bonding_id="${BONDING_CURVE_PROGRAM_ID:-$(existing_program_id bondingCurve || true)}"
  default_soul_id="${SOUL_GENERATOR_PROGRAM_ID:-$(existing_program_id soulGenerator || true)}"
  default_hook_id="${TRANSFER_HOOK_PROGRAM_ID:-$(existing_program_id transferHook || true)}"

  deploy_program \
    "bonding-curve" \
    "$BONDING_SO" \
    "$default_bonding_id" \
    "$ROOT_DIR/target/deploy/bonding_curve-keypair.json" \
    "$keypair_path"
  bonding_program_id="$DEPLOYED_PROGRAM_ID"
  verify_program "bonding-curve" "$bonding_program_id"

  deploy_program \
    "soul-generator" \
    "$SOUL_SO" \
    "$default_soul_id" \
    "$ROOT_DIR/target/deploy/soul_generator-keypair.json" \
    "$keypair_path"
  soul_program_id="$DEPLOYED_PROGRAM_ID"
  verify_program "soul-generator" "$soul_program_id"

  deploy_program \
    "transfer-hook" \
    "$HOOK_SO" \
    "$default_hook_id" \
    "$ROOT_DIR/target/deploy/transfer_hook-keypair.json" \
    "$keypair_path"
  hook_program_id="$DEPLOYED_PROGRAM_ID"
  verify_program "transfer-hook" "$hook_program_id"

  write_deployment_file "$wallet_address" "$bonding_program_id" "$soul_program_id" "$hook_program_id"

  log "devnet deployment complete"
}

main "$@"
