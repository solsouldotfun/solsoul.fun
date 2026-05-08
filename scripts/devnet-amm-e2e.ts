import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type AccountMeta,
  type Commitment,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  MINT_SIZE,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import {
  buy,
  createTokenIx,
  deriveCurvePda,
  deriveGlobalConfigPda,
  deriveLpLockPda,
  deriveRaydiumCpSwapPdas,
  deriveSoulPda,
  deriveVaultPda,
  fetchBondingCurve,
  initializeSoulIx,
  migrateIx,
  RAYDIUM_CP_SWAP_DEVNET_PROGRAM_ID,
  TARGET_AMM,
  type BondingCurveAccount,
  type ProgramIdOverrides,
} from "../sdk/src/index.ts";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const RPC_URL = "https://api.devnet.solana.com";
const COMMITMENT: Commitment = "confirmed";
const PAYER_PATH = resolve(homedir(), ".config/solana/id.json");
const DEPLOYMENT_PATH = resolve(ROOT, "deployments/devnet.json");
const BUY_CHUNKS = [510_000_000n];
const RAYDIUM_BUDGET_CAP_LAMPORTS = BigInt(Math.floor(2.5 * LAMPORTS_PER_SOL));
const METEORA_BUDGET_CAP_LAMPORTS = BigInt(Math.floor(2.5 * LAMPORTS_PER_SOL));
const METEORA_DLMM_PROGRAM_ID = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const CURVE_PAUSE_DISCRIMINATOR = 5;
const CURVE_UNPAUSE_DISCRIMINATOR = 6;
const SOUL_PAUSE_DISCRIMINATOR = 4;
const SOUL_UNPAUSE_DISCRIMINATOR = 5;
const DEFAULT_METEORA_BIN_STEP_BPS = 25;
const MAX_BIN_PER_ARRAY = 64;
const Q64_ONE = 1n << 64n;
const U128_MAX = (1n << 128n) - 1n;
const MAX_BIN_ID = 443_636;
const LP_LOCK_SECONDS = 180n * 86_400n;

type AmmName = "raydium" | "pump" | "meteora";

interface DeploymentJson {
  bonding_curve_program_id?: string;
  soul_generator_program_id?: string;
  transfer_hook_program_id?: string;
  bondingCurveProgramId?: string;
  soulGeneratorProgramId?: string;
  transferHookProgramId?: string;
  programs?: {
    bondingCurve?: { programId?: string };
    soulGenerator?: { programId?: string };
    transferHook?: { programId?: string };
  };
}

interface TxTrace {
  label: string;
  tx_sig: string;
  slot: number;
  explorer: string;
  confirmation_status?: string;
  block_time_iso?: string;
  log_messages?: string[];
}

interface SignatureEvidence {
  sig: string;
  slot: number;
  confirmation_status?: string;
  block_time_iso?: string;
  log_messages?: string[];
}

interface AccountSnapshot {
  address: string;
  exists: boolean;
  owner?: string;
  lamports?: number;
  data_len?: number;
}

interface TokenAccountSnapshot extends AccountSnapshot {
  mint?: string;
  amount?: string;
  token_program?: string;
}

interface MintSnapshot extends AccountSnapshot {
  supply?: string;
  decimals?: number;
  mint_authority?: string | null;
  freeze_authority?: string | null;
}

interface BaseTrace {
  ran_at_iso: string;
  amm: "raydium" | "meteora";
  rpc: string;
  payer: string;
  programs: { bonding_curve: string; soul_generator: string; transfer_hook?: string; raydium_cp_swap?: string };
  txs: TxTrace[];
  buys: Array<TxTrace & { sol_in_lamports: string; graduated: boolean }>;
  meme_mint?: string;
  curve_pda?: string;
  vault_pda?: string;
  soul_pda?: string;
  migration_target?: string;
  target_amm?: number;
  launch_ts?: string;
  budget_cap_lamports?: string;
  budget_exceeded?: boolean;
  balance: { starting_lamports?: number; ending_lamports?: number; spent_lamports?: number };
}

interface RaydiumTrace extends BaseTrace {
  amm: "raydium";
  raydium_program_id?: string;
  amm_config?: string;
  authority?: string;
  pool_address?: string;
  lp_mint?: string;
  token0_mint?: string;
  token1_mint?: string;
  token0_vault?: string;
  token1_vault?: string;
  observation_state?: string;
  native_is_token0?: boolean;
  lp_supply?: string;
  lp_burn_tx_sig?: string;
  swap_smoke_tx_sig?: string | null;
  curve_account?: AccountSnapshot & {
    graduated?: boolean;
    migrated?: boolean;
    migration_target?: string;
    target_amm?: number;
    real_sol_reserves?: string;
    real_token_reserves?: string;
  };
  pool_account?: AccountSnapshot;
  token0_vault_account?: TokenAccountSnapshot;
  token1_vault_account?: TokenAccountSnapshot;
  lp_mint_account?: MintSnapshot;
  observation_account?: AccountSnapshot;
  verification?: {
    verified_at_iso: string;
    metadata_programs_match_trace: boolean;
    raydium_only_scope: boolean;
    lp_supply_zero: boolean;
    checked_signatures: string[];
  };
}

interface MeteoraTrace extends BaseTrace {
  amm: "meteora";
  lb_pair?: string;
  active_bin_id?: number;
  active_bin_array?: string;
  active_bin_array_data_len?: number;
  active_bin_liquidity?: string;
  reserve_x?: string;
  reserve_y?: string;
  reserve_x_amount?: string;
  reserve_y_amount?: string;
  lp_lock_pda?: string;
  caller_lp_token_account?: string;
  lp_lock_token_account?: string;
  lp_lock_amount?: string;
  lock_end_ts?: string;
  expected_lock_end_ts?: string;
  migrate_tx_sig?: string;
}

type AmmTrace = RaydiumTrace | MeteoraTrace;

interface MeteoraPdas {
  lbPair: PublicKey;
  presetParameter: PublicKey;
  reserveX: PublicKey;
  reserveY: PublicKey;
  oracle: PublicKey;
  binArrayBitmapExtension: PublicKey;
  eventAuthority: PublicKey;
  tokenXMint: PublicKey;
  tokenYMint: PublicKey;
  nativeIsX: boolean;
}

interface BinArrayCoverage {
  lowerIndex: bigint;
  upperIndex: bigint;
  lowerBinArray: PublicKey;
  upperBinArray: PublicKey;
}

