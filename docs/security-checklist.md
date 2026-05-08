# Security Checklist

Milestone 6 audit snapshot for the Pinocchio programs. Every item carries a
`Status` value and cites concrete source or verification references.

## Checklist

### 1. `generate_soul` compute-unit bound

- **Status:** pass
- **Check:** `generate_soul` remains below the 200,000 CU budget.
- **Evidence:** The latest performance run records `generate_soul` at 7,100 CU
  against the `< 200,000` budget (`docs/performance.md:7`,
  `docs/performance.md:9`). The instruction renders into the fixed
  `last_svg` buffer and converts the resulting length only after rendering
  (`programs/soul-generator/src/instructions/generate_soul.rs:78`,
  `programs/soul-generator/src/instructions/generate_soul.rs:101`).

### 2. Integer-overflow audit covers every `checked_*`

- **Status:** pass
- **Check:** All production arithmetic that can cross account-size, reserve,
  fee, SVG, metadata, PDA-seed, or base64 boundaries uses checked operations and
  returns a Solana error on overflow/underflow.
- **Evidence inventory:**
  - Shared PDA seed iteration:
    `programs/shared/src/geppetto/mod.rs:68`.
  - Bonding-curve instruction deltas and rent math:
    `programs/bonding-curve/src/instructions/buy.rs:86`,
    `programs/bonding-curve/src/instructions/buy.rs:95`,
    `programs/bonding-curve/src/instructions/create_token.rs:203`,
    `programs/bonding-curve/src/instructions/create_token.rs:205`,
    `programs/bonding-curve/src/instructions/sell.rs:83`,
    `programs/bonding-curve/src/instructions/sell.rs:94`,
    `programs/bonding-curve/src/instructions/sell.rs:98`.
  - Bonding-curve fee, launch-fund, buy/sell quote, product, and ceil-div
    math: `programs/bonding-curve/src/math.rs:40`,
    `programs/bonding-curve/src/math.rs:42`,
    `programs/bonding-curve/src/math.rs:47`,
    `programs/bonding-curve/src/math.rs:49`,
    `programs/bonding-curve/src/math.rs:80`,
    `programs/bonding-curve/src/math.rs:85`,
    `programs/bonding-curve/src/math.rs:118`,
    `programs/bonding-curve/src/math.rs:121`,
    `programs/bonding-curve/src/math.rs:125`,
    `programs/bonding-curve/src/math.rs:144`,
    `programs/bonding-curve/src/math.rs:154`,
    `programs/bonding-curve/src/math.rs:157`,
    `programs/bonding-curve/src/math.rs:162`.
  - Bonding-curve graduation reserve update:
    `programs/bonding-curve/src/state.rs:184`.
  - Soul initialization, rent, generation, blockhash, and upload parsing:
    `programs/soul-generator/src/instructions/initialize_soul.rs:97`,
    `programs/soul-generator/src/instructions/initialize_soul.rs:99`,
    `programs/soul-generator/src/instructions/initialize_soul.rs:169`,
    `programs/soul-generator/src/instructions/initialize_soul.rs:171`,
    `programs/soul-generator/src/instructions/generate_soul.rs:70`,
    `programs/soul-generator/src/instructions/generate_soul.rs:165`,
    `programs/soul-generator/src/instructions/generate_soul.rs:177`,
    `programs/soul-generator/src/instructions/upload_template.rs:58`,
    `programs/soul-generator/src/instructions/upload_template.rs:61`,
    `programs/soul-generator/src/instructions/upload_template.rs:73`.
  - Claim/NFT metadata sizing, URI/base64 sizing, and claim-count updates:
    `programs/soul-generator/src/instructions/claim_soul.rs:152`,
    `programs/soul-generator/src/instructions/claim_soul.rs:154`,
    `programs/soul-generator/src/instructions/claim_soul.rs:211`,
    `programs/soul-generator/src/instructions/claim_soul.rs:242`,
    `programs/soul-generator/src/instructions/claim_soul.rs:262`,
    `programs/soul-generator/src/instructions/claim_soul.rs:365`,
    `programs/soul-generator/src/instructions/claim_soul.rs:371`,
    `programs/soul-generator/src/instructions/claim_soul.rs:373`,
    `programs/soul-generator/src/instructions/claim_soul.rs:386`,
    `programs/soul-generator/src/instructions/claim_soul.rs:397`,
    `programs/soul-generator/src/instructions/claim_soul.rs:400`,
    `programs/soul-generator/src/instructions/claim_soul.rs:401`,
    `programs/soul-generator/src/instructions/claim_soul.rs:433`,
    `programs/soul-generator/src/instructions/claim_soul.rs:483`,
    `programs/soul-generator/src/instructions/claim_soul.rs:485`.
  - SVG/template and Token-2022 metadata helpers:
    `programs/soul-generator/src/svg/template.rs:26`,
    `programs/soul-generator/src/svg/template.rs:136`,
    `programs/soul-generator/src/svg/unicorn.rs:19`,
    `programs/soul-generator/src/token_2022.rs:33`,
    `programs/soul-generator/src/token_2022.rs:35`,
    `programs/soul-generator/src/token_2022.rs:38`,
    `programs/soul-generator/src/token_2022.rs:41`,
    `programs/soul-generator/src/token_2022.rs:96`,
    `programs/soul-generator/src/token_2022.rs:99`,
    `programs/soul-generator/src/token_2022.rs:103`.

