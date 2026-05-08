# SolSoul.fun

> **On-chain Art from Market Activity**
>
> A Solana launchpad where every trade generates a unique, fully on-chain SVG Soul.
> Exponential bonding curves run forever. No graduation. No migration. Pure math.

SolSoul.fun is a Solana mono-repo built with Pinocchio Rust programs, a TypeScript SDK, a Next.js 14 frontend, and an on-chain SVG rendering engine. The protocol loop is simple: **launch → trade → generate Soul → claim NFT**.

## Core Innovations

- **🔄 Exponential Bonding Curve**: `T = K·(1−e^(−R/S))` with `S = 500 SOL`, `K = 21M` tokens. Runs forever — no graduation threshold, no AMM migration, no liquidity extraction.
- **🔒 Permanent Lock Fee**: 0.1% of every buy is locked in the curve PDA forever, creating deflationary backing for all holders.
- **🎨 Soul Engine**: Extensible three-layer rendering system — built-in mathematical renderers + community renderer registry via CPI.
- **📜 Hard Binding**: Token-2022 Transfer Hook validates receipt-backed whole-token positions. Selling across protected boundaries requires explicit settlement.
- **⛓️ Pure On-Chain Art**: Every Soul is a deterministic SVG generated from trade entropy — no IPFS, no Arweave, no external storage. Website-only Animated Soul Flow Evolution wraps the static SVG with client-side Three.js/WebGL motion without changing on-chain or marketplace metadata.

## Quickstart

Requirements: Rust 1.89+, Solana CLI with SBF toolchain, Node 20+, pnpm 9.1.x.

```bash
# Install dependencies
pnpm install

# Build and test Rust workspace
cargo build --workspace
cargo test --workspace
cargo clippy --workspace -- -D warnings

# Build SDK and frontend
pnpm --filter sdk build
pnpm --filter app build

# Run frontend locally
pnpm --filter app dev
```

For local end-to-end testing:

```bash
cargo build-sbf --workspace
pnpm exec tsx scripts/e2e-localnet.ts
```

Copy `app/.env.example` to `app/.env.local` for devnet program IDs.

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `programs/bonding-curve` | Exponential curve, buy/sell, pause, lock fee |
| `programs/soul-generator` | Soul Engine, SVG rendering, NFT claims, receipts |
| `programs/transfer-hook` | Token-2022 Transfer Hook for boundary validation |
| `programs/solsoul-renderer-sdk` | SDK crate for building community renderers |
| `programs/shared` | Geppetto guards, boundary math, no-std primitives |
| `app` | Next.js 14 + Tailwind + next-intl + Three.js frontend |
| `sdk` | TypeScript SDK (tsup) |
| `services/indexer` | SQLite indexer with WebSocket subscriptions |
| `tests/integration` | SBF-backed integration tests |
| `docs` | Architecture, math, fee model, Soul Engine, renderers |

## Documentation

| Document | Description |
|----------|-------------|
| [`WHITEPAPER.md`](WHITEPAPER.md) | Protocol whitepaper — curve math, Soul Engine, tokenomics |
| [`docs/architecture.md`](docs/architecture.md) | Full system architecture and PDA inventory |
| [`docs/bonding-curve.md`](docs/bonding-curve.md) | Exponential curve math, buy/sell mechanics, worked examples |
| [`docs/fee-model.md`](docs/fee-model.md) | Fee economics — lock fee flywheel, treasury, comparison |
| [`docs/soul-engine.md`](docs/soul-engine.md) | Soul Engine technical spec — three-layer architecture, CPI, SDK |
| [`docs/renderers.md`](docs/renderers.md) | Mathematical renderer catalog — fractals, chaos, fields, waves |
| [`docs/protocol-vision.md`](docs/protocol-vision.md) | Long-term protocol direction and design constraints |
| [`docs/deploy.md`](docs/deploy.md) | Devnet deployment runbook |
| [`docs/security.md`](docs/security.md) | Secret scanner and security checklist |
| [`docs/testing.md`](docs/testing.md) | Test matrix and coverage |

## Protocol Parameters

```rust
CURVE_S: 500 SOL                    // Scale parameter
CURVE_K: 21_000_000 tokens         // Asymptotic supply cap
LOCK_FEE: 0.1% of buy SOL          // Permanently locked
LAUNCH_FEE: 0.03 SOL               // One-time protocol revenue
MAX_BUY: 5 SOL per tx              // Whale resistance
SELF_DEPRECATED: 99% of K          // Buy halt threshold
```

## Milestone Status

