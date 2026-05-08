import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  type AccountMeta,
  type Commitment,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getOrCreateAssociatedTokenAccount,
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
  deriveSoulPda,
  deriveVaultPda,
  fetchBondingCurve,
  initializeSoulIx,
  migrateIx,
  TARGET_AMM,
  type ProgramIdOverrides,
} from "../sdk/src/index.ts";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const RPC_URL = "http://127.0.0.1:8899";
const COMMITMENT: Commitment = "confirmed";
const PUMPSWAP_PROGRAM_ID = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
const PUMPSWAP_GLOBAL_CONFIG = new PublicKey("ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw");
const PUMPSWAP_GLOBAL_CONFIG_LAMPORTS = 8_986_091;
const PUMPSWAP_GLOBAL_CONFIG_DATA =
  "lQicyqD8sNnTu4yrNBzgUoRX8sOBfTJ4RBlj3NVf7Vi6JMmZ3awCqhQAAAAAAAAABQAAAAAAAAAASsL40N1cvJfjKJwZfLUGKlTz2Va5zm5RFfllZ6pcs+ZgjMwd/OlhtDt3nBkVBabi079F1aTbRhitdsgtYXVFNWODcwAOoiyyZNNK/2SgS176v7t03c0EiZexmBVH19EQg4R0KS5nWpS0NuywqZiJQjKKg93GIzgClhJnxc1hF8uNGBoMhJ+pN6bzSt7TCB75VwCqywybs9kJpLkUdSek69eqj7Bg2CkbTE1HXa/3Yslr3A2s6zbAEurRLtOpSEFh4ATIfOuY+lzkf4A4Bv0seUXSlSSVmuwA3tl4FPOPeEb/g4OBi6j6KMPNO21ek/n6uPCXm8NyFazFskaHe6jDyQUAAAAAAAAAByFdmUB5NpThFgZs5Fm4GP35u6DHtBt4P6OhIMpBlTKii1/SarR5pqnMbL9rCyPrYYhaNx4BIKypE77vPROKeOiTFB+xjp8VdNgQ4XjhnjBgTjF1qi5KMt/IYAcn0QcJATWEU2JWCU+RKBkSfvpORGtDM3IXk9E4dvmq2/PcfQtfbnUBgiD5QmdwAyN7TWtFN1m0pcaQtZw12bsYegkMvSozmHqeuxNnmatZklsT5dyLMIHfAF20J8FHj6Rv+MNHoHTpVD8+N6LQRiJ63ctOnHdMRCWMQ+3ySqiq4fACFGZb2kw4zW23Q49ZtAi7nsO0yp6K0fHyRlPEmbV5bCDb+bMt3Z7qPzmzchFccYR8GEXPpTbGhQdOAw5E0CHePvnjXEy3gPCO4v7oS+xEald4Jdpo1Dn6il2jsMXP9Q9j9FRrAQ==";
const PUMPSWAP_POOL_INDEX = 0;
const VALIDATOR_TIMEOUT_MS = 90_000;
const PAYER_AIRDROP_LAMPORTS = 5 * LAMPORTS_PER_SOL;
const DEPLOYER_AIRDROP_LAMPORTS = 20 * LAMPORTS_PER_SOL;
const BUY_CHUNKS = [510_000_000n];

interface TxTrace {
  label: string;
  tx_sig: string;
  slot: number;
}

interface PumpTrace {
  mode: "m10-f3-local-pumpswap-e2e";
  ran_at_iso: string;
  rpc: string;
  validator_pid?: number;
  pumpswap_program_id: string;
  bonding_curve_program_id?: string;
  soul_generator_program_id?: string;
  snapshot_sha256: string;
  payer: string;
  meme_mint?: string;
  curve_pda?: string;
  vault_pda?: string;
  soul_pda?: string;
  target_amm: number;
  graduation_threshold_lamports?: string;
  pool_address?: string;
  lp_mint?: string;
  creator_lp_ata?: string;
  observed_lp_burned?: string;
  expected_lp_burned?: string;
  expected_creator_lp?: string;
  observed_lp_supply?: string;
  observed_creator_lp?: string;
  pool_exists?: boolean;
  txs: TxTrace[];
  buys: Array<TxTrace & { sol_in_lamports: string; cumulative_sol_raised: string; graduated: boolean }>;
  cleanup: {
    validator_stopped: boolean;
    lsof_8899_empty?: boolean;
  };
}