### 3. PDA validation in every instruction

- **Status:** pass
- **Check:** Stateful PDA accounts are validated with Geppetto seed checks before
  writes or CPI use.
- **Evidence:** Soul Generator validates the SoulAccount PDA in
  `initialize_soul`, `generate_soul`, `upload_template`, and `claim_soul`
  (`programs/soul-generator/src/instructions/initialize_soul.rs:35`,
  `programs/soul-generator/src/instructions/generate_soul.rs:61`,
  `programs/soul-generator/src/instructions/upload_template.rs:33`,
  `programs/soul-generator/src/instructions/claim_soul.rs:111`) and claim/NFT
  authority PDAs in `claim_soul`
  (`programs/soul-generator/src/instructions/claim_soul.rs:121`,
  `programs/soul-generator/src/instructions/claim_soul.rs:126`). Bonding Curve
  validates curve/vault/treasury or soul PDAs in `create_token`, `buy`, `sell`,
  and `migrate`
  (`programs/bonding-curve/src/instructions/create_token.rs:63`,
  `programs/bonding-curve/src/instructions/create_token.rs:66`,
  `programs/bonding-curve/src/instructions/create_token.rs:68`,
  `programs/bonding-curve/src/instructions/buy.rs:56`,
  `programs/bonding-curve/src/instructions/buy.rs:77`,
  `programs/bonding-curve/src/instructions/sell.rs:44`,
  `programs/bonding-curve/src/instructions/sell.rs:69`,
  `programs/bonding-curve/src/instructions/migrate.rs:55`,
  `programs/bonding-curve/src/instructions/migrate.rs:56`).

### 4. Owner checks before program-owned or Token-2022 writes

- **Status:** pass
- **Check:** Instructions reject accounts whose owners do not match the program,
  Token-2022, or System program expectations.
