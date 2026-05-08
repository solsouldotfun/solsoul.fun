#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAPSHOT_DIR="$PROJECT_DIR/tests/snapshots"
SNAPSHOT_SO="$SNAPSHOT_DIR/raydium-cpmm.so"
SNAPSHOT_SHA="$SNAPSHOT_DIR/raydium-cpmm.sha256.txt"
RAYDIUM_CPMM_DEVNET="CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW"

mkdir -p "$SNAPSHOT_DIR"
cd "$PROJECT_DIR"
solana program dump --url https://api.devnet.solana.com "$RAYDIUM_CPMM_DEVNET" "$SNAPSHOT_SO"
shasum -a 256 "tests/snapshots/raydium-cpmm.so" | tee "$SNAPSHOT_SHA"
