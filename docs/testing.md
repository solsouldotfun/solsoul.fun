# Testing

## Test matrix

| Area | Files / commands | Scope | Acceptance signal |
| --- | --- | --- | --- |
| Geppetto guards | `programs/shared/src/geppetto/tests.rs`, `cargo test -p shared geppetto` | Signer, writable, owner, PDA, and program-id guard happy/reject paths. | All guard tests pass. |
| Bonding curve math | `programs/bonding-curve/src/math.rs`, `cargo test -p bonding-curve math` | Exponential curve buy/sell quotes, `exp_neg` Taylor expansion, inverse solve, slippage rejection, zero amount rejection, fee math, launch fee, and overflow safety. | Unit tests pass with checked arithmetic. |
| Bonding curve state | `programs/bonding-curve/src/state.rs`, `cargo test -p bonding-curve state` | Curve/vault/treasury PDA derivation, `self_deprecated` flag, flash-loan slot check, and state serialization. | State tests pass and layout remains stable. |
| Soul state and SVG rendering | `programs/soul-generator/src/state.rs`, `programs/soul-generator/src/svg/*`, `cargo test -p soul-generator` | SoulAccount layout, legacy unpack compatibility, template/style bounds, deterministic mathematical rendering (fractal, chaos, harmonic, field, lattice, pixel), and placeholder rendering. | Unit tests pass and SVG output remains within the 4096-byte account budget. |
| Soul NFT claim logic | `programs/soul-generator/src/instructions/claim_soul.rs`, `tests/integration/claim.rs` | Holder balance gate, duplicate-claim rejection, Token-2022 metadata initialization, and self-pointing metadata URI. | Unit tests and integration claim scenarios pass. |
| Localnet skeleton | `tests/integration/e2e_skeleton.rs`, `cargo test --features integration --test e2e_skeleton` | create token → initialize soul → buy → CPI generate Soul, including exact PDA rent checks. | Buy increments `generation_count` and `last_svg` starts with `<svg`. |
| Templates integration | `tests/integration/templates.rs`, `cargo test --features integration --test templates` | Upload custom SVG template and style params, then read persisted bytes. | Template/style bytes round-trip through SoulAccount. |
| Curve e2e | `tests/integration/curve_e2e.rs`, `cargo test --features integration --test curve_e2e` | End-to-end exponential curve buy/sell roundtrip, lock fee accounting, and self-deprecation edge cases. | Roundtrip preserves 0.1% lock fee; self-deprecated rejects buys. |
| Security provenance | `tests/integration/sec_provenance.rs`, `cargo test --features integration --test sec_provenance` | Flash-loan slot check, max buy enforcement, sell ratio limits, and receipt boundary validation. | All safety valves reject as expected. |
| Default renderer | `tests/integration/default_renderer.rs`, `cargo test --features integration --test default_renderer` | Built-in renderer dispatch, deterministic output verification, and SVG well-formedness. | Renderers produce valid SVG within budget. |
| Transfer hook | `tests/integration/transfer_hook.rs`, `cargo test --features integration --test transfer_hook` | Boundary-breaking transfer rejection, hook account resolution, and receipt validation. | Hook rejects unauthorized boundary crossings. |
| SDK | `sdk/src/index.test.ts`, `pnpm --filter sdk test`, `pnpm --filter sdk typecheck` | PDA helpers, instruction account wiring, decoders, and TypeScript types. | Vitest and TypeScript exit 0. |
| Frontend | `app/src/**/*.test.ts*`, `pnpm --filter app test`, `pnpm --filter app typecheck`, `pnpm --filter app build` | Template editor validation, localized pages, wallet integration build surface, and production compilation. | Vitest, TypeScript, and Next build exit 0. |
| Coverage | `bash scripts/coverage.sh` | Rust line coverage for core math, state, SVG/template, and guard logic. | Line coverage is at or above the configured 80% threshold. |
| Devnet deployment | `bash scripts/deploy-devnet.sh <keypair>` | Build SBF artifacts, deploy both programs to devnet, verify program metadata, and write `deployments/devnet.json`. | Script exits 0 with funded devnet wallet and `solana program show` succeeds. |

## Rust Coverage

Use `scripts/coverage.sh` to measure Rust line coverage for the Cargo workspace:

```bash
bash scripts/coverage.sh
```

The script uses `cargo-llvm-cov` and writes the LCOV report to `coverage/lcov.info`:

```bash
cargo llvm-cov --workspace --lcov --output-path coverage/lcov.info
```

The Cargo workspace currently contains the three on-chain Rust crates covered by the Milestone 6 target:

- `programs/soul-generator`
- `programs/bonding-curve`
- `programs/shared`

The report ignores SBF/CPI boundary modules by default (`entrypoint.rs`, `token_2022.rs`,
`soul_generator_cpi.rs`, and instruction handler files). Those paths are exercised by
`solana-program-test` against SBF artifacts, but host LLVM coverage cannot attribute executed SBF
bytecode back to the Rust source. Core math, state serialization, SVG/template rendering, and
Geppetto guard logic remain included in the line coverage threshold.

The default line coverage threshold is `80%`. Override it only for local experiments:

```bash
MIN_LINE_COVERAGE=90 bash scripts/coverage.sh
```

Install the preferred coverage tool if it is missing:

```bash
cargo install cargo-llvm-cov
```

## Core Validation Commands

Run these before handing off Rust changes:

```bash
cargo test --workspace
cargo clippy --workspace -- -D warnings
cargo fmt --all -- --check
bash scripts/coverage.sh
```

For SDK or frontend changes, also run the package-specific checks:

```bash
pnpm --filter sdk test
pnpm --filter sdk typecheck
pnpm --filter app test
pnpm --filter app typecheck
```

## Consolidated Integration Suite

Milestone 6 consolidates the heavy `solana-program-test` scenarios under root-level test targets:

- `tests/integration/e2e_skeleton.rs` — create token, initialize soul, buy, and verify SVG generation through CPI.
- `tests/integration/templates.rs` — initialize a SoulAccount, upload a custom SVG template, and verify persisted template/style bytes.
- `tests/integration/claim.rs` — claim Soul NFT scenarios, including holder success, non-holder rejection, duplicate rejection, and Token-2022 metadata checks.
- `tests/integration/curve_e2e.rs` — exponential curve buy/sell roundtrip, lock fee accounting, and self-deprecation behavior.
- `tests/integration/sec_provenance.rs` — flash-loan protection, max buy limits, sell ratio checks, and boundary enforcement.
- `tests/integration/default_renderer.rs` — built-in renderer deterministic output and SVG validation.
- `tests/integration/transfer_hook.rs` — boundary-breaking transfer rejection and hook account resolution.

These tests are gated by the Cargo feature flag `integration` because they rely on SBF artifacts and `ProgramTest` bank execution. Build the SBF programs first, then run:

```bash
cargo build-sbf --workspace
cargo test --features integration --tests
```

Without the feature flag, `cargo test --workspace` runs the faster unit/doc-test suite and skips the root integration targets.

