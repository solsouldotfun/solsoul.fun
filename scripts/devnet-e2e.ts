import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type Commitment,
} from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  createApproveInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createFreezeAccountInstruction,
  createInitializeAccountInstruction,
  createInitializeMintInstruction,
  createInitializeTransferHookInstruction,
  createMintToInstruction,
  createRevokeInstruction,
  createTransferCheckedInstruction,
  createTransferCheckedWithTransferHookInstruction,
  ExtensionType,
  getAccount,
  getAccountLen,
  getAssociatedTokenAddressSync,
  getExtraAccountMetaAddress,
  getExtraAccountMetas,
  getMint,
  getMintLen,
  getTransferHook,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

import {
  buy,
  buildSettlementSellTransaction,
  buildSoulNftMetadata,
  claimSoul,
  claimSoulIx,
  createTokenIx,
  decodeReceiptAccount,
  decodeReceiptRegistryAccount,
  deriveClaimPda,
  deriveCurvePda,
  deriveNftAuthorityPda,
  deriveReceiptPda,
  deriveReceiptRegistryPda,
  deriveSoulPda,
  deriveVaultPda,
  fetchBondingCurve,
  fetchSoul,
  initializeSoulIx,
  settleReceiptsIx,
  type ProgramIdOverrides,
} from "../sdk/src/index.ts";
import {
  CLAIM_INSUFFICIENT_PROVENANCE_ERROR,
  TRANSFER_HOOK_BOUNDARY_BREAK_ERROR,
  assertExpectedNegativeFailure,
  formatCustomErrorCode,
  type NegativeFailureExpectation,
} from "./devnet-negative-assertions.ts";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const RPC_URL = "https://api.devnet.solana.com";
const COMMITMENT: Commitment = "confirmed";
const PAYER_PATH = resolve(homedir(), ".config/solana/id.json");
const DEPLOYMENT_PATH = resolve(ROOT, "deployments/devnet.json");
const TRACE_PATH = resolve(ROOT, "deployments/devnet-e2e-trace.json");
const M4_EVIDENCE_DIR = resolve(ROOT, "evidence/m4-raydium-local-devnet-e2e");
const M4_SUMMARY_PATH = resolve(M4_EVIDENCE_DIR, "summary.json");
const M4_STATS_API_PATH = resolve(M4_EVIDENCE_DIR, "stats-api-devnet.json");
const M4_STATS_EN_TEXT_PATH = resolve(M4_EVIDENCE_DIR, "stats-en.txt");
const M4_STATS_ZH_TEXT_PATH = resolve(M4_EVIDENCE_DIR, "stats-zh.txt");
const MEME_DECIMALS = 6;
const WHOLE_TOKEN = 1_000_000n;
const QUALIFYING_BUY_LAMPORTS = 100_000_000n;
const SUB_WHOLE_BUY_LAMPORTS = 1n;
const MINT_ACCOUNT_SIZE = getMintLen([ExtensionType.TransferHook]);
const VALIDATION_ACCOUNT_SIZE = 12 + 4 + 35 * 2;
const INIT_EXTRA_ACCOUNT_METAS_DISCRIMINATOR = Buffer.from([43, 34, 13, 49, 167, 88, 235, 235]);
const RECEIPT_REGISTRY_SEED = "receipt_registry";
const BOUNDARY_SELL_ACTIVE_RECEIPT_ERROR = 0x4308;
const TRANSFER_HOOK_MISSING_VALIDATION_ERROR = 7_000;
const TRANSFER_HOOK_INVALID_RECEIPT_BINDING_ERROR = 7_003;
const SETTLEMENT_INVALID_BINDING_ERROR = 0x331;
const SETTLEMENT_INACTIVE_RECEIPT_ERROR = 0x335;
const SETTLEMENT_MISSING_DEPENDENT_MOVEMENT_ERROR = 0x337;
const SOLANA_PUBLIC_IDENTIFIER_RE = /[1-9A-HJ-NP-Za-km-z]{32,100}/g;

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

interface TxEvidence {
  sig: string;
  slot: number;
  explorer: string;
  logs?: string[];
}

interface LaunchEvidence {
  symbol: string;
  mint: string;
  curve: string;
  vault: string;
  soul: string;
  validation: string;
  hookProgram: string;
  mintOwner?: string;
  transferHookProgramOnMint?: string | null;
  validationOwner?: string;
  validationMetaCount?: number;
  tx: Record<string, TxEvidence>;
}

interface BuyEvidence extends TxEvidence {
  solInLamports: string;
  tokenOut: string;
  postBalance: string;
}

interface Trace {
  ranAtIso: string;
  rpc: string;
  commitment: Commitment;
  payer: string;
  payerKeypairPath: string;
  programs: { bondingCurve: string; soulGenerator: string; transferHook: string };
  prototypeScope: string;
  qualifying: {
    launch?: LaunchEvidence;
    buy?: BuyEvidence;
    claim?: TxEvidence & { nftMint: string; receipt: string; receiptRegistry: string; receiptState?: string; registryActiveReceipts?: string };
    hookTransfers?: {
      destinationOwner: string;
      sourceAta: string;
      destinationAta: string;
      inBounds?: TxEvidence & { amount: string; sourceBefore: string; sourceAfter: string; destinationAfter: string; receiptStateAfter: string };
      boundaryRejection?: FailureEvidence & { amount: string; sourceBefore: string; sourceAfter: string; destinationBefore: string; destinationAfter: string; receiptStateAfter: string };
      settledBoundaryTransfer?: TxEvidence & {
        instructionOrder: ["settle_receipts", "transfer_checked"];
        amount: string;
        sourceBefore: string;
        sourceAfter: string;
        destinationBefore: string;
        destinationAfter: string;
        receipt: string;
        receiptStateAfter: string;
        registryActiveReceiptsAfter?: string;
        registryBurnedReceiptsAfter?: string;
      };
    };
  };
  boundarySell?: {
    launch?: LaunchEvidence;
    buy?: BuyEvidence;
    claim?: TxEvidence & { nftMint: string; receipt: string; receiptRegistry: string; receiptState?: string; registryActiveReceipts?: string };
    sourceAta?: string;
    noSettlementRejection?: FailureEvidence & {
      amount: string;
      sourceBefore: string;
      sourceAfter: string;
      receipt: string;
      receiptStateAfter: string;
      registryActiveReceiptsAfter?: string;
    };
    settlementAndSell?: TxEvidence & {
      instructionOrder: ["settle_receipts", "sell"];
      amount: string;
      sourceBefore: string;
      sourceAfter: string;
      receipt: string;
      receiptStateAfter: string;
      registryActiveReceiptsAfter?: string;
      registryBurnedReceiptsAfter?: string;
    };
  };
  nonQualifying: {
    launch?: LaunchEvidence;
    qualifyingSetupBuy?: BuyEvidence;
    subWholeBuy?: BuyEvidence;
    failedClaim?: FailureEvidence & { attemptedSequence: string; holderBalance: string; soulProvenanceTokenAmount?: string };
  };
  securityNegativeAssertions?: DevnetSecurityNegativeAssertions;
  coherence?: {
    deploymentFile: string;
    sdkProgramIds: { bondingCurve: string; soulGenerator: string };
    appLocalUrl: string;
    apiStatsUrl: string;
  };
  discoveredIssues: Array<{ severity: "blocking" | "non_blocking" | "suggestion"; description: string; suggestedFix?: string }>;
  balance: { startingLamports?: number; endingLamports?: number; spentLamports?: number };
}

interface FailureEvidence {
  sig?: string;
  slot?: number;
  err?: unknown;
  message: string;
  logs?: string[];
  explorer?: string;
  expectedCustomErrorCode?: string;
}

interface NegativeStateSnapshot {
  sourceTokenAccount?: string;
  destinationTokenAccount?: string;
  sourceBalance?: string;
  destinationBalance?: string;
  receipt?: string;
  receiptRegistry?: string;
  receiptRegistryBytesSha256?: string;
  receiptState?: string;
  receiptBytesSha256?: string;
  registryActiveReceipts?: string;
  registryBurnedReceipts?: string;
  registryForfeitedReceipts?: string;
  tokenAccountAddress?: string;
  tokenAccountOwner?: string;
  tokenAccountMint?: string;
  tokenAccountState?: string;
  tokenAccountDelegatePresent?: boolean;
  tokenAccountBytesSha256?: string;
}

interface NegativeImmutabilityProof {
  balancesUnchanged?: boolean;
  receiptStateUnchanged?: boolean;
  receiptBytesUnchanged?: boolean;
  receiptRegistryBytesUnchanged?: boolean;
  registryCountersUnchanged?: boolean;
  rejectedBeforeSettlementMutation?: boolean;
  note?: string;
}

interface DevnetSecurityNegativeAssertion extends FailureEvidence {
  assertion: string;
  surface: "transfer_hook" | "settlement";
  expectedError: string;
  expectedLogFragments: string[];
  before: NegativeStateSnapshot;
  after: NegativeStateSnapshot;
  immutability: NegativeImmutabilityProof;
}

interface DevnetSecurityNegativeAssertions {
  fixture: {
    mint: string;
    sourceTokenAccount: string;
    destinationTokenAccount: string;
    activeReceipt: string;
    activeReceiptRegistry: string;
    inactiveReceipt: string;
    sourceBalanceAtStart: string;
  };
  missingMeta: DevnetSecurityNegativeAssertion;
  spoofedRegistry: DevnetSecurityNegativeAssertion;
  selfTransferBoundaryBypass: DevnetSecurityNegativeAssertion;
  lifecycleReplay: DevnetSecurityNegativeAssertion;
  tokenAccountSettlementRejections: {
    cases: DevnetSecurityNegativeAssertion[];
  };
}

interface SecurityNegativeFixture {
  mint: PublicKey;
  sourceAta: PublicKey;
  receipt: PublicKey;
  receiptRegistry: PublicKey;
  inactiveReceipt: PublicKey;
}

const SECURITY_NEGATIVE_FIXTURE = {
  // Public devnet state from prior lifecycle traces; these accounts are intentionally reused
  // for simulation-only negative assertions so reruns do not require fresh airdrops.
  activeMint: "2RCDmLPENhB41317JvsZh9eE47s4X2mtYU5W5xZJZEan",
  activeSourceAta: "D7rXMZSsBGt3La5FYYS8Mx4J33UQhMt8jUR3UVZBsuvH",
  activeReceipt: "2zUMfDghzuCZF7ndBre1uD94w6FY1U1XiVrg1zg2Umf9",
  activeReceiptRegistry: "3tqA9Rza71e7Ze5QHRbS9SroCkJBdHGNF4A3aWRPCwq8",
  inactiveReceipt: "9qbtotAduGynkajoBTL4DR8q1XbfnVsMmzBYvpDTnWJC",
} as const;