interface LaunchAddresses {
  mint: Keypair;
  curve: PublicKey;
  vault: PublicKey;
  soul: PublicKey;
}

interface PumpPdas {
  pool: PublicKey;
  lpMint: PublicKey;
  eventAuthority: PublicKey;
  userBaseTokenAccount: PublicKey;
  userQuoteTokenAccount: PublicKey;
  userPoolTokenAccount: PublicKey;
  poolBaseTokenAccount: PublicKey;
  poolQuoteTokenAccount: PublicKey;
}

async function main(): Promise<void> {
  if (process.env.SOLSOUL_ENABLE_DEFERRED_PUMPSWAP_RESEARCH !== "1") {
    throw new Error(
      "[sdk] PumpSwap local snapshot execution is deferred/historical while SolSoul active AMM scope is Raydium-only. A future scoped feature must explicitly re-enable this research path and SDK non-Raydium target construction before running it.",
    );
  }

  const snapshot = join(ROOT, "tests/snapshots/pumpswap.so");
  const snapshotSha = join(ROOT, "tests/snapshots/pumpswap.sha256.txt");
  assertExists(snapshot);
  assertExists(snapshotSha);

  console.log("[pump] building SBF programs with local graduation threshold");
  run("cargo", ["build-sbf", "--workspace"]);

  const bondingSo = join(ROOT, "target/deploy/bonding_curve.so");
  const soulSo = join(ROOT, "target/deploy/soul_generator.so");
  const bondingKeypair = join(ROOT, "target/deploy/bonding_curve-keypair.json");
  const soulKeypair = join(ROOT, "target/deploy/soul_generator-keypair.json");
  assertExists(bondingSo);
  assertExists(soulSo);
  assertExists(bondingKeypair);
  assertExists(soulKeypair);

  const bondingProgramId = keypairPubkey(bondingKeypair);
  const soulProgramId = keypairPubkey(soulKeypair);
  const programIds: ProgramIdOverrides = { bondingCurve: bondingProgramId, soulGenerator: soulProgramId };
  const snapshotHash = readFileSync(snapshotSha, "utf8").trim().split(/\s+/)[0] ?? "";
  const payer = Keypair.generate();
  const trace: PumpTrace = {
    mode: "m10-f3-local-pumpswap-e2e",
    ran_at_iso: new Date().toISOString(),
    rpc: RPC_URL,
    pumpswap_program_id: PUMPSWAP_PROGRAM_ID.toBase58(),
    bonding_curve_program_id: bondingProgramId.toBase58(),
    soul_generator_program_id: soulProgramId.toBase58(),
    snapshot_sha256: snapshotHash,
    payer: payer.publicKey.toBase58(),
    target_amm: TARGET_AMM.Pump,
    txs: [],
    buys: [],
    cleanup: { validator_stopped: false },
  };

  mkdirSync(join(ROOT, "deployments"), { recursive: true });
  const workDir = mkdtempSync(join(tmpdir(), "solsoul-pumpswap-"));
  const ledgerDir = join(workDir, "ledger");
  const accountDir = join(workDir, "accounts");
  mkdirSync(accountDir, { recursive: true });
  const globalConfigDump = join(accountDir, "pumpswap-global-config.json");
  const bondingGlobalConfigDump = join(accountDir, "bonding-global-config.json");
  const soulGlobalConfigDump = join(accountDir, "soul-global-config.json");
  writeAccountDump(globalConfigDump, {
    pubkey: PUMPSWAP_GLOBAL_CONFIG,
    owner: PUMPSWAP_PROGRAM_ID,
    lamports: PUMPSWAP_GLOBAL_CONFIG_LAMPORTS,
    dataBase64: PUMPSWAP_GLOBAL_CONFIG_DATA,
  });
  writeGlobalConfigDump(bondingGlobalConfigDump, bondingProgramId, payer.publicKey);
  writeGlobalConfigDump(soulGlobalConfigDump, soulProgramId, payer.publicKey);

  let validator: ChildProcessWithoutNullStreams | undefined;
  let connection: Connection | undefined;
  const cleanup = async (): Promise<void> => {
    if (connection) {
      closeConnection(connection);
      connection = undefined;
    }
    if (validator) {
      await stopValidator(validator);
      validator = undefined;
      trace.cleanup.validator_stopped = true;
    }
    trace.cleanup.lsof_8899_empty = await assertPort8899Empty();
    writeTrace(trace);
    rmSync(workDir, { recursive: true, force: true });
  };
  installTraps(cleanup);

  try {
    validator = startValidator({
      ledgerDir,
      snapshot,
      globalConfigDump,
      bondingGlobalConfigDump,
      soulGlobalConfigDump,
      bondingProgramId,
      soulProgramId,
    });
    trace.validator_pid = validator.pid;
    writeTrace(trace);
    connection = new Connection(RPC_URL, {
      commitment: COMMITMENT,
      confirmTransactionInitialTimeout: 120_000,
    });
    await waitForValidator(validator);
    await deployPrograms(bondingSo, soulSo, bondingKeypair, soulKeypair);
    await verifyProgramExecutable(connection, PUMPSWAP_PROGRAM_ID, "PumpSwap snapshot");
    await verifyProgramExecutable(connection, bondingProgramId, "bonding-curve");
    await verifyProgramExecutable(connection, soulProgramId, "soul-generator");

    const airdropSignature = await connection.requestAirdrop(payer.publicKey, PAYER_AIRDROP_LAMPORTS);
    await confirm(connection, airdropSignature);
    trace.txs.push({ label: "airdrop_payer", tx_sig: airdropSignature, slot: await signatureSlot(connection, airdropSignature) });

    const launch = findFreshLaunchKeypair(programIds);
    trace.meme_mint = launch.mint.publicKey.toBase58();
    trace.curve_pda = launch.curve.toBase58();
    trace.vault_pda = launch.vault.toBase58();
    trace.soul_pda = launch.soul.toBase58();
    writeTrace(trace);

    await record(trace, "create_mint_account", async () => {
      const lamports = await connection!.getMinimumBalanceForRentExemption(MINT_SIZE);
      const tx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: launch.mint.publicKey,
          lamports,
          space: MINT_SIZE,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
      );
      return sendConfirmed(connection!, tx, [payer, launch.mint]);
    });

    await record(trace, "initialize_soul_target_pump", async () => {
      const tx = new Transaction().add(
        initializeSoulIx({
          mint: launch.mint.publicKey,
          authority: payer.publicKey,
          createdAt: BigInt(Math.floor(Date.now() / 1_000)),
          symbol: `PMP${randomSuffix(5)}`,
          targetAmm: TARGET_AMM.Pump,
          programIds,
        }),
      );
      return sendConfirmed(connection!, tx, [payer]);
    });

    await record(trace, "create_token", async () => {
      const tx = new Transaction().add(
        createTokenIx({
          mint: launch.mint.publicKey,
          payer: payer.publicKey,
          feeRecipient: payer.publicKey,
          migrationTarget: payer.publicKey,
          soul: launch.soul,
          programIds,
        }),
      );
      return sendConfirmed(connection!, tx, [payer]);
    });

    await buyUntilGraduated(connection, payer, launch.mint.publicKey, programIds, trace);
    const curve = await fetchBondingCurve(connection, launch.mint.publicKey, { commitment: COMMITMENT, programIds });
    trace.graduation_threshold_lamports = curve.graduationThresholdLamports.toString();
    if (curve.targetAmm !== TARGET_AMM.Pump || !curve.graduated) {
      throw new Error(`Expected graduated Pump curve, got target_amm=${curve.targetAmm} graduated=${curve.graduated}`);
    }

    const pdas = derivePumpPdas(payer.publicKey, launch.mint.publicKey);
    trace.pool_address = pdas.pool.toBase58();
    trace.lp_mint = pdas.lpMint.toBase58();
    trace.creator_lp_ata = pdas.userPoolTokenAccount.toBase58();
    await migratePump(connection, payer, launch.mint.publicKey, programIds, pdas, trace);
    await verifyPumpMigration(connection, pdas, trace);
    writeTrace(trace);
    console.log("[pump] full local PumpSwap e2e passed and wrote deployments/local-pumpswap-trace.json");
  } finally {
    await cleanup();
  }
}

