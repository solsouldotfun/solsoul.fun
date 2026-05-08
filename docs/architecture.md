# SolSoul Architecture

SolSoul.fun is a Solana mono-repo with two Pinocchio programs, a TypeScript SDK,
a Next.js 14 frontend, an indexer service, and an SVG rendering API. The product
loop is: launch a Token-2022 meme mint on an **exponential bonding curve**,
trade it forever (no graduation), generate a fully on-chain SVG "Soul" after
every trade, and optionally claim generated Souls as Token-2022 NFTs with
hard-boundary receipt proofs.

## System overview

```text
Browser / Wallet
  |
  | Next.js App Router pages and wallet-adapter UI
  v
TypeScript SDK
  |-- PDA derivation helpers
  |-- instruction builders
  |-- account decoders
  v
Solana RPC / wallet transaction signing
  |
  |------------------------------|
  v                              v
bonding-curve program            soul-generator program
  |                              |
  | create_token / buy / sell    | initialize_soul / upload_template
  | pause / unpause              | generate_soul / claim_soul
  |                              |
  v                              v
Token-2022 meme mint             SoulAccount + Token-2022 Soul NFT metadata
         |                              |
         | Transfer Hook                | Receipt Registry
         | (hard boundary check)         | (claim proof)
         v                              v
    On-chain enforcement          SVG art + provenance
```

Repository responsibilities:

- `programs/bonding-curve` owns launch, exponential curve math, buy/sell,
  pause/unpause safety valve, and permanent 0.1% lock fee mechanics.
- `programs/soul-generator` owns SoulAccount state, deterministic SVG rendering,
  template uploads, Soul NFT claims, and receipt registry.
- `programs/shared` owns Geppetto account guards and boundary math shared by
  both programs.
- `sdk` mirrors PDA derivations, account layouts, and transaction helpers for
  app and script callers.
- `app` renders the localized launch, token trading, gallery, and profile flows.
- `services/indexer` indexes program logs and receipt accounts into SQLite and
  serves a REST API for token discovery and generation provenance.
- `services/svg-api` renders SVG previews for the frontend.
- `scripts` contains localnet and devnet operational entrypoints.

## Core design principles

1. **No graduation**: The exponential curve runs forever. There is no threshold,
   no migration, and no liquidity extraction.
2. **Permanent lock fee**: 0.1% of every buy is locked in the curve PDA forever.
   This creates deflationary backing for all holders.
3. **Hard binding**: Token transfers are validated by a Transfer Hook against
   receipt boundaries. Selling across a boundary requires active receipt
   settlement, making token持有 a provable on-chain credential.
4. **Soul provenance**: Every buy and sell triggers a deterministic SVG
   generation seeded by the trade amount, trader, and slot hashes.

## Walking-skeleton CPI flow

The core on-chain loop is:

1. `bonding-curve::create_token` initializes a Token-2022 mint with
   `decimals = 6`, `freeze_authority = None`, and the curve PDA as mint
   authority. The launcher pays 0.03 SOL to the treasury PDA.
2. `soul-generator::initialize_soul` initializes the SoulAccount PDA for the
   same mint, recording authority, symbol, claim defaults, and empty SVG/template
   fields.
3. `bonding-curve::buy` validates accounts, applies the 0.1% lock fee
   (transferred to curve PDA permanently), transfers net SOL into the vault PDA,
   mints meme tokens to the buyer, and updates `cumulative_sol` and
   `total_minted` in the curve account.
4. After the state update is packed and mutable borrows are released,
   `bonding-curve::buy` CPIs into `soul-generator::generate_soul`.
5. `generate_soul` combines the signer, recent slot hashes, `swap_amount`, and
   direction flag into a deterministic seed, renders into the fixed 4096-byte
   SoulAccount SVG buffer, and increments `generation_count`.
6. A holder may later call `claim_soul`, which verifies the holder's Token-2022
   balance and mints a `decimals = 0`, `supply = 1` Token-2022 NFT whose
   metadata URI embeds the generated SVG as a `data:` URI.

## Cross-program PDA signing pattern

The curve PDA is both the Token-2022 mint authority and the CPI signer for
trade-triggered soul generation. `buy` constructs the signer seeds once:

```text
[b"curve", mint.as_ref()]
```

and uses signed invocation for:

- Token-2022 `MintTo`, with the curve PDA as mint authority.
- Soul Generator `generate_soul`, with the curve PDA passed as the `payer`
  signer.

The Soul Generator CPI receives:

```text
accounts = [
  SoulAccount PDA      writable, [b"soul", mint.as_ref()], owner = soul-generator
  Curve PDA            readonly signer, [b"curve", mint.as_ref()], owner = bonding-curve
  SlotHashes sysvar    readonly
]
args = {
  swap_amount: net_sol_in,
  is_buy: true
}
```

`bonding-curve::buy` validates the SoulAccount PDA and Soul Generator program id
before invoking, and releases mutable borrows of the curve account before CPI so
the signed invocation cannot observe stale borrowed state.

## PDA inventory

| PDA | Program owner | Seeds | Purpose | Primary callers |
| --- | --- | --- | --- | --- |
| Curve account | `bonding-curve` | `[b"curve", mint]` | Stores mint, cumulative SOL, total minted, self-deprecated flag, and last interaction slot. Also signs Token-2022 minting. | `create_token`, `buy`, `sell`, Soul Generator CPI signer |
| Vault account | `bonding-curve` | `[b"vault", mint]` | Holds real SOL reserves during curve trading. Never migrated. | `create_token`, `buy`, `sell` |
| Treasury account | `bonding-curve` | `[b"treasury"]` | Receives the fixed 0.03 SOL launch fee. Lamport-only account. | `create_token` |
| Soul account | `soul-generator` | `[b"soul", mint]` | Stores generated SVG bytes, template bytes, style parameters, claim defaults, claim count, and meme symbol. | `initialize_soul`, `generate_soul`, `upload_template`, `claim_soul` |
| Claim account | `soul-generator` | `[b"claim", soul, sequence_le]` | Records one claimed generated Soul and prevents duplicate claims for the same sequence. | `claim_soul` |
| NFT authority | `soul-generator` | `[b"nft", soul, sequence_le]` | PDA signer for minting the claimed Token-2022 Soul NFT. | `claim_soul` |
| Receipt registry | `soul-generator` | `[b"receipt_registry", claimant, mint]` | Tracks active/burned/forfeited receipts per claimant per token. | Transfer Hook, `claim_soul`, settlement |
| Receipt | `soul-generator` | `[b"receipt", soul, sequence_le]` | Individual claim proof with bound quantity and boundary. | Transfer Hook, settlement |

All PDAs use Pinocchio's no-bump `Pubkey::derive_address` pattern in program
code and matching SDK helpers. The SDK's `findMintWithNoBumpPdas` utility scans
candidate mints until the curve, vault, and soul derivations are valid off-curve
addresses for the no-bump model.

## Account state summary

| Account | Key fields | Size / compatibility |
| --- | --- | --- |
| `BondingCurveAccount` | `mint`, `cumulative_sol`, `total_minted`, `self_deprecated`, `last_interaction_slot` | **57 bytes**. No legacy migration fields. |
| `SoulAccount` | `mint`, `authority`, `generation_count`, `last_svg`, `base_svg_template`, `style_params`, `min_claim_balance`, `claim_count`, `meme_symbol` | `unpack` accepts `LEGACY_LEN` and current `LEN`; new writes require current layout. |
| `ClaimAccount` | `soul`, `claimer`, `nft_mint`, `sequence`, `generation_count` | One account per Soul claim sequence. |
| `ReceiptRegistry` | `claimant`, `token_mint`, `active_receipts`, `burned_receipts`, `forfeited_receipts` | 88 bytes. |
| `Receipt` | `soul`, `claimant`, `token_mint`, `nft_mint`, `sequence`, `generation_count`, `bound_quantity`, `bound_boundary`, `lifecycle_state` | 161 bytes. |

## External-storage boundary

SVG templates, generated SVGs, and claimed NFT metadata are kept on chain. The
implementation does not depend on IPFS, Arweave, centralized image hosting,
oracles, or third-party indexers for protocol correctness. Marketplace/indexer
display is best-effort and documented separately in `docs/nft-compat.md`.
Long-term receipt mechanics are tracked separately in `docs/protocol-vision.md`.

## Safety valves

| Mechanism | Purpose | Condition |
|-----------|---------|-----------|
| `pause` / `unpause` | Emergency halt of trading | Admin-only; can be renounced |
| `self_deprecated` | Prevent infinite minting at asymptotic price | `total_minted ≥ K * 99%` |
| Same-slot check | Flash-loan arbitrage prevention | `last_interaction_slot == current_slot` |
| Max buy | Whale accumulation resistance | `sol_in > 5 SOL` |
| Sell ratio limit | Curve stability | `token_in / remaining_supply > 2` |