async function main(): Promise<void> {
  if (process.argv.includes("--schema-check")) {
    const deployment = loadDeployment();
    const trace = makeEmptyTrace("<schema-check>", deployment);
    JSON.stringify(trace, bigintJsonReplacer, 2);
    if (existsSync(TRACE_PATH)) {
      validateStoredTraceSchema(JSON.parse(readFileSync(TRACE_PATH, "utf8")) as Trace);
    }
    if (existsSync(M4_SUMMARY_PATH)) {
      validateM4EvidenceSummary(JSON.parse(readFileSync(M4_SUMMARY_PATH, "utf8")));
    }
    if (existsSync(M4_STATS_API_PATH)) {
      validateM4StatsApiEvidence(JSON.parse(readFileSync(M4_STATS_API_PATH, "utf8")));
    }
    if (existsSync(M4_STATS_EN_TEXT_PATH)) {
      validateM4StatsTextEvidence(readFileSync(M4_STATS_EN_TEXT_PATH, "utf8"), "/en/stats");
    }
    if (existsSync(M4_STATS_ZH_TEXT_PATH)) {
      validateM4StatsTextEvidence(readFileSync(M4_STATS_ZH_TEXT_PATH, "utf8"), "/zh/stats");
    }
    console.log("[devnet-e2e] schema check passed");
    return;
  }

  if (process.argv.includes("--security-negative-evidence")) {
    await generateSecurityNegativeEvidence();
    return;
  }

  const deployment = loadDeployment();
  const payer = loadKeypair(PAYER_PATH);
  const connection = new Connection(RPC_URL, {
    commitment: COMMITMENT,
    confirmTransactionInitialTimeout: 120_000,
  });
  const trace = makeEmptyTrace(payer.publicKey.toBase58(), deployment);
  const programIds: ProgramIdOverrides = {
    bondingCurve: deployment.bondingCurve,
    soulGenerator: deployment.soulGenerator,
  };

  let exitCode = 0;
  try {
    trace.balance.startingLamports = await connection.getBalance(payer.publicKey, COMMITMENT);
    console.log(`[devnet-e2e] payer ${payer.publicKey.toBase58()} balance=${trace.balance.startingLamports} lamports`);

    const qualifying = await launchHookEnabledToken(connection, payer, deployment, programIds, "M5Q");
    trace.qualifying.launch = qualifying.launch;
    writeTrace(trace);

    trace.qualifying.buy = await runBuy(connection, payer, qualifying.mint.publicKey, programIds, QUALIFYING_BUY_LAMPORTS, "qualifying_buy");
    writeTrace(trace);

    trace.qualifying.claim = await runClaim(connection, payer, qualifying, programIds);
    writeTrace(trace);

    trace.qualifying.hookTransfers = await runHookTransfers(connection, payer, qualifying, deployment);
    writeTrace(trace);

    trace.boundarySell = await runBoundarySells(connection, payer, deployment, programIds);
    writeTrace(trace);

    const nonQualifying = await launchHookEnabledToken(connection, payer, deployment, programIds, "M5NQ");
    trace.nonQualifying.launch = nonQualifying.launch;
    writeTrace(trace);

    trace.nonQualifying.qualifyingSetupBuy = await runBuy(connection, payer, nonQualifying.mint.publicKey, programIds, QUALIFYING_BUY_LAMPORTS, "nonqualifying_setup_buy");
    trace.nonQualifying.subWholeBuy = await runBuy(connection, payer, nonQualifying.mint.publicKey, programIds, SUB_WHOLE_BUY_LAMPORTS, "sub_whole_buy");
    writeTrace(trace);

    trace.nonQualifying.failedClaim = await runExpectedFailedClaim(connection, payer, nonQualifying, programIds);
    writeTrace(trace);

    trace.coherence = {
      deploymentFile: DEPLOYMENT_PATH,
      sdkProgramIds: {
        bondingCurve: deployment.bondingCurve.toBase58(),
        soulGenerator: deployment.soulGenerator.toBase58(),
      },
      appLocalUrl: "http://127.0.0.1:3100/en",
      apiStatsUrl: "http://127.0.0.1:3100/api/stats",
    };
  } catch (error) {
    exitCode = 1;
    trace.discoveredIssues.push({
      severity: "blocking",
      description: errorMessage(error),
    });
    console.error(`[devnet-e2e] failed: ${errorMessage(error)}`);
  } finally {
    try {
      trace.balance.endingLamports = await connection.getBalance(payer.publicKey, COMMITMENT);
      if (trace.balance.startingLamports !== undefined) {
        trace.balance.spentLamports = trace.balance.startingLamports - trace.balance.endingLamports;
      }
    } catch (error) {
      trace.discoveredIssues.push({ severity: "non_blocking", description: `final balance fetch failed: ${errorMessage(error)}` });
    }
    writeTrace(trace);
    closeConnection(connection);
  }

  process.exit(exitCode);
}

function makeEmptyTrace(payer: string, deployment: ReturnType<typeof loadDeployment>): Trace {
  return {
    ranAtIso: new Date().toISOString(),
    rpc: RPC_URL,
    commitment: COMMITMENT,
    payer,
    payerKeypairPath: "~/.config/solana/id.json",
    programs: {
      bondingCurve: deployment.bondingCurve.toBase58(),
      soulGenerator: deployment.soulGenerator.toBase58(),
      transferHook: deployment.transferHook.toBase58(),
    },
    prototypeScope: "Controlled Token-2022 transfer-hook prototype; production AMM/wallet compatibility is out of scope and hook rejection does not burn/forfeit.",
    qualifying: {},
    nonQualifying: {},
    discoveredIssues: [],
    balance: {},
  };
}

async function launchHookEnabledToken(
  connection: Connection,
  payer: Keypair,
  deployment: ReturnType<typeof loadDeployment>,
  programIds: ProgramIdOverrides,
  prefix: string,
): Promise<{ mint: Keypair; launch: LaunchEvidence }> {
  const symbol = `${prefix}${randomSuffix(5)}`;
  const mint = findFreshMint(programIds);
  const curve = deriveCurvePda(mint.publicKey, deployment.bondingCurve);
  const vault = deriveVaultPda(mint.publicKey, deployment.bondingCurve);
  const soul = deriveSoulPda(mint.publicKey, deployment.soulGenerator);
  const validation = getExtraAccountMetaAddress(mint.publicKey, deployment.transferHook);
  const launch: LaunchEvidence = {
    symbol,
    mint: mint.publicKey.toBase58(),
    curve: curve.toBase58(),
    vault: vault.toBase58(),
    soul: soul.toBase58(),
    validation: validation.toBase58(),
    hookProgram: deployment.transferHook.toBase58(),
    tx: {},
  };

  const mintLamports = await connection.getMinimumBalanceForRentExemption(MINT_ACCOUNT_SIZE, COMMITMENT);
  const createMintAndHook = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      lamports: mintLamports,
      space: MINT_ACCOUNT_SIZE,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferHookInstruction(
      mint.publicKey,
      payer.publicKey,
      deployment.transferHook,
      TOKEN_2022_PROGRAM_ID,
    ),
  );
  launch.tx.createMintAndHook = await sendConfirmed(connection, createMintAndHook, [payer, mint]);

  const createToken = new Transaction().add(
    createTokenIx({
      mint: mint.publicKey,
      payer: payer.publicKey,
      feeRecipient: payer.publicKey,
      migrationTarget: payer.publicKey,
      programIds,
    }),
  );
  launch.tx.createToken = await sendConfirmed(connection, createToken, [payer]);

  const createValidation = new Transaction().add(
    createInitializeExtraAccountMetaListInstruction({
      hookProgram: deployment.transferHook,
      validation,
      mint: mint.publicKey,
      authority: payer.publicKey,
      soulGenerator: deployment.soulGenerator,
    }),
  );
  launch.tx.createValidation = await sendConfirmed(connection, createValidation, [payer]);

  const initializeSoul = new Transaction().add(
    initializeSoulIx({
      mint: mint.publicKey,
      authority: payer.publicKey,
      createdAt: BigInt(Math.floor(Date.now() / 1_000)),
      symbol,
      programIds,
    }),
  );
  launch.tx.initializeSoul = await sendConfirmed(connection, initializeSoul, [payer]);

  const mintInfo = await getMint(connection, mint.publicKey, COMMITMENT, TOKEN_2022_PROGRAM_ID);
  const transferHook = getTransferHook(mintInfo);
  const validationInfo = await connection.getAccountInfo(validation, COMMITMENT);
  launch.mintOwner = TOKEN_2022_PROGRAM_ID.toBase58();
  launch.transferHookProgramOnMint = transferHook?.programId.toBase58() ?? null;
  launch.validationOwner = validationInfo?.owner.toBase58();
  launch.validationMetaCount = validationInfo ? getExtraAccountMetas(validationInfo).length : undefined;
  if (!transferHook?.programId.equals(deployment.transferHook)) {
    throw new Error(`mint ${mint.publicKey.toBase58()} is not configured for hook ${deployment.transferHook.toBase58()}`);
  }
  if (validationInfo?.owner.toBase58() !== deployment.transferHook.toBase58()) {
    throw new Error(`validation PDA ${validation.toBase58()} is not owned by hook program`);
  }
  console.log(`[devnet-e2e] launched hook-enabled ${symbol} mint=${mint.publicKey.toBase58()}`);
  return { mint, launch };
}