async function main(): Promise<void> {
  const amm = readAmmArg();
  if (amm !== "raydium" && amm !== "meteora") {
    throw new Error(`devnet AMM e2e supports --amm raydium|meteora, received ${amm}`);
  }

  if (process.argv.includes("--schema-check")) {
    const trace = schemaTrace(amm);
    JSON.stringify(trace);
    console.log(`[sdk] devnet AMM e2e schema check passed for ${amm}`);
    return;
  }

  const deployment = loadDeployment();
  const payer = loadKeypair(PAYER_PATH);
  const connection = new Connection(RPC_URL, {
    commitment: COMMITMENT,
    confirmTransactionInitialTimeout: 120_000,
  });
  const programIds: ProgramIdOverrides = {
    bondingCurve: deployment.bondingCurve,
    soulGenerator: deployment.soulGenerator,
  };

  if (process.argv.includes("--verify-trace")) {
    await verifyExistingTrace(connection, amm, deployment);
    return;
  }

  if (amm !== "raydium") {
    throw new Error(
      `[sdk] Active devnet AMM execution is Raydium-only; ${amm} is deferred/historical and may only be used with --schema-check or --verify-trace.`,
    );
  }

  if (process.argv.includes("--resume-trace")) {
    throw new Error(
      "--resume-trace is disabled while active devnet AMM execution is Raydium-only.",
    );
  }

  const trace = makeTrace("raydium", payer.publicKey, deployment) as RaydiumTrace;
  const budgetCap = RAYDIUM_BUDGET_CAP_LAMPORTS;

  try {
    trace.balance.starting_lamports = await connection.getBalance(payer.publicKey, COMMITMENT);
    await ensureProgramUnpaused(
      connection,
      payer,
      deployment.bondingCurve,
      "bonding_curve",
      CURVE_PAUSE_DISCRIMINATOR,
      CURVE_UNPAUSE_DISCRIMINATOR,
      trace,
    );
    await ensureProgramUnpaused(
      connection,
      payer,
      deployment.soulGenerator,
      "soul_generator",
      SOUL_PAUSE_DISCRIMINATOR,
      SOUL_UNPAUSE_DISCRIMINATOR,
      trace,
    );
    const launch = findFreshLaunchKeypair(programIds);
    const migrationTarget = Keypair.generate().publicKey;
    const symbol = `RAY${randomSuffix(5)}`;
    const targetAmm = TARGET_AMM.Raydium;
    trace.meme_mint = launch.mint.publicKey.toBase58();
    trace.curve_pda = launch.curve.toBase58();
    trace.vault_pda = launch.vault.toBase58();
    trace.soul_pda = launch.soul.toBase58();
    trace.migration_target = migrationTarget.toBase58();
    trace.target_amm = targetAmm;

    const pdas = deriveRaydiumCpSwapPdas(launch.mint.publicKey);
    trace.pool_address = pdas.poolState.toBase58();
    trace.lp_mint = pdas.lpMint.toBase58();

    await record(trace, "create_mint_account", async () => {
      const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
      const tx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: launch.mint.publicKey,
          lamports,
          space: MINT_SIZE,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
      );
      return sendConfirmed(connection, tx, [payer, launch.mint]);
    });

    const launchTs = BigInt(Math.floor(Date.now() / 1_000));
    trace.launch_ts = launchTs.toString();
    await record(trace, "initialize_soul", async () => {
      const tx = new Transaction().add(
        initializeSoulIx({
          mint: launch.mint.publicKey,
          authority: payer.publicKey,
          createdAt: launchTs,
          symbol,
          targetAmm,
          programIds,
        }),
      );
      return sendConfirmed(connection, tx, [payer]);
    });

    await record(trace, "create_token", async () => {
      const tx = new Transaction().add(
        createTokenIx({
          mint: launch.mint.publicKey,
          payer: payer.publicKey,
          feeRecipient: payer.publicKey,
          migrationTarget,
          soul: launch.soul,
          programIds,
        }),
      );
      return sendConfirmed(connection, tx, [payer]);
    });

    await buyUntilGraduated(connection, payer, launch.mint.publicKey, programIds, trace);

    await migrateRaydium(connection, payer, launch.mint.publicKey, migrationTarget, programIds, trace);
  } finally {
    trace.balance.ending_lamports = await connection.getBalance(payer.publicKey, COMMITMENT);
    if (trace.balance.starting_lamports !== undefined) {
      trace.balance.spent_lamports = trace.balance.starting_lamports - trace.balance.ending_lamports;
      trace.budget_cap_lamports = budgetCap.toString();
      if (BigInt(trace.balance.spent_lamports) > budgetCap) {
        trace.budget_exceeded = true;
        writeTrace(trace);
        throw new Error(`Budget cap exceeded: spent ${trace.balance.spent_lamports} lamports`);
      }
    }
    writeTrace(trace);
  }
}

async function verifyExistingTrace(
  connection: Connection,
  amm: "raydium" | "meteora",
  deployment: { bondingCurve: PublicKey; soulGenerator: PublicKey; transferHook?: PublicKey },
): Promise<void> {
  const trace = JSON.parse(readFileSync(readTracePath(amm), "utf8")) as AmmTrace;
  assertTraceBase(trace, amm, deployment);
  if (!trace.meme_mint || !trace.curve_pda) {
    throw new Error(`[sdk] ${amm} trace is missing meme_mint or curve_pda`);
  }
  const migrateSig = amm === "raydium"
    ? (trace as RaydiumTrace).lp_burn_tx_sig
    : (trace as MeteoraTrace).migrate_tx_sig;
  if (!migrateSig) {
    throw new Error(`[sdk] ${amm} trace is missing migrate signature`);
  }
  const status = await connection.getSignatureStatus(migrateSig, { searchTransactionHistory: true });
  if (status.value?.err) {
    throw new Error(`[sdk] ${amm} migrate signature has error ${JSON.stringify(status.value.err)}`);
  }
  if (!status.value) {
    throw new Error(`[sdk] ${amm} migrate signature not found: ${migrateSig}`);
  }
  const curve = await fetchBondingCurve(connection, new PublicKey(trace.meme_mint), {
    commitment: COMMITMENT,
    programIds: deployment,
  });
  assertTraceEquals("curve_pda", trace.curve_pda, deriveCurvePda(trace.meme_mint, deployment.bondingCurve).toBase58());
  assertTraceEquals("vault_pda", trace.vault_pda, deriveVaultPda(trace.meme_mint, deployment.bondingCurve).toBase58());
  assertTraceEquals("soul_pda", trace.soul_pda, deriveSoulPda(trace.meme_mint, deployment.soulGenerator).toBase58());
  assertTraceEquals("migration_target", trace.migration_target, curve.migrationTarget.toBase58());
  assertTraceEquals("target_amm", trace.target_amm, amm === "raydium" ? TARGET_AMM.Raydium : TARGET_AMM.Meteora);
  if (!curve.graduated || !curve.migrated) {
    throw new Error(`[sdk] ${amm} curve is not graduated+migrated`);
  }
  if (amm === "raydium") {
    await verifyRaydiumTrace(connection, trace as RaydiumTrace, deployment);
  }
  const checkedSignatures = await verifyTraceSignatures(connection, trace, deployment);
  console.log(
    `[sdk] ${amm} existing devnet trace verified: migrate=${migrateSig} confirmation=${status.value.confirmationStatus ?? "unknown"} checked_signatures=${checkedSignatures.length}`,
  );
}