function startValidator(paths: {
  ledgerDir: string;
  snapshot: string;
  globalConfigDump: string;
  bondingGlobalConfigDump: string;
  soulGlobalConfigDump: string;
  bondingProgramId: PublicKey;
  soulProgramId: PublicKey;
}): ChildProcessWithoutNullStreams {
  const args = [
    "--reset",
    "--quiet",
    "--ledger",
    paths.ledgerDir,
    "--rpc-port",
    "8899",
    "--bpf-program",
    PUMPSWAP_PROGRAM_ID.toBase58(),
    paths.snapshot,
    "--account",
    PUMPSWAP_GLOBAL_CONFIG.toBase58(),
    paths.globalConfigDump,
    "--account",
    deriveGlobalConfigPda(paths.bondingProgramId).toBase58(),
    paths.bondingGlobalConfigDump,
    "--account",
    deriveGlobalConfigPda(paths.soulProgramId).toBase58(),
    paths.soulGlobalConfigDump,
  ];
  console.log(`[pump] starting solana-test-validator on ${RPC_URL}`);
  const child = spawn("solana-test-validator", args, {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk: Buffer) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
  return child;
}

async function waitForValidator(child: ChildProcessWithoutNullStreams): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < VALIDATOR_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(`solana-test-validator exited early with code ${child.exitCode}`);
    }
    const result = spawnSync("solana", ["cluster-version", "--url", RPC_URL], {
      cwd: ROOT,
      encoding: "utf8",
      env: withCargoPath(),
    });
    if (result.status === 0) {
      console.log(`[pump] validator healthcheck passed: ${result.stdout.trim()}`);
      return;
    }
    await sleep(500);
  }
  throw new Error("Timed out waiting for solana-test-validator healthcheck");
}

