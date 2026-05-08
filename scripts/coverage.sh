#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

export PATH="${HOME}/.cargo/bin:${PATH}"

MIN_LINE_COVERAGE="${MIN_LINE_COVERAGE:-80}"
LCOV_PATH="coverage/lcov.info"
COVERAGE_IGNORE_REGEX="${COVERAGE_IGNORE_REGEX:-(/entrypoint\.rs|/token_2022\.rs|/soul_generator_cpi\.rs|/instructions/(buy|sell|create_token|migrate|generate_soul|claim_soul|initialize_soul|upload_template|mod)\.rs)$}"

if ! cargo llvm-cov --version >/dev/null 2>&1; then
  cat >&2 <<'EOF'
[coverage] cargo-llvm-cov is required.
[coverage] Install it with: cargo install cargo-llvm-cov
EOF
  exit 127
fi

mkdir -p "$(dirname "${LCOV_PATH}")"

echo "[coverage] generating LCOV report at ${LCOV_PATH}"
cargo llvm-cov \
  --workspace \
  --lcov \
  --output-path "${LCOV_PATH}" \
  --ignore-filename-regex "${COVERAGE_IGNORE_REGEX}" \
  --fail-under-lines "${MIN_LINE_COVERAGE}"

echo
echo "[coverage] summary"
cargo llvm-cov report --ignore-filename-regex "${COVERAGE_IGNORE_REGEX}"

echo
echo "[coverage] line coverage threshold met: >= ${MIN_LINE_COVERAGE}%"