- **Evidence:** Geppetto `assert_owned_by` rejects owner mismatches
  (`programs/shared/src/geppetto/mod.rs:45`,
  `programs/shared/src/geppetto/mod.rs:47`). Soul Generator checks ownership in
  `initialize_soul`, `generate_soul`, `upload_template`, and `claim_soul`
  (`programs/soul-generator/src/instructions/initialize_soul.rs:48`,
  `programs/soul-generator/src/instructions/generate_soul.rs:41`,
  `programs/soul-generator/src/instructions/upload_template.rs:21`,
  `programs/soul-generator/src/instructions/claim_soul.rs:88`,
  `programs/soul-generator/src/instructions/claim_soul.rs:93`,
  `programs/soul-generator/src/instructions/claim_soul.rs:96`). Bonding Curve
  checks curve/mint/token-account/treasury ownership in `create_token`, `buy`,
  `sell`, and `migrate`
  (`programs/bonding-curve/src/instructions/create_token.rs:70`,
  `programs/bonding-curve/src/instructions/create_token.rs:108`,
  `programs/bonding-curve/src/instructions/create_token.rs:110`,
  `programs/bonding-curve/src/instructions/buy.rs:42`,
  `programs/bonding-curve/src/instructions/buy.rs:46`,
  `programs/bonding-curve/src/instructions/buy.rs:55`,
  `programs/bonding-curve/src/instructions/sell.rs:42`,
  `programs/bonding-curve/src/instructions/sell.rs:48`,
  `programs/bonding-curve/src/instructions/migrate.rs:37`,
  `programs/bonding-curve/src/instructions/migrate.rs:43`).

### 5. Signer checks and signer model

- **Status:** pass
- **Check:** User-authorized entrypoints require explicit signers; CPI-only
  authority is represented as a signed PDA.
- **Evidence:** Geppetto `assert_signer` rejects missing signatures
  (`programs/shared/src/geppetto/mod.rs:29`,
  `programs/shared/src/geppetto/mod.rs:31`). Signer checks are present on
  launch, buy, sell, initialize, generate, upload, and claim paths
  (`programs/bonding-curve/src/instructions/create_token.rs:72`,
  `programs/bonding-curve/src/instructions/buy.rs:50`,
  `programs/bonding-curve/src/instructions/sell.rs:50`,
  `programs/soul-generator/src/instructions/initialize_soul.rs:37`,
  `programs/soul-generator/src/instructions/generate_soul.rs:42`,
  `programs/soul-generator/src/instructions/upload_template.rs:22`,
  `programs/soul-generator/src/instructions/claim_soul.rs:92`). The migration
  path intentionally has no arbitrary user signer; it is gated by the on-chain
  graduated/unmigrated state and exact preconfigured migration target
  (`programs/bonding-curve/src/instructions/migrate.rs:52`,
  `programs/bonding-curve/src/instructions/migrate.rs:60`).

### 6. CPI re-entry guard rationale

- **Status:** pass
- **Check:** The buy path releases mutable curve data before cross-program SVG
  generation, so the CPI cannot observe or invalidate a live mutable borrow.
- **Evidence:** `buy` packs the updated curve state, drops the mutable borrow,
  then calls the Soul Generator CPI
  (`programs/bonding-curve/src/instructions/buy.rs:130`,
  `programs/bonding-curve/src/instructions/buy.rs:132`,
  `programs/bonding-curve/src/instructions/buy.rs:134`). The CPI wrapper marks
  the SoulAccount writable and the curve PDA authority as a readonly signer
  (`programs/bonding-curve/src/soul_generator_cpi.rs:24`,
  `programs/bonding-curve/src/soul_generator_cpi.rs:26`,
  `programs/bonding-curve/src/soul_generator_cpi.rs:48`).

### 7. SVG input size validation

- **Status:** pass
- **Check:** Uploaded templates and generated SVG output are bounded by fixed
  account fields.
- **Evidence:** The state layout fixes `last_svg` to 4096 bytes, uploaded
  template storage to 2048 bytes, and style params to 256 bytes
  (`programs/soul-generator/src/state.rs:7`,
  `programs/soul-generator/src/state.rs:8`,
  `programs/soul-generator/src/state.rs:9`). Upload parsing rejects oversized
  template/style inputs and non-SVG prefixes
  (`programs/soul-generator/src/instructions/upload_template.rs:152`,
  `programs/soul-generator/src/instructions/upload_template.rs:156`,
  `programs/soul-generator/src/instructions/upload_template.rs:159`). Rendering
  writes only into the bounded `last_svg` slice
  (`programs/soul-generator/src/instructions/generate_soul.rs:80`,
  `programs/soul-generator/src/instructions/generate_soul.rs:95`).