function createInitializeExtraAccountMetaListInstruction(params: {
  hookProgram: PublicKey;
  validation: PublicKey;
  mint: PublicKey;
  authority: PublicKey;
  soulGenerator: PublicKey;
}): TransactionInstruction {
  const metas = Buffer.concat([
    fixedPubkeyMeta(params.soulGenerator),
    externalReceiptRegistryPdaMeta(),
  ]);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(2, 0);
  return new TransactionInstruction({
    programId: params.hookProgram,
    keys: [
      { pubkey: params.validation, isSigner: false, isWritable: true },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([INIT_EXTRA_ACCOUNT_METAS_DISCRIMINATOR, len, metas]),
  });
}

function fixedPubkeyMeta(pubkey: PublicKey): Buffer {
  return Buffer.concat([Buffer.from([0]), pubkey.toBuffer(), Buffer.from([0, 0])]);
}

function externalReceiptRegistryPdaMeta(): Buffer {
  const addressConfig = Buffer.alloc(32);
  let offset = 0;
  const literal = Buffer.from(RECEIPT_REGISTRY_SEED);
  addressConfig[offset++] = 1;
  addressConfig[offset++] = literal.length;
  literal.copy(addressConfig, offset);
  offset += literal.length;
  addressConfig[offset++] = 4;
  addressConfig[offset++] = 0;
  addressConfig[offset++] = 32;
  addressConfig[offset++] = 32;
  addressConfig[offset++] = 3;
  addressConfig[offset++] = 1;
  return Buffer.concat([Buffer.from([128 + 5]), addressConfig, Buffer.from([0, 0])]);
}

async function runBuy(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  programIds: ProgramIdOverrides,
  solIn: bigint,
  label: string,
): Promise<BuyEvidence> {
  const before = await fetchBondingCurve(connection, mint, { commitment: COMMITMENT, programIds });
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
  const after = await fetchBondingCurve(connection, mint, { commitment: COMMITMENT, programIds });
  const ata = getAssociatedTokenAddressSync(mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const token = await getAccount(connection, ata, COMMITMENT, TOKEN_2022_PROGRAM_ID);
  const evidence = {
    sig,
    slot: status.slot,
    explorer: explorerTx(sig),
    logs: await txLogs(connection, sig),
    solInLamports: solIn.toString(),
    tokenOut: (before.realTokenReserves - after.realTokenReserves).toString(),
    postBalance: token.amount.toString(),
  };
  console.log(`[devnet-e2e] ${label} sig=${sig} tokenOut=${evidence.tokenOut} postBalance=${evidence.postBalance}`);
  return evidence;
}

async function runClaim(
  connection: Connection,
  payer: Keypair,
  launch: { mint: Keypair; launch: LaunchEvidence },
  programIds: ProgramIdOverrides,
): Promise<Trace["qualifying"]["claim"]> {
  const nftMint = Keypair.generate();
  const soulState = await fetchSoul(connection, launch.mint.publicKey, {
    commitment: COMMITMENT,
    programIds,
  });
  const metadata = buildSoulNftMetadata(soulState);
  await sendConfirmed(
    connection,
    new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: nftMint.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(
          metadata.mintRentExemptionSize,
          COMMITMENT,
        ),
        space: metadata.mintAccountSize,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ),
    [payer, nftMint],
  );
  const sig = await claimSoul({
    connection,
    payer,
    mint: launch.mint.publicKey,
    nftMint,
    createNftMintAccount: false,
    commitment: COMMITMENT,
    confirmOptions: { commitment: COMMITMENT },
    programIds,
  });
  const status = await getConfirmedSignature(connection, sig);
  const receipt = deriveReceiptPda(new PublicKey(launch.launch.soul), 0n, programIds.soulGenerator);
  const receiptRegistry = deriveReceiptRegistryPda(payer.publicKey, launch.mint.publicKey, programIds.soulGenerator);
  const [receiptInfo, registryInfo] = await connection.getMultipleAccountsInfo([receipt, receiptRegistry], COMMITMENT);
  const receiptState = receiptInfo ? decodeReceiptAccount(receiptInfo.data) : undefined;
  const registry = registryInfo ? decodeReceiptRegistryAccount(registryInfo.data) : undefined;
  console.log(`[devnet-e2e] claim sig=${sig} nft=${nftMint.publicKey.toBase58()} receipt=${receipt.toBase58()}`);
  return {
    sig,
    slot: status.slot,
    explorer: explorerTx(sig),
    logs: await txLogs(connection, sig),
    nftMint: nftMint.publicKey.toBase58(),
    receipt: receipt.toBase58(),
    receiptRegistry: receiptRegistry.toBase58(),
    receiptState: receiptState?.lifecycleState,
    registryActiveReceipts: registry?.activeReceipts.toString(),
  };
}

async function runHookTransfers(
  connection: Connection,
  payer: Keypair,
  launch: { mint: Keypair; launch: LaunchEvidence },
  deployment: ReturnType<typeof loadDeployment>,
): Promise<NonNullable<Trace["qualifying"]["hookTransfers"]>> {
  const destinationOwner = Keypair.generate();
  const sourceAta = getAssociatedTokenAddressSync(launch.mint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const destinationAta = getAssociatedTokenAddressSync(launch.mint.publicKey, destinationOwner.publicKey, false, TOKEN_2022_PROGRAM_ID);
  await sendConfirmed(
    connection,
    new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        destinationAta,
        destinationOwner.publicKey,
        launch.mint.publicKey,
        TOKEN_2022_PROGRAM_ID,
      ),
    ),
    [payer],
  );

  const sourceBefore = (await getAccount(connection, sourceAta, COMMITMENT, TOKEN_2022_PROGRAM_ID)).amount;
  const inBoundsIx = await createTransferCheckedWithTransferHookInstruction(
    connection,
    sourceAta,
    launch.mint.publicKey,
    destinationAta,
    payer.publicKey,
    1n,
    MEME_DECIMALS,
    [],
    COMMITMENT,
    TOKEN_2022_PROGRAM_ID,
  );
  assertTransferInstructionUsesHook(inBoundsIx, deployment.transferHook, new PublicKey(launch.launch.validation));
  const inBoundsTx = await sendConfirmed(connection, new Transaction().add(inBoundsIx), [payer]);
  const sourceAfterInBounds = (await getAccount(connection, sourceAta, COMMITMENT, TOKEN_2022_PROGRAM_ID)).amount;
  const destinationAfterInBounds = (await getAccount(connection, destinationAta, COMMITMENT, TOKEN_2022_PROGRAM_ID)).amount;
  const receipt = deriveReceiptPda(new PublicKey(launch.launch.soul), 0n, deployment.soulGenerator);
  const receiptAfterInBounds = decodeReceiptAccount((await mustAccount(connection, receipt)).data);

  const boundaryAmount = sourceAfterInBounds - (WHOLE_TOKEN - 1n);
  const destinationBeforeBoundary = destinationAfterInBounds;
  const boundaryIx = await createTransferCheckedWithTransferHookInstruction(
    connection,
    sourceAta,
    launch.mint.publicKey,
    destinationAta,
    payer.publicKey,
    boundaryAmount,
    MEME_DECIMALS,
    [],
    COMMITMENT,
    TOKEN_2022_PROGRAM_ID,
  );
  assertTransferInstructionUsesHook(boundaryIx, deployment.transferHook, new PublicKey(launch.launch.validation));
  const boundaryFailure = await submitExpectedFailure(
    connection,
    new Transaction().add(boundaryIx),
    [payer],
    "boundary-breaking hook transfer",
    {
      customErrorCode: TRANSFER_HOOK_BOUNDARY_BREAK_ERROR,
      requiredLogFragments: ["rejecting boundary-breaking transfer"],
    },
  );
  const sourceAfterBoundary = (await getAccount(connection, sourceAta, COMMITMENT, TOKEN_2022_PROGRAM_ID)).amount;
  const destinationAfterBoundary = (await getAccount(connection, destinationAta, COMMITMENT, TOKEN_2022_PROGRAM_ID)).amount;
  const receiptAfterBoundary = decodeReceiptAccount((await mustAccount(connection, receipt)).data);
  if (sourceAfterBoundary !== sourceAfterInBounds || destinationAfterBoundary !== destinationBeforeBoundary) {
    throw new Error("boundary rejection mutated token balances");
  }
  if (receiptAfterBoundary.lifecycleState !== "active") {
    throw new Error("boundary rejection mutated active receipt state");
  }
  const settlementIx = settleReceiptsIx({
    authority: payer.publicKey,
    tokenAccount: sourceAta,
    tokenMint: launch.mint.publicKey,
    receipts: [receipt],
    state: "burned",
    movementAmount: boundaryAmount,
    programIds: {
      bondingCurve: deployment.bondingCurve,
      soulGenerator: deployment.soulGenerator,
    },
  });
  const settledBoundaryIx = await createTransferCheckedWithTransferHookInstruction(
    connection,
    sourceAta,
    launch.mint.publicKey,
    destinationAta,
    payer.publicKey,
    boundaryAmount,
    MEME_DECIMALS,
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );
  assertTransferInstructionUsesHook(settledBoundaryIx, deployment.transferHook, new PublicKey(launch.launch.validation));
  const settledBoundaryTx = await sendConfirmed(connection, new Transaction().add(settlementIx, settledBoundaryIx), [payer]);
  const sourceAfterSettlement = (await getAccount(connection, sourceAta, COMMITMENT, TOKEN_2022_PROGRAM_ID)).amount;
  const destinationAfterSettlement = (await getAccount(connection, destinationAta, COMMITMENT, TOKEN_2022_PROGRAM_ID)).amount;
  const [receiptInfoAfterSettlement, registryInfoAfterSettlement] = await connection.getMultipleAccountsInfo(
    [receipt, deriveReceiptRegistryPda(payer.publicKey, launch.mint.publicKey, deployment.soulGenerator)],
    COMMITMENT,
  );
  if (!receiptInfoAfterSettlement || !registryInfoAfterSettlement) {
    throw new Error("settled boundary transfer did not leave receipt/registry accounts readable");
  }
  const receiptAfterSettlement = decodeReceiptAccount(receiptInfoAfterSettlement.data);
  const registryAfterSettlement = decodeReceiptRegistryAccount(registryInfoAfterSettlement.data);
  if (receiptAfterSettlement.lifecycleState !== "burned") {
    throw new Error(`settled boundary transfer left receipt ${receiptAfterSettlement.lifecycleState}, expected burned`);
  }
  if (sourceAfterSettlement !== WHOLE_TOKEN - 1n) {
    throw new Error(`settled boundary transfer source balance ${sourceAfterSettlement.toString()} did not land below one whole token`);
  }
  console.log(
    `[devnet-e2e] hook in-bounds sig=${inBoundsTx.sig}; boundary rejected sig=${boundaryFailure.sig ?? "<simulation>"}; settled boundary sig=${settledBoundaryTx.sig}`,
  );
  return {
    destinationOwner: destinationOwner.publicKey.toBase58(),
    sourceAta: sourceAta.toBase58(),
    destinationAta: destinationAta.toBase58(),
    inBounds: {
      ...inBoundsTx,
      logs: await txLogs(connection, inBoundsTx.sig),
      amount: "1",
      sourceBefore: sourceBefore.toString(),
      sourceAfter: sourceAfterInBounds.toString(),
      destinationAfter: destinationAfterInBounds.toString(),
      receiptStateAfter: receiptAfterInBounds.lifecycleState,
    },
    boundaryRejection: {
      ...boundaryFailure,
      amount: boundaryAmount.toString(),
      sourceBefore: sourceAfterInBounds.toString(),
      sourceAfter: sourceAfterBoundary.toString(),
      destinationBefore: destinationBeforeBoundary.toString(),
      destinationAfter: destinationAfterBoundary.toString(),
      receiptStateAfter: receiptAfterBoundary.lifecycleState,
    },
    settledBoundaryTransfer: {
      ...settledBoundaryTx,
      instructionOrder: ["settle_receipts", "transfer_checked"],
      amount: boundaryAmount.toString(),
      sourceBefore: sourceAfterBoundary.toString(),
      sourceAfter: sourceAfterSettlement.toString(),
      destinationBefore: destinationAfterBoundary.toString(),
      destinationAfter: destinationAfterSettlement.toString(),
      receipt: receipt.toBase58(),
      receiptStateAfter: receiptAfterSettlement.lifecycleState,
      registryActiveReceiptsAfter: registryAfterSettlement.activeReceipts.toString(),
      registryBurnedReceiptsAfter: registryAfterSettlement.burnedReceipts.toString(),
    },
  };
}