async function deployPrograms(
  bondingSo: string,
  soulSo: string,
  bondingKeypair: string,
  soulKeypair: string,
): Promise<void> {
  const deployer = runCapture("solana", ["address"]);
  run("solana", ["airdrop", String(Math.floor(DEPLOYER_AIRDROP_LAMPORTS / LAMPORTS_PER_SOL)), deployer, "--url", RPC_URL]);
  run("solana", ["program", "deploy", "--program-id", soulKeypair, soulSo, "--url", RPC_URL]);
  run("solana", ["program", "deploy", "--program-id", bondingKeypair, bondingSo, "--url", RPC_URL]);
}

async function verifyProgramExecutable(connection: Connection, programId: PublicKey, label: string): Promise<void> {
  const account = await connection.getAccountInfo(programId, COMMITMENT);
  if (!account?.executable) {
    throw new Error(`${label} program is not executable at ${programId.toBase58()}`);
  }
}

async function buyUntilGraduated(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  programIds: ProgramIdOverrides,
  trace: PumpTrace,
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
    const slot = await signatureSlot(connection, sig);
    const curve = await fetchBondingCurve(connection, mint, { commitment: COMMITMENT, programIds });
    trace.buys.push({
      label: `buy_${index + 1}`,
      tx_sig: sig,
      slot,
      sol_in_lamports: solIn.toString(),
      cumulative_sol_raised: curve.realSolReserves.toString(),
      graduated: curve.graduated,
    });
    writeTrace(trace);
    if (curve.graduated) {
      return;
    }
  }
  throw new Error("Bonding curve did not graduate within local buy chunks");
}