### 8. Template injection guard and placeholder grammar

- **Status:** pass
- **Check:** The renderer supports only `{{NAME}}` placeholders and a narrow
  `style_params` grammar; unknown placeholders remain literal rather than
  executing or expanding untrusted syntax.
- **Evidence:** Placeholder scanning only recognizes `{{...}}` pairs and writes
  unrecognized placeholders back unchanged
  (`programs/soul-generator/src/svg/template.rs:90`,
  `programs/soul-generator/src/svg/template.rs:94`,
  `programs/soul-generator/src/svg/template.rs:107`). `style_params` accepts
  only key/value pairs separated by `;`, with recognized `mode` values
  `color|hsl|pixel` and `evolution` values `0..3`
  (`programs/soul-generator/src/svg/template.rs:120`,
  `programs/soul-generator/src/svg/template.rs:144`,
  `programs/soul-generator/src/svg/template.rs:153`,
  `programs/soul-generator/src/svg/template.rs:160`). The public template spec
  documents the same grammar (`docs/templates.md:6`, `docs/templates.md:14`).

### 9. Unauthorized instruction rejection

- **Status:** pass
- **Check:** Unknown discriminators and malformed argument lengths fail before
  any account mutation.
- **Evidence:** Soul Generator dispatch rejects empty data and unknown
  discriminators (`programs/soul-generator/src/instructions/mod.rs:18`,
  `programs/soul-generator/src/instructions/mod.rs:27`). Bonding Curve dispatch
  does the same (`programs/bonding-curve/src/instructions/mod.rs:18`,
  `programs/bonding-curve/src/instructions/mod.rs:27`). Individual handlers
  reject wrong argument lengths or boolean tags before account writes
  (`programs/bonding-curve/src/instructions/buy.rs:20`,
  `programs/bonding-curve/src/instructions/sell.rs:23`,
  `programs/bonding-curve/src/instructions/create_token.rs:28`,
  `programs/bonding-curve/src/instructions/migrate.rs:20`,
  `programs/soul-generator/src/instructions/generate_soul.rs:26`,
  `programs/soul-generator/src/instructions/generate_soul.rs:50`,
  `programs/soul-generator/src/instructions/claim_soul.rs:67`).

### 10. Rent and account-size checks

- **Status:** pass
- **Check:** PDA creation uses exact rent-exempt lamports and fixed layout sizes;
  handlers reject undersized accounts.
- **Evidence:** Soul and curve PDA allocators compute rent with checked
  `ACCOUNT_STORAGE_OVERHEAD + bytes * DEFAULT_LAMPORTS_PER_BYTE`
  (`programs/soul-generator/src/instructions/initialize_soul.rs:156`,
  `programs/soul-generator/src/instructions/initialize_soul.rs:169`,
  `programs/bonding-curve/src/instructions/create_token.rs:190`,
  `programs/bonding-curve/src/instructions/create_token.rs:203`,
  `programs/soul-generator/src/instructions/claim_soul.rs:477`,
  `programs/soul-generator/src/instructions/claim_soul.rs:483`). Runtime size
  guards reject short accounts
  (`programs/soul-generator/src/instructions/generate_soul.rs:44`,
  `programs/soul-generator/src/instructions/upload_template.rs:24`,
  `programs/soul-generator/src/instructions/claim_soul.rs:102`), and the M6
  integration suite asserts exact rent balances for curve, vault, and soul PDAs
  (`tests/integration/e2e_skeleton.rs:251`,
  `tests/integration/e2e_skeleton.rs:253`,
  `tests/integration/e2e_skeleton.rs:267`,
  `tests/integration/e2e_skeleton.rs:330`,
  `tests/integration/e2e_skeleton.rs:332`).

### 11. Freeze authority disabled on Token-2022 mints

- **Status:** pass
- **Check:** Token-2022 mint initialization writes `COption::None` for freeze
  authority on both meme-token and Soul NFT mints.
