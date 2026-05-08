# Raydium CP-Swap AMM Integration

> **Historical / deferred reference.** The active SolSoul product now uses an exponential bonding
> curve that runs forever: no graduation, no AMM migration, and no liquidity extraction. This file
> is retained only for legacy adapter evidence, account-decoding context, and future optional
> research unless the product scope is explicitly reopened.

## Program IDs

- Devnet CP-Swap mirror: `CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW`
- Mainnet CP-Swap: `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`

M8 validation uses the devnet mirror and the local `tests/snapshots/raydium-cpmm.so` fixture.

## PDA Derivation

The SDK helper `deriveRaydiumCpSwapPdas(memeMint)` mirrors Raydium CP-Swap seeds:

- `amm_config`: `[b"amm_config", 0_u16.to_be_bytes()]`
- `authority`: `[b"vault_and_lp_mint_auth_seed"]`
- `pool_state`: `[b"pool", amm_config, token_0_mint, token_1_mint]`
- `lp_mint`: `[b"pool_lp_mint", pool_state]`
- `token_{0,1}_vault`: `[b"pool_vault", pool_state, token_{0,1}_mint]`
- `observation_state`: `[b"observation", pool_state]`

`token_0_mint` and `token_1_mint` are sorted lexicographically. One side is native WSOL
(`So11111111111111111111111111111111111111112`), and the other side is the Token-2022 meme mint.

## SDK Account Ordering

`migrateIx({ raydiumAccounts: { creator } })` appends the Raydium remaining accounts after the
legacy 7 SolSoul migrate accounts:

1. creator / payer signer
2. `amm_config`
3. Raydium authority
4. `pool_state`
5. `token_0_mint`
6. `token_1_mint`
7. `lp_mint`
8. creator token-0 account
9. creator token-1 account
10. creator LP token account
11. token-0 vault
12. token-1 vault
13. create-pool fee receiver
14. observation state
15. SPL Token program
16. token-0 program
17. token-1 program
18. Associated Token program
19. System program
20. Rent sysvar
21. Raydium CP-Swap program account

Before migration, the caller must ensure the creator WSOL ATA and meme Token-2022 ATA exist. Raydium
initializes the LP ATA during pool creation.

## Liquidity Split and LP Burn

SolSoul splits graduated reserves with `split_for_lp`: 84% of SOL and 84% of meme reserves seed the
Raydium pool, and the remaining 16% is sent to the configured protocol migration target. The
bonding-curve program funds the creator WSOL/meme token accounts from the vault/curve PDA, invokes
Raydium CP-Swap `initialize`, then burns the LP tokens minted to the creator LP ATA. Raydium's
locked 100 LP units are excluded from the minted creator amount, so the post-burn LP mint supply is
expected to be zero for the initial pool.

## Token-2022 Transfer-Fee Restriction

Raydium CP-Swap supports Token-2022 mints with metadata-related extensions used by SolSoul, but the
M8 adapter rejects meme mints containing `TransferFeeConfig`. The on-chain adapter returns
`ProgramError::Custom(0xA01)` for this case so launch surfaces can block unsupported configurations
before migration.

## Local ProgramTest Coverage

`tests/integration/amm_raydium.rs` keeps two local checks:

- `raydium_snapshot_loads_and_pda_fixture_is_stable` loads the devnet `raydium-cpmm.so` snapshot and
  verifies the committed SHA/PDA fixture.
- `graduation_to_raydium_migrate_seeds_vaults_and_burns_lp` runs a full SolSoul
  create → initialize soul → buy-to-graduation → migrate(target_amm=0) flow through the
  bonding-curve Raydium adapter. ProgramTest cannot bootstrap Raydium's real devnet `amm_config`
  state and fee/config accounts deterministically, so the test registers a minimal Raydium CP-Swap
  mock at the devnet CP-Swap program id after separately proving the snapshot loads. The mock only
  performs the externally observable CP-Swap effects SolSoul depends on: pool state is touched,
  WSOL/meme deposits move into the Raydium vault accounts, LP is minted to the creator LP account,
  and the adapter burns that LP. The assertions then check `pool_state` exists, LP mint supply is
  zero after burn, and both Raydium vault accounts hold the 84% liquidity share.