| Phase | Status | Description |
|-------|--------|-------------|
| **M1 — Walking Skeleton** | ✅ Complete | Mono-repo, Pinocchio programs, Token-2022, CPI SVG generation, SDK, frontend |
| **M2 — Soul Engine v1** | ✅ Complete | 7 built-in mathematical renderers, deterministic SVG, trait system |
| **M3 — Soul Engine v2** | ✅ Complete | External renderer registry, RenderBuffer PDA, CPI dispatch, `solsoul-renderer-sdk` |
| **M4 — Hard Binding** | ✅ Complete | Receipt creation, sell-side boundary enforcement, Token-2022 parser hardening |
| **M5 — Exponential Curve** | ✅ Complete | Sato-style exponential curve, 0.1% lock fee, no graduation, simplified state |
| **M6 — UI Simplification** | ✅ Complete | Premium Soul-first black-gallery launch/token redesign, simplified navigation |
| **M7 — Animated Soul Flow Evolution** | ✅ Complete | Deterministic client-side Three.js/WebGL flow layer over static Soul SVGs, with static on-chain/marketplace artifacts |
| **Devnet Readiness** | ✅ Complete | Deploy scripts, e2e traces, frontend smoke, console-clean local visual validation |

## Current Frontend State

- Token pages center on a minimal **Trade Soul** card with buy/sell tabs, quote preview, and advanced controls tucked behind disclosure.
- Quick trade presets cover 0.05/0.1/0.5/1 SOL buys plus 25/50/75/100% sells, including an MT gate preset and exact MT gate estimate copy when curve and wallet data are available.
- Launch and token detail hero surfaces use a website-only client-side Three.js/WebGL Animated Soul layer, with current Soul art when available and a safe mathematical fallback otherwise.
- Compact feed, launch, and gallery cards fall back to canvas/static Soul presentation as appropriate; reduced-motion and off states freeze non-essential motion, including `prefers-reduced-motion`.
- The Animated Soul Flow Evolution boundary is website-only: on-chain SVGs, claimed NFT metadata, and marketplace payloads stay static and omit executable formula, Three scene data, `video`, and `animation_url` fields.
- Token detail pages include a lightweight bonding curve chart with current point, minted progress, 10,000-token MT marker, and 2,100 MT/Soul cap marker.
- Run locally with `pnpm --filter app dev`; validate the app with `pnpm --filter app test` and `pnpm --filter app typecheck`.

## Art QA Readiness

Final built-in Soul art QA is **GO** for mainnet first impression. Review the full batch contact sheet at `evidence/art-qa/contact-sheet.html` and the readiness report at `evidence/art-qa/mainnet-readiness-report.md`; machine artifacts live under `evidence/art-qa/`.

Validation commands:

```bash
cargo run -p soul-generator --example art_qa_batch_sample -- --samples 240 --out evidence/art-qa
pnpm --filter app typecheck && pnpm --filter app test
pnpm --filter sdk typecheck && pnpm --filter sdk test
cargo fmt --all -- --check && cargo test --workspace && cargo clippy --workspace -- -D warnings
```

Mainnet deployment is a **deferred operator decision**.
- **Comprehensive runbook**: [`docs/mainnet-deploy.md`](docs/mainnet-deploy.md) — full lifecycle from pre-flight through post-launch monitoring
- **Printable checklist**: [`docs/mainnet-checklist.md`](docs/mainnet-checklist.md)
- **Artifact schema**: [`deployments/mainnet.json.template`](deployments/mainnet.json.template)
- Older dry-run reference: [`docs/mainnet-dry-run.md`](docs/mainnet-dry-run.md)

## Test Status

```bash
# Rust workspace
cargo test --workspace              # 203 passed
cargo clippy --workspace -- -D warnings  # clean
cargo fmt --all -- --check          # clean

# TypeScript SDK
pnpm --filter sdk test              # 96 passed
pnpm --filter sdk typecheck         # clean

# Frontend
pnpm --filter app test              # 500 passed
pnpm --filter app typecheck         # clean

# Indexer
cd services/indexer && pnpm test   # 26 passed
```

## Live Deployments

| Service | URL |
|---------|-----|
| Frontend (devnet) | <https://solsoul-devnet.vercel.app> |
| Indexer (devnet) | <https://indexer-production-bf20.up.railway.app> |

Program IDs (devnet): see [`deployments/devnet.json`](deployments/devnet.json)

## Useful Commands

```bash
# Full validation
cargo test --workspace && pnpm --filter sdk test && pnpm --filter app test

# SBF build verification
cargo build-sbf --workspace
bash scripts/check-mainnet-build.sh target/deploy/bonding_curve.so

# Coverage
bash scripts/coverage.sh

# Devnet deploy
bash scripts/deploy-devnet.sh ~/.config/solana/solsoul-devnet.json

# Local e2e
pnpm exec tsx scripts/e2e-localnet.ts
```

## License

MIT
