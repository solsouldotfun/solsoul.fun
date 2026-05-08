# Mainnet Risk Assessment

This document records SolSoul.fun mainnet-readiness risks for historical/deferred Raydium AMM research and other deferred AMM notes. It is not an audit report and must be read together with [`docs/mainnet-dry-run.md`](mainnet-dry-run.md).

**AUDIT NOT DONE — proceed at your own risk.**

## Scope

- Current AMM path: none; the product is curve-only with no graduation or AMM migration.
- Historical / deferred research only: Raydium CP-Swap (`target_amm=0`).
- Deferred / historical research only: PumpSwap (`target_amm=1`) and Meteora DLMM (`target_amm=2`).
- Mainnet deployment and all mainnet writes remain a user decision.

## Historical/deferred Raydium CP-Swap risk table

| Resource at risk | Likelihood (high/med/low) | Impact (high/med/low) | Mitigation | Audit-required-Y/N |
| --- | --- | --- | --- | --- |
| Curve SOL vault during 84% LP seeding | med | high | Re-run the Raydium devnet trace against the approved commit, confirm `pool_state`, vault balances, and LP supply before opening public launches. | Y |
| Meme mint supply and Token-2022 compatibility | med | med | Keep the adapter-side `TransferFeeConfig` rejection in place and block unsupported mint extensions in launch UI before graduation. | Y |
| LP ownership after migration | low | high | Confirm LP mint supply is zero after the burn path, and require an operator checklist item for every Raydium migrate transaction. | Y |
| Program/account ordering in SDK `migrateIx` remaining accounts | med | high | Freeze SDK account-order fixtures and run `pnpm --filter sdk test` plus a full schema check before mainnet build approval. | Y |
| Devnet budget / operator funding assumptions | high | med | Treat the M8.F2 overrun as an operational warning; pre-fund a dedicated mainnet keypair only after final fee and rent estimates are reviewed. | N |
| Raydium governance/config account assumptions | med | high | Rehearse against known Raydium mainnet config accounts using a tiny test mint before allowing untrusted launches. | Y |

## Deferred PumpSwap research risk notes

PumpSwap is not part of the current execution scope. These notes preserve historical validation context only.

| Resource at risk | Likelihood (high/med/low) | Impact (high/med/low) | Mitigation | Audit-required-Y/N |
| --- | --- | --- | --- | --- |
| Creator LP allocation under Pump default 84% burn / 16% creator rule | med | high | If PumpSwap research is reactivated, verify the creator / `SoulAccount.authority` account receives only the expected 16% LP share in local snapshot tests before any user-approved mainnet rehearsal. | Y |
| PumpSwap program binary compatibility | med | high | Re-dump the mainnet PumpSwap program, compare SHA256 with the committed fixture, and stop if the program upgraded. | Y |
| Local-only verification gap | high | high | If PumpSwap research is reactivated, inspect a current mainnet PumpSwap transaction before any user-approved tiny-value rehearsal. | Y |
| PumpSwap global config and PDA derivation | med | high | Keep canonical bumped PDA tests and preload/verify config account data before each local rehearsal. | Y |
| Local validator cleanup / artifact hygiene | med | med | After `scripts/local-pumpswap-e2e.ts`, rebuild default non-devnet SBF artifacts before any final validation or build-hash capture. | N |
| Mainnet write exposure from first real PumpSwap CPI | med | high | Keep PumpSwap disabled unless the user explicitly reopens this scope; require pause authority and monitoring before any future rehearsal. | Y |

## Deferred Meteora DLMM research risk notes

Meteora is not part of the current execution scope. These notes preserve historical validation context only.

| Resource at risk | Likelihood (high/med/low) | Impact (high/med/low) | Mitigation | Audit-required-Y/N |
| --- | --- | --- | --- | --- |
| First real Meteora CPI because devnet `preset_parameter` was unavailable | high | med | If Meteora research is reactivated, rehearse on a known-good tiny mainnet test mint only after explicit user approval. | Y |
| DLMM position NFT / lock custody semantics | high | high | **MUST-FIX-BEFORE-MAINNET**: replace fungible-LP transfer semantics with DLMM position-NFT initialization, deposit, and transfer-to-lock semantics. | Y |
| Active bin / bin array price math | med | high | Re-run Q64.64 bin math fixtures, assert bin-array coverage for boundary bins, and cap migrate if derived accounts differ from SDK output. | Y |
| Six-month LP lock release authority | med | high | If Meteora research is reactivated, rotate upgrade authority to multisig, test pause/unpause and release gates via multisig, and verify `lock_end_ts` before any Meteora launch. | Y |
| `preset_parameter` / LB pair account availability on mainnet | med | high | If Meteora research is reactivated, query the exact mainnet preset and pair PDAs during its dry-run; stop if any required account is uninitialized or owned by an unexpected program. | Y |
| Devnet receipt-path divergence from production code | high | med | If Meteora research is reactivated, build production artifacts without `--features devnet`, verify SHA256, and run a throwaway 0.01 SOL mainnet rehearsal before any Meteora launch. | Y |