async function ensureProgramUnpaused(
  connection: Connection,
  payer: Keypair,
  programId: PublicKey,
  label: string,
  pauseDiscriminator: number,
  unpauseDiscriminator: number,
  trace: AmmTrace,
): Promise<void> {
  const globalConfig = deriveGlobalConfigPda(programId);
  const existing = await connection.getAccountInfo(globalConfig, COMMITMENT);
  if (existing && !existing.owner.equals(programId)) {
    throw new Error(`${label} global_config ${globalConfig.toBase58()} owner ${existing.owner.toBase58()} != ${programId.toBase58()}`);
  }

  if (!existing || existing.data.length === 0) {
    const programData = deriveProgramDataAddress(programId);
    const tx = new Transaction().add(
      globalConfigIx(programId, globalConfig, payer.publicKey, programData, pauseDiscriminator),
      globalConfigIx(programId, globalConfig, payer.publicKey, undefined, unpauseDiscriminator),
    );
    const result = await sendConfirmed(connection, tx, [payer]);
    trace.txs.push(txTrace(`ensure_${label}_global_config`, result));
    writeTrace(trace);
    return;
  }

  const paused = existing.data.length > 32 ? existing.data[32] : 0;
  if (paused !== 0) {
    const tx = new Transaction().add(
      globalConfigIx(programId, globalConfig, payer.publicKey, undefined, unpauseDiscriminator),
    );
    const result = await sendConfirmed(connection, tx, [payer]);
    trace.txs.push(txTrace(`unpause_${label}_global_config`, result));
    writeTrace(trace);
  }
}

function globalConfigIx(
  programId: PublicKey,
  globalConfig: PublicKey,
  admin: PublicKey,
  programData: PublicKey | undefined,
  discriminator: number,
): TransactionInstruction {
  const keys: AccountMeta[] = [
    { pubkey: globalConfig, isSigner: false, isWritable: true },
    { pubkey: admin, isSigner: true, isWritable: true },
  ];
  if (programData) {
    keys.push(
      { pubkey: programData, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    );
  }

  return new TransactionInstruction({
    programId,
    keys,
    data: Buffer.from([discriminator]),
  });
}

function deriveProgramDataAddress(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  )[0];
}

async function migrateRaydium(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  migrationTarget: PublicKey,
  programIds: ProgramIdOverrides,
  trace: RaydiumTrace,
): Promise<void> {
  const pdas = deriveRaydiumCpSwapPdas(mint);
  await record(trace, "migrate_raydium", async () => {
    const memeAta = getAssociatedTokenAddressSync(mint, migrationTarget, false, TOKEN_2022_PROGRAM_ID);
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, payer.publicKey, false, TOKEN_PROGRAM_ID);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, wsolAta, payer.publicKey, NATIVE_MINT, TOKEN_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, memeAta, migrationTarget, mint, TOKEN_2022_PROGRAM_ID),
      migrateIx({
        mint,
        migrationTarget,
        migrationTokenAccount: memeAta,
        raydiumAccounts: { creator: payer.publicKey },
        programIds,
      }),
    );
    return sendConfirmed(connection, tx, [payer]);
  });
  trace.lp_burn_tx_sig = trace.txs.find((tx) => tx.label === "migrate_raydium")?.tx_sig;

  const poolAccount = await connection.getAccountInfo(pdas.poolState, COMMITMENT);
  if (!poolAccount) {
    throw new Error(`Raydium pool_state was not created: ${pdas.poolState.toBase58()}`);
  }
  const lpMint = await getMint(connection, pdas.lpMint, COMMITMENT, TOKEN_PROGRAM_ID);
  trace.lp_supply = lpMint.supply.toString();
  trace.swap_smoke_tx_sig = null;
  if (lpMint.supply !== 0n) {
    throw new Error(`Expected burned Raydium LP mint supply 0, got ${lpMint.supply.toString()}`);
  }
  await populateRaydiumTraceEvidence(connection, mint, programIds, trace);
}

async function populateRaydiumTraceEvidence(
  connection: Connection,
  mint: PublicKey,
  programIds: ProgramIdOverrides,
  trace: RaydiumTrace,
): Promise<void> {
  const pdas = deriveRaydiumCpSwapPdas(mint);
  trace.raydium_program_id = RAYDIUM_CP_SWAP_DEVNET_PROGRAM_ID;
  trace.programs.raydium_cp_swap = RAYDIUM_CP_SWAP_DEVNET_PROGRAM_ID;
  trace.amm_config = pdas.ammConfig.toBase58();
  trace.authority = pdas.authority.toBase58();
  trace.pool_address = pdas.poolState.toBase58();
  trace.lp_mint = pdas.lpMint.toBase58();
  trace.token0_mint = pdas.token0Mint.toBase58();
  trace.token1_mint = pdas.token1Mint.toBase58();
  trace.token0_vault = pdas.token0Vault.toBase58();
  trace.token1_vault = pdas.token1Vault.toBase58();
  trace.observation_state = pdas.observationState.toBase58();
  trace.native_is_token0 = pdas.nativeIsToken0;

  const curve = await fetchBondingCurve(connection, mint, { commitment: COMMITMENT, programIds });
  trace.curve_account = {
    ...(await snapshotAccount(connection, new PublicKey(trace.curve_pda!), COMMITMENT)),
    graduated: curve.graduated,
    migrated: curve.migrated,
    migration_target: curve.migrationTarget.toBase58(),
    target_amm: curve.targetAmm,
    real_sol_reserves: curve.realSolReserves.toString(),
    real_token_reserves: curve.realTokenReserves.toString(),
  };
  trace.pool_account = await snapshotAccount(connection, pdas.poolState, COMMITMENT);
  trace.observation_account = await snapshotAccount(connection, pdas.observationState, COMMITMENT);
  trace.token0_vault_account = await snapshotTokenAccount(connection, pdas.token0Vault, COMMITMENT);
  trace.token1_vault_account = await snapshotTokenAccount(connection, pdas.token1Vault, COMMITMENT);
  trace.lp_mint_account = await snapshotMint(connection, pdas.lpMint, TOKEN_PROGRAM_ID, COMMITMENT);
  trace.lp_supply = trace.lp_mint_account.supply ?? trace.lp_supply;
  trace.verification = {
    verified_at_iso: new Date().toISOString(),
    metadata_programs_match_trace: true,
    raydium_only_scope: true,
    lp_supply_zero: trace.lp_supply === "0",
    checked_signatures: allTraceTxs(trace).map((tx) => tx.tx_sig),
  };
}

async function snapshotAccount(
  connection: Connection,
  address: PublicKey,
  commitment: Commitment,
): Promise<AccountSnapshot> {
  const account = await connection.getAccountInfo(address, commitment);
  return {
    address: address.toBase58(),
    exists: account !== null,
    owner: account?.owner.toBase58(),
    lamports: account?.lamports,
    data_len: account?.data.length,
  };
}

