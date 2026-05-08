# SolSoul NFT Compatibility

## Token-2022 metadata layout

Claimed Souls are Token-2022 NFTs with:

- `decimals = 0`, `supply = 1`
- `MetadataPointer` initialized before `InitializeMint2`
- metadata address pointing to the NFT mint itself
- `TokenMetadata` stored in the mint account

The SDK creates the mint with MetadataPointer account space and funds rent for the final
TokenMetadata size. The Token-2022 metadata initializer then reallocates the mint to the exact
length needed for the generated `uri`.

## Metadata fields

Required fields are populated on claim:

- `name`: `<meme_symbol> Soul #<sequence>`
- `symbol`: `<meme_symbol>`
- `uri`: `data:application/json;base64,<json>`

`initialize_soul` stores an optional ASCII meme symbol (up to 16 bytes) on the `SoulAccount`.
Claims use that stored symbol so each meme launch has distinct NFT metadata. Older Soul accounts
that do not have a stored symbol fall back to `SOUL`.

The decoded JSON is:

```json
{
  "name": "<meme_symbol> Soul #<sequence>",
  "symbol": "<meme_symbol>",
  "image": "data:image/svg+xml;base64,<svg>"
}
```

The image payload is fully on-chain and base64-decodes to the generated SVG.

## External marketplace boundary

External NFT marketplaces are out of the MVP and current roadmap. SolSoul does not list, trade, route, or operate marketplace flows for Soul NFTs; Souls are claim/view/profile/gallery/rarity-provenance assets inside the product.

Magic Eden and Tensor index Token-2022 support unevenly compared with Metaplex Token Metadata accounts. This implementation aligns with the Token-2022 on-mint metadata interface and the Metaplex-required `name`, `symbol`, and `uri` fields, but does not create a legacy Metaplex metadata PDA.

Known display limitations if a third-party indexer independently discovers a Soul NFT:

- Marketplaces that require legacy Metaplex metadata PDAs may not display these NFTs.
- Some indexers may not render nested `data:` URIs or SVG images immediately.
- Collection verification, royalties, creators, and seller-fee fields are not present in the Token-2022 `TokenMetadata` base fields.
- Local validation reads the on-chain `TokenMetadata` extension and decodes the embedded SVG data URI; it is not a commitment to marketplace listing or trading support.
