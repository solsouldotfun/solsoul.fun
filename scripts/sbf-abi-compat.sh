#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage: scripts/sbf-abi-compat.sh [--check] [target/deploy/*.so ...]

Normalizes SBF ELF artifacts for Solana CLI compatibility by ensuring the ELF
OSABI byte is System V (0). Some SBF toolchains emit Linux (3), which current
Solana CLI/devnet rejects with "wrong ABI".

Modes:
  default   Rewrite Linux OSABI artifacts to System V, then verify headers.
  --check   Verify headers only; fail instead of rewriting incompatible files.
USAGE
}

die() {
  printf '[sbf-abi-compat] ERROR: %s\n' "$*" >&2
  exit 1
}

mode="normalize"
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
elif [[ "${1:-}" == "--check" ]]; then
  mode="check"
  shift
fi

if [[ $# -eq 0 ]]; then
  set -- \
    "$ROOT_DIR/target/deploy/bonding_curve.so" \
    "$ROOT_DIR/target/deploy/soul_generator.so" \
    "$ROOT_DIR/target/deploy/transfer_hook.so"
fi

command -v python3 >/dev/null 2>&1 || die "required command not found on PATH: python3"

python3 - "$mode" "$@" <<'PY'
from __future__ import annotations

import sys
from pathlib import Path

MODE = sys.argv[1]
PATHS = [Path(arg) for arg in sys.argv[2:]]

ELF_MAGIC = b"\x7fELF"
ELFCLASS64 = 2
ELFDATA2LSB = 1
EV_CURRENT = 1
ELFOSABI_SYSV = 0
ELFOSABI_LINUX = 3
EM_BPF = 247
EM_SBF = 263
EM_NAMES = {
    EM_BPF: "BPF",
    EM_SBF: "SBF",
}


def fail(message: str) -> None:
    print(f"[sbf-abi-compat] ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def artifact_label(path: Path) -> str:
    try:
        return str(path.relative_to(Path.cwd()))
    except ValueError:
        return str(path)


def inspect_or_normalize(path: Path) -> None:
    if not path.is_file():
        fail(f"missing SBF artifact: {path}")

    data = bytearray(path.read_bytes())
    if len(data) < 20:
        fail(f"{artifact_label(path)} is too small to be an ELF artifact")
    if bytes(data[:4]) != ELF_MAGIC:
        fail(f"{artifact_label(path)} is not an ELF artifact")
    if data[4] != ELFCLASS64:
        fail(f"{artifact_label(path)} is not a 64-bit ELF artifact (class={data[4]})")
    if data[5] != ELFDATA2LSB:
        fail(f"{artifact_label(path)} is not little-endian ELF data (data={data[5]})")
    if data[6] != EV_CURRENT:
        fail(f"{artifact_label(path)} has unsupported ELF version byte {data[6]}")
    if data[8] != 0:
        fail(f"{artifact_label(path)} has non-zero ELF ABI version byte {data[8]}")

    machine = int.from_bytes(data[18:20], "little")
    if machine not in (EM_BPF, EM_SBF):
        fail(f"{artifact_label(path)} has unsupported ELF machine {machine}; expected SBF/BPF")

    osabi = data[7]
    label = artifact_label(path)
    machine_name = EM_NAMES[machine]
    if osabi == ELFOSABI_SYSV:
        print(f"[sbf-abi-compat] OK: {label} OSABI=System V(0) machine={machine_name}({machine})")
        return

    if osabi == ELFOSABI_LINUX:
        if MODE == "check":
            fail(f"{label} OSABI=Linux(3); run scripts/sbf-abi-compat.sh to normalize before deploy")
        data[7] = ELFOSABI_SYSV
        path.write_bytes(data)
        print(
            f"[sbf-abi-compat] normalized: {label} OSABI Linux(3) -> System V(0) "
            f"machine={machine_name}({machine})"
        )
        return

    fail(f"{label} has unsupported ELF OSABI byte {osabi}; expected System V(0) for Solana CLI/devnet")


if MODE not in {"normalize", "check"}:
    fail(f"unsupported mode: {MODE}")
if not PATHS:
    fail("no SBF artifacts provided")

for artifact in PATHS:
    inspect_or_normalize(artifact)
PY