async function migratePump(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  programIds: ProgramIdOverrides,
  pdas: PumpPdas,
  trace: PumpTrace,
): Promise<void> {
  const migrationTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
    false,
    COMMITMENT,
    { commitment: COMMITMENT },
    TOKEN_2022_PROGRAM_ID,
  );
  const userQuoteAta = getAssociatedTokenAddressSync(NATIVE_MINT, payer.publicKey, false, TOKEN_PROGRAM_ID);
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, pdas.userBaseTokenAccount, payer.publicKey, mint, TOKEN_2022_PROGRAM_ID),
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, userQuoteAta, payer.publicKey, NATIVE_MINT, TOKEN_PROGRAM_ID),
    migrateIx({
      mint,
      migrationTarget: payer.publicKey,
      migrationTokenAccount: migrationTokenAccount.address,
      remainingAccounts: pumpRemainingAccounts(payer.publicKey, mint, pdas),
      programIds,
    }),
  );
  await record(trace, "migrate_pumpswap", async () => sendConfirmed(connection, tx, [payer]));
}

async function verifyPumpMigration(connection: Connection, pdas: PumpPdas, trace: PumpTrace): Promise<void> {
  const poolAccount = await connection.getAccountInfo(pdas.pool, COMMITMENT);
  if (!poolAccount) {
    throw new Error(`PumpSwap pool was not created: ${pdas.pool.toBase58()}`);
  }
  trace.pool_exists = true;

  const lpMint = await getMint(connection, pdas.lpMint, COMMITMENT, TOKEN_2022_PROGRAM_ID);
  const creatorBalance = await connection.getTokenAccountBalance(pdas.userPoolTokenAccount, COMMITMENT);
  const creatorLp = BigInt(creatorBalance.value.amount);
  const burnAmount = await readLpBurnAmount(connection, pdas.lpMint, trace);
  const totalBeforeBurn = burnAmount + creatorLp;
  const expectedBurn = (totalBeforeBurn * 84n) / 100n;
  const expectedCreator = totalBeforeBurn - expectedBurn;

  trace.observed_lp_supply = lpMint.supply.toString();
  trace.observed_creator_lp = creatorLp.toString();
  trace.observed_lp_burned = burnAmount.toString();
  trace.expected_lp_burned = expectedBurn.toString();
  trace.expected_creator_lp = expectedCreator.toString();

  if (burnAmount !== expectedBurn) {
    throw new Error(`Expected burned LP ${expectedBurn}, got ${burnAmount}`);
  }
  if (lpMint.supply !== expectedCreator) {
    throw new Error(`Expected remaining LP supply ${expectedCreator}, got ${lpMint.supply}`);
  }
  if (creatorLp !== expectedCreator) {
    throw new Error(`Expected creator LP ATA ${expectedCreator}, got ${creatorLp}`);
  }
}

async function readLpBurnAmount(
  connection: Connection,
  lpMint: PublicKey,
  trace: PumpTrace,
): Promise<bigint> {
  const migrateSig = trace.txs.find((tx) => tx.label === "migrate_pumpswap")?.tx_sig;
  if (!migrateSig) {
    throw new Error("Missing migrate_pumpswap signature in trace");
  }
  const parsed = await connection.getParsedTransaction(migrateSig, {
    commitment: COMMITMENT,
    maxSupportedTransactionVersion: 0,
  });
  const innerInstructions = parsed?.meta?.innerInstructions ?? [];
  for (const group of innerInstructions) {
    for (const instruction of group.instructions) {
      if (!("parsed" in instruction)) {
        continue;
      }
      const parsedInstruction = instruction.parsed as
        | { type?: string; info?: { mint?: string; amount?: string } }
        | undefined;
      if (
        parsedInstruction?.type === "burn" &&
        parsedInstruction.info?.mint === lpMint.toBase58() &&
        parsedInstruction.info.amount
      ) {
        return BigInt(parsedInstruction.info.amount);
      }
    }
  }
  throw new Error(`Could not find Token-2022 burn inner instruction for LP mint ${lpMint.toBase58()}`);
}