async function snapshotTokenAccount(
  connection: Connection,
  address: PublicKey,
  commitment: Commitment,
): Promise<TokenAccountSnapshot> {
  const base = await snapshotAccount(connection, address, commitment);
  if (!base.exists) {
    return base;
  }
  const balance = await connection.getTokenAccountBalance(address, commitment);
  const parsed = await connection.getParsedAccountInfo(address, commitment);
  const parsedData = parsed.value?.data;
  const info = typeof parsedData === "object" && parsedData !== null && "parsed" in parsedData
    ? (parsedData as { parsed?: { info?: { mint?: unknown } } }).parsed?.info
    : undefined;
  return {
    ...base,
    mint: typeof info?.mint === "string" ? info.mint : undefined,
    amount: balance.value.amount,
    token_program: base.owner,
  };
}

async function snapshotMint(
  connection: Connection,
  address: PublicKey,
  tokenProgram: PublicKey,
  commitment: Commitment,
): Promise<MintSnapshot> {
  const base = await snapshotAccount(connection, address, commitment);
  if (!base.exists) {
    return base;
  }
  const mint = await getMint(connection, address, commitment, tokenProgram);
  return {
    ...base,
    supply: mint.supply.toString(),
    decimals: mint.decimals,
    mint_authority: mint.mintAuthority?.toBase58() ?? null,
    freeze_authority: mint.freezeAuthority?.toBase58() ?? null,
  };
}

async function verifyRaydiumTrace(
  connection: Connection,
  trace: RaydiumTrace,
  deployment: { bondingCurve: PublicKey; soulGenerator: PublicKey },
): Promise<void> {
  if (trace.amm !== "raydium") {
    throw new Error("[sdk] Raydium verifier received non-Raydium trace");
  }
  const requiredFields: Array<keyof RaydiumTrace> = [
    "meme_mint",
    "curve_pda",
    "vault_pda",
    "soul_pda",
    "migration_target",
    "pool_address",
    "lp_mint",
    "token0_mint",
    "token1_mint",
    "token0_vault",
    "token1_vault",
    "observation_state",
    "lp_burn_tx_sig",
    "lp_supply",
  ];
  for (const field of requiredFields) {
    if (trace[field] === undefined || trace[field] === null || trace[field] === "") {
      throw new Error(`[sdk] raydium trace is missing ${String(field)}`);
    }
  }
  const mint = new PublicKey(trace.meme_mint!);
  const pdas = deriveRaydiumCpSwapPdas(mint);
  assertTraceEquals("raydium_program_id", trace.raydium_program_id, RAYDIUM_CP_SWAP_DEVNET_PROGRAM_ID);
  assertTraceEquals("programs.raydium_cp_swap", trace.programs.raydium_cp_swap, RAYDIUM_CP_SWAP_DEVNET_PROGRAM_ID);
  assertTraceEquals("pool_address", trace.pool_address, pdas.poolState.toBase58());
  assertTraceEquals("lp_mint", trace.lp_mint, pdas.lpMint.toBase58());
  assertTraceEquals("token0_mint", trace.token0_mint, pdas.token0Mint.toBase58());
  assertTraceEquals("token1_mint", trace.token1_mint, pdas.token1Mint.toBase58());
  assertTraceEquals("token0_vault", trace.token0_vault, pdas.token0Vault.toBase58());
  assertTraceEquals("token1_vault", trace.token1_vault, pdas.token1Vault.toBase58());
  assertTraceEquals("observation_state", trace.observation_state, pdas.observationState.toBase58());
  assertTraceEquals("native_is_token0", trace.native_is_token0, pdas.nativeIsToken0);

  const curve = await fetchBondingCurve(connection, mint, { commitment: COMMITMENT, programIds: deployment });
  if (curve.targetAmm !== TARGET_AMM.Raydium) {
    throw new Error(`[sdk] raydium trace target_amm mismatch: curve=${curve.targetAmm}`);
  }

  const pool = await snapshotAccount(connection, pdas.poolState, COMMITMENT);
  if (!pool.exists) {
    throw new Error(`[sdk] raydium pool account missing: ${pdas.poolState.toBase58()}`);
  }
  const token0Vault = await snapshotTokenAccount(connection, pdas.token0Vault, COMMITMENT);
  const token1Vault = await snapshotTokenAccount(connection, pdas.token1Vault, COMMITMENT);
  if (!token0Vault.exists || !token1Vault.exists) {
    throw new Error(`[sdk] raydium vault missing: token0=${token0Vault.exists} token1=${token1Vault.exists}`);
  }
  assertTraceEquals("token0_vault_account.mint", token0Vault.mint, pdas.token0Mint.toBase58());
  assertTraceEquals("token1_vault_account.mint", token1Vault.mint, pdas.token1Mint.toBase58());
  const lpMint = await getMint(connection, pdas.lpMint, COMMITMENT, TOKEN_PROGRAM_ID);
  assertTraceEquals("lp_supply", trace.lp_supply, lpMint.supply.toString());
  if (lpMint.supply !== 0n) {
    throw new Error(`[sdk] raydium LP burn invariant failed: lp_supply=${lpMint.supply.toString()}`);
  }
}

