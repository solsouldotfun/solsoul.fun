# Contributing to SolSoul

Thank you for your interest in contributing to SolSoul! This guide covers how to get started, our code standards, and how to submit changes.

## Getting Started

### Prerequisites

- **Rust 1.89+** with Solana SBF toolchain
- **Node.js 20+** and **pnpm 9.1.x**
- **Solana CLI** (for local testing and devnet deployment)
- **Git** with pre-commit hooks

### Development Setup

```bash
# Clone the repository
git clone https://github.com/DaviRain-Su/solsouldotfun.git
cd solsouldotfun

# Install dependencies
pnpm install

# Install pre-commit hook (secret scanner)
cp scripts/pre-commit.hook .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Verify Rust toolchain
cargo --version
cargo build-sbf --version

# Run full test suite
cargo test --workspace
pnpm --filter sdk test
pnpm --filter app test
```

## Project Structure

```
solsouldotfun/
├── programs/
│   ├── bonding-curve/      # Curve math, buy/sell, pause
│   ├── soul-generator/     # Soul Engine, SVG rendering, claims
│   ├── transfer-hook/      # Token-2022 boundary validation
│   ├── solsoul-renderer-sdk/ # Renderer SDK crate
│   └── shared/             # Geppetto guards, boundary math
├── app/                    # Next.js 14 frontend
├── sdk/                    # TypeScript SDK
├── services/
│   └── indexer/            # SQLite + WebSocket indexer
├── tests/integration/      # SBF-backed integration tests
├── scripts/                # Deployment and E2E helpers
└── docs/                   # Protocol documentation
```

## Contribution Areas

### 1. Community Renderers

The most impactful way to contribute is building new mathematical renderers for the Soul Engine.

**Requirements:**
- Must generate beauty from pure mathematics (fractals, chaos, fields, waves, etc.)
- No illustration, characters, or themed imagery
- Must be deterministic: same `RenderContext` → same SVG bytes
- Must fit within 4KB SBF stack and 50K compute units
- Must use the `solsoul-renderer-sdk` crate

**Steps:**
1. Read `docs/soul-engine.md` and `docs/renderers.md`
2. Study `programs/solsoul-renderer-sdk/examples/community_renderer.rs`
3. Implement your renderer as a separate program crate
4. Test with `cargo test` and `cargo build-sbf`
5. Submit a PR with:
   - Renderer source code
   - Unit tests proving determinism
   - Example SVG output (rendered offline)
   - Documentation of the mathematical basis

**Registration:** Once merged, the renderer can be registered on-chain via `register_renderer` (0.1 SOL fee, admin-gated).

### 2. Curve Math Improvements

- Optimize `exp_neg()` Taylor expansion (more terms, lower error)
- Implement alternative curve models (e.g., sigmoid, logistic)
- Add fixed-point precision benchmarks

### 3. Frontend Contributions

- UI improvements (accessibility, mobile, performance)
- New data visualizations (curve charts, Soul galleries)
- Wallet integrations (beyond Phantom)
- i18n translations (beyond EN/ZH)

### 4. Indexer & API

- Additional REST endpoints
- GraphQL support
- Real-time WebSocket event filtering
- Analytics dashboards

### 5. Documentation

- Translations of whitepaper and docs
- Tutorial content ("How to launch a token", "How to claim a Soul")
- Video guides

## Code Standards

### Rust

```bash
# Before submitting, run:
cargo fmt --all
cargo clippy --workspace -- -D warnings
cargo test --workspace
bash scripts/coverage.sh
```

- **No `unsafe`**: All on-chain code must be safe Rust
- **No allocations**: Pinocchio programs use `no_std`, no `alloc`
- **Checked arithmetic**: Use `checked_add`, `checked_mul`, etc.
- **Error handling**: Return `ProgramError` with descriptive messages
- **Documentation**: Every public function must have rustdoc

### TypeScript

```bash
# Before submitting, run:
pnpm --filter sdk typecheck
pnpm --filter app typecheck
pnpm --filter app test
```

- **Strict TypeScript**: No `any` without justification
- **Functional components**: Use React hooks, not class components
- **Accessibility**: All interactive elements need `aria-label`
- **i18n**: All user-facing strings through `next-intl`

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(ui): add dark mode toggle
fix(curve): correct exp_neg overflow at high x
docs(whitepaper): add section on lock fee flywheel
refactor(engine): simplify renderer dispatch
test(sell): add flash-loan rejection case
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code restructuring
- `test`: Adding or updating tests
- `chore`: Maintenance (deps, scripts, etc.)

## Pull Request Process

1. **Fork** the repository and create a feature branch
2. **Write tests** for any new functionality
3. **Run the full test suite** (see above)
4. **Update documentation** if your change affects protocol behavior
5. **Submit PR** with:
   - Clear description of what and why
   - Screenshots (for UI changes)
   - Test results
   - Link to related issue (if any)

### PR Review Checklist

- [ ] Tests pass (`cargo test --workspace`, `pnpm --filter app test`)
- [ ] No secret leaks (`bash scripts/scan-secrets.sh`)
- [ ] Formatting clean (`cargo fmt --all -- --check`)
- [ ] Clippy clean (`cargo clippy --workspace -- -D warnings`)
- [ ] Documentation updated
- [ ] Commit messages follow convention

## Security

- **Never commit keys**: Solana keypairs, API keys, RPC tokens
- **Report vulnerabilities privately**: Email `security@solsoul.fun` (placeholder)
- **Pre-commit hook**: The secret scanner runs automatically; do not bypass without justification

## Community

- **GitHub Discussions**: For questions and ideas
- **GitHub Issues**: For bugs and feature requests
- **Devnet Testing**: Test your changes on devnet before submitting

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

*Last updated: 2026-05-04*