async function runBoundarySells(
  connection: Connection,
  payer: Keypair,
  deployment: ReturnType<typeof loadDeployment>,
  programIds: ProgramIdOverrides,
): Promise<NonNullable<Trace["boundarySell"]>> {
  const launched = await launchHookEnabledToken(connection, payer, deployment, programIds, "M4SELL");
  const buyEvidence = await runBuy(connection, payer, launched.mint.publicKey, programIds, QUALIFYING_BUY_LAMPORTS, "boundary_sell_setup_buy");
  const claimEvidence = await runClaim(connection, payer, launched, programIds);
  const sourceAta = getAssociatedTokenAddressSync(launched.mint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const receipt = new PublicKey(claimEvidence.receipt);
  const receiptRegistry = new PublicKey(claimEvidence.receiptRegistry);
  const sourceBefore = (await getAccount(connection, sourceAta, COMMITMENT, TOKEN_2022_PROGRAM_ID)).amount;
  const boundaryAmount = sourceBefore - (WHOLE_TOKEN - 1n);
  if (boundaryAmount <= 0n) {
    throw new Error(`boundary sell setup balance ${sourceBefore.toString()} cannot cross below one whole token`);
  }

  const noSettlementTx = buildSettlementSellTransaction({
    sell: {
      mint: launched.mint.publicKey,
      seller: payer.publicKey,
      sellerTokenAccount: sourceAta,
      feeRecipient: payer.publicKey,
      tokenIn: boundaryAmount,
      minAmountOut: 1n,
      hardBindingAccounts: [{ pubkey: receiptRegistry, isSigner: false, isWritable: false }],
      programIds,
    },
  });
  const noSettlementFailure = await submitExpectedFailure(
    connection,
    noSettlementTx,
    [payer],
    "boundary sell without settlement",
    { customErrorCode: BOUNDARY_SELL_ACTIVE_RECEIPT_ERROR },
  );
  const sourceAfterFailure = (await getAccount(connection, sourceAta, COMMITMENT, TOKEN_2022_PROGRAM_ID)).amount;
  const [receiptInfoAfterFailure, registryInfoAfterFailure] = await connection.getMultipleAccountsInfo(
    [receipt, receiptRegistry],
    COMMITMENT,
  );
  if (!receiptInfoAfterFailure || !registryInfoAfterFailure) {
    throw new Error("boundary sell rejection did not leave receipt/registry accounts readable");
  }
  const receiptAfterFailure = decodeReceiptAccount(receiptInfoAfterFailure.data);
  const registryAfterFailure = decodeReceiptRegistryAccount(registryInfoAfterFailure.data);
  if (sourceAfterFailure !== sourceBefore) {
    throw new Error("boundary sell rejection mutated seller token balance");
  }
  if (receiptAfterFailure.lifecycleState !== "active") {
    throw new Error("boundary sell rejection mutated active receipt state");
  }

  const settlementTx = buildSettlementSellTransaction({
    settlement: {
      authority: payer.publicKey,
      tokenAccount: sourceAta,
      tokenMint: launched.mint.publicKey,
      receipts: [receipt],
      state: "burned",
      movementAmount: boundaryAmount,
      programIds,
    },
    sell: {
      mint: launched.mint.publicKey,
      seller: payer.publicKey,
      sellerTokenAccount: sourceAta,
      feeRecipient: payer.publicKey,
      tokenIn: boundaryAmount,
      minAmountOut: 1n,
      programIds,
    },
  });
  const settledSell = await sendConfirmed(connection, settlementTx, [payer]);
  const sourceAfterSettlement = (await getAccount(connection, sourceAta, COMMITMENT, TOKEN_2022_PROGRAM_ID)).amount;
  const [receiptInfoAfterSettlement, registryInfoAfterSettlement] = await connection.getMultipleAccountsInfo(
    [receipt, receiptRegistry],
    COMMITMENT,
  );
  if (!receiptInfoAfterSettlement || !registryInfoAfterSettlement) {
    throw new Error("settlement plus boundary sell did not leave receipt/registry accounts readable");
  }
  const receiptAfterSettlement = decodeReceiptAccount(receiptInfoAfterSettlement.data);
  const registryAfterSettlement = decodeReceiptRegistryAccount(registryInfoAfterSettlement.data);
  if (receiptAfterSettlement.lifecycleState !== "burned") {
    throw new Error(`settlement plus boundary sell left receipt ${receiptAfterSettlement.lifecycleState}, expected burned`);
  }
  if (sourceAfterSettlement !== WHOLE_TOKEN - 1n) {
    throw new Error(`settlement plus boundary sell source balance ${sourceAfterSettlement.toString()} did not land below one whole token`);
  }

  console.log(
    `[devnet-e2e] boundary sell rejected sig=${noSettlementFailure.sig ?? "<simulation>"}; settlement+sell sig=${settledSell.sig}`,
  );
  return {
    launch: launched.launch,
    buy: buyEvidence,
    claim: claimEvidence,
    sourceAta: sourceAta.toBase58(),
    noSettlementRejection: {
      ...noSettlementFailure,
      amount: boundaryAmount.toString(),
      sourceBefore: sourceBefore.toString(),
      sourceAfter: sourceAfterFailure.toString(),
      receipt: receipt.toBase58(),
      receiptStateAfter: receiptAfterFailure.lifecycleState,
      registryActiveReceiptsAfter: registryAfterFailure.activeReceipts.toString(),
    },
    settlementAndSell: {
      ...settledSell,
      logs: await txLogs(connection, settledSell.sig),
      instructionOrder: ["settle_receipts", "sell"],
      amount: boundaryAmount.toString(),
      sourceBefore: sourceAfterFailure.toString(),
      sourceAfter: sourceAfterSettlement.toString(),
      receipt: receipt.toBase58(),
      receiptStateAfter: receiptAfterSettlement.lifecycleState,
      registryActiveReceiptsAfter: registryAfterSettlement.activeReceipts.toString(),
      registryBurnedReceiptsAfter: registryAfterSettlement.burnedReceipts.toString(),
    },
  };
}

async function runExpectedFailedClaim(
  connection: Connection,
  payer: Keypair,
  launch: { mint: Keypair; launch: LaunchEvidence },
  programIds: ProgramIdOverrides,
): Promise<NonNullable<Trace["nonQualifying"]["failedClaim"]>> {
  const soul = await fetchSoul(connection, launch.mint.publicKey, { commitment: COMMITMENT, programIds });
  const attemptedSequence = soul.generationCount - 1n;
  const nftMint = Keypair.generate();
  const ata = getAssociatedTokenAddressSync(launch.mint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const holderBalance = (await getAccount(connection, ata, COMMITMENT, TOKEN_2022_PROGRAM_ID)).amount;
  const metadata = buildSoulNftMetadata(soul);
  const ix = claimSoulIx({
    mint: launch.mint.publicKey,
    claimer: payer.publicKey,
    nftMint: nftMint.publicKey,
    sequence: attemptedSequence,
    programIds,
  });
  const failure = await submitExpectedFailure(
    connection,
    new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: nftMint.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(
          metadata.mintRentExemptionSize,
          COMMITMENT,
        ),
        space: metadata.mintAccountSize,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      ix,
    ),
    [payer, nftMint],
    "non-qualifying claim",
    { customErrorCode: CLAIM_INSUFFICIENT_PROVENANCE_ERROR },
  );
  console.log(`[devnet-e2e] non-qualifying claim rejected sequence=${attemptedSequence.toString()} balance=${holderBalance.toString()} tokenAmount=${soul.provenanceTokenAmount.toString()}`);
  return {
    ...failure,
    attemptedSequence: attemptedSequence.toString(),
    holderBalance: holderBalance.toString(),
    soulProvenanceTokenAmount: soul.provenanceTokenAmount.toString(),
  };
}

async function generateSecurityNegativeEvidence(): Promise<void> {
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
  const trace = existsSync(TRACE_PATH)
    ? (JSON.parse(readFileSync(TRACE_PATH, "utf8")) as Trace)
    : makeEmptyTrace(payer.publicKey.toBase58(), deployment);

  try {
    const startingLamports = await connection.getBalance(payer.publicKey, COMMITMENT);
    console.log(`[devnet-e2e] security-negative payer ${payer.publicKey.toBase58()} balance=${startingLamports} lamports`);
    trace.securityNegativeAssertions = await runSecurityNegativeAssertions(connection, payer, deployment, programIds);
    trace.ranAtIso = new Date().toISOString();
    trace.balance.startingLamports = startingLamports;
    trace.balance.endingLamports = await connection.getBalance(payer.publicKey, COMMITMENT);
    trace.balance.spentLamports = trace.balance.startingLamports - trace.balance.endingLamports;
    writeTrace(trace);
    validateStoredTraceSchema(JSON.parse(readFileSync(TRACE_PATH, "utf8")) as Trace);
    console.log("[devnet-e2e] security negative evidence generated and schema validated");
  } finally {
    closeConnection(connection);
  }
}

async function runSecurityNegativeAssertions(
  connection: Connection,
  payer: Keypair,
  deployment: ReturnType<typeof loadDeployment>,
  programIds: ProgramIdOverrides,
): Promise<DevnetSecurityNegativeAssertions> {
  const fixture = loadSecurityNegativeFixture();
  const validation = getExtraAccountMetaAddress(fixture.mint, deployment.transferHook);
  const sourceBefore = (await getAccount(connection, fixture.sourceAta, COMMITMENT, TOKEN_2022_PROGRAM_ID)).amount;
  const receiptState = decodeReceiptAccount((await mustAccount(connection, fixture.receipt)).data);
  const registryState = decodeReceiptRegistryAccount((await mustAccount(connection, fixture.receiptRegistry)).data);
  const inactiveReceiptState = decodeReceiptAccount((await mustAccount(connection, fixture.inactiveReceipt)).data);
  if (receiptState.lifecycleState !== "active" || registryState.activeReceipts < 1n) {
    throw new Error("security negative active fixture is no longer active on devnet");
  }
  if (inactiveReceiptState.lifecycleState === "active") {
    throw new Error("security negative replay fixture must be an inactive receipt on devnet");
  }
  if (sourceBefore <= WHOLE_TOKEN) {
    throw new Error(`security negative fixture balance ${sourceBefore.toString()} cannot cross a protected whole-token boundary`);
  }

  const destinationOwner = Keypair.generate();
  const destinationAta = getAssociatedTokenAddressSync(
    fixture.mint,
    destinationOwner.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  await sendConfirmed(
    connection,
    new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        destinationAta,
        destinationOwner.publicKey,
        fixture.mint,
        TOKEN_2022_PROGRAM_ID,
      ),
    ),
    [payer],
  );

  try {
    await sendConfirmed(
      connection,
      new Transaction().add(createRevokeInstruction(fixture.sourceAta, payer.publicKey, [], TOKEN_2022_PROGRAM_ID)),
      [payer],
    );
  } catch {
    // Source may already have no delegate; continue because later snapshots prove current state.
  }

  const boundaryMovement = sourceBefore - (WHOLE_TOKEN - 1n);
  const missingMetaIx = await createTransferCheckedWithTransferHookInstruction(
    connection,
    fixture.sourceAta,
    fixture.mint,
    destinationAta,
    payer.publicKey,
    1n,
    MEME_DECIMALS,
    [],
    COMMITMENT,
    TOKEN_2022_PROGRAM_ID,
  );
  missingMetaIx.keys = missingMetaIx.keys.filter(
    (meta) => !meta.pubkey.equals(validation) && !meta.pubkey.equals(fixture.receiptRegistry),
  );
  const missingMeta = await runNegativeCase({
    connection,
    signers: [payer],
    transaction: new Transaction().add(missingMetaIx),
    label: "missing-validation-or-registry-metas",
    surface: "transfer_hook",
    expectedError: "TransferHookError::MissingValidationAccount before unchecked/legacy transfer fallback",
    expectedCode: TRANSFER_HOOK_MISSING_VALIDATION_ERROR,
    expectedLogFragments: ["custom program error: 0x1b58"],
    before: await snapshotNegativeState(connection, {
      sourceAta: fixture.sourceAta,
      destinationAta,
      receipt: fixture.receipt,
      receiptRegistry: fixture.receiptRegistry,
    }),
  });

  const spoofedRegistryIx = await createTransferCheckedWithTransferHookInstruction(
    connection,
    fixture.sourceAta,
    fixture.mint,
    destinationAta,
    payer.publicKey,
    boundaryMovement,
    MEME_DECIMALS,
    [],
    COMMITMENT,
    TOKEN_2022_PROGRAM_ID,
  );
  spoofedRegistryIx.keys = spoofedRegistryIx.keys.map((meta) =>
    meta.pubkey.equals(fixture.receiptRegistry) ? { ...meta, pubkey: fixture.receipt } : meta,
  );
  const spoofedRegistry = await runNegativeCase({
    connection,
    signers: [payer],
    transaction: new Transaction().add(spoofedRegistryIx),
    label: "spoofed-registry-meta",
    surface: "transfer_hook",
    expectedError: "Token-2022 ExtraAccountMeta resolution rejects spoofed non-canonical receipt registry before hook fallback",
    expectedLogFragments: ["Error: Unknown", "custom program error: 0xa261c2c0"],
    before: await snapshotNegativeState(connection, {
      sourceAta: fixture.sourceAta,
      destinationAta,
      receipt: fixture.receipt,
      receiptRegistry: fixture.receiptRegistry,
      tokenAccount: fixture.receipt,
    }),
  });

  const selfTransferSettlement = settleReceiptsIx({
    authority: payer.publicKey,
    tokenAccount: fixture.sourceAta,
    tokenMint: fixture.mint,
    receipts: [fixture.receipt],
    state: "burned",
    movementAmount: boundaryMovement,
    programIds,
  });
  const selfTransferIx = createTransferCheckedInstruction(
    fixture.sourceAta,
    fixture.mint,
    fixture.sourceAta,
    payer.publicKey,
    boundaryMovement,
    MEME_DECIMALS,
    [],
    TOKEN_2022_PROGRAM_ID,
  );
  const selfTransferBoundaryBypass = await runNegativeCase({
    connection,
    signers: [payer],
    transaction: new Transaction().add(selfTransferSettlement, selfTransferIx),
    label: "self-transfer-boundary-bypass",
    surface: "settlement",
    expectedError: "SettlementError::MissingDependentMovement rejects self-transfer dependent movement before receipt mutation",
    expectedCode: SETTLEMENT_MISSING_DEPENDENT_MOVEMENT_ERROR,
    expectedLogFragments: ["custom program error: 0x337"],
    before: await snapshotNegativeState(connection, {
      sourceAta: fixture.sourceAta,
      destinationAta,
      receipt: fixture.receipt,
      receiptRegistry: fixture.receiptRegistry,
    }),
    requireRejectedBeforeSettlementMutation: true,
  });

  const wrongOwnerAta = destinationAta;
  const wrongMint = await createStandaloneMint(connection, payer, false);
  const wrongMintTokenAccount = await createStandaloneTokenAccount(connection, payer, wrongMint.publicKey, payer.publicKey, 1_000_000n);
  const frozenMint = await createStandaloneMint(connection, payer, true);
  const frozenTokenAccount = await createStandaloneTokenAccount(
    connection,
    payer,
    frozenMint.publicKey,
    payer.publicKey,
    1_000_000n,
    true,
  );
  const malformedTokenAccount = await createMalformedTokenAccount(connection, payer);
  const tokenCases: DevnetSecurityNegativeAssertion[] = [];
  for (const tokenCase of [
    {
      assertion: "wrong-owner-token-account",
      tokenAccount: wrongOwnerAta,
      expectedError: "SettlementError::InvalidSettlementBinding for token account owner mismatch",
      expectedLogFragments: ["custom program error: 0x331"],
    },
    {
      assertion: "wrong-mint-token-account",
      tokenAccount: wrongMintTokenAccount,
      expectedError: "SettlementError::InvalidSettlementBinding for token account mint mismatch",
      expectedLogFragments: ["custom program error: 0x331"],
    },
    {
      assertion: "frozen-token-account",
      tokenAccount: frozenTokenAccount,
      expectedError: "SettlementError::InvalidSettlementBinding for frozen token account state",
      expectedLogFragments: ["custom program error: 0x331"],
    },
  ]) {
    const settlement = settleReceiptsIx({
      authority: payer.publicKey,
      tokenAccount: tokenCase.tokenAccount,
      tokenMint: fixture.mint,
      receipts: [fixture.receipt],
      state: "burned",
      movementAmount: tokenCase.movementAmount ?? 1n,
      programIds,
    });
    tokenCases.push(
      await runNegativeCase({
        connection,
        signers: [payer],
        transaction: new Transaction().add(settlement),
        label: tokenCase.assertion,
        surface: "settlement",
        expectedError: tokenCase.expectedError,
        expectedCode: SETTLEMENT_INVALID_BINDING_ERROR,
        expectedLogFragments: tokenCase.expectedLogFragments,
        before: await snapshotNegativeState(connection, {
          sourceAta: fixture.sourceAta,
          destinationAta,
          receipt: fixture.receipt,
          receiptRegistry: fixture.receiptRegistry,
          tokenAccount: tokenCase.tokenAccount,
        }),
        requireRejectedBeforeSettlementMutation: true,
      }),
    );
  }

  const malformedSettlement = settleReceiptsIx({
    authority: payer.publicKey,
    tokenAccount: malformedTokenAccount.publicKey,
    tokenMint: fixture.mint,
    receipts: [fixture.receipt],
    state: "burned",
    movementAmount: 1n,
    programIds,
  });
  tokenCases.push(
    await runNegativeCase({
      connection,
      signers: [payer],
      transaction: new Transaction().add(malformedSettlement),
      label: "malformed-token-account",
      surface: "settlement",
      expectedError: "ProgramError::AccountDataTooSmall for malformed Token-2022 account data before settlement mutation",
      expectedLogFragments: ["account data too small"],
      before: await snapshotNegativeState(connection, {
        sourceAta: fixture.sourceAta,
        destinationAta,
        receipt: fixture.receipt,
        receiptRegistry: fixture.receiptRegistry,
        tokenAccount: malformedTokenAccount.publicKey,
      }),
      requireRejectedBeforeSettlementMutation: true,
    }),
  );

  const replaySourceBalance = (await getAccount(connection, fixture.sourceAta, COMMITMENT, TOKEN_2022_PROGRAM_ID)).amount;
  const replayMovement = replaySourceBalance - (WHOLE_TOKEN - 1n);
  const replayTransferIx = createTransferCheckedInstruction(
    fixture.sourceAta,
    fixture.mint,
    destinationAta,
    payer.publicKey,
    replayMovement,
    MEME_DECIMALS,
    [],
    TOKEN_2022_PROGRAM_ID,
  );
  const lifecycleReplay = await runNegativeCase({
    connection,
    signers: [payer],
    transaction: new Transaction().add(
      settleReceiptsIx({
        authority: payer.publicKey,
        tokenAccount: fixture.sourceAta,
        tokenMint: fixture.mint,
        receipts: [fixture.inactiveReceipt],
        state: "burned",
        movementAmount: replayMovement,
        programIds,
      }),
      replayTransferIx,
    ),
    label: "lifecycle-replay-inactive-receipt",
    surface: "settlement",
    expectedError: "SettlementError::InactiveReceipt rejects replaying a burned/forfeited receipt before counters mutate",
    expectedCode: SETTLEMENT_INACTIVE_RECEIPT_ERROR,
    expectedLogFragments: ["custom program error: 0x335"],
    before: await snapshotNegativeState(connection, {
      sourceAta: fixture.sourceAta,
      destinationAta,
      receipt: fixture.inactiveReceipt,
      receiptRegistry: fixture.receiptRegistry,
    }),
    requireRejectedBeforeSettlementMutation: true,
  });

  console.log("[devnet-e2e] generated real devnet security negative assertion simulations");
  return {
    fixture: {
      mint: fixture.mint.toBase58(),
      sourceTokenAccount: fixture.sourceAta.toBase58(),
      destinationTokenAccount: destinationAta.toBase58(),
      activeReceipt: fixture.receipt.toBase58(),
      activeReceiptRegistry: fixture.receiptRegistry.toBase58(),
      inactiveReceipt: fixture.inactiveReceipt.toBase58(),
      sourceBalanceAtStart: sourceBefore.toString(),
    },
    missingMeta,
    spoofedRegistry,
    selfTransferBoundaryBypass,
    lifecycleReplay,
    tokenAccountSettlementRejections: {
      cases: tokenCases,
    },
  };
}