function pumpRemainingAccounts(creator: PublicKey, mint: PublicKey, pdas: PumpPdas): AccountMeta[] {
  return [
    { pubkey: pdas.pool, isSigner: false, isWritable: true },
    { pubkey: PUMPSWAP_GLOBAL_CONFIG, isSigner: false, isWritable: false },
    { pubkey: creator, isSigner: true, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: NATIVE_MINT, isSigner: false, isWritable: false },
    { pubkey: pdas.lpMint, isSigner: false, isWritable: true },
    { pubkey: pdas.userBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: pdas.userQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: pdas.userPoolTokenAccount, isSigner: false, isWritable: true },
    { pubkey: pdas.poolBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: pdas.poolQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: pdas.eventAuthority, isSigner: false, isWritable: false },
    { pubkey: PUMPSWAP_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
}

function derivePumpPdas(creator: PublicKey, memeMint: PublicKey): PumpPdas {
  const index = Buffer.alloc(2);
  index.writeUInt16LE(PUMPSWAP_POOL_INDEX, 0);
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), index, creator.toBuffer(), memeMint.toBuffer(), NATIVE_MINT.toBuffer()],
    PUMPSWAP_PROGRAM_ID,
  );
  const [lpMint] = PublicKey.findProgramAddressSync([Buffer.from("pool_lp_mint"), pool.toBuffer()], PUMPSWAP_PROGRAM_ID);
  const [eventAuthority] = PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], PUMPSWAP_PROGRAM_ID);
  const userBaseTokenAccount = getAssociatedTokenAddressSync(memeMint, creator, false, TOKEN_2022_PROGRAM_ID);
  const userQuoteTokenAccount = getAssociatedTokenAddressSync(NATIVE_MINT, creator, false, TOKEN_PROGRAM_ID);
  const userPoolTokenAccount = getAssociatedTokenAddressSync(lpMint, creator, false, TOKEN_2022_PROGRAM_ID);
  const poolBaseTokenAccount = getAssociatedTokenAddressSync(memeMint, pool, true, TOKEN_2022_PROGRAM_ID);
  const poolQuoteTokenAccount = getAssociatedTokenAddressSync(NATIVE_MINT, pool, true, TOKEN_PROGRAM_ID);
  return { pool, lpMint, eventAuthority, userBaseTokenAccount, userQuoteTokenAccount, userPoolTokenAccount, poolBaseTokenAccount, poolQuoteTokenAccount };
}

function findFreshLaunchKeypair(programIds: ProgramIdOverrides): LaunchAddresses {
  for (let attempt = 0; attempt < 20_000; attempt += 1) {
    const mint = Keypair.generate();
    try {
      const curve = deriveCurvePda(mint.publicKey, programIds.bondingCurve);
      const vault = deriveVaultPda(mint.publicKey, programIds.bondingCurve);
      const soul = deriveSoulPda(mint.publicKey, programIds.soulGenerator);
      return { mint, curve, vault, soul };
    } catch {
      // SolSoul-owned PDAs intentionally use no-bump create_program_address.
    }
  }
  throw new Error("Unable to find a mint with off-curve SolSoul PDAs");
}

async function record(
  trace: PumpTrace,
  label: string,
  fn: () => Promise<{ sig: string; slot: number }>,
): Promise<void> {
  const evidence = await fn();
  trace.txs.push({ label, tx_sig: evidence.sig, slot: evidence.slot });
  writeTrace(trace);
}

