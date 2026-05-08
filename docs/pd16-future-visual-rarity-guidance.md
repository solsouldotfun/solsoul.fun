# PD16 Future Visual Rarity Guidance

This document captures the deferred guidance from
`misc-pd16-trait-parity-visual-guidance` for any future work that
intends to make additional `DefaultSoulTraitSet` categories — most
notably `gas_level` — visually expressed in the on-chain SVG renderer.

The corresponding parity audit lives in the mission library at
`library/pd16-trait-parity-audit.md` and is the canonical record of
the current Rust / SDK / app representation per category and of the
explicit "metadata-only / future" decision for `gas_level`.

## 1. What is settled today

PD16 ships a 9-category trait engine (`character_archetype`,
`goggles_eyes`, `expression`, `gas_aura_cloud`, `background`, `outfit`,
`relic`, `animation_behavior`, `gas_level`) implemented identically in
three layers (`programs/soul-generator/src/svg/traits.rs`,
`sdk/src/index.ts`, `app/src/lib/soulTraits.ts`). The on-chain SVG
renderer branches on every category except `gas_level`, which is a
metadata-only signal localized in EN/ZH and consumed by metadata-side
rarity (`derive_metadata_rarity` in `claim_soul.rs` and
`deriveSoulMetadataRarity` in the SDK). The persisted 8-byte
`provenance_seed_hash` plus the persisted provenance fields are the
only inputs that survive a trade — every reconstruction MUST be a
function of those fields alone.

Cross-layer preservation is locked by three parity tests that all use
the same canonical fixture (8-byte seed hash
`c6 13 e0 2a a4 84 60 b1`, theme `neonpuff`, side `buy`, generation
`7`, amount `123_456_789`, tokenAmount `2_000_000`). The tests live in:

- `programs/soul-generator/src/svg/traits.rs` —
  `tests::persisted_seed_hash_reconstruction_yields_stable_trait_set`
- `sdk/src/trait.test.ts` —
  `"reconstructs identical traits from a persisted 8-byte seed hash"`
- `app/src/lib/soulTraits.test.ts` —
  `"matches Rust/SDK reconstruction for a persisted 8-byte seed hash"`

## 2. Hard invariants for any future visual rarity work

If a future feature wants to add a visible SVG manifestation for
`gas_level` (or for any other metadata-only signal), it MUST satisfy
all of the following invariants. Violating any one is a parity break
and will fail the existing parity guards.

1. **Do not change the trait engine output.** `solsoul:traits:v1`
   domain, the FNV-1a 64-bit constants, the 0xff/0xfe separators, the
   per-category weight tables, the option IDs, the per-input byte
   ordering, and the `theme_id` table are all part of the parity
   contract. They are pinned by tests in all three layers.
2. **Do not change persisted layout.** `SoulAccount` offsets,
   `SEED_HASH_LEN`, `provenance_*` fields, and the JSON metadata
   attribute ordering in `claim_soul.rs` are part of upgrade safety.
3. **Reconstruct only from persisted inputs.** Visual changes must
   feed off the same `(seed_hash, theme, provenance_side, generation,
   amount, token_amount)` tuple. Do NOT introduce slot-time / blockhash
   /external entropy at render time, or historical Souls will become
   unrenderable.
4. **Stay inside byte/CU budgets.** `LAST_SVG_CAPACITY` is 4096 B.
   Renderer changes must keep PD16.A2 byte-and-CU regression tests
   green (no new external refs, no scripts/fonts/images).
5. **Composability with `animation_behavior`.** `gas_level` visuals
   must coexist with the existing animation branches — no double
   `<animate>` on the same attribute, no animations longer than the
   bounded durations already used.
6. **EN/ZH parity.** Any new visible variant MUST keep the existing
   stable trait IDs (`level_1`..`level_8`) and may only adjust how
   the renderer maps each ID to pixels — labels stay localized.
7. **No scarcity-narrative escalation.** Per PD18.F5 and the dust
   dominance gate (`library/pd18-f5-dust-dominance-gate.md`),
   `gas_level` MUST NOT be used as an "official" scarcity proof in
   App / docs / APIs / mission artifacts before the protocol-coverage
   conditions there are satisfied.

## 3. Suggested implementation envelope (non-binding)

A safe future visual mapping for `gas_level` is to derive bounded
**intensity** from the level ID without changing any trait IDs. For
example:

| Trait ID | Suggested visible effect (illustrative only) |
| --- | --- |
| `level_1` | minimal aura puff radius, low opacity |
| `level_2` | small aura, subtle gas drift |
| `level_3` | baseline aura intensity |
| `level_4` | medium aura, slightly faster drift |
| `level_5` | medium-high aura, prominent gas trail |
| `level_6` | high aura intensity, secondary halo |
| `level_7` | very high aura, layered halos |
| `level_8` | ceiling aura with bounded prism shimmer |

This is intentionally additive: it touches only opacity / radius /
duration constants in the existing aura/gas branches and does not
reshape outline geometry, so byte and CU budgets remain predictable.
It also lets the existing `animation_behavior` branches drive motion
without modification.

## 4. Required test deltas (when work lands)

A future visible-`gas_level` PR MUST include:

- Renderer fixture(s) for each of `level_1`..`level_8` under
  `programs/soul-generator/src/svg/` (one per level), asserting
  presence of the level-specific opacity / radius / duration constants
  and continued presence of byte/CU caps.
- Updates to `app/src/components/SoulGalleryCard.test.tsx` and
  `app/src/lib/soulGallery.test.ts` if the app starts surfacing the
  `gas_level` visual signal in card UX.
- A parity-safe extension of the persisted-seed-hash test trio in §1
  (e.g. additional seed hashes that pin `level_1` / `level_5` /
  `level_8` so each visible branch is exercised).
- A re-run of `cargo test --workspace`, `pnpm --filter sdk test`,
  `pnpm --filter app test`, and any indexer/CU regression checks.

## 5. Out-of-scope reminders

- **Soul NFT marketplace UX** is explicitly out of scope (PD15:
  Souls are claim/view/Profile/gallery/rarity/provenance only).
- **Non-Raydium AMM surfaces** stay deferred (PD15/PD18 boundary).
- **Server signer fallback** is retired; any new claim/refresh paths
  introduced alongside visual rarity work MUST stay wallet-signed.
- **Mainnet writes** remain forbidden during devnet validation.

If a future visual-rarity proposal cannot satisfy the invariants in
§2 it MUST go through a fresh mission proposal — the metadata-only
status of `gas_level` is the safe default until then.