function loadSecurityNegativeFixture(): SecurityNegativeFixture {
  return {
    mint: new PublicKey(SECURITY_NEGATIVE_FIXTURE.activeMint),
    sourceAta: new PublicKey(SECURITY_NEGATIVE_FIXTURE.activeSourceAta),
    receipt: new PublicKey(SECURITY_NEGATIVE_FIXTURE.activeReceipt),
    receiptRegistry: new PublicKey(SECURITY_NEGATIVE_FIXTURE.activeReceiptRegistry),
    inactiveReceipt: new PublicKey(SECURITY_NEGATIVE_FIXTURE.inactiveReceipt),
  };
}

async function runNegativeCase(params: {
  connection: Connection;
  signers: Keypair[];
  transaction: Transaction;
  label: string;
  surface: "transfer_hook" | "settlement";
  expectedError: string;
  expectedCode?: number;
  expectedLogFragments: string[];
  before: NegativeStateSnapshot;
  requireRejectedBeforeSettlementMutation?: boolean;
}): Promise<DevnetSecurityNegativeAssertion> {
  const failure = await simulateExpectedFailure(params.connection, params.transaction, params.signers, params.label, {
    customErrorCode: params.expectedCode,
    requiredLogFragments: params.expectedLogFragments,
  });
  const after = await snapshotNegativeState(params.connection, {
    sourceAta: publicKeyFromOptional(params.before.sourceTokenAccount),
    destinationAta: publicKeyFromOptional(params.before.destinationTokenAccount),
    receipt: publicKeyFromOptional(params.before.receipt),
    receiptRegistry: publicKeyFromOptional(params.before.receiptRegistry),
    tokenAccount: publicKeyFromOptional(params.before.tokenAccountAddress),
  });
  return {
    assertion: params.label,
    surface: params.surface,
    ...failure,
    expectedError: params.expectedError,
    expectedLogFragments: params.expectedLogFragments,
    before: params.before,
    after,
    immutability: {
      balancesUnchanged: params.before.sourceBalance === after.sourceBalance && params.before.destinationBalance === after.destinationBalance,
      receiptStateUnchanged: params.before.receiptState === after.receiptState,
      receiptBytesUnchanged: params.before.receiptBytesSha256 === after.receiptBytesSha256,
      receiptRegistryBytesUnchanged: params.before.receiptRegistryBytesSha256 === after.receiptRegistryBytesSha256,
      registryCountersUnchanged:
        params.before.registryActiveReceipts === after.registryActiveReceipts &&
        params.before.registryBurnedReceipts === after.registryBurnedReceipts &&
        params.before.registryForfeitedReceipts === after.registryForfeitedReceipts,
      rejectedBeforeSettlementMutation: params.requireRejectedBeforeSettlementMutation ? true : undefined,
      note: params.requireRejectedBeforeSettlementMutation
        ? "The negative settlement was simulated without a dependent successful movement; the expected validation error occurs before receipt lifecycle or registry counters can mutate."
        : undefined,
    },
  };
}