- **Evidence:** The Bonding Curve Token-2022 helper writes
  `instruction_data[34] = 0`, and `create_token` uses it with 6 decimals and the
  curve PDA as mint authority
  (`programs/bonding-curve/src/token_2022.rs:20`,
  `programs/bonding-curve/src/token_2022.rs:22`,
  `programs/bonding-curve/src/instructions/create_token.rs:112`). The Soul NFT
  helper writes the same freeze-authority-none byte, and `claim_soul` uses it
  with 0 decimals (`programs/soul-generator/src/token_2022.rs:128`,
  `programs/soul-generator/src/token_2022.rs:130`,
  `programs/soul-generator/src/instructions/claim_soul.rs:192`).

### 12. Treasury and fee-recipient correctness

- **Status:** pass
- **Check:** The launch treasury is a PDA, while the fee recipient is a
  persisted curve field that buy/sell must match exactly.
- **Evidence:** `create_token` validates the treasury PDA from `[b"treasury"]`
  and funds it via signed PDA creation or transfer
  (`programs/bonding-curve/src/instructions/create_token.rs:67`,
  `programs/bonding-curve/src/instructions/create_token.rs:68`,
  `programs/bonding-curve/src/instructions/create_token.rs:104`,
  `programs/bonding-curve/src/instructions/create_token.rs:128`). The derivation
  helper and unit test pin that seed
  (`programs/bonding-curve/src/state.rs:215`,
  `programs/bonding-curve/src/state.rs:353`). `create_token` stores
  `fee_recipient`, and buy/sell reject a mismatched fee account before moving
  fees (`programs/bonding-curve/src/instructions/create_token.rs:114`,
  `programs/bonding-curve/src/instructions/create_token.rs:116`,
  `programs/bonding-curve/src/instructions/buy.rs:81`,
  `programs/bonding-curve/src/instructions/sell.rs:73`).

### 13. Claim authorization and duplicate-claim rejection

- **Status:** pass
- **Check:** A Soul NFT claim requires the claimer signer, a valid meme-token
  account, PDA-derived claim/NFT authority accounts, and an unused claim PDA.
- **Evidence:** `claim_soul` requires the claimer signer and Token-2022 owners
  (`programs/soul-generator/src/instructions/claim_soul.rs:91`,
  `programs/soul-generator/src/instructions/claim_soul.rs:92`,
  `programs/soul-generator/src/instructions/claim_soul.rs:93`,
  `programs/soul-generator/src/instructions/claim_soul.rs:98`). It validates
  claim and NFT authority PDAs
  (`programs/soul-generator/src/instructions/claim_soul.rs:121`,
  `programs/soul-generator/src/instructions/claim_soul.rs:126`), rejects an
  already allocated claim account
  (`programs/soul-generator/src/instructions/claim_soul.rs:131`), and checks
  the claimer's associated token account against the claimed mint
  (`programs/soul-generator/src/instructions/claim_soul.rs:135`).

### 14. Program-id allowlist for CPI and token/system programs

- **Status:** pass
- **Check:** Handlers verify external program account IDs before CPI or token
  operations.
- **Evidence:** Geppetto `assert_program_id` rejects unexpected program
  accounts (`programs/shared/src/geppetto/mod.rs:89`,
  `programs/shared/src/geppetto/mod.rs:91`). Instructions enforce the Token-2022,
  System, and Soul Generator IDs before use
  (`programs/soul-generator/src/instructions/initialize_soul.rs:38`,
  `programs/soul-generator/src/instructions/claim_soul.rs:99`,
  `programs/soul-generator/src/instructions/claim_soul.rs:100`,
  `programs/bonding-curve/src/instructions/create_token.rs:73`,
  `programs/bonding-curve/src/instructions/create_token.rs:74`,
  `programs/bonding-curve/src/instructions/buy.rs:52`,
  `programs/bonding-curve/src/instructions/buy.rs:61`,
  `programs/bonding-curve/src/instructions/sell.rs:52`,
  `programs/bonding-curve/src/instructions/migrate.rs:44`).