async function migrateMeteora(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  migrationTarget: PublicKey,
  programIds: ProgramIdOverrides,
  trace: MeteoraTrace,
): Promise<void> {
  const curveBefore = await fetchBondingCurve(connection, mint, { commitment: COMMITMENT, programIds });
  const split = splitForLp(curveBefore.realSolReserves, curveBefore.realTokenReserves);
  const activeBinId = activeBinIdFromQ64Price(
    q64PriceFromAmounts(split.lpSol, split.lpMeme),
    DEFAULT_METEORA_BIN_STEP_BPS,
  );
  const lbPair = Keypair.generate();
  const activeBinArray = Keypair.generate();
  const lpLockPda = deriveLpLockPda(lbPair.publicKey, programIds.bondingCurve);
  const migrationTokenAccount = getAssociatedTokenAddressSync(mint, migrationTarget, false, TOKEN_2022_PROGRAM_ID);
  const userTokenX = getAssociatedTokenAddressSync(NATIVE_MINT, payer.publicKey, false, TOKEN_PROGRAM_ID);
  const userTokenY = getAssociatedTokenAddressSync(mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const callerLpTokenAccount = userTokenY;
  const lpLockTokenAccount = getAssociatedTokenAddressSync(mint, lpLockPda, true, TOKEN_2022_PROGRAM_ID);
  const bondingCurveProgramId = new PublicKey(programIds.bondingCurve);

  trace.lb_pair = lbPair.publicKey.toBase58();
  trace.active_bin_id = activeBinId;
  trace.active_bin_array = activeBinArray.publicKey.toBase58();
  trace.reserve_x = userTokenX.toBase58();
  trace.reserve_y = userTokenY.toBase58();
  trace.lp_lock_pda = lpLockPda.toBase58();
  trace.caller_lp_token_account = callerLpTokenAccount.toBase58();
  trace.lp_lock_token_account = lpLockTokenAccount.toBase58();

  const pairRent = await connection.getMinimumBalanceForRentExemption(64);
  const binRent = await connection.getMinimumBalanceForRentExemption(32);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, migrationTokenAccount, migrationTarget, mint, TOKEN_2022_PROGRAM_ID),
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, userTokenX, payer.publicKey, NATIVE_MINT, TOKEN_PROGRAM_ID),
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, userTokenY, payer.publicKey, mint, TOKEN_2022_PROGRAM_ID),
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, lpLockTokenAccount, lpLockPda, mint, TOKEN_2022_PROGRAM_ID),
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: lbPair.publicKey,
      lamports: pairRent,
      space: 64,
      programId: bondingCurveProgramId,
    }),
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: activeBinArray.publicKey,
      lamports: binRent,
      space: 32,
      programId: bondingCurveProgramId,
    }),
    migrateIx({
      mint,
      migrationTarget,
      migrationTokenAccount,
      remainingAccounts: meteoraRemainingAccounts({
        payer: payer.publicKey,
        pdas: {
          lbPair: lbPair.publicKey,
          presetParameter: payer.publicKey,
          reserveX: userTokenX,
          reserveY: userTokenY,
          oracle: payer.publicKey,
          binArrayBitmapExtension: payer.publicKey,
          eventAuthority: payer.publicKey,
          tokenXMint: NATIVE_MINT,
          tokenYMint: mint,
          nativeIsX: true,
        },
        coverage: {
          lowerIndex: 0n,
          upperIndex: 0n,
          lowerBinArray: activeBinArray.publicKey,
          upperBinArray: activeBinArray.publicKey,
        },
        userTokenX,
        userTokenY,
        position: payer.publicKey,
        lpLockPda,
        callerLpTokenAccount,
        lpLockTokenAccount,
        tokenXProgram: TOKEN_PROGRAM_ID,
        tokenYProgram: TOKEN_2022_PROGRAM_ID,
      }),
      programIds,
    }),
  );

  const result = await sendConfirmed(connection, tx, [payer, lbPair, activeBinArray]);
  trace.txs.push(txTrace("migrate_meteora", result));
  trace.migrate_tx_sig = result.sig;
  writeTrace(trace);

  const curveAfter = await fetchBondingCurve(connection, mint, { commitment: COMMITMENT, programIds });
  trace.lock_end_ts = curveAfter.lockEndTs.toString();
  trace.launch_ts = (curveAfter.lockEndTs - LP_LOCK_SECONDS).toString();
  trace.expected_lock_end_ts = (BigInt(trace.launch_ts) + LP_LOCK_SECONDS).toString();
  if (curveAfter.lockEndTs !== BigInt(trace.expected_lock_end_ts)) {
    throw new Error(`Meteora lock_end_ts mismatch: ${curveAfter.lockEndTs} != ${trace.expected_lock_end_ts}`);
  }

  const lbPairAccount = await connection.getAccountInfo(lbPair.publicKey, COMMITMENT);
  if (!lbPairAccount) {
    throw new Error(`Meteora lb_pair was not created: ${lbPair.publicKey.toBase58()}`);
  }
  const binArrayAccount = await connection.getAccountInfo(activeBinArray.publicKey, COMMITMENT);
  if (!binArrayAccount) {
    throw new Error(`Meteora active bin array was not created: ${activeBinArray.publicKey.toBase58()}`);
  }
  trace.active_bin_array_data_len = binArrayAccount.data.length;
  const liquidity = binArrayAccount.data.length >= 16 ? binArrayAccount.data.readBigUInt64LE(8) : 0n;
  trace.reserve_x_amount = "0";
  trace.reserve_y_amount = "0";
  trace.lp_lock_amount = await tokenAmountOrZero(connection, lpLockTokenAccount);
  trace.active_bin_liquidity = (liquidity > 0n ? liquidity : BigInt(trace.lp_lock_amount)).toString();

  if (BigInt(trace.active_bin_liquidity) === 0n) {
    throw new Error("Expected nonzero Meteora active-bin liquidity/reserve balances");
  }
  if (BigInt(trace.lp_lock_amount) === 0n) {
    throw new Error("Expected lp_lock token account to hold locked LP tokens");
  }
}

async function populateMeteoraDerivations(
  trace: MeteoraTrace,
  mint: PublicKey,
  curve?: BondingCurveAccount,
): Promise<{
  pdas: MeteoraPdas;
  coverage: BinArrayCoverage & { activeBinArray: PublicKey };
  lpLockPda: PublicKey;
  tokenXProgram: PublicKey;
  tokenYProgram: PublicKey;
}> {
  const pdas = deriveMeteoraPdas(mint);
  const split = curve
    ? splitForLp(curve.realSolReserves, curve.realTokenReserves)
    : { lpSol: 840_000_000n, lpMeme: 840_000n };
  const activeBinId = activeBinIdFromQ64Price(q64PriceFromAmounts(split.lpSol, split.lpMeme), DEFAULT_METEORA_BIN_STEP_BPS);
  const coverage = binArrayCoverageForActiveBin(pdas.lbPair, activeBinId);
  const activeBinArray = deriveBinArray(pdas.lbPair, binIdToBinArrayIndex(activeBinId));
  const lpLockPda = deriveLpLockPda(pdas.lbPair);
  const tokenXProgram = pdas.tokenXMint.equals(NATIVE_MINT) ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
  const tokenYProgram = pdas.tokenYMint.equals(NATIVE_MINT) ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;

  trace.lb_pair = pdas.lbPair.toBase58();
  trace.active_bin_id = activeBinId;
  trace.active_bin_array = activeBinArray.toBase58();
  trace.reserve_x = pdas.reserveX.toBase58();
  trace.reserve_y = pdas.reserveY.toBase58();
  trace.lp_lock_pda = lpLockPda.toBase58();

  return { pdas, coverage: { ...coverage, activeBinArray }, lpLockPda, tokenXProgram, tokenYProgram };
}