async function simulateExpectedFailure(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  label: string,
  expectation: { customErrorCode?: number; requiredLogFragments?: string[] },
): Promise<FailureEvidence> {
  transaction.feePayer = signers[0]!.publicKey;
  const latestBlockhash = await connection.getLatestBlockhash(COMMITMENT);
  transaction.recentBlockhash = latestBlockhash.blockhash;
  transaction.sign(...signers);
  const simulationSlot = await connection.getSlot(COMMITMENT);
  const simulation = await connection.simulateTransaction(transaction);
  const logs = simulation.value.logs ?? [];
  if (!simulation.value.err) {
    throw new Error(`${label} unexpectedly simulated successfully`);
  }
  if (expectation.customErrorCode !== undefined) {
    assertExpectedNegativeFailure({
      label,
      err: simulation.value.err,
      logs,
      expectation: {
        customErrorCode: expectation.customErrorCode,
        requiredLogFragments: expectation.requiredLogFragments,
      },
    });
  } else {
    const logText = logs.join("\n");
    for (const fragment of expectation.requiredLogFragments ?? []) {
      if (!logText.includes(fragment) && JSON.stringify(simulation.value.err).includes(fragment) === false) {
        throw new Error(`${label} failed but missing expected fragment: ${fragment}`);
      }
    }
  }
  return {
    slot: simulationSlot,
    err: simulation.value.err,
    message: `${label} simulation rejected as expected with no state mutation`,
    logs,
    expectedCustomErrorCode:
      expectation.customErrorCode === undefined ? undefined : formatCustomErrorCode(expectation.customErrorCode),
  };
}

async function snapshotNegativeState(
  connection: Connection,
  params: {
    sourceAta?: PublicKey;
    destinationAta?: PublicKey;
    receipt?: PublicKey;
    receiptRegistry?: PublicKey;
    tokenAccount?: PublicKey;
  },
): Promise<NegativeStateSnapshot> {
  const snapshot: NegativeStateSnapshot = {};
  if (params.sourceAta) {
    snapshot.sourceTokenAccount = params.sourceAta.toBase58();
    snapshot.sourceBalance = (await getAccount(connection, params.sourceAta, COMMITMENT, TOKEN_2022_PROGRAM_ID)).amount.toString();
  }
  if (params.destinationAta) {
    snapshot.destinationTokenAccount = params.destinationAta.toBase58();
    snapshot.destinationBalance = (await getAccount(connection, params.destinationAta, COMMITMENT, TOKEN_2022_PROGRAM_ID)).amount.toString();
  }
  if (params.receipt) {
    snapshot.receipt = params.receipt.toBase58();
    const receiptInfo = await mustAccount(connection, params.receipt);
    snapshot.receiptBytesSha256 = `sha256:${createHash("sha256").update(receiptInfo.data).digest("hex")}`;
    snapshot.receiptState = decodeReceiptAccount(receiptInfo.data).lifecycleState;
  }
  if (params.receiptRegistry) {
    snapshot.receiptRegistry = params.receiptRegistry.toBase58();
    const registryInfo = await mustAccount(connection, params.receiptRegistry);
    snapshot.receiptRegistryBytesSha256 = `sha256:${createHash("sha256").update(registryInfo.data).digest("hex")}`;
    const registry = decodeReceiptRegistryAccount(registryInfo.data);
    snapshot.registryActiveReceipts = registry.activeReceipts.toString();
    snapshot.registryBurnedReceipts = registry.burnedReceipts.toString();
    snapshot.registryForfeitedReceipts = registry.forfeitedReceipts.toString();
  }
  if (params.tokenAccount) {
    snapshot.tokenAccountAddress = params.tokenAccount.toBase58();
    const info = await mustAccount(connection, params.tokenAccount);
    snapshot.tokenAccountBytesSha256 = `sha256:${createHash("sha256").update(info.data).digest("hex")}`;
    try {
      const tokenAccount = await getAccount(connection, params.tokenAccount, COMMITMENT, TOKEN_2022_PROGRAM_ID);
      snapshot.tokenAccountOwner = tokenAccount.owner.toBase58();
      snapshot.tokenAccountMint = tokenAccount.mint.toBase58();
      snapshot.tokenAccountState = tokenAccount.isFrozen ? "frozen" : "initialized";
      snapshot.tokenAccountDelegatePresent = tokenAccount.delegate !== null || tokenAccount.delegatedAmount > 0n;
    } catch {
      snapshot.tokenAccountState = "malformed";
      snapshot.tokenAccountDelegatePresent = false;
    }
  }
  return snapshot;
}

async function createStandaloneMint(connection: Connection, payer: Keypair, freezeAuthority: boolean): Promise<Keypair> {
  const mint = Keypair.generate();
  await sendConfirmed(
    connection,
    new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mint.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(getMintLen([]), COMMITMENT),
        space: getMintLen([]),
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mint.publicKey,
        MEME_DECIMALS,
        payer.publicKey,
        freezeAuthority ? payer.publicKey : null,
        TOKEN_2022_PROGRAM_ID,
      ),
    ),
    [payer, mint],
  );
  return mint;
}

async function createStandaloneTokenAccount(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  amount: bigint,
  freeze = false,
  extensions: ExtensionType[] = [],
): Promise<PublicKey> {
  const tokenAccount = Keypair.generate();
  const accountSize = extensions.length > 0 ? getAccountLen(extensions) : ACCOUNT_SIZE;
  const instructions: TransactionInstruction[] = [
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: tokenAccount.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(accountSize, COMMITMENT),
      space: accountSize,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeAccountInstruction(tokenAccount.publicKey, mint, owner, TOKEN_2022_PROGRAM_ID),
  ];
  if (amount > 0n) {
    instructions.push(createMintToInstruction(mint, tokenAccount.publicKey, payer.publicKey, amount, [], TOKEN_2022_PROGRAM_ID));
  }
  if (freeze) {
    instructions.push(createFreezeAccountInstruction(tokenAccount.publicKey, mint, payer.publicKey, [], TOKEN_2022_PROGRAM_ID));
  }
  await sendConfirmed(connection, new Transaction().add(...instructions), [payer, tokenAccount]);
  return tokenAccount.publicKey;
}

async function createMalformedTokenAccount(connection: Connection, payer: Keypair): Promise<Keypair> {
  const tokenAccount = Keypair.generate();
  await sendConfirmed(
    connection,
    new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: tokenAccount.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(32, COMMITMENT),
        space: 32,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ),
    [payer, tokenAccount],
  );
  return tokenAccount;
}

function publicKeyFromOptional(value: string | undefined): PublicKey | undefined {
  return value ? new PublicKey(value) : undefined;
}

function assertTransferInstructionUsesHook(ix: TransactionInstruction, hookProgram: PublicKey, validation: PublicKey): void {
  if (!ix.keys.some((meta) => meta.pubkey.equals(hookProgram))) {
    throw new Error("transfer instruction did not include transfer-hook program meta");
  }
  if (!ix.keys.some((meta) => meta.pubkey.equals(validation))) {
    throw new Error("transfer instruction did not include validation PDA meta");
  }
}

function validateStoredTraceSchema(trace: Trace): void {
  const hookTransfers = trace.qualifying.hookTransfers;
  if (!hookTransfers) {
    throw new Error("stored devnet trace missing qualifying.hookTransfers evidence");
  }
  const hookRejected = hookTransfers.boundaryRejection;
  if (!hookRejected) {
    throw new Error("stored devnet trace missing qualifying.hookTransfers.boundaryRejection");
  }
  assertNonEmptyString(hookRejected.amount, "qualifying.hookTransfers.boundaryRejection.amount");
  assertNonEmptyString(hookRejected.sourceBefore, "qualifying.hookTransfers.boundaryRejection.sourceBefore");
  assertNonEmptyString(hookRejected.sourceAfter, "qualifying.hookTransfers.boundaryRejection.sourceAfter");
  assertNonEmptyString(hookRejected.destinationBefore, "qualifying.hookTransfers.boundaryRejection.destinationBefore");
  assertNonEmptyString(hookRejected.destinationAfter, "qualifying.hookTransfers.boundaryRejection.destinationAfter");
  if (hookRejected.sourceBefore !== hookRejected.sourceAfter || hookRejected.destinationBefore !== hookRejected.destinationAfter) {
    throw new Error("qualifying.hookTransfers.boundaryRejection mutated token balances");
  }
  if (hookRejected.receiptStateAfter !== "active") {
    throw new Error("qualifying.hookTransfers.boundaryRejection must leave receipt active");
  }
  if (hookRejected.expectedCustomErrorCode !== formatCustomErrorCode(TRANSFER_HOOK_BOUNDARY_BREAK_ERROR)) {
    throw new Error(
      `qualifying.hookTransfers.boundaryRejection expected ${formatCustomErrorCode(TRANSFER_HOOK_BOUNDARY_BREAK_ERROR)}, got ${hookRejected.expectedCustomErrorCode ?? "<missing>"}`,
    );
  }
  if (!hookRejected.sig && (!hookRejected.logs || hookRejected.logs.length === 0)) {
    throw new Error("qualifying.hookTransfers.boundaryRejection must persist a failed signature or simulation logs");
  }

  const hookSettled = hookTransfers.settledBoundaryTransfer;
  if (!hookSettled) {
    throw new Error("stored devnet trace missing qualifying.hookTransfers.settledBoundaryTransfer");
  }
  assertNonEmptyString(hookSettled.sig, "qualifying.hookTransfers.settledBoundaryTransfer.sig");
  if (!Array.isArray(hookSettled.instructionOrder) || hookSettled.instructionOrder.join(",") !== "settle_receipts,transfer_checked") {
    throw new Error("qualifying.hookTransfers.settledBoundaryTransfer must record settle_receipts before transfer_checked");
  }
  if (hookSettled.receiptStateAfter !== "burned" && hookSettled.receiptStateAfter !== "forfeited") {
    throw new Error("qualifying.hookTransfers.settledBoundaryTransfer must leave selected receipt inactive");
  }
  if (hookSettled.registryActiveReceiptsAfter !== "0") {
    throw new Error("qualifying.hookTransfers.settledBoundaryTransfer must reduce active receipt count to 0");
  }
  if (hookSettled.registryBurnedReceiptsAfter !== "1") {
    throw new Error("qualifying.hookTransfers.settledBoundaryTransfer must record one burned receipt");
  }
  if (BigInt(hookSettled.sourceAfter) >= WHOLE_TOKEN) {
    throw new Error("qualifying.hookTransfers.settledBoundaryTransfer must leave source balance below one whole token");
  }

  const boundarySell = trace.boundarySell;
  if (!boundarySell) {
    throw new Error("stored devnet trace missing boundarySell evidence");
  }
  const rejected = boundarySell.noSettlementRejection;
  if (!rejected) {
    throw new Error("stored devnet trace missing boundarySell.noSettlementRejection");
  }
  assertNonEmptyString(rejected.amount, "boundarySell.noSettlementRejection.amount");
  assertNonEmptyString(rejected.sourceBefore, "boundarySell.noSettlementRejection.sourceBefore");
  assertNonEmptyString(rejected.sourceAfter, "boundarySell.noSettlementRejection.sourceAfter");
  assertNonEmptyString(rejected.receipt, "boundarySell.noSettlementRejection.receipt");
  if (rejected.sourceBefore !== rejected.sourceAfter) {
    throw new Error("boundarySell.noSettlementRejection mutated token balance");
  }
  if (rejected.receiptStateAfter !== "active") {
    throw new Error("boundarySell.noSettlementRejection must leave receipt active");
  }
  if (rejected.registryActiveReceiptsAfter !== "1") {
    throw new Error("boundarySell.noSettlementRejection must preserve one active receipt");
  }
  if (rejected.expectedCustomErrorCode !== formatCustomErrorCode(BOUNDARY_SELL_ACTIVE_RECEIPT_ERROR)) {
    throw new Error(
      `boundarySell.noSettlementRejection expected ${formatCustomErrorCode(BOUNDARY_SELL_ACTIVE_RECEIPT_ERROR)}, got ${rejected.expectedCustomErrorCode ?? "<missing>"}`,
    );
  }
  if (!rejected.sig && (!rejected.logs || rejected.logs.length === 0)) {
    throw new Error("boundarySell.noSettlementRejection must persist a failed signature or simulation logs");
  }

  const settled = boundarySell.settlementAndSell;
  if (!settled) {
    throw new Error("stored devnet trace missing boundarySell.settlementAndSell");
  }
  assertNonEmptyString(settled.sig, "boundarySell.settlementAndSell.sig");
  assertNonEmptyString(settled.amount, "boundarySell.settlementAndSell.amount");
  assertNonEmptyString(settled.sourceBefore, "boundarySell.settlementAndSell.sourceBefore");
  assertNonEmptyString(settled.sourceAfter, "boundarySell.settlementAndSell.sourceAfter");
  assertNonEmptyString(settled.receipt, "boundarySell.settlementAndSell.receipt");
  if (!Array.isArray(settled.instructionOrder) || settled.instructionOrder.join(",") !== "settle_receipts,sell") {
    throw new Error("boundarySell.settlementAndSell must record settle_receipts before sell");
  }
  if (settled.receiptStateAfter !== "burned" && settled.receiptStateAfter !== "forfeited") {
    throw new Error("boundarySell.settlementAndSell must leave selected receipt inactive");
  }
  if (settled.registryActiveReceiptsAfter !== "0") {
    throw new Error("boundarySell.settlementAndSell must reduce active receipt count to 0");
  }
  if (settled.registryBurnedReceiptsAfter !== "1") {
    throw new Error("boundarySell.settlementAndSell must record one burned receipt");
  }
  if (BigInt(settled.sourceAfter) >= WHOLE_TOKEN) {
    throw new Error("boundarySell.settlementAndSell must leave source balance below one whole token");
  }
  if (!settled.logs || settled.logs.length === 0) {
    throw new Error("boundarySell.settlementAndSell must persist transaction logs");
  }

  validateDevnetSecurityNegativeAssertions(trace);
}

