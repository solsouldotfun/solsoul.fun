# Public Devnet Deployment — Vercel + Railway Runbook

This document describes how to deploy the public SolSoul.fun devnet test
environment:

- **Frontend**: Next.js app on Vercel at <https://solsoul-devnet.vercel.app>
- **Indexer**: Node.js log indexer on Railway at
  <https://indexer-production-bf20.up.railway.app>
- **Programs**: Existing devnet deployments
  `HuSRC61oy9qyRDH21sHD8kmkuVsB5Jd9tdJMkbk4zNjQ` (bonding curve) and
  `5wGUMWySAafwgTpGNgSaTMh1kiejnEGVTZj9x7wWJftk` (soul generator)

The public deployment is **devnet-only**. Do not switch these services to
`mainnet-beta` without a separate user-approved mainnet launch.

## Prerequisites

- [Vercel CLI](https://vercel.com/docs/cli) installed (`npm i -g vercel`)
- A Vercel account with a [full-account scope token](https://vercel.com/account/tokens)
- [Railway CLI](https://docs.railway.com/reference/cli) installed if using the
  CLI path (`brew install railway` or `npm i -g @railway/cli`)
- Tokens stored locally:
  - `~/.solsoul/vercel.token` or `~/.solsoul/vercel-auth.json`
  - `~/.solsoul/railway.token`
  - files `chmod 600`, directory `chmod 700`

> **Security**: Never commit, echo, or log Vercel/Railway tokens. Commands read
> tokens into shell variables inside the same subshell that uses them; do not
> globally `export` token values and do not paste token bytes into logs,
> metadata, docs, or handoffs.

For Vercel, use the compatibility loader when either plain token or Vercel auth
JSON may be present:

```bash
if [ -f "$HOME/.solsoul/vercel.token" ]; then
  VTOKEN="$(cat "$HOME/.solsoul/vercel.token")"
else
  VTOKEN="$(python3 -c 'import json, os; print(json.load(open(os.path.expanduser("~/.solsoul/vercel-auth.json")))["token"])')"
fi
```

For Railway, read the token only in the command that needs it:

```bash
RAILWAY_TOKEN="$(cat "$HOME/.solsoul/railway.token")" railway status
```

## Vercel Frontend Deployment

### 1. Project Link / Create

From the `app/` directory:

```bash
vercel link --yes --project solsoul-devnet --token "$(cat ~/.solsoul/vercel.token)"
```

This creates the project if it doesn't exist, or links to the existing one.

### 2. Set Environment Variables

Add each required env var to the Vercel project (production scope):

```bash
vercel env add NEXT_PUBLIC_RPC production --token "$(cat ~/.solsoul/vercel.token)"
# Value: https://api.devnet.solana.com

vercel env add NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID production --token "$(cat ~/.solsoul/vercel.token)"
# Value: HuSRC61oy9qyRDH21sHD8kmkuVsB5Jd9tdJMkbk4zNjQ

vercel env add NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID production --token "$(cat ~/.solsoul/vercel.token)"
# Value: 5wGUMWySAafwgTpGNgSaTMh1kiejnEGVTZj9x7wWJftk

vercel env add NEXT_PUBLIC_ENV production --token "$(cat ~/.solsoul/vercel.token)"
# Value: devnet
```

To verify the env vars are set:

```bash
vercel env ls --token "$(cat ~/.solsoul/vercel.token)"
```

### 3. Deploy to Production

```bash
cd app/
vercel --prod --token "$(cat ~/.solsoul/vercel.token)"
```

The build command (defined in `app/vercel.json`) runs:

```
pnpm install --frozen-lockfile && pnpm --filter sdk build && pnpm --filter app build
```

### 4. Set Custom Alias (if needed)

If the deployment URL is not automatically `solsoul-devnet.vercel.app`:

```bash
vercel alias set <deployment-url> solsoul-devnet.vercel.app --token "$(cat ~/.solsoul/vercel.token)"
```

### 5. Verify Frontend Deployment

```bash
curl -sSI https://solsoul-devnet.vercel.app | head -3
# Expected: HTTP/2 200

curl -sS https://solsoul-devnet.vercel.app | grep -F "DEVNET TESTNET"
# Expected: matches the DevnetBanner text
```

### Frontend Rollback

To roll back to a previous deployment:

```bash
# List recent deployments
vercel ls solsoul-devnet --token "$(cat ~/.solsoul/vercel.token)"

# Promote a specific deployment URL to production
vercel alias set <previous-deployment-url> solsoul-devnet.vercel.app --token "$(cat ~/.solsoul/vercel.token)"
```

Alternatively, use the Vercel dashboard to redeploy a previous git commit.

### Frontend Configuration Reference

The `app/vercel.json` file configures:

| Field | Value |
|---|---|
| `framework` | `nextjs` |
| `buildCommand` | `pnpm install --frozen-lockfile && pnpm --filter sdk build && pnpm --filter app build` |
| `outputDirectory` | `.next` |
| `installCommand` | `pnpm install --frozen-lockfile` |
| `env` | Maps 4 `NEXT_PUBLIC_*` vars to Vercel env via `@` references |

All env values are managed through Vercel's environment variable system (referenced via `@env-name`) and are never committed to the repository.

### SolSoul Branding Policy

Public devnet tokens and Soul displays are SolSoul badge-branded in the UI. The
existing Token-2022 Soul NFT metadata flow also includes JSON `platform` and
`creator` fields set to `SolSoul` where metadata is minted. This branding layer
must not mutate creator-entered names or symbols: do **not** append a forced
`SolSoul` suffix to token names, tickers, or Soul NFT symbols.

## Railway Indexer Deployment

The Railway indexer runs `services/indexer`, subscribes to logs for both public
devnet programs, stores parsed events in SQLite, and exposes `/health` for public
smoke checks.

Current public deployment metadata is recorded in
[`deployments/public-devnet.json`](../deployments/public-devnet.json):

| Field | Value |
| --- | --- |
| Project | `solsoul-indexer-devnet` |
| Service URL | <https://indexer-production-bf20.up.railway.app> |
| Deployment ID | `bfadc750-0dd0-4163-a8fa-af4bf6b87ed5` |
| Expected status | `SUCCESS` |

### Railway Token Caveat

Railway CLI **v4.43.0** may reject otherwise valid account tokens with an auth
failure even when the same token succeeds against Railway GraphQL (`me { email }`)
and direct deployment upload APIs. Do not treat `railway whoami` or
`railway status` failure as the only source of truth for this milestone.

PD.F3/PD.F3b used the direct Railway GraphQL/API fallback to create the current
project/service, upload the indexer source archive, poll deployment status, and
read deployment logs. Prefer CLI when it works; fall back to GraphQL/API when the
CLI token path rejects a valid token.

### Indexer Environment Variables

Set these Railway variables on the production service:

| Variable | Value / Source | Purpose |
| --- | --- | --- |
| `RPC_URL` | `https://api.devnet.solana.com` | Devnet RPC endpoint |
| `BONDING_CURVE_PROGRAM_ID` | `HuSRC61oy9qyRDH21sHD8kmkuVsB5Jd9tdJMkbk4zNjQ` | Program log subscription |
| `SOUL_GENERATOR_PROGRAM_ID` | `5wGUMWySAafwgTpGNgSaTMh1kiejnEGVTZj9x7wWJftk` | Program log subscription |
| `PORT` | Railway-provided | Health server listen port |

Do not set Vercel/Railway tokens as service variables.

### CLI Deploy Path

From `services/indexer/`:

```bash
RAILWAY_TOKEN="$(cat "$HOME/.solsoul/railway.token")" railway init --name solsoul-indexer-devnet

RAILWAY_TOKEN="$(cat "$HOME/.solsoul/railway.token")" railway variables \
  --set RPC_URL=https://api.devnet.solana.com \
  --set BONDING_CURVE_PROGRAM_ID=HuSRC61oy9qyRDH21sHD8kmkuVsB5Jd9tdJMkbk4zNjQ \
  --set SOUL_GENERATOR_PROGRAM_ID=5wGUMWySAafwgTpGNgSaTMh1kiejnEGVTZj9x7wWJftk

RAILWAY_TOKEN="$(cat "$HOME/.solsoul/railway.token")" railway up --detach
```

If the CLI rejects the token, switch to the direct API fallback below rather than
printing or debugging the token value.

### Direct GraphQL/API Fallback Used by PD.F3

Use the Railway GraphQL endpoint at
`https://backboard.railway.com/graphql/v2` with the token read from
`~/.solsoul/railway.token` into an in-memory `Authorization: Bearer ...` header.
The PD.F3 fallback flow was:

1. Query `me` and available workspaces to confirm the token is valid.
2. Create or select project `solsoul-indexer-devnet`.
3. Create service `indexer` and production environment.
4. Configure service instance settings:
   - Dockerfile builder with `services/indexer/Dockerfile`
   - start command `pnpm exec tsx src/main.ts --rpc $RPC_URL --duration-sec 0`
   - healthcheck path `/`
   - restart policy `ON_FAILURE`
5. Set `RPC_URL`, `BONDING_CURVE_PROGRAM_ID`, and
   `SOUL_GENERATOR_PROGRAM_ID`.
6. Upload a source archive containing `services/indexer/`, `package.json`,
   `pnpm-lock.yaml`, and `pnpm-workspace.yaml` to Railway's deployment upload
   endpoint.
7. Poll the deployment until status is `SUCCESS`.
8. Read deployment logs via GraphQL and record only non-secret startup evidence.

The fallback must never log the token, full request headers, or response payloads
that contain credentials.

### Verify Public `/health`

The public health endpoint is the canonical validator-friendly Railway check:

```bash
curl -fsS https://indexer-production-bf20.up.railway.app/health
```

Expected JSON shape:

```json
{"ok":true,"service":"solsoul-indexer","inserted":0,"subscriptions":2}
```

`inserted` may be `0` on a quiet devnet, but `ok` must be `true` and
`subscriptions` must be at least `2`.

### Log and Status Checks

Acceptable Railway evidence includes:

- deployment status `SUCCESS` from GraphQL or CLI
- public domain target port `8080`
- startup log line `[indexer] listening on :8080`
- config log lines for both public devnet program IDs
- two `subscribe ok` lines, one for each program
- `/health` returning `ok=true` and `subscriptions=2`

CLI examples when Railway auth works:

```bash
RAILWAY_TOKEN="$(cat "$HOME/.solsoul/railway.token")" railway status
RAILWAY_TOKEN="$(cat "$HOME/.solsoul/railway.token")" railway logs --json
```

### Railway Redeploy / Rollback

To redeploy the current source with CLI auth:

```bash
cd services/indexer
RAILWAY_TOKEN="$(cat "$HOME/.solsoul/railway.token")" railway up --detach
```

To redeploy through the direct API fallback, repeat the PD.F3 upload flow with a
fresh archive from the desired commit and poll until the replacement deployment is
`SUCCESS`.

For rollback:

1. Identify the previous successful deployment in the Railway dashboard, CLI, or
   GraphQL deployment list.
2. Use the Railway dashboard "Redeploy" action for that deployment, or call the
   Railway redeploy mutation for the selected deployment ID.
3. Re-run `/health` and log checks above.
4. Update `deployments/public-devnet.json` if the public service URL, deployment
   ID, or deploy timestamp changes.

### Known Railway Security Scan Gotcha

Railway's vulnerability scanner can inspect workspace-level files and report a
stale frontend `next@14.2.33` finding even though the indexer service is a Node
process and the app now declares `next@14.2.35`. The current mitigation is:

- `app/package.json` pins `next` to `14.2.35`.
- `services/indexer/Dockerfile` copies only the package metadata and
  `services/indexer/` files needed to build the indexer image.
- If Railway reports `next@14.2.33`, confirm the upload archive includes the
  updated lockfile/source from the current commit and redeploy.

## Architecture Notes

- The frontend is a Next.js 14 App Router application with i18n (`next-intl`).
- The SDK (`sdk/`) is built as a workspace dependency before the app build.
- The `DevnetBanner` component displays a persistent red banner when `NEXT_PUBLIC_ENV=devnet`.
- The banner is always visible in devnet — it is NOT gated behind a feature flag.
- The indexer health server returns `/` and `/health`; validators should prefer
  `/health` for PD.A2.
