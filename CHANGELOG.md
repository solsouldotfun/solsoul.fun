# Changelog

All notable changes to the SolSoul protocol, programs, SDK, and frontend.

## [Unreleased] — Exponential Curve + Soul Engine v2

### Protocol
- **BREAKING**: Replaced CPMM bonding curve with sato-style exponential curve `T = K·(1−e^(−R/S))`
  - `S = 500 SOL`, `K = 21M` tokens
  - No graduation threshold, no AMM migration, no liquidity extraction
  - Curve runs forever with permanent 0.1% lock fee
- **BREAKING**: Removed graduation, migration, and Raydium adapter code
- **BREAKING**: Removed CPMM constant-product math, slippage, virtual reserves
- Simplified `BondingCurveAccount` to 57 bytes (mint, cumulative_sol, total_minted, self_deprecated, last_interaction_slot)
- Added `GlobalConfig` PDA for pause/unpause governance (renounceable)
- Added `renounce_admin` instruction for immutable governance

### Soul Engine
- Added three-layer extensible renderer architecture:
  - Layer 1: Renderer programs (built-in + community)
  - Layer 2: Engine Core (seed derivation, dispatch, assembly)
  - Layer 3: Algorithm Registry (built-in IDs + community registry)
- Added `RendererRegistryEntry` PDA for community renderer registration
- Added `RenderBuffer` PDA for external renderer CPI output
- Added `register_renderer` / `unregister_renderer` instructions
- Added `solsoul-renderer-sdk` crate with `RenderContext`, `SvgWriter`, `ColorPalette`
- Built-in renderers now use independent function-pointer dispatch

### Renderers
- **Removed** (non-mathematical): neonpuff, soulpuff, monochrome, hexagram, signal, unicorn
- **Retained** (mathematical): fractal, field, lattice, chaos, harmonic, pixel_fractal, pixel_art
- Fractal renderer: IFS affine transforms with 10K iterations
- Chaos renderer: Lorenz/Rössler/Aizawa strange attractors
- Harmonic renderer: Fourier synthesis with 8 harmonics
- Field renderer: Perlin-noise curl fields with particle advection
- Lattice renderer: 17 wallpaper group symmetry patterns
- PixelFractal renderer: 32×32 IFS pixel blocks
- PixelArt renderer: Value noise + cellular automata 8-bit aesthetic

### Fees
- Reduced buy fee from 1% to 0.1% (lock fee, permanently locked in curve PDA)
- Removed sell fee (0%)
- Launch fee remains 0.03 SOL
- Fee recipient removed (lock fee is non-extractable)

### Frontend
- Radical UI simplification (Apple-style minimal design)
- Navigation reduced from 6 to 4 core items: Explore / Market / Souls / Launch
- TokenFeedRow: card grid with hero Soul image + floating price badge
- SoulGalleryCard: art-forward vertical cards (name + rarity + CTA only)
- Responsive grid layout (1→2→3→4 columns)
- Removed GenerationRulesCard from profile/gallery noise

### Documentation
- Added `WHITEPAPER.md` — protocol whitepaper
- Added `docs/soul-engine.md` — Soul Engine technical specification
- Added `docs/renderers.md` — Mathematical renderer catalog
- Updated `README.md` with new architecture and milestones
- Updated `docs/testing.md` with new test matrix
- Updated `docs/deploy.md` with three-program deployment flow

## [2026-05-01] — PD18 Security Hardening

### Security
- Added `SEC.F1` flash-loan protection (same-slot check)
- Added `SEC.F2` sell ratio limit (`token_in / remaining_supply ≤ 2`)
- Added `SEC.F3` Transfer Hook reject-only invariant
- Added `SEC.F4` Raydium CP-Swap migration fail-closed
- Added `SEC.F5` dust dominance ratio gate (disabled by default)

### Programs
- Added `pause` / `unpause` instructions with `GlobalConfig` authority check
- Added `self_deprecated` safety valve at 99% of K

## [2026-04-28] — Renderer Cleanup

### Renderers
- Removed 6 illustration-themed renderers (neonpuff, soulpuff, monochrome, hexagram, signal, unicorn)
- Kept 7 mathematical renderers
- Updated `ArtTheme` enum to mathematical-only variants
- Updated trait snapshots and test fixtures

## [2026-04-25] — Soul Engine Phase 3

### Programs
- Added `RenderBuffer` PDA for external renderer output
- Added `invoke_external_renderer` CPI with signed seeds
- Added `copy_render_buffer_svg` for buffer → SoulAccount transfer

## [2026-04-20] — Soul Engine Phase 2

### Programs
- Added `RendererRegistryEntry` PDA
- Added `register_renderer` instruction (0.1 SOL fee)
- Added `unregister_renderer` instruction (admin-gated)

## [2026-04-15] — Soul Engine Phase 1

### Programs
- Added `engine/mod.rs` + `engine/registry.rs`
- Added 10 built-in renderer function-pointer registry
- Added `render_builtin_with_traits` dispatch

## [2026-04-10] — Pixel Renderers

### Programs
- Added `pixel_fractal` renderer (32×32 IFS pixel blocks)
- Added `pixel_art` renderer (value noise + 8-bit palette)

## [2026-04-01] — Exponential Curve Refactor

### Programs
- Added `math.rs` with `exp_neg()` (8-term Taylor) and `solve_exp_inverse()` (binary search)
- Added `CURVE_S = 500 SOL`, `CURVE_K = 21M` tokens
- Rewrote `buy.rs` with lock fee → curve PDA
- Rewrote `sell.rs` with hard binding validation
- Removed `migrate.rs`, `amm_*.rs` adapter files
- Removed `graduation.rs` integration test

## [2026-03-20] — Initial Walking Skeleton

### Programs
- Bonding curve with CPMM (constant-product market maker)
- Soul generator with basic SVG rendering
- Transfer Hook prototype
- Token-2022 integration

### SDK
- TypeScript SDK with PDA helpers and instruction builders

### Frontend
- Next.js 14 App Router with i18n
- Wallet integration (Phantom)
- Launch form, token detail, gallery, profile pages

---

*Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).*