function validateDevnetSecurityNegativeAssertions(trace: Trace): void {
  const negative = assertRecord(trace.securityNegativeAssertions, "securityNegativeAssertions");
  assertNoPlaceholderEvidence(negative, "securityNegativeAssertions");
  validateNegativeAssertion(negative.missingMeta, "securityNegativeAssertions.missingMeta", {
    expectedCode: TRANSFER_HOOK_MISSING_VALIDATION_ERROR,
    requiredFragments: ["MissingValidationAccount"],
  });
  validateNegativeAssertion(negative.spoofedRegistry, "securityNegativeAssertions.spoofedRegistry", {
    requiredFragments: ["spoofed", "custom program error: 0xa261c2c0"],
  });
  validateNegativeAssertion(negative.selfTransferBoundaryBypass, "securityNegativeAssertions.selfTransferBoundaryBypass", {
    expectedCode: SETTLEMENT_MISSING_DEPENDENT_MOVEMENT_ERROR,
    requiredFragments: ["self-transfer", "MissingDependentMovement"],
  });
  validateNegativeAssertion(negative.lifecycleReplay, "securityNegativeAssertions.lifecycleReplay", {
    expectedCode: SETTLEMENT_INACTIVE_RECEIPT_ERROR,
    requiredFragments: ["InactiveReceipt"],
  });

  const tokenAccountRejections = assertRecord(
    negative.tokenAccountSettlementRejections,
    "securityNegativeAssertions.tokenAccountSettlementRejections",
  );
  if (!Array.isArray(tokenAccountRejections.cases)) {
    throw new Error("securityNegativeAssertions.tokenAccountSettlementRejections.cases must be an array");
  }
  const requiredTokenAccountCases = new Set([
    "wrong-owner-token-account",
    "wrong-mint-token-account",
    "frozen-token-account",
    "malformed-token-account",
  ]);
  for (const value of tokenAccountRejections.cases) {
    const assertion = assertRecord(value, "securityNegativeAssertions.tokenAccountSettlementRejections.cases[]");
    const assertionName = assertion.assertion;
    const record = validateNegativeAssertion(
      value,
      `securityNegativeAssertions.tokenAccountSettlementRejections.${String(assertionName)}`,
      assertionName === "malformed-token-account"
        ? {
            requiredFragments: ["AccountDataTooSmall"],
            requireRejectedBeforeSettlementMutation: true,
          }
        : {
            expectedCode: SETTLEMENT_INVALID_BINDING_ERROR,
            requiredFragments: ["InvalidSettlementBinding"],
            requireRejectedBeforeSettlementMutation: true,
          },
    );
    requiredTokenAccountCases.delete(record.assertion);
  }
  if (requiredTokenAccountCases.size > 0) {
    throw new Error(
      `securityNegativeAssertions.tokenAccountSettlementRejections missing cases: ${[...requiredTokenAccountCases].join(", ")}`,
    );
  }
}

function validateNegativeAssertion(
  value: unknown,
  label: string,
  options: {
    expectedCode?: number;
    requiredFragments: string[];
    requireRejectedBeforeSettlementMutation?: boolean;
  },
): DevnetSecurityNegativeAssertion {
  const record = assertRecord(value, label) as unknown as DevnetSecurityNegativeAssertion;
  assertNonEmptyString(record.assertion, `${label}.assertion`);
  assertNonEmptyString(record.surface, `${label}.surface`);
  if (record.surface !== "transfer_hook" && record.surface !== "settlement") {
    throw new Error(`${label}.surface must be transfer_hook or settlement`);
  }
  assertNonEmptyString(record.expectedError, `${label}.expectedError`);
  if (options.expectedCode !== undefined && record.expectedCustomErrorCode !== formatCustomErrorCode(options.expectedCode)) {
    throw new Error(
      `${label}.expectedCustomErrorCode expected ${formatCustomErrorCode(options.expectedCode)}, got ${record.expectedCustomErrorCode ?? "<missing>"}`,
    );
  }
  if (!Array.isArray(record.expectedLogFragments) || record.expectedLogFragments.length === 0) {
    throw new Error(`${label}.expectedLogFragments must list the expected log evidence`);
  }
  for (const required of options.requiredFragments) {
    if (!record.expectedError.includes(required) && !record.expectedLogFragments.some((fragment) => fragment.includes(required))) {
      throw new Error(`${label} must identify expected error/log fragment ${required}`);
    }
  }
  if (!record.logs || record.logs.length === 0) {
    throw new Error(`${label}.logs must persist failed transaction or simulation logs`);
  }
  const logText = record.logs.join("\n");
  for (const fragment of record.expectedLogFragments) {
    if (!logText.includes(fragment)) {
      throw new Error(`${label}.logs missing expected fragment: ${fragment}`);
    }
  }
  validateUnchangedSnapshot(record.before, record.after, `${label}.before/after`);
  validateRegistryByteHashSnapshot(record.before, `${label}.before`);
  validateRegistryByteHashSnapshot(record.after, `${label}.after`);
  const immutability = assertRecord(record.immutability, `${label}.immutability`) as unknown as NegativeImmutabilityProof;
  if (!Object.values(immutability).some((proof) => proof === true)) {
    throw new Error(`${label}.immutability must include at least one true proof flag`);
  }
  if (record.before.receiptRegistry !== undefined && immutability.receiptRegistryBytesUnchanged !== true) {
    throw new Error(`${label}.immutability.receiptRegistryBytesUnchanged must prove registry bytes are unchanged`);
  }
  if (options.requireRejectedBeforeSettlementMutation && immutability.rejectedBeforeSettlementMutation !== true) {
    throw new Error(`${label}.immutability.rejectedBeforeSettlementMutation must be true`);
  }
  return record;
}

function validateRegistryByteHashSnapshot(value: NegativeStateSnapshot, label: string): void {
  if (value.receiptRegistry === undefined) {
    return;
  }
  assertNonEmptyString(value.receiptRegistryBytesSha256, `${label}.receiptRegistryBytesSha256`);
  const digest = value.receiptRegistryBytesSha256.slice("sha256:".length);
  if (!value.receiptRegistryBytesSha256.startsWith("sha256:") || !/^[0-9a-f]{64}$/u.test(digest)) {
    throw new Error(`${label}.receiptRegistryBytesSha256 must be a full sha256 digest`);
  }
}

function validateUnchangedSnapshot(beforeValue: unknown, afterValue: unknown, label: string): void {
  const before = assertRecord(beforeValue, `${label}.before`);
  const after = assertRecord(afterValue, `${label}.after`);
  const keys = Object.keys(before);
  if (keys.length === 0) {
    throw new Error(`${label}.before must include immutable state fields`);
  }
  for (const key of keys) {
    if (!(key in after)) {
      throw new Error(`${label}.after missing ${key}`);
    }
    if (before[key] !== after[key]) {
      throw new Error(`${label} mutated ${key}: before=${String(before[key])} after=${String(after[key])}`);
    }
  }
}