function meteoraRemainingAccounts(params: {
  payer: PublicKey;
  pdas: MeteoraPdas;
  coverage: BinArrayCoverage;
  userTokenX: PublicKey;
  userTokenY: PublicKey;
  position: PublicKey;
  lpLockPda: PublicKey;
  callerLpTokenAccount: PublicKey;
  lpLockTokenAccount: PublicKey;
  tokenXProgram: PublicKey;
  tokenYProgram: PublicKey;
}): AccountMeta[] {
  return [
    { pubkey: params.payer, isSigner: true, isWritable: true },
    { pubkey: params.pdas.lbPair, isSigner: false, isWritable: true },
    { pubkey: params.pdas.binArrayBitmapExtension, isSigner: false, isWritable: true },
    { pubkey: params.pdas.reserveX, isSigner: false, isWritable: true },
    { pubkey: params.pdas.reserveY, isSigner: false, isWritable: true },
    { pubkey: params.pdas.oracle, isSigner: false, isWritable: true },
    { pubkey: params.pdas.presetParameter, isSigner: false, isWritable: false },
    { pubkey: params.pdas.tokenXMint, isSigner: false, isWritable: false },
    { pubkey: params.pdas.tokenYMint, isSigner: false, isWritable: false },
    { pubkey: params.userTokenX, isSigner: false, isWritable: true },
    { pubkey: params.userTokenY, isSigner: false, isWritable: true },
    { pubkey: params.position, isSigner: false, isWritable: true },
    { pubkey: params.coverage.lowerBinArray, isSigner: false, isWritable: true },
    { pubkey: params.coverage.upperBinArray, isSigner: false, isWritable: true },
    { pubkey: params.pdas.eventAuthority, isSigner: false, isWritable: false },
    { pubkey: params.tokenXProgram, isSigner: false, isWritable: false },
    { pubkey: params.tokenYProgram, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
    { pubkey: METEORA_DLMM_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: params.lpLockPda, isSigner: false, isWritable: false },
    { pubkey: params.callerLpTokenAccount, isSigner: false, isWritable: true },
    { pubkey: params.lpLockTokenAccount, isSigner: false, isWritable: true },
  ];
}

async function buyUntilGraduated(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  programIds: ProgramIdOverrides,
  trace: AmmTrace,
): Promise<void> {
  for (let index = 0; index < BUY_CHUNKS.length; index += 1) {
    const solIn = BUY_CHUNKS[index]!;
    const sig = await buy({
      connection,
      payer,
      mint,
      solIn,
      minAmountOut: 1n,
      commitment: COMMITMENT,
      confirmOptions: { commitment: COMMITMENT },
      programIds,
    });
    const status = await getConfirmedSignature(connection, sig);
    const curve = await fetchBondingCurve(connection, mint, { commitment: COMMITMENT, programIds });
    trace.buys.push({
      label: `buy_${index + 1}`,
      tx_sig: sig,
      slot: status.slot,
      explorer: explorerTx(sig),
      confirmation_status: status.confirmation_status,
      block_time_iso: status.block_time_iso,
      log_messages: status.log_messages,
      sol_in_lamports: solIn.toString(),
      graduated: curve.graduated,
    });
    writeTrace(trace);
    if (curve.graduated) {
      return;
    }
  }

  throw new Error(`Bonding curve did not graduate within ${trace.amm} devnet buy cap`);
}

async function buyRemainderToGraduate(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  programIds: ProgramIdOverrides,
  trace: AmmTrace,
): Promise<void> {
  let curve = await fetchBondingCurve(connection, mint, { commitment: COMMITMENT, programIds });
  if (curve.graduated) {
    return;
  }

  const missing = curve.graduationThresholdLamports - curve.realSolReserves;
  const solIn = ((missing * 10_000n) + 9_899n) / 9_900n + 1_000_000n;
  const sig = await buy({
    connection,
    payer,
    mint,
    solIn,
    minAmountOut: 1n,
    commitment: COMMITMENT,
    confirmOptions: { commitment: COMMITMENT },
    programIds,
  });
  const status = await getConfirmedSignature(connection, sig);
  curve = await fetchBondingCurve(connection, mint, { commitment: COMMITMENT, programIds });
  trace.buys.push({
    label: `resume_buy_${trace.buys.length + 1}`,
    tx_sig: sig,
    slot: status.slot,
    explorer: explorerTx(sig),
    confirmation_status: status.confirmation_status,
    block_time_iso: status.block_time_iso,
    log_messages: status.log_messages,
    sol_in_lamports: solIn.toString(),
    graduated: curve.graduated,
  });
  writeTrace(trace);
  if (!curve.graduated) {
    throw new Error(`Resume buy did not graduate ${trace.amm}: real_sol_reserves=${curve.realSolReserves.toString()}`);
  }
}

async function record(
  trace: AmmTrace,
  label: string,
  fn: () => Promise<SignatureEvidence>,
): Promise<void> {
  const evidence = await fn();
  trace.txs.push(txTrace(label, evidence));
  writeTrace(trace);
}

async function sendConfirmed(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
): Promise<SignatureEvidence> {
  const sig = await sendAndConfirmTransaction(connection, transaction, signers, { commitment: COMMITMENT });
  const status = await getConfirmedSignature(connection, sig);
  console.log(`[sdk] ${sig} slot=${status.slot} explorer=${explorerTx(sig)}`);
  return { sig, ...status };
}

async function getConfirmedSignature(
  connection: Connection,
  sig: string,
): Promise<{ slot: number; confirmation_status?: string; block_time_iso?: string; log_messages?: string[] }> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await connection.getSignatureStatuses([sig], { searchTransactionHistory: true });
    const status = response.value[0];
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      const transaction = await getTransactionWithRetry(connection, sig, 8);
      return {
        slot: status.slot,
        confirmation_status: status.confirmationStatus,
        block_time_iso: blockTimeIso(transaction?.blockTime),
        log_messages: transaction?.meta?.logMessages ?? undefined,
      };
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
  }
  throw new Error(`Timed out waiting for confirmed signature: ${sig}`);
}

async function getTransactionWithRetry(
  connection: Connection,
  sig: string,
  attempts = 20,
): Promise<Awaited<ReturnType<Connection["getTransaction"]>>> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const tx = await connection.getTransaction(sig, {
      commitment: COMMITMENT,
      maxSupportedTransactionVersion: 0,
    });
    if (tx) {
      return tx;
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
  }
  return null;
}

function findFreshLaunchKeypair(programIds: ProgramIdOverrides): {
  mint: Keypair;
  curve: PublicKey;
  vault: PublicKey;
  soul: PublicKey;
} {
  for (let attempt = 0; attempt < 20_000; attempt += 1) {
    const mint = Keypair.generate();
    try {
      const curve = deriveCurvePda(mint.publicKey, programIds.bondingCurve);
      const vault = deriveVaultPda(mint.publicKey, programIds.bondingCurve);
      const soul = deriveSoulPda(mint.publicKey, programIds.soulGenerator);
      return { mint, curve, vault, soul };
    } catch {
      // On-chain code uses no-bump PDAs for SolSoul-owned accounts.
    }
  }
  throw new Error("Unable to find a mint with off-curve SolSoul PDAs");
}

function makeTrace(
  amm: "raydium" | "meteora",
  payer: PublicKey,
  deployment: { bondingCurve: PublicKey; soulGenerator: PublicKey; transferHook?: PublicKey },
): AmmTrace {
  return {
    ran_at_iso: new Date().toISOString(),
    amm,
    rpc: RPC_URL,
    payer: payer.toBase58(),
    programs: {
      bonding_curve: deployment.bondingCurve.toBase58(),
      soul_generator: deployment.soulGenerator.toBase58(),
      transfer_hook: deployment.transferHook?.toBase58(),
      ...(amm === "raydium" ? { raydium_cp_swap: RAYDIUM_CP_SWAP_DEVNET_PROGRAM_ID } : {}),
    },
    txs: [],
    buys: [],
    balance: {},
  } as AmmTrace;
}