async function sendConfirmed(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
): Promise<{ sig: string; slot: number }> {
  const sig = await sendAndConfirmTransaction(connection, transaction, signers, { commitment: COMMITMENT });
  const slot = await signatureSlot(connection, sig);
  console.log(`[pump] ${sig} slot=${slot}`);
  return { sig, slot };
}

async function signatureSlot(connection: Connection, sig: string): Promise<number> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await connection.getSignatureStatuses([sig], { searchTransactionHistory: true });
    const status = response.value[0];
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return status.slot;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for confirmed signature: ${sig}`);
}

async function confirm(connection: Connection, signature: string): Promise<void> {
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, COMMITMENT);
}

async function stopValidator(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolveStop) => child.once("exit", () => resolveStop())),
    sleep(5_000).then(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
  console.log("[pump] stopped solana-test-validator");
}

async function assertPort8899Empty(): Promise<boolean> {
  const result = spawnSync("lsof", ["-i", ":8899", "-P", "-n", "-sTCP:LISTEN"], { encoding: "utf8" });
  if (result.status === 1) {
    console.log("[pump] verified no listener remains on :8899");
    return true;
  }
  if (result.status === 0) {
    throw new Error(`Expected no listener on :8899, found:\n${result.stdout}`);
  }
  throw new Error(`lsof -i :8899 failed with status ${result.status}: ${result.stderr}`);
}

function writeTrace(trace: PumpTrace): void {
  writeFileSync(join(ROOT, "deployments/local-pumpswap-trace.json"), `${JSON.stringify(trace, null, 2)}\n`, "utf8");
}

function writeAccountDump(filePath: string, options: {
  pubkey: PublicKey;
  owner: PublicKey;
  lamports: number;
  dataBase64: string;
}): void {
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        pubkey: options.pubkey.toBase58(),
        account: {
          lamports: options.lamports,
          data: [options.dataBase64, "base64"],
          owner: options.owner.toBase58(),
          executable: false,
          rentEpoch: 0,
        },
      },
      null,
      2,
    ),
  );
}

function writeGlobalConfigDump(filePath: string, programId: PublicKey, admin: PublicKey): void {
  const data = Buffer.alloc(128);
  admin.toBuffer().copy(data, 0);
  data[32] = 0;
  writeAccountDump(filePath, {
    pubkey: deriveGlobalConfigPda(programId),
    owner: programId,
    lamports: 1_000_000,
    dataBase64: data.toString("base64"),
  });
}

function keypairPubkey(path: string): PublicKey {
  const secret = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret)).publicKey;
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: withCargoPath(),
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

function runCapture(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: withCargoPath(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function withCargoPath(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${join(homedir(), ".cargo/bin")}:${process.env.PATH ?? ""}`,
  };
}

function installTraps(cleanup: () => Promise<void>): void {
  let cleaning = false;
  const handler = (signal: NodeJS.Signals): void => {
    if (cleaning) {
      return;
    }
    cleaning = true;
    cleanup()
      .catch((error: unknown) => console.error("[pump] cleanup after signal failed", error))
      .finally(() => process.exit(signal === "SIGTERM" ? 143 : 130));
  };
  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);
}

function assertExists(path: string): void {
  if (!existsSync(path)) {
    throw new Error(`Required file does not exist: ${path}`);
  }
}

function randomSuffix(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return output;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function closeConnection(connection: Connection | undefined): void {
  const rpcWebSocket = (
    connection as
      | (Connection & {
          _rpcWebSocket?: { close: () => void; removeAllListeners?: () => void };
        })
      | undefined
  )?._rpcWebSocket;
  rpcWebSocket?.removeAllListeners?.();
  rpcWebSocket?.close();
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("[pump] local PumpSwap e2e failed", error);
    process.exit(1);
  });
