# Production RPC Configuration

SolSoul production deployments should use a paid mainnet RPC provider with a secondary fallback. Keep real Helius/Triton API keys and Sentry DSNs out of git; `app/.env.production.example` contains placeholders only.

## Environment template

Use `NEXT_PUBLIC_RPC` for production RPC configuration:

```bash
NEXT_PUBLIC_RPC=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY,https://api.triton.one/your-token
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_ENV=production
NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID=
NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID=
```

The first comma-separated URL is the primary endpoint. The second URL is the fallback endpoint. Program IDs must match the final production deployment record in `deployments/mainnet.json` before mainnet launch.

## Rate-limit handling

RPC providers return HTTP `429` when request volume exceeds the plan limit. Treat repeated `429` responses as a capacity issue, not an app bug:

- Raise provider capacity or reduce polling frequency before launch.
- Prefer Helius or Triton paid plans for production traffic.
- Do not rely on `https://api.mainnet-beta.solana.com` for sustained traffic; it is only a temporary read-only fallback.
- Never log or commit full RPC URLs with API-key query strings.

## Failover pattern

Frontend RPC calls use the thin wrapper in `app/src/lib/rpc.ts`.

1. `getRpcEndpoint()` selects the first `NEXT_PUBLIC_RPC` URL as primary.
2. `getRpcFallbackEndpoint()` selects the second comma-separated URL, when present.
3. The custom fetch wrapper retries exactly once on the fallback URL when the primary returns HTTP `429` or any `5xx`.
4. The wrapper writes a redacted console log with the `[app]` prefix and the HTTP status.
5. If the fallback also fails, the fallback response is returned; there is no retry loop.

This is intentionally simple so wallet-adapter and server-side `Connection` usage share the same behavior without hiding persistent provider outages.