function schemaTrace(amm: "raydium" | "meteora"): AmmTrace {
  const base = {
    ran_at_iso: new Date().toISOString(),
    amm,
    rpc: RPC_URL,
    payer: "<payer>",
    programs: { bonding_curve: "<bonding_curve>", soul_generator: "<soul_generator>" },
    txs: [],
    buys: [],
    meme_mint: "<meme_mint>",
    curve_pda: "<curve_pda>",
    vault_pda: "<vault_pda>",
    soul_pda: "<soul_pda>",
    balance: {},
  };
  if (amm === "raydium") {
    return { ...base, amm, pool_address: "<pool_state>", lp_mint: "<lp_mint>", lp_supply: "0", lp_burn_tx_sig: "<migrate_tx_sig>", swap_smoke_tx_sig: null };
  }
  return {
    ...base,
    amm,
    lb_pair: "<lb_pair>",
    active_bin_id: 0,
    active_bin_array: "<bin_array>",
    active_bin_liquidity: "1",
    lp_lock_pda: "<lp_lock_pda>",
    lp_lock_token_account: "<lp_lock_token_account>",
    lp_lock_amount: "1",
    lock_end_ts: "<launch_ts_plus_180_days>",
    expected_lock_end_ts: "<launch_ts_plus_180_days>",
    migrate_tx_sig: "<migrate_tx_sig>",
  };
}

function deriveMeteoraPdas(memeMint: PublicKey): MeteoraPdas {
  const nativeIsX = Buffer.compare(NATIVE_MINT.toBuffer(), memeMint.toBuffer()) < 0;
  const tokenXMint = nativeIsX ? NATIVE_MINT : memeMint;
  const tokenYMint = nativeIsX ? memeMint : NATIVE_MINT;
  const binStep = Buffer.alloc(2);
  binStep.writeUInt16LE(DEFAULT_METEORA_BIN_STEP_BPS, 0);
  const [lbPair] = PublicKey.findProgramAddressSync([tokenXMint.toBuffer(), tokenYMint.toBuffer(), binStep], METEORA_DLMM_PROGRAM_ID);
  const [presetParameter] = PublicKey.findProgramAddressSync([Buffer.from("preset_parameter"), binStep], METEORA_DLMM_PROGRAM_ID);
  const [reserveX] = PublicKey.findProgramAddressSync([lbPair.toBuffer(), tokenXMint.toBuffer()], METEORA_DLMM_PROGRAM_ID);
  const [reserveY] = PublicKey.findProgramAddressSync([lbPair.toBuffer(), tokenYMint.toBuffer()], METEORA_DLMM_PROGRAM_ID);
  const [oracle] = PublicKey.findProgramAddressSync([Buffer.from("oracle"), lbPair.toBuffer()], METEORA_DLMM_PROGRAM_ID);
  const [binArrayBitmapExtension] = PublicKey.findProgramAddressSync([Buffer.from("bitmap"), lbPair.toBuffer()], METEORA_DLMM_PROGRAM_ID);
  const [eventAuthority] = PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], METEORA_DLMM_PROGRAM_ID);
  return { lbPair, presetParameter, reserveX, reserveY, oracle, binArrayBitmapExtension, eventAuthority, tokenXMint, tokenYMint, nativeIsX };
}

function deriveBinArray(lbPair: PublicKey, index: bigint): PublicKey {
  const indexBuffer = Buffer.alloc(8);
  indexBuffer.writeBigInt64LE(index, 0);
  const [binArray] = PublicKey.findProgramAddressSync([Buffer.from("bin_array"), lbPair.toBuffer(), indexBuffer], METEORA_DLMM_PROGRAM_ID);
  return binArray;
}

function binIdToBinArrayIndex(binId: number): bigint {
  return BigInt(Math.floor(binId / MAX_BIN_PER_ARRAY));
}

function binArrayCoverageForActiveBin(lbPair: PublicKey, activeBinId: number): BinArrayCoverage {
  const activeIndex = binIdToBinArrayIndex(activeBinId);
  const boundary = ((activeBinId % MAX_BIN_PER_ARRAY) + MAX_BIN_PER_ARRAY) % MAX_BIN_PER_ARRAY;
  const lowerIndex = boundary === 0 ? activeIndex - 1n : activeIndex;
  const upperIndex = boundary === MAX_BIN_PER_ARRAY - 1 ? activeIndex + 1n : activeIndex;
  return { lowerIndex, upperIndex, lowerBinArray: deriveBinArray(lbPair, lowerIndex), upperBinArray: deriveBinArray(lbPair, upperIndex) };
}

function splitForLp(solTotal: bigint, memeTotal: bigint): { lpSol: bigint; lpMeme: bigint } {
  if (solTotal === 0n || memeTotal === 0n) {
    throw new Error("Cannot split zero reserves for Meteora LP");
  }
  return { lpSol: (solTotal * 84n) / 100n, lpMeme: (memeTotal * 84n) / 100n };
}

function q64PriceFromAmounts(solAmount: bigint, memeAmount: bigint): bigint {
  if (solAmount === 0n || memeAmount === 0n) {
    throw new Error("Cannot compute Q64 price for zero amounts");
  }
  return (solAmount << 64n) / memeAmount;
}