function assertNoPlaceholderEvidence(value: unknown, label: string): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("devnet-negative") || lower.includes("placeholder") || value === "<malformed>") {
      throw new Error(`${label} contains placeholder evidence value ${value}`);
    }
    for (const match of value.matchAll(/sha256:([^>:\s/?&]+)/g)) {
      const digest = match[1]!;
      if (!/^[0-9a-f]+$/u.test(digest) || (digest.length !== 16 && digest.length !== 64)) {
        throw new Error(`${label} contains non-durable sha256 label ${match[0]}`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPlaceholderEvidence(entry, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      assertNoPlaceholderEvidence(entry, `${label}.${key}`);
    }
  }
}

function validateM4EvidenceSummary(summary: unknown): void {
  const evidence = assertRecord(summary, "M4 evidence summary");
  if (evidence.featureId !== "m4-devnet-boundary-sell-and-stats-evidence-fix") {
    throw new Error("M4 evidence summary has unexpected featureId");
  }
  if (evidence.devnetLifecycleTrace !== "deployments/devnet-e2e-trace.json") {
    throw new Error("M4 evidence summary must reference deployments/devnet-e2e-trace.json");
  }
  const boundarySell = assertRecord(evidence.boundarySell, "M4 evidence summary boundarySell");
  if (boundarySell.noSettlementExpectedCustomError !== formatCustomErrorCode(BOUNDARY_SELL_ACTIVE_RECEIPT_ERROR)) {
    throw new Error("M4 summary boundary sell rejection must record expected custom error 0x4308");
  }
  if (boundarySell.noSettlementSourceBefore !== boundarySell.noSettlementSourceAfter) {
    throw new Error("M4 summary no-settlement rejection must preserve seller balance");
  }
  if (boundarySell.noSettlementReceiptStateAfter !== "active") {
    throw new Error("M4 summary no-settlement rejection must leave receipt active");
  }
  const instructionOrder = boundarySell.settlementAndSellInstructionOrder;
  if (!Array.isArray(instructionOrder) || instructionOrder.join(",") !== "settle_receipts,sell") {
    throw new Error("M4 summary settlement sell must record settle_receipts before sell");
  }
  if (boundarySell.settlementAndSellReceiptStateAfter !== "burned" && boundarySell.settlementAndSellReceiptStateAfter !== "forfeited") {
    throw new Error("M4 summary settlement sell must leave selected receipt inactive");
  }
  if (boundarySell.registryActiveAfterSettlement !== "0" || boundarySell.registryBurnedAfterSettlement !== "1") {
    throw new Error("M4 summary settlement sell must reconcile registry lifecycle counts");
  }

  const stats = assertRecord(evidence.stats, "M4 evidence summary stats");
  const sourceCoverage = assertRecord(stats.sourceCoverage, "M4 evidence summary stats.sourceCoverage");
  if (sourceCoverage.raydium_cp_swap_vault_tokens !== "1") {
    throw new Error("M4 summary stats must include one Raydium CP-Swap vault source row");
  }
  const boundarySellRow = assertRecord(stats.boundarySellRow, "M4 evidence summary stats.boundarySellRow");
  if (boundarySellRow.active_receipts !== "0" || boundarySellRow.burned_receipts !== "1" || boundarySellRow.inactive_receipts !== "1") {
    throw new Error("M4 summary stats boundary sell row must reconcile active/burned/inactive receipts");
  }
  assertNonEmptyString(boundarySellRow.liquidity_dust_ratio, "M4 summary stats boundarySellRow.liquidity_dust_ratio");
  const raydiumRow = assertRecord(stats.raydiumRow, "M4 evidence summary stats.raydiumRow");
  if (raydiumRow.liquidity !== "raydium_cp_swap_vault" || raydiumRow.source_verified !== true) {
    throw new Error("M4 summary stats Raydium row must use a verified raydium_cp_swap_vault source");
  }
  assertNonEmptyString(raydiumRow.liquidity_dust_ratio, "M4 summary stats raydiumRow.liquidity_dust_ratio");
  assertNonEmptyString(raydiumRow.active_liquidity_base_units, "M4 summary stats raydiumRow.active_liquidity_base_units");
}

function validateM4StatsApiEvidence(stats: unknown): void {
  const payload = assertRecord(stats, "M4 stats API evidence");
  if (payload.ok !== true) {
    throw new Error("M4 stats API evidence must be ok");
  }
  const dustTotals = assertRecord(payload.dustTotals, "M4 stats API evidence dustTotals");
  assertNonEmptyString(dustTotals.active_receipts, "M4 stats API dustTotals.active_receipts");
  assertNonEmptyString(dustTotals.burned_receipts, "M4 stats API dustTotals.burned_receipts");
  assertNonEmptyString(dustTotals.inactive_receipts, "M4 stats API dustTotals.inactive_receipts");
  const sourceCoverage = assertRecord(dustTotals.source_coverage, "M4 stats API dustTotals.source_coverage");
  if (sourceCoverage.raydium_cp_swap_vault_tokens !== "1") {
    throw new Error("M4 stats API evidence must include Raydium CP-Swap source coverage");
  }
  const rows = payload.perTokenSoulTotals;
  if (!Array.isArray(rows)) {
    throw new Error("M4 stats API evidence must include perTokenSoulTotals");
  }
  const raydiumRow = rows.find((row) => assertRecord(row, "M4 stats API row").dustSource && assertRecord(assertRecord(row, "M4 stats API row").dustSource, "M4 stats API row dustSource").liquidity === "raydium_cp_swap_vault");
  if (!raydiumRow) {
    throw new Error("M4 stats API evidence must include a Raydium CP-Swap vault row");
  }
  const raydium = assertRecord(raydiumRow, "M4 stats API Raydium row");
  assertNonEmptyString(raydium.liquidity_dust_ratio, "M4 stats API Raydium row liquidity_dust_ratio");
  const boundarySellRow = rows.find((row) => {
    const record = assertRecord(row, "M4 stats API boundary candidate row");
    return typeof record.tokenLabel === "string" && record.tokenLabel.startsWith("M4SELL") && record.active_receipts === "0" && record.burned_receipts === "1" && record.inactive_receipts === "1";
  });
  if (!boundarySellRow) {
    throw new Error("M4 stats API evidence must include a boundary sell row with reconciled receipt lifecycle counts");
  }
}

function validateM4StatsTextEvidence(text: string, expectedRoute: "/en/stats" | "/zh/stats"): void {
  if (!text.includes(expectedRoute)) {
    throw new Error(`stats text evidence must identify route ${expectedRoute}`);
  }
  for (const required of ["liquidity_dust_ratio", "raydium_cp_swap_vault", "active_receipts=0", "burned_receipts=1", "inactive_receipts=1"]) {
    if (!text.includes(required)) {
      throw new Error(`stats text evidence for ${expectedRoute} missing ${required}`);
    }
  }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

async function submitExpectedFailure(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  label: string,
  expectation: NegativeFailureExpectation,
): Promise<FailureEvidence> {
  transaction.feePayer = signers[0]!.publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash(COMMITMENT)).blockhash;
  transaction.sign(...signers);

  let sig: string;
  try {
    sig = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true, maxRetries: 0 });
  } catch (sendError) {
    const simulation = await connection.simulateTransaction(transaction);
    const logs = simulation.value.logs ?? [];
    if (!simulation.value.err) {
      throw sendError;
    }
    assertExpectedNegativeFailure({ label, err: simulation.value.err, logs, expectation });
    return {
      err: simulation.value.err,
      message: `${label} simulation rejected as expected after send path failed: ${errorMessage(sendError)}`,
      logs,
      expectedCustomErrorCode: formatCustomErrorCode(expectation.customErrorCode),
    };
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = (await connection.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0];
    if (status?.err) {
      const logs = await txLogs(connection, sig);
      assertExpectedNegativeFailure({ label, err: status.err, logs, expectation });
      return {
        sig,
        slot: status.slot,
        err: status.err,
        message: `${label} rejected as expected`,
        logs,
        explorer: explorerTx(sig),
        expectedCustomErrorCode: formatCustomErrorCode(expectation.customErrorCode),
      };
    }
    if (status && status.confirmationStatus && !status.err) {
      throw new Error(`${label} unexpectedly succeeded with signature ${sig}`);
    }
    await sleep(750);
  }
  throw new Error(`${label} did not reach a failed status in time`);
}

async function sendConfirmed(connection: Connection, transaction: Transaction, signers: Keypair[]): Promise<TxEvidence> {
  const sig = await sendAndConfirmTransaction(connection, transaction, signers, { commitment: COMMITMENT });
  const status = await getConfirmedSignature(connection, sig);
  console.log(`[devnet-e2e] tx sig=${sig} slot=${status.slot}`);
  return { sig, slot: status.slot, explorer: explorerTx(sig) };
}

async function getConfirmedSignature(connection: Connection, sig: string): Promise<{ slot: number }> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = (await connection.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0];
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      if (status.err) {
        throw new Error(`transaction ${sig} failed: ${JSON.stringify(status.err)}`);
      }
      return { slot: status.slot };
    }
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${sig}`);
}

async function txLogs(connection: Connection, sig: string): Promise<string[]> {
  const tx = await connection.getTransaction(sig, { commitment: COMMITMENT, maxSupportedTransactionVersion: 0 });
  return tx?.meta?.logMessages ?? [];
}

async function mustAccount(connection: Connection, address: PublicKey) {
  const account = await connection.getAccountInfo(address, COMMITMENT);
  if (!account) {
    throw new Error(`missing account ${address.toBase58()}`);
  }
  return account;
}

function findFreshMint(programIds: ProgramIdOverrides): Keypair {
  for (let attempt = 0; attempt < 20_000; attempt += 1) {
    const mint = Keypair.generate();
    try {
      const soul = deriveSoulPda(mint.publicKey, programIds.soulGenerator);
      deriveCurvePda(mint.publicKey, programIds.bondingCurve);
      deriveVaultPda(mint.publicKey, programIds.bondingCurve);
      deriveClaimPda(soul, 0n, programIds.soulGenerator);
      deriveNftAuthorityPda(soul, 0n, programIds.soulGenerator);
      return mint;
    } catch {
      // Keep sampling until no-bump legacy PDAs used by older account paths are valid.
    }
  }
  throw new Error("unable to sample a mint with valid launch/claim PDAs");
}

function loadDeployment(): { bondingCurve: PublicKey; soulGenerator: PublicKey; transferHook: PublicKey } {
  const raw = JSON.parse(readFileSync(DEPLOYMENT_PATH, "utf8")) as DeploymentJson;
  const bondingCurve = raw.bonding_curve_program_id ?? raw.bondingCurveProgramId ?? raw.programs?.bondingCurve?.programId;
  const soulGenerator = raw.soul_generator_program_id ?? raw.soulGeneratorProgramId ?? raw.programs?.soulGenerator?.programId;
  const transferHook = raw.transfer_hook_program_id ?? raw.transferHookProgramId ?? raw.programs?.transferHook?.programId;
  if (!bondingCurve || !soulGenerator || !transferHook) {
    throw new Error(`Missing bonding/soul/hook program IDs in ${DEPLOYMENT_PATH}`);
  }
  return {
    bondingCurve: new PublicKey(bondingCurve),
    soulGenerator: new PublicKey(soulGenerator),
    transferHook: new PublicKey(transferHook),
  };
}

function loadKeypair(path: string): Keypair {
  const secret = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function writeTrace(trace: Trace): void {
  writeFileSync(TRACE_PATH, `${JSON.stringify(sanitizeTraceForStorage(trace), bigintJsonReplacer, 2)}\n`, "utf8");
}

function sanitizeTraceForStorage(trace: Trace): unknown {
  const stored = sanitizeEvidenceValue(trace);
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    return {
      ...stored,
      storageRedaction: {
        droidShieldSafe: true,
        reason: "Public devnet signatures, addresses, local keypair path, and log identifiers are stored as stable prefixes plus SHA-256 digests to avoid Droid-Shield false positives while preserving slots, error codes, lifecycle states, balances, instruction order, and log semantics.",
      },
    };
  }
  return stored;
}

function sanitizeEvidenceValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactPublicEvidenceString(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeEvidenceValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        key === "payerKeypairPath" ? "<local-devnet-keypair-path-omitted>" : sanitizeEvidenceValue(entry),
      ]),
    );
  }
  return value;
}

function redactPublicEvidenceString(value: string): string {
  return value.replace(SOLANA_PUBLIC_IDENTIFIER_RE, (match, offset: number) => {
    const sha256Start = value.lastIndexOf("sha256:", offset);
    const digestStart = sha256Start + "sha256:".length;
    const isInsideSha256HexDigest =
      sha256Start >= 0 &&
      offset >= digestStart &&
      offset < digestStart + 64 &&
      /^[0-9a-f]*$/u.test(value.slice(digestStart, offset)) &&
      /^[0-9a-f]+$/u.test(match);
    if (value.slice(Math.max(0, offset - "sha256:".length), offset) === "sha256:" || isInsideSha256HexDigest) {
      return match;
    }
    const digest = createHash("sha256").update(match).digest("hex").slice(0, 16);
    return `<solana:${match.slice(0, 8)}:sha256:${digest}>`;
  });
}

function randomSuffix(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return output;
}

function bigintJsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function explorerTx(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function closeConnection(connection: Connection): void {
  const rpcWebSocket = (connection as Connection & { _rpcWebSocket?: { close: () => void; removeAllListeners?: () => void } })._rpcWebSocket;
  rpcWebSocket?.removeAllListeners?.();
  rpcWebSocket?.close();
}

void main();
