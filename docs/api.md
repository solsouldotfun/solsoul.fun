# SolSoul Indexer API

The SolSoul indexer (`services/indexer`) subscribes to on-chain program logs, parses events into a SQLite database, and exposes a REST API for token discovery and Soul provenance.

## Base URL

- **Local**: `http://localhost:8080`
- **Devnet**: `https://indexer-production-bf20.up.railway.app`

## Endpoints

### Health Check

```http
GET /health
```

Response:
```json
{
  "ok": true,
  "service": "solsoul-indexer",
  "inserted": 42,
  "subscriptions": 2
}
```

### List All Tokens

```http
GET /tokens
```

Query parameters:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 50 | Max results |
| `offset` | integer | 0 | Pagination offset |
| `sort` | string | `created_at_desc` | `created_at_desc`, `price_asc`, `price_desc` |

Response:
```json
{
  "tokens": [
    {
      "mint": "Mint11111111111111111111111111111111111111",
      "symbol": "SOUL",
      "name": "Soul Token",
      "creator": "Creator111111111111111111111111111111111111",
      "current_price": "0.000001 SOL/token",
      "cumulative_sol": "150000000000",
      "total_minted": "5000000000000",
      "generation_count": 12,
      "claim_count": 3,
      "created_at": "2026-05-01T12:00:00Z",
      "self_deprecated": false
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

### Get Token Detail

```http
GET /tokens/:mint
```

Response:
```json
{
  "mint": "Mint11111111111111111111111111111111111111",
  "symbol": "SOUL",
  "name": "Soul Token",
  "creator": "Creator111111111111111111111111111111111111",
  "current_price": "0.000001 SOL/token",
  "cumulative_sol": "150000000000",
  "total_minted": "5000000000000",
  "generation_count": 12,
  "claim_count": 3,
  "created_at": "2026-05-01T12:00:00Z",
  "self_deprecated": false,
  "curve_pda": "CurvePDA1111111111111111111111111111111111",
  "vault_pda": "VaultPDA1111111111111111111111111111111111",
  "soul_pda": "SoulPDA11111111111111111111111111111111111"
}
```

### Get Token Generations

```http
GET /tokens/:mint/generations
```

Response:
```json
{
  "generations": [
    {
      "generation": 1,
      "side": "buy",
      "amount": "1000000",
      "trader": "Trader1111111111111111111111111111111111",
      "seed_hash": "abcdef0123456789",
      "slot": "458769366",
      "signature": "Signature111111111111111111111111111111111",
      "created_at": "2026-05-01T12:05:00Z"
    }
  ]
}
```

### Get Token Claims

```http
GET /tokens/:mint/claims
```

Response:
```json
{
  "claims": [
    {
      "sequence": 1,
      "claimer": "Claimer111111111111111111111111111111111",
      "nft_mint": "NftMint111111111111111111111111111111111",
      "generation": 1,
      "claimed_at": "2026-05-01T12:10:00Z"
    }
  ]
}
```

### Get Soul SVG

```http
GET /tokens/:mint/souls/:generation/svg
```

Returns the raw SVG bytes with `Content-Type: image/svg+xml`.

### Search Tokens

```http
GET /tokens/search?q=:query
```

Searches by symbol or name (case-insensitive prefix match).

## WebSocket Events

The indexer emits WebSocket events for real-time updates:

```javascript
const ws = new WebSocket('wss://indexer-production-bf20.up.railway.app/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data.type: 'token_created' | 'generation' | 'claim' | 'buy' | 'sell'
  // data.payload: event-specific data
};
```

## Database Schema

### token_rows

| Column | Type | Description |
|--------|------|-------------|
| `mint` | TEXT PRIMARY KEY | Token mint address |
| `symbol` | TEXT | Token symbol |
| `name` | TEXT | Token name |
| `creator` | TEXT | Launcher pubkey |
| `cumulative_sol` | INTEGER | Total SOL deposited (lamports) |
| `total_minted` | INTEGER | Total tokens minted (base units) |
| `generation_count` | INTEGER | Number of Soul generations |
| `claim_count` | INTEGER | Number of claimed Souls |
| `created_at` | TEXT ISO8601 | Launch timestamp |
| `self_deprecated` | INTEGER | 0 or 1 |

### generation_events

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Auto-increment |
| `token_mint` | TEXT | Foreign key to token_rows |
| `generation` | INTEGER | Generation number |
| `side` | TEXT | "buy" or "sell" |
| `amount` | INTEGER | Trade amount |
| `trader` | TEXT | Trader pubkey |
| `seed_hash` | TEXT | Deterministic seed hash |
| `slot` | INTEGER | Slot number |
| `signature` | TEXT | Transaction signature |
| `created_at` | TEXT ISO8601 | Event timestamp |

### claim_events

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Auto-increment |
| `token_mint` | TEXT | Foreign key to token_rows |
| `sequence` | INTEGER | Claim sequence |
| `claimer` | TEXT | Claimer pubkey |
| `nft_mint` | TEXT | NFT mint address |
| `generation` | INTEGER | Claimed generation |
| `claimed_at` | TEXT ISO8601 | Claim timestamp |

## Error Responses

All errors use the following format:

```json
{
  "error": "description",
  "code": "ERROR_CODE"
}
```

Common codes:
| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `NOT_FOUND` | 404 | Token or resource not found |
| `INVALID_MINT` | 400 | Invalid mint address format |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

*Document version: 2026-05-04*