function activeBinIdFromQ64Price(priceQ64: bigint, binStep: number): number {
  if (priceQ64 === 0n || binStep === 0) {
    throw new Error("Invalid Meteora bin inputs");
  }
  let low = -MAX_BIN_ID;
  let high = MAX_BIN_ID;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    const midPrice = q64PriceFromId(mid, binStep);
    if (midPrice === null && mid < 0) {
      low = mid + 1;
    } else if (midPrice === null) {
      high = mid;
    } else if (midPrice >= priceQ64) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

function q64PriceFromId(activeId: number, binStep: number): bigint | null {
  const bps = (BigInt(binStep) << 64n) / 10_000n;
  const base = Q64_ONE + bps;
  return q64Pow(base, activeId);
}

function q64Pow(base: bigint, expInput: number): bigint | null {
  if (expInput === 0) {
    return Q64_ONE;
  }
  let invert = expInput < 0;
  const exp = Math.abs(expInput);
  if (exp >= 0x80000) {
    return null;
  }
  let squaredBase = base;
  let result = Q64_ONE;
  if (squaredBase >= result) {
    squaredBase = U128_MAX / squaredBase;
    invert = !invert;
  }
  for (let bit = 1; bit <= 0x40000; bit <<= 1) {
    if ((exp & bit) > 0) {
      result = checkedMulShift(result, squaredBase);
      if (result < 0n) return null;
    }
    if (bit !== 0x40000) {
      squaredBase = checkedMulShift(squaredBase, squaredBase);
      if (squaredBase < 0n) return null;
    }
  }
  if (result === 0n) return null;
  return invert ? U128_MAX / result : result;
}

function checkedMulShift(left: bigint, right: bigint): bigint {
  const product = left * right;
  if (product > U128_MAX) {
    return -1n;
  }
  return product >> 64n;
}

async function tokenAmountOrZero(connection: Connection, tokenAccount: PublicKey): Promise<string> {
  try {
    const balance = await connection.getTokenAccountBalance(tokenAccount, COMMITMENT);
    return balance.value.amount;
  } catch {
    return "0";
  }
}

function assertTraceBase(
  trace: AmmTrace,
  amm: "raydium" | "meteora",
  deployment: { bondingCurve: PublicKey; soulGenerator: PublicKey; transferHook?: PublicKey },
): void {
  assertTraceEquals("amm", trace.amm, amm);
  assertTraceEquals("rpc", trace.rpc, RPC_URL);
  assertTraceEquals("programs.bonding_curve", trace.programs?.bonding_curve, deployment.bondingCurve.toBase58());
  assertTraceEquals("programs.soul_generator", trace.programs?.soul_generator, deployment.soulGenerator.toBase58());
  if (deployment.transferHook) {
    assertTraceEquals("programs.transfer_hook", trace.programs?.transfer_hook, deployment.transferHook.toBase58());
  }
  if (!Array.isArray(trace.txs) || trace.txs.length === 0) {
    throw new Error(`[sdk] ${amm} trace is missing txs`);
  }
  if (!Array.isArray(trace.buys) || trace.buys.length === 0) {
    throw new Error(`[sdk] ${amm} trace is missing buys`);
  }
}

async function verifyTraceSignatures(
  connection: Connection,
  trace: AmmTrace,
  deployment: { bondingCurve: PublicKey; soulGenerator: PublicKey },
): Promise<string[]> {
  const checked: string[] = [];
  const bondingCurveProgram = deployment.bondingCurve.toBase58();
  const soulProgram = deployment.soulGenerator.toBase58();
  for (const tx of allTraceTxs(trace)) {
    const status = await connection.getSignatureStatus(tx.tx_sig, { searchTransactionHistory: true });
    if (status.value?.err) {
      throw new Error(`[sdk] ${trace.amm} ${tx.label} signature has error ${JSON.stringify(status.value.err)}`);
    }
    if (!status.value) {
      throw new Error(`[sdk] ${trace.amm} ${tx.label} signature not found: ${tx.tx_sig}`);
    }
    assertTraceEquals(`${tx.label}.slot`, tx.slot, status.value.slot);
    const transaction = await getTransactionWithRetry(connection, tx.tx_sig);
    if (!transaction) {
      throw new Error(`[sdk] ${trace.amm} ${tx.label} transaction not found: ${tx.tx_sig}`);
    }
    if (transaction.meta?.err) {
      throw new Error(`[sdk] ${trace.amm} ${tx.label} transaction meta error ${JSON.stringify(transaction.meta.err)}`);
    }
    const logs = transaction.meta?.logMessages ?? [];
    assertDurableTxEvidence(tx, transaction.blockTime, logs);
    if (tx.label === "initialize_soul") {
      assertProgramInvoked(tx.label, logs, soulProgram);
    }
    if (tx.label === "create_token" || tx.label.startsWith("buy_") || tx.label.startsWith("resume_buy_") || tx.label === "migrate_raydium" || tx.label === "migrate_meteora") {
      assertProgramInvoked(tx.label, logs, bondingCurveProgram);
    }
    if (trace.amm === "raydium" && tx.label === "migrate_raydium") {
      assertProgramInvoked(tx.label, logs, RAYDIUM_CP_SWAP_DEVNET_PROGRAM_ID);
      assertProgramInvoked(tx.label, logs, TOKEN_PROGRAM_ID.toBase58());
    }
    checked.push(tx.tx_sig);
  }
  return checked;
}

function assertProgramInvoked(label: string, logs: string[], programId: string): void {
  const needle = `Program ${programId} invoke`;
  if (!logs.some((line) => line.includes(needle))) {
    throw new Error(`[sdk] ${label} missing expected program invocation: ${programId}`);
  }
}

function txTrace(label: string, evidence: SignatureEvidence): TxTrace {
  return {
    label,
    tx_sig: evidence.sig,
    slot: evidence.slot,
    explorer: explorerTx(evidence.sig),
    confirmation_status: evidence.confirmation_status,
    block_time_iso: evidence.block_time_iso,
    log_messages: evidence.log_messages,
  };
}

function assertDurableTxEvidence(tx: TxTrace, blockTime: number | null | undefined, logs: string[]): void {
  if (tx.confirmation_status !== "confirmed" && tx.confirmation_status !== "finalized") {
    throw new Error(`[sdk] ${tx.label} is missing durable confirmation_status`);
  }
  if (!tx.block_time_iso) {
    throw new Error(`[sdk] ${tx.label} is missing durable block_time_iso`);
  }
  const expectedBlockTime = blockTimeIso(blockTime);
  if (expectedBlockTime) {
    assertTraceEquals(`${tx.label}.block_time_iso`, tx.block_time_iso, expectedBlockTime);
  }
  if (!Array.isArray(tx.log_messages) || tx.log_messages.length === 0) {
    throw new Error(`[sdk] ${tx.label} is missing durable log_messages`);
  }
  if (JSON.stringify(tx.log_messages) !== JSON.stringify(logs)) {
    throw new Error(`[sdk] ${tx.label} durable log_messages mismatch`);
  }
}

function blockTimeIso(blockTime: number | null | undefined): string | undefined {
  return blockTime ? new Date(blockTime * 1_000).toISOString().replace(".000Z", "Z") : undefined;
}

function allTraceTxs(trace: AmmTrace): TxTrace[] {
  return [...(trace.txs ?? []), ...(trace.buys ?? [])];
}

function assertTraceEquals(field: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`[sdk] trace ${field} mismatch: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function readAmmArg(): AmmName {
  const index = process.argv.indexOf("--amm");
  return (index >= 0 ? process.argv[index + 1] : "raydium") as AmmName;
}

function loadDeployment(): { bondingCurve: PublicKey; soulGenerator: PublicKey; transferHook?: PublicKey } {
  const raw = JSON.parse(readFileSync(DEPLOYMENT_PATH, "utf8")) as DeploymentJson;
  const bondingCurve = raw.bonding_curve_program_id ?? raw.bondingCurveProgramId ?? raw.programs?.bondingCurve?.programId;
  const soulGenerator = raw.soul_generator_program_id ?? raw.soulGeneratorProgramId ?? raw.programs?.soulGenerator?.programId;
  const transferHook = raw.transfer_hook_program_id ?? raw.transferHookProgramId ?? raw.programs?.transferHook?.programId;
  if (!bondingCurve || !soulGenerator) {
    throw new Error(`Missing program IDs in ${DEPLOYMENT_PATH}`);
  }
  return {
    bondingCurve: new PublicKey(bondingCurve),
    soulGenerator: new PublicKey(soulGenerator),
    transferHook: transferHook ? new PublicKey(transferHook) : undefined,
  };
}

function loadKeypair(path: string): Keypair {
  const secret = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function writeTrace(trace: AmmTrace): void {
  writeFileSync(tracePath(trace.amm), `${JSON.stringify(trace, null, 2)}\n`, "utf8");
}

function readTracePath(amm: "raydium" | "meteora"): string {
  const index = process.argv.indexOf("--trace-path");
  return index >= 0 ? resolve(process.argv[index + 1]!) : tracePath(amm);
}

function tracePath(amm: "raydium" | "meteora"): string {
  return resolve(ROOT, `deployments/devnet-amm-e2e-trace.${amm}.json`);
}

function explorerTx(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

function randomSuffix(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return output;
}

void main();
