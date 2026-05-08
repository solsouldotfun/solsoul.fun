#!/usr/bin/env bash
# scripts/scan-secrets.sh
#
# Secret scanner wrapper around gitleaks.
#
# Usage:
#   bash scripts/scan-secrets.sh                          # scan staged files (pre-commit mode)
#   bash scripts/scan-secrets.sh <path>                   # scan a specific file or directory
#   bash scripts/scan-secrets.sh test-fixtures/secret-positive  # expects non-zero exit
#
# Exit codes:
#   0  — no secrets detected
#   1  — secrets detected (or gitleaks unavailable)
#
# The script deliberately does NOT scan untracked files when running in
# staged-only mode; it uses `gitleaks protect --staged` which checks only
# the files in the git index.
#
# See docs/security.md for installation instructions and bypass guidance.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${REPO_ROOT}/.gitleaks.toml"
GITLEAKS="${GITLEAKS_BIN:-gitleaks}"

# ─── Preflight ───────────────────────────────────────────────────────────────

if ! command -v "${GITLEAKS}" >/dev/null 2>&1; then
  echo "[scan-secrets] ERROR: gitleaks not found." >&2
  echo "[scan-secrets] Install: brew install gitleaks  # or see docs/security.md" >&2
  exit 1
fi

if [[ ! -f "${CONFIG}" ]]; then
  echo "[scan-secrets] ERROR: .gitleaks.toml not found at ${CONFIG}" >&2
  exit 1
fi

# ─── Mode selection ──────────────────────────────────────────────────────────

if [[ $# -ge 1 ]]; then
  TARGET="$1"

  # Resolve relative paths from the caller's working directory.
  if [[ "${TARGET}" != /* ]]; then
    TARGET="${PWD}/${TARGET}"
  fi

  echo "[scan-secrets] Scanning path: ${TARGET}"
  exec "${GITLEAKS}" detect \
    --config "${CONFIG}" \
    --source "${TARGET}" \
    --no-git \
    --verbose
else
  # No argument: operate in pre-commit / staged-files mode.
  # gitleaks protect --staged only checks files added to the git index.
  # Untracked files are never inspected.
  echo "[scan-secrets] Scanning staged files..."
  cd "${REPO_ROOT}"
  exec "${GITLEAKS}" protect \
    --config "${CONFIG}" \
    --staged \
    --verbose
fi
