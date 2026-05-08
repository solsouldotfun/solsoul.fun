# Performance

Measured on 2026-04-27 from a production app build served with `next start` on localhost and a local Solana validator.

## On-chain compute units

| Instruction | Surface | Compute units | Budget |
| --- | --- | ---: | ---: |
| `generate_soul` | localnet `solana-test-validator` transaction metadata | 7,100 | < 200,000 |

## Lighthouse mobile scores

Command shape: `pnpm --filter app build`, `PORT=3001 pnpm --filter app start`, then `pnpm dlx lighthouse@latest --only-categories=performance --form-factor=mobile`.

| Page | Performance | LCP | FCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/` | 94 | 2.73s | 0.92s | 61ms | 0.090 |
| `/launch` | 92 | 3.36s | 1.13s | 76ms | 0.022 |
| `/token/LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY` | 95 | 2.71s | 0.91s | 93ms | 0.046 |
| `/gallery` | 92 | 3.36s | 1.13s | 41ms | 0.022 |

## Per-page metric detail

| Page | Metric | Value |
| --- | --- | ---: |
| `/` | LCP | 2.73s |
| `/` | FCP | 0.92s |
| `/` | TBT | 61ms |
| `/` | CLS | 0.090 |
| `/launch` | LCP | 3.36s |
| `/launch` | FCP | 1.13s |
| `/launch` | TBT | 76ms |
| `/launch` | CLS | 0.022 |
| `/token/LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY` | LCP | 2.71s |
| `/token/LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY` | FCP | 0.91s |
| `/token/LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY` | TBT | 93ms |
| `/token/LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY` | CLS | 0.046 |
| `/gallery` | LCP | 3.36s |
| `/gallery` | FCP | 1.13s |
| `/gallery` | TBT | 41ms |
| `/gallery` | CLS | 0.022 |

## Follow-up from LCP pass

The first Lighthouse pass met three of four page score targets, but `/launch` scored 66 and the wallet adapter stylesheet loaded a remote Google Font at runtime. The app now uses a local copy of the wallet adapter stylesheet without the remote `@import`, lazy-loads Phantom/Solflare adapters during browser idle time, and slightly reduces above-the-fold mobile text weight. The follow-up pass listed above has every required page above the Performance > 70 target.

The wallet adapter idle-load path uses the DOM `requestIdleCallback` typings supplied by `app/tsconfig.json` via `"lib": ["DOM", "DOM.Iterable", "ESNext"]`, so no local casts are needed around `window.requestIdleCallback`.
