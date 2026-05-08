#!/usr/bin/env bash
set -euo pipefail

CURRENT=$(solana config get | awk '/^RPC URL/ {print $3}')
[[ "$CURRENT" != *mainnet* ]] || {
  echo 'refusing: current config is mainnet, switch to devnet/localhost first'
  exit 64
}

mkdir -p tests/snapshots
SNAPSHOT_PATH=tests/snapshots/pumpswap.so
SHA256_FIXTURE=tests/snapshots/pumpswap.sha256.txt

solana program dump pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA "$SNAPSHOT_PATH" --url https://api.mainnet-beta.solana.com
NEW_SHA256=$(shasum -a 256 "$SNAPSHOT_PATH" | awk '{print $1}')
NEW_FIXTURE_LINE="${NEW_SHA256}  ${SNAPSHOT_PATH}"

if [[ -f "$SHA256_FIXTURE" ]]; then
  PRIOR_SHA256=$(awk 'NF {print $1; exit}' "$SHA256_FIXTURE")
  if [[ "$NEW_SHA256" != "$PRIOR_SHA256" ]]; then
    printf '%s\n' 'MAINNET PROGRAM UPGRADED — orchestrator decision required before proceeding' >&2
    printf 'expected SHA256 %s from %s, got %s\n' "$PRIOR_SHA256" "$SHA256_FIXTURE" "$NEW_SHA256" >&2
    exit 65
  fi
  printf '%s\n' "$NEW_FIXTURE_LINE"
else
  printf '%s\n' "$NEW_FIXTURE_LINE" | tee "$SHA256_FIXTURE"
fi
