#!/usr/bin/env bash
# scripts/check-mainnet-build.sh
#
# Purpose: Binary smoke test + curve-constant presence check for the
#          bonding-curve SBF artifact.
#
# The devnet Cargo feature was removed after commit 8d78729 because no code
# branches on it any more.  This gate no longer detects a devnet-feature
# sentinel; instead it asserts that the canonical exponential-curve sentinel
# string is present, proving the binary was compiled from the new curve model.
#
# Usage:
#   bash scripts/check-mainnet-build.sh <path-to-bonding_curve.so>
#
# Exit codes:
#   0  Sentinel found — binary looks like a canonical exponential-curve build.
#   1  Sentinel missing or file not found — DO NOT deploy this binary.

set -euo pipefail

SENTINEL="EXP_CURVE_V1_K_21M_S_500SOL"

die() {
  printf '[check-mainnet-build] ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '[check-mainnet-build] %s\n' "$*"
}

# ── argument validation ────────────────────────────────────────────────────────
if [[ $# -lt 1 ]]; then
  die "Usage: $0 <path-to-bonding_curve.so>"
fi

SO_PATH="$1"

[[ -f "$SO_PATH" ]] || die "file not found: $SO_PATH"

SO_SIZE_BYTES=$(wc -c < "$SO_PATH" | tr -d ' ')
[[ "$SO_SIZE_BYTES" -gt 0 ]] || die "binary is empty: $SO_PATH"

info "checking $SO_PATH (${SO_SIZE_BYTES} bytes)"

# ── sentinel presence check ───────────────────────────────────────────────────
# The sentinel string EXP_CURVE_V1_K_21M_S_500SOL is embedded via:
#   #[used] static EXP_CURVE_SENTINEL: &[u8] = b"EXP_CURVE_V1_K_21M_S_500SOL";
# in programs/bonding-curve/src/lib.rs.
#
# `strings` extracts printable ASCII sequences >=4 chars from the binary;
# the sentinel will appear verbatim in .rodata.

if strings "$SO_PATH" | grep -qF "$SENTINEL"; then
  info "PASS: sentinel '$SENTINEL' found in binary — canonical exponential-curve build confirmed."
else
  die "FAIL: sentinel '$SENTINEL' NOT found in $SO_PATH.
       This binary may be corrupted, compiled from the wrong branch, or missing the sentinel.
       DO NOT deploy."
fi