## Known issues

1. **Meteora devnet `preset_parameter` unavailable** — flagged by **M9.F3**. The real DLMM CPI was
   not exercised on devnet because Meteora has no initialized `preset_parameter` accounts on devnet
   for common bin steps `1/2/5/10/20/25/50/80/100/200/400` bps. SolSoul shipped a
   `--features devnet` receipt-path workaround. Because Meteora is deferred, SolSoul should not run
   `migrate(target_amm=2)` unless the user explicitly reopens that scope. Risk if reactivated:
   **HIGH likelihood / MED impact**. Mitigation: rehearse on a known-good mainnet test mint with
   tiny LP only after explicit user approval. Cross-reference:
   mission library `library/amm-integration-notes.md` §13 and [`docs/amm-meteora.md`](amm-meteora.md).

2. **Meteora DLMM position-NFT vs fungible-LP mismatch** — flagged by **scrutiny-validator-M9** at
   `programs/bonding-curve/src/amm/meteora.rs` around lines 489, 533-537, and 647-662. The
   production non-`devnet` path currently asserts `caller_lp_token_account.mint == lb_pair` and
   SPL-transfers a fungible LP balance, but DLMM positions are NFTs rather than fungible SPL LP
   tokens. Risk: **HIGH likelihood / HIGH impact, MUST-FIX-BEFORE-MAINNET**. Mitigation: replace
   fungible-LP semantics in `seed_liquidity` and `transfer_lp_to_lock` with DLMM position-NFT
   semantics (`initialize_position` + deposit-to-position + transfer position NFT to
   `lp_lock_pda`) before any future Meteora mainnet launch.

3. **Raydium devnet 0.084 SOL budget overrun** — flagged by **M8.F2**. The successful Raydium
   devnet trace spent about `1.584169` SOL against a `1.5` SOL cap, a `0.084169` SOL overrun.
   Risk: **HIGH likelihood / MED impact** for operator budgeting and dry-run cost estimates.
   Mitigation: re-estimate mainnet rent/fees from fresh account lists and require an operator
   funding review before the dedicated mainnet keypair receives SOL.

4. **PumpSwap local-only verification** — flagged by **M10**. PumpSwap has no devnet write path in
   this mission; validation used a local validator loaded with a mainnet program snapshot, so no
   devnet or mainnet write path was exercised before launch. Risk: **HIGH likelihood / HIGH impact**.
   Mitigation if reactivated: re-dump and hash-check the mainnet PumpSwap binary, inspect a current
   mainnet transaction shape, and run only a tiny-value user-approved mainnet test mint before any
   public access.

5. **Audit deferred by mission scope** — flagged by **M13.F2** and the mainnet dry-run runbook.
   The mainnet runbook is explicit that audit work is deferred and every mainnet write is gated by
   `[USER DECISION REQUIRED]`. Risk: **HIGH likelihood / HIGH impact** if operators treat readiness
   evidence as an audit substitute. Mitigation: commission audit before public launch and publish a
   risk disclosure that states audit status plainly.

## Pre-mainnet checklist

- [ ] commission audit.
- [ ] rotate upgrade authority to multisig.
- [ ] enable Sentry DSN.
- [ ] switch RPC to Helius/Triton.
- [ ] review ToS legally.
- [ ] set up monitoring alerts.
- [ ] fund mainnet keypair from secure source.
- [ ] verify program SHA256 matches build.
- [ ] test pause+unpause on mainnet via multisig.
- [ ] announce launch + risk disclosure.
- [ ] do not run Raydium, PumpSwap, or Meteora launch/migration tests unless AMM scope is explicitly reopened.
- [ ] keep PumpSwap and Meteora disabled/deferred unless the user explicitly reopens that scope.
- [ ] confirm launch pages state that AMM migration is inactive/deferred.
