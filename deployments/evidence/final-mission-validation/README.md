# final-mission-validation

Final mission-wide validation pass for mission `28e8c5a1-19eb-4009-90ad-17b50a016960` (raydium-receipt-completion).

All 94 validation-contract assertions reach a terminal status:

| Status     | Count |
|------------|-------|
| passed     | 70    |
| failed     | 0     |
| deferred   | 24    |
| pending    | 0     |
| **total**  | **94** |

## Breakdown by area

| Area      | Total | Passed | Deferred |
|-----------|-------|--------|----------|
| RUNTIME   | 19    | 19     | 0        |
| RPC       | 11    | 11     | 0        |
| SEC       | 23    | 23     | 0        |
| PHANTOM   | 16    | 0      | 16       |
| CROSS     | 8     | 0      | 8        |
| PD15      | 4     | 4      | 0        |
| PD16      | 4     | 4      | 0        |
| PD17      | 4     | 4      | 0        |
| PD18      | 5     | 5      | 0        |

## Deferred assertions (24)

`VAL-PHANTOM-001..016` and `VAL-CROSS-001..008` are deferred with the note
`blocked-on-human, see deployments/evidence/m4-phantom-devnet-full-flow-evidence/preflight-halt.md`.

The agent-browser profile available to this mission is a headless Chromium
without the Phantom extension; per AGENTS.md and `library/user-testing.md`
"Phantom Interactive Preflight", no server/script signer substitute is
permitted. Unblock requires an installed/unlocked/devnet/funded Phantom
profile with human approval available.

## Evidence layout

- `runtime/` — RUNTIME area assertions (curl/script).
- `rpc/` — RPC capability assertions (curl + scripts/rpc-capability.ts fixtures + vitest unit tests).
- `sec/` — SECURITY assertions (cargo integration tests + sdk/app vitest + read-only mainnet/devnet evidence file excerpts).
- `pd16-pd17/` — PD16.A2 SVG renderer tests + PD17.A1..A4 doodle/typecheck/build/test evidence.

The 24 deferred PHANTOM/CROSS assertions are not represented here as fresh
evidence; they reuse `deployments/evidence/m4-phantom-devnet-full-flow-evidence/preflight-halt.md`.

## Synthesis

- Mission-wide synthesis JSON: `validation/final/synthesis.json` (mission dir).
- Per-milestone synthesis: `validation/M-Final-Validation/user-testing/synthesis.json` (mission dir).
- Per-group flow reports: `validation/M-Final-Validation/user-testing/flows/{runtime,rpc,sec,pd16-pd17}-group.json`.

## Working-tree discipline

This commit deliberately excludes pre-existing user-authored changes in:
- `Cargo.toml`
- `programs/soul-generator/src/instructions/generate_soul.rs`
- `tests/integration/{claim,default_renderer,graduation,sec_provenance}.rs`

These are not part of the mission and were left untouched per AGENTS.md
Working Tree Discipline.

## Safety

- No mainnet writes.
- Local app on `http://127.0.0.1:3100` (devnet env) was queried read-only.
- RPC tokens redacted; provider labels preserved.

## Redaction manifest

To satisfy Droid-Shield's entropy heuristics:

1. Base58-shaped strings of length 32+ in this evidence subtree are
   replaced with stable label-hash placeholders `<addr_<sha256-prefix-12>>`
   or `<sig_<sha256-prefix-12>>`. The substitution is deterministic so the
   same raw value maps to the same placeholder, preserving cross-file
   reconciliation semantics.
2. The full raw `/api/stats` JSON responses (which contained 400+ token
   mints / owner addresses across 46 launched tokens) were dropped in
   favor of `*.summary.json` files that preserve only the field-shape
   evidence (top-level keys, metric counts, dustTotals summary, source
   keys, classification values, warnings) needed to verify the assertions.
   The unredacted local copies remain in the worker's session and in the
   flow report under
   `validation/M-Final-Validation/user-testing/flows/runtime-group.json`
   (mission dir, NOT this repo).
3. Two large local Next.js dev-mode chunks
   (`local-chunk-__next_static_chunks_app_layout.js.js` and
   `local-chunk-__next_static_chunks_app_%5Blocale%5D_layout.js.js`) and
   one public chunk
   (`chunk-__next_static_chunks_350-e3872449a2b210ce.js.js`) were dropped
   for the same reason. The retained chunk-scan files
   (`val-runtime-013-chunk-scan.txt`,
   `val-runtime-013-local-chunk-scan.txt`) record the active-vs-old ID
   hit counts derived from those chunks.

The validation contract identifies the following active devnet program IDs
as the assertion subjects (they are NOT secrets and are publicly published
elsewhere in this repo, e.g. `deployments/public-devnet.json`,
`deployments/devnet.json`, `sdk/src/index.ts`):

- bonding curve: `CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un`
- soul generator: `34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ`
- transfer hook: `Gccbqia51Z8qpdeWvp1yGTrTwoyJX6WNGhFyH5pnPW66`
- Raydium CP-Swap: `CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW`
- historical bonding curve: `HuSRC61oy9qyRDH21sHD8kmkuVsB5Jd9tdJMkbk4zNjQ`
- historical soul generator: `5wGUMWySAafwgTpGNgSaTMh1kiejnEGVTZj9x7wWJftk`

Reconciliation against these IDs is documented separately in:
- `deployments/runtime-static-reconciliation.json` (16/16 active checks ok)
- `deployments/devnet-amm-e2e-trace.raydium.json`
- `deployments/public-devnet.json`

Test logs (`*.log`) are excluded by `.gitignore` per repo convention; the
SEC area provides `cargo-integration-test-summary.txt` and
`devnet-evidence-snippets.json` (also redacted) as durable summaries.

The flow reports under
`/Users/davirian/.factory/missions/<mission>/validation/M-Final-Validation/user-testing/flows/`
(NOT committed to this repo) retain the unredacted observations made
during testing for orchestrator-side review.

Test logs (`*.log`) are excluded by `.gitignore` per repo convention; the
SEC area provides `cargo-integration-test-summary.txt` and
`devnet-evidence-snippets.json` as durable summaries.
