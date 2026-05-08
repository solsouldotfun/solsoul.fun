# SolSoul Mainnet Art Readiness Report

**Feature:** `artqa-final-brand-review-go-report`

**Objective status:** PASS

**Subjective brand-quality result:** GO

**Recommended mainnet art decision:** **GO** for mainnet first impression, with the watch samples below kept visible for final human/operator review.

## Objective Gate Summary

- Batch samples: **240** (minimum 200).
- Built-in theme coverage: **chaos=30, field=30, fractal=30, harmonic=30, lattice=30, pixelart=30, pixelfractal=30, symphony=30**.
- Exact duplicate SVGs: **0**; unique SVGs: **240**.
- Byte length: min **1360**, p50 **2674**, p95 **3796**, max **3806** bytes under the 4096-byte cap.
- Visible primitive counts: min **8**, p50 **38**, p95 **69**, max **69**.
- Visibility/safety heuristics: **0** failing standard-visible checks, **0** zero-opacity samples, **0** zero-primitive samples.
- Objective blockers: **0**.

## Subjective Brand Review

Reviewed the regenerated `evidence/art-qa/contact-sheet.html` plus focused inline SVG samples for Pixel Fractal, Symphony, Fractal, Harmonic, Field, Chaos, Lattice, and Pixel Art.

**Decision: GO.** The tuned batch is acceptable for mainnet first impression. Pixel Fractal now reads as intentional pixel-glow generative art instead of sparse fragments, and Symphony has moved away from literal clip-art notes into abstract audio-reactive spectrum/wave/resonance compositions.

### Strengths

- Pixel Fractal gained visible foreground density, central motifs, glow blocks, and mirrored structure while staying crisp and deterministic.
- Symphony now presents spectral bars, waveform paths, resonance geometry, and Solana-accent color fields rather than literal music-note iconography.
- Fractal and Harmonic dark-gallery themes include interior glow, contour/ring structure, and secondary geometry, reducing flat dark/gray first impressions.
- The full contact sheet remains visually varied across all eight built-in themes with no blank or malformed tiles observed in browser review.

### Watch Notes

- Some Pixel Fractal watch samples remain minimalist; keep monitoring whether the pentagon/spiral/block vocabulary feels sufficiently premium at product scale.
- Some Symphony samples are intentionally dense and arcade-like; acceptable for launch, but future tuning could make spectral forms more refined.
- Pixel Art and a few light-background variants are lower-priority aesthetic watch items, not blockers, because objective safety and representative theme quality pass.

## Representative Best / Watch Samples

Use `contact-sheet.html` for the full batch and open the linked SVG paths directly for per-sample inspection.

| Theme | Best sample | Watch sample | Notes |
| --- | --- | --- | --- |
| `fractal` | `sample-040-fractal`<br>`batch-samples/sample-040-fractal.svg`<br>1775 bytes · 27 primitives | `sample-000-fractal`<br>`batch-samples/sample-000-fractal.svg`<br>1714 bytes · 27 primitives | Best shows black-gallery spiral/contour/glow structure; watch remains acceptable dark minimalism. |
| `field` | `sample-009-field`<br>`batch-samples/sample-009-field.svg`<br>3250 bytes · 50 primitives | `sample-009-field`<br>`batch-samples/sample-009-field.svg`<br>3250 bytes · 50 primitives | Dense field output passes visibility; watch is the same objective-heavy representative. |
| `lattice` | `sample-114-lattice`<br>`batch-samples/sample-114-lattice.svg`<br>2412 bytes · 38 primitives | `sample-114-lattice`<br>`batch-samples/sample-114-lattice.svg`<br>2412 bytes · 38 primitives | Crisp accent grid/spiral form; watch for repeated sparse lattice vocabulary, not a blocker. |
| `chaos` | `sample-003-chaos`<br>`batch-samples/sample-003-chaos.svg`<br>2674 bytes · 52 primitives | `sample-003-chaos`<br>`batch-samples/sample-003-chaos.svg`<br>2674 bytes · 52 primitives | Input-sensitive waveform/light-field sample; light-background variants are acceptable but less on-brand than black-gallery themes. |
| `harmonic` | `sample-124-harmonic`<br>`batch-samples/sample-124-harmonic.svg`<br>3806 bytes · 69 primitives | `sample-124-harmonic`<br>`batch-samples/sample-124-harmonic.svg`<br>3806 bytes · 69 primitives | Strong waveform, rings, and node structure; no flat dark-form blocker remains. |
| `pixelfractal` | `sample-101-pixelfractal`<br>`batch-samples/sample-101-pixelfractal.svg`<br>3756 bytes · 60 primitives | `sample-045-pixelfractal`<br>`batch-samples/sample-045-pixelfractal.svg`<br>2878 bytes · 46 primitives | Primary weak theme now has dense block/glow/spiral structure; watch sample remains intentionally minimal but no longer blank. |
| `pixelart` | `sample-126-pixelart`<br>`batch-samples/sample-126-pixelart.svg`<br>1673 bytes · 12 primitives | `sample-158-pixelart`<br>`batch-samples/sample-158-pixelart.svg`<br>1493 bytes · 10 primitives | Classic pixel terrain remains legible; watch sample is lower priority due to simpler retro vocabulary. |
| `symphony` | `sample-119-symphony`<br>`batch-samples/sample-119-symphony.svg`<br>3438 bytes · 10 primitives | `sample-223-symphony`<br>`batch-samples/sample-223-symphony.svg`<br>3605 bytes · 8 primitives | Primary weak theme now uses abstract spectrum/wave/resonance forms, not literal note clip art. |

## Theme / Trait Parity Readiness

- Rust renderer coverage exercises all eight built-in themes: `fractal`, `field`, `lattice`, `chaos`, `harmonic`, `pixelfractal`, `pixelart`, and `symphony`.
- The final batch spans all supported core trait categories: `palette`, `mood`, `form`, and `background`, with deterministic system fill for omissions.
- Normal deterministic seed sweep has no exact duplicate SVG output and no blank/malformed samples.

## Artifact Index

- machineReport: `evidence/art-qa/mainnet-readiness-report.json`
- humanReport: `evidence/art-qa/mainnet-readiness-report.md`
- batchReport: `evidence/art-qa/report.json`
- contactSheet: `evidence/art-qa/contact-sheet.html`
- sampleIndex: `evidence/art-qa/sample-index.json`
- hashes: `evidence/art-qa/hashes.tsv`
- sampleDirectory: `evidence/art-qa/batch-samples/`

## Final Validation Commands

- `cargo run -p soul-generator --example art_qa_batch_sample -- --samples 240 --out evidence/art-qa`
- `pnpm --filter app typecheck && pnpm --filter app test`
- `pnpm --filter sdk typecheck && pnpm --filter sdk test`
- `cargo fmt --all -- --check && cargo test --workspace && cargo clippy --workspace -- -D warnings`
