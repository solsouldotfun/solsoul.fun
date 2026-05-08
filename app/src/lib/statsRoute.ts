import { PublicKey, type Connection, type ParsedAccountData } from "@solana/web3.js";
import {
  MIN_CLAIM_BALANCE,
  PROGRAM_IDS,
  RECEIPT_ACCOUNT_SIZE,
  TARGET_AMM,
  decodeReceiptAccount,
  deriveVaultPda,
  deriveRaydiumCpSwapPdas,
  listBondingCurveTokens,
  listClaimedSoulNfts,
  resolveRaydiumCpSwapVaultBalance,
  type ClaimedSoulNftPage,
  type LaunchedTokenPage,
} from "sdk";
import { getRpcEndpoint } from "./config";
import {
  fetchGenerationRowsFromFinalizedRpc,
  type GenerationProvenanceRow,
} from "./generationProvenance";
import { createRpcConnection, type RpcFailoverEvent } from "./rpc";
import { publicApiWarning } from "./publicApiErrors";
import {
  probeToken2022OutsideLiquidityCapability,
  requiredToken2022OutsideLiquidityFilters,
  summarizeRpcCapability,
  type OutsideLiquidityAudit,
  type RpcCapabilityConnection,
  type RpcOutsideLiquidityCapability,
} from "./rpcCapability";
import { describeRpcSource } from "./rpcSource";
import {
  buildPublicStatsSnapshot,
  type OutsideLiquidityByMint,
  type PublicStatsSnapshot,
  type RaydiumLiquidityByMint,
  type ReceiptLifecycleCountsByMint,
} from "./stats";

const MAX_STATS_TOKENS = 500;
const RECENT_CLAIMS = 12;
const RECENT_GENERATIONS = 8;
const TOKEN_STATS_TIMEOUT_MS = 4_500;
const CLAIM_STATS_TIMEOUT_MS = 4_500;
const GENERATION_STATS_TIMEOUT_MS = 15_000;
const RECEIPT_STATS_TIMEOUT_MS = 4_500;
const RAYDIUM_LIQUIDITY_STATS_TIMEOUT_MS = 4_500;
const OUTSIDE_LIQUIDITY_STATS_TIMEOUT_MS = 4_500;
const SOURCE_SLOT_TIMEOUT_MS = 2_000;
const MAX_GENERATION_TRANSACTIONS = 24;

let lastUsableStatsSnapshot: PublicStatsRouteSnapshot | undefined;
let prewarmInFlight: Promise<PublicStatsRouteSnapshot | undefined> | undefined;
let prewarmCompleted = false;

export interface PublicStatsRouteSnapshot extends PublicStatsSnapshot {
  source: PublicStatsSnapshot["source"] & {
    partial?: boolean;
    warnings?: string[];
  };
}

export interface LoadPublicStatsSnapshotOptions {
  connection?: Connection;
  now?: Date;
  rpcEndpoint?: string;
  loadTokens?: () => Promise<LaunchedTokenPage>;
  loadClaims?: () => Promise<ClaimedSoulNftPage>;
  loadGenerationRows?: () => Promise<GenerationProvenanceRow[]>;
  loadReceiptLifecycleCounts?: () => Promise<ReceiptLifecycleCountsByMint>;
  loadRaydiumLiquidity?: (tokens: LaunchedTokenPage["items"]) => Promise<RaydiumLiquidityByMint>;
  loadOutsideLiquidity?: (
    tokens: LaunchedTokenPage["items"],
    raydiumLiquidityByMint: RaydiumLiquidityByMint,
  ) => Promise<OutsideLiquidityByMint>;
  loadRpcCapability?: () => Promise<RpcOutsideLiquidityCapability>;
  loadSourceSlot?: () => Promise<number>;
  timeouts?: {
    tokensMs?: number;
    claimsMs?: number;
    generationsMs?: number;
    receiptCountsMs?: number;
    raydiumLiquidityMs?: number;
    outsideLiquidityMs?: number;
    sourceSlotMs?: number;
  };
}

type SettledStatsSource<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; timedOut: boolean };

interface OutsideLiquidityScanRouteResult {
  byMint: OutsideLiquidityByMint;
  rpcCapability: RpcOutsideLiquidityCapability;
}

export async function loadPublicStatsSnapshot(
  options: LoadPublicStatsSnapshotOptions = {},
): Promise<PublicStatsRouteSnapshot> {
  const failoverEvents: RpcFailoverEvent[] = [];
  const connection =
    options.connection ??
    createRpcConnection({ commitment: "confirmed" }, (event) => {
      failoverEvents.push(event);
    });
  const rpcEndpoint = options.rpcEndpoint ?? getRpcEndpoint();
  const [tokensResult, claimsResult, generationResult, receiptCountsResult, sourceSlotResult] = await Promise.all([
    settleWithTimeout(
      options.loadTokens?.() ??
        listBondingCurveTokens(connection, {
          page: 1,
          pageSize: MAX_STATS_TOKENS,
        }),
      options.timeouts?.tokensMs ?? TOKEN_STATS_TIMEOUT_MS,
      "launched tokens",
    ),
    settleWithTimeout(
      options.loadClaims?.() ??
        listClaimedSoulNfts(connection, {
          fetchMetadata: false,
          page: 1,
          pageSize: RECENT_CLAIMS,
        }),
      options.timeouts?.claimsMs ?? CLAIM_STATS_TIMEOUT_MS,
      "claimed Souls",
    ),
    settleWithTimeout(
      options.loadGenerationRows?.() ??
        fetchGenerationRowsFromFinalizedRpc({
          connection,
          signatureLimit: RECENT_GENERATIONS,
          maxTransactions: MAX_GENERATION_TRANSACTIONS,
          stopAfterRows: RECENT_GENERATIONS,
        }),
      options.timeouts?.generationsMs ?? GENERATION_STATS_TIMEOUT_MS,
      "generation provenance",
    ),
    settleWithTimeout(
      options.loadReceiptLifecycleCounts?.() ??
        fetchReceiptLifecycleCountsFromRpc(connection, {
          programId: PROGRAM_IDS.soulGenerator,
        }),
      options.timeouts?.receiptCountsMs ?? RECEIPT_STATS_TIMEOUT_MS,
      "receipt lifecycle counts",
    ),
    settleWithTimeout(
      options.loadSourceSlot?.() ?? connection.getSlot("confirmed"),
      options.timeouts?.sourceSlotMs ?? SOURCE_SLOT_TIMEOUT_MS,
      "stats source slot",
    ),
  ]);

  const tokensPage = tokensResult.ok ? tokensResult.value : emptyLaunchedTokenPage();
  const raydiumLiquidityResult = tokensResult.ok
    ? await settleWithTimeout(
        options.loadRaydiumLiquidity?.(tokensPage.items) ??
          fetchRaydiumLiquidityByMint({
            connection,
            tokens: tokensPage.items,
            slot: sourceSlotResult.ok ? sourceSlotResult.value : undefined,
          }),
        options.timeouts?.raydiumLiquidityMs ?? RAYDIUM_LIQUIDITY_STATS_TIMEOUT_MS,
        "Raydium liquidity vault discovery",
      )
    : ({
        ok: false,
        reason: "launched token metrics unavailable",
        timedOut: false,
      } satisfies SettledStatsSource<RaydiumLiquidityByMint>);
  const raydiumLiquidityByMint = raydiumLiquidityResult.ok ? raydiumLiquidityResult.value : {};
  const outsideLiquidityResult = tokensResult.ok
    ? await settleWithTimeout(
        loadOutsideLiquidityWithCapability({
          connection,
          tokens: tokensPage.items,
          raydiumLiquidityByMint,
          rpcEndpoint,
          failoverEvents,
          loadOutsideLiquidity: options.loadOutsideLiquidity,
          loadRpcCapability: options.loadRpcCapability,
        }),
        options.timeouts?.outsideLiquidityMs ?? OUTSIDE_LIQUIDITY_STATS_TIMEOUT_MS,
        "outside-liquidity token account scan",
      )
    : ({
        ok: false,
        reason: "launched token metrics unavailable",
        timedOut: false,
      } satisfies SettledStatsSource<OutsideLiquidityScanRouteResult>);

  const warnings = [
    warningFor("launched token metrics", tokensResult),
    warningFor("claimed Soul metrics", claimsResult),
    warningFor("recent generation provenance", generationResult),
    warningFor("receipt lifecycle counts", receiptCountsResult),
    warningFor("Raydium liquidity vault discovery", raydiumLiquidityResult),
    warningFor("outside-liquidity token account scan", outsideLiquidityResult),
    warningFor("stats source slot", sourceSlotResult),
  ].filter((warning): warning is string => Boolean(warning));
  const claimsPage = claimsResult.ok ? claimsResult.value : emptyClaimedSoulPage();
  const generationRows = generationResult.ok ? generationResult.value : [];
  const snapshot = buildPublicStatsSnapshot({
    tokens: tokensPage.items,
    claims: claimsPage.items,
    fetchedAt: options.now ?? new Date(),
    rpcEndpoint,
    commitment: "confirmed",
    ...(sourceSlotResult.ok ? { slot: sourceSlotResult.value } : {}),
    totalClaimedSouls: claimsPage.total,
    totalLaunchedTokens: tokensPage.total,
    generationRows,
    receiptLifecycleCountsByMint: receiptCountsResult.ok ? receiptCountsResult.value : {},
    outsideLiquidityByMint: outsideLiquidityResult.ok ? outsideLiquidityResult.value.byMint : {},
    raydiumLiquidityByMint,
    rpcCapability: outsideLiquidityResult.ok
      ? outsideLiquidityResult.value.rpcCapability
      : summarizeRpcCapability({ endpoint: rpcEndpoint, audits: {}, failoverEvents }),
  });
  const snapshotWithSource = {
    ...snapshot,
    source: {
      ...snapshot.source,
      ...(warnings.length > 0
        ? {
            partial: true,
            warnings,
          }
        : {}),
    },
  };

  if (isTransientCollectionFailure(tokensResult, claimsResult) && !hasCollectionData(snapshotWithSource)) {
    if (lastUsableStatsSnapshot) {
      return {
        ...lastUsableStatsSnapshot,
        source: {
          ...lastUsableStatsSnapshot.source,
          partial: true,
          stale: true,
          warnings,
        },
      };
    }
    return snapshotWithSource;
  }

  if (hasCollectionData(snapshotWithSource) || !isTransientCollectionFailure(tokensResult, claimsResult)) {
    lastUsableStatsSnapshot = snapshotWithSource;
  }

  return snapshotWithSource;
}

/**
 * Lightweight cold-start prewarm for `/api/stats`.
 *
 * The first call to `/api/stats` after a server start can hit collector
 * timeouts on launched-token / claimed-Soul / receipt-lifecycle / Raydium
 * liquidity / outside-liquidity sources, returning a partial zero-valued
 * payload while warming the in-process cache. `primePublicStatsSnapshot`
 * fires `loadPublicStatsSnapshot` once in the background so that subsequent
 * requests reliably observe a populated `lastUsableStatsSnapshot` graceful
 * partial fallback.
 *
 * The helper is idempotent: concurrent calls share the same in-flight promise,
 * and once a successful warm collection has been observed, repeated calls are
 * no-ops. It does not change cache TTLs, warning semantics, or the snapshot
 * schema; it only ensures the second public request is not still cold.
 */
export function primePublicStatsSnapshot(
  options: LoadPublicStatsSnapshotOptions = {},
): Promise<PublicStatsRouteSnapshot | undefined> {
  if (prewarmCompleted) {
    return Promise.resolve(lastUsableStatsSnapshot);
  }
  if (prewarmInFlight) {
    return prewarmInFlight;
  }
  prewarmInFlight = (async () => {
    try {
      const snapshot = await loadPublicStatsSnapshot(options);
      if (hasCollectionData(snapshot) && snapshot.source.partial !== true) {
        prewarmCompleted = true;
      }
      return snapshot;
    } catch {
      return undefined;
    } finally {
      prewarmInFlight = undefined;
    }
  })();
  return prewarmInFlight;
}

/**
 * Test-only helper: clears in-process prewarm + last-usable-snapshot state so
 * cold-vs-warm parity tests can deterministically observe both branches.
 */
export function _resetStatsPrewarmStateForTests(): void {
  lastUsableStatsSnapshot = undefined;
  prewarmInFlight = undefined;
  prewarmCompleted = false;
}

export function buildStatsPrecheck({
  rpcEndpoint = getRpcEndpoint(),
  now = new Date(),
}: {
  rpcEndpoint?: string;
  now?: Date;
} = {}) {
  const rpcSource = describeRpcSource(rpcEndpoint);
  return {
    ok: true,
    route: "/api/stats",
    status: "ready",
    bounded: true,
    gracefulPartialFallback: true,
    source: {
      fetchedAt: now.toISOString(),
      rpcEndpoint: rpcSource.rpcEndpointLabel,
      rpcEndpointLabel: rpcSource.rpcEndpointLabel,
      rpcProvider: rpcSource.rpcProvider,
      rpcCluster: rpcSource.rpcCluster,
      rpcCredentialRedacted: rpcSource.rpcCredentialRedacted,
      commitment: "confirmed",
      deployment: {
        bondingCurveProgramId: PROGRAM_IDS.bondingCurve,
        soulGeneratorProgramId: PROGRAM_IDS.soulGenerator,
      },
      rpcCapability: {
        outsideLiquidity: summarizeRpcCapability({ endpoint: rpcEndpoint, audits: {} }),
      },
    },
  };
}

export async function fetchReceiptLifecycleCountsFromRpc(
  connection: Pick<Connection, "getProgramAccounts">,
  {
    programId = PROGRAM_IDS.soulGenerator,
  }: {
    programId?: string;
  } = {},
): Promise<ReceiptLifecycleCountsByMint> {
  const accounts = await connection.getProgramAccounts(new PublicKey(programId), {
    commitment: "confirmed",
    filters: [{ dataSize: RECEIPT_ACCOUNT_SIZE }],
  });
  const counts: ReceiptLifecycleCountsByMint = {};
  for (const account of accounts) {
    try {
      const receipt = decodeReceiptAccount(account.account.data);
      const mint = receipt.tokenMint.toBase58();
      const current = counts[mint] ?? {};
      current[receipt.lifecycleState] = BigInt(current[receipt.lifecycleState] ?? 0n) + 1n;
      counts[mint] = current;
    } catch {
      // Same-size non-receipt accounts are ignored; the decoder is the classifier.
    }
  }
  return counts;
}

export async function fetchRaydiumLiquidityByMint({
  connection,
  tokens,
  slot,
}: {
  connection: Pick<Connection, "getMultipleAccountsInfo">;
  tokens: LaunchedTokenPage["items"];
  slot?: number;
}): Promise<RaydiumLiquidityByMint> {
  const result: RaydiumLiquidityByMint = {};
  // Exponential curve: no migration, no external AMM liquidity.
  const raydiumMigratedTokens: typeof tokens = [];

  for (const token of raydiumMigratedTokens) {
    const mint = token.mint.toBase58();
    const pdas = deriveRaydiumCpSwapPdas(token.mint);
    const [poolStateAccount, token0VaultAccount, token1VaultAccount] =
      await connection.getMultipleAccountsInfo(
        [pdas.poolState, pdas.token0Vault, pdas.token1Vault],
        "confirmed",
      );
    const resolved = resolveRaydiumCpSwapVaultBalance({
      memeMint: token.mint,
      poolStateAccount,
      token0VaultAccount,
      token1VaultAccount,
      slot,
      commitment: "confirmed",
    });

    result[mint] = {
      verified: resolved.verified,
      warnings: resolved.warnings,
      raydiumProgramId: resolved.raydiumProgramId.toBase58(),
      poolState: resolved.poolState.toBase58(),
      token0Vault: resolved.token0Vault.toBase58(),
      token1Vault: resolved.token1Vault.toBase58(),
      token0Mint: resolved.token0Mint.toBase58(),
      token1Mint: resolved.token1Mint.toBase58(),
      selectedVault: resolved.selectedVault?.toBase58() ?? null,
      selectedVaultTokenProgram: resolved.selectedVaultTokenProgram?.toBase58() ?? null,
      activeLiquidityBaseUnits: resolved.activeLiquidityBaseUnits?.toString() ?? null,
      nonSelectedVault: resolved.nonSelectedVault?.toBase58() ?? null,
      ...(resolved.slot !== undefined ? { slot: resolved.slot } : {}),
      ...(resolved.commitment ? { commitment: resolved.commitment } : {}),
    };
  }

  return result;
}

export async function scanOutsideLiquidityByMint({
  connection,
  tokens,
  raydiumLiquidityByMint = {},
}: {
  connection: RpcCapabilityConnection;
  tokens: LaunchedTokenPage["items"];
  raydiumLiquidityByMint?: RaydiumLiquidityByMint;
}): Promise<OutsideLiquidityByMint> {
  return (
    await scanOutsideLiquidityWithCapability({
      connection,
      tokens,
      raydiumLiquidityByMint,
      rpcEndpoint: undefined,
      failoverEvents: [],
    })
  ).byMint;
}

async function loadOutsideLiquidityWithCapability({
  connection,
  tokens,
  raydiumLiquidityByMint,
  rpcEndpoint,
  failoverEvents,
  loadOutsideLiquidity,
  loadRpcCapability,
}: {
  connection: RpcCapabilityConnection;
  tokens: LaunchedTokenPage["items"];
  raydiumLiquidityByMint: RaydiumLiquidityByMint;
  rpcEndpoint: string | undefined;
  failoverEvents: RpcFailoverEvent[];
  loadOutsideLiquidity?: LoadPublicStatsSnapshotOptions["loadOutsideLiquidity"];
  loadRpcCapability?: LoadPublicStatsSnapshotOptions["loadRpcCapability"];
}): Promise<OutsideLiquidityScanRouteResult> {
  if (loadOutsideLiquidity) {
    const [byMint, rpcCapability] = await Promise.all([
      loadOutsideLiquidity(tokens, raydiumLiquidityByMint),
      loadRpcCapability?.(),
    ]);
    return {
      byMint,
      rpcCapability:
        rpcCapability ??
        summarizeRpcCapability({
          endpoint: rpcEndpoint,
          audits: byMint,
          failoverEvents,
          probeMint: firstScannableToken(tokens, raydiumLiquidityByMint)?.mint,
        }),
    };
  }

  return scanOutsideLiquidityWithCapability({
    connection,
    tokens,
    raydiumLiquidityByMint,
    rpcEndpoint,
    failoverEvents,
  });
}

export async function scanOutsideLiquidityWithCapability({
  connection,
  tokens,
  raydiumLiquidityByMint = {},
  rpcEndpoint,
  failoverEvents = [],
}: {
  connection: RpcCapabilityConnection;
  tokens: LaunchedTokenPage["items"];
  raydiumLiquidityByMint?: RaydiumLiquidityByMint;
  rpcEndpoint: string | undefined;
  failoverEvents?: RpcFailoverEvent[];
}): Promise<OutsideLiquidityScanRouteResult> {
  const result: OutsideLiquidityByMint = {};
  const scannableTokens = tokens.filter((token) => {
    if (!token.bondingCurve.selfDeprecated) {
      return true;
    }
    return false;
  });

  for (const token of scannableTokens) {
    const mint = token.mint.toBase58();
    const excludedActiveLiquidityVault =
      raydiumLiquidityByMint[mint]?.selectedVault ?? deriveVaultPda(token.mint).toBase58();
    result[mint] = await scanSingleTokenOutsideLiquidity({
      connection,
      token,
      excludedActiveLiquidityVault,
      rpcEndpoint,
      failoverEvents,
    });
  }

  return {
    byMint: result,
    rpcCapability: summarizeRpcCapability({
      endpoint: rpcEndpoint,
      audits: result,
      failoverEvents,
      probeMint: scannableTokens[0]?.mint,
    }),
  };
}

async function scanSingleTokenOutsideLiquidity({
  connection,
  token,
  excludedActiveLiquidityVault,
  rpcEndpoint,
  failoverEvents,
}: {
  connection: RpcCapabilityConnection;
  token: LaunchedTokenPage["items"][number];
  excludedActiveLiquidityVault: string;
  rpcEndpoint: string | undefined;
  failoverEvents: RpcFailoverEvent[];
}): Promise<OutsideLiquidityAudit> {
  const mint = token.mint.toBase58();
  const filters = requiredToken2022OutsideLiquidityFilters(mint);
  try {
    const accounts = await connection.getParsedProgramAccounts(new PublicKey(PROGRAM_IDS.token2022), {
      commitment: "confirmed",
      filters,
    });
    let outsideBaseUnits = 0n;
    let scannedAccounts = 0n;
    let excludedAccounts = 0n;

    for (const account of accounts) {
      const parsedAmount = readLiveParsedTokenAccountAmount({
        data: account.account.data,
        lamports: account.account.lamports,
        expectedMint: mint,
      });
      if (
        parsedAmount === null ||
        parsedAmount === 0n ||
        account.pubkey.toBase58() === excludedActiveLiquidityVault
      ) {
        excludedAccounts += 1n;
        continue;
      }
      scannedAccounts += 1n;
      outsideBaseUnits += parsedAmount;
    }

    return {
      classification: "indexed_rpc_verified",
      indexedGpaSupported: true,
      warningCodes: failoverEvents.length > 0 ? ["rpc_failover_used"] : [],
      wholeUnitsOutsideLiquidity: outsideBaseUnits / MIN_CLAIM_BALANCE,
      observedOutsideLiquidityBaseUnits: outsideBaseUnits,
      scannedAccounts,
      excludedAccounts,
      excludedVaults: [excludedActiveLiquidityVault],
    };
  } catch {
    const capability = await probeToken2022OutsideLiquidityCapability({
      connection,
      endpoint: rpcEndpoint,
      mint: token.mint,
      excludedVaults: [excludedActiveLiquidityVault],
      failoverEvents,
    });
    const bounded = capability.boundedAudit;
    return {
      classification: capability.classification,
      indexedGpaSupported: capability.indexedGpaSupported,
      warningCodes: capability.warningCodes,
      ...(bounded?.observedWholeUnitsOutsideLiquidity !== undefined
        ? { wholeUnitsOutsideLiquidity: bounded.observedWholeUnitsOutsideLiquidity }
        : {}),
      ...(bounded?.observedOutsideLiquidityBaseUnits !== undefined
        ? { observedOutsideLiquidityBaseUnits: bounded.observedOutsideLiquidityBaseUnits }
        : {}),
      scannedAccounts: bounded?.inspectedAccounts ?? bounded?.sampledAccounts,
      excludedAccounts: bounded?.excludedAccounts,
      accountLimit: bounded?.accountLimit,
      tokenSupplyBaseUnits: bounded?.tokenSupplyBaseUnits,
      excludedVaults: bounded?.excludedVaults,
    };
  }
}

function firstScannableToken(
  tokens: LaunchedTokenPage["items"],
  raydiumLiquidityByMint: RaydiumLiquidityByMint,
): LaunchedTokenPage["items"][number] | undefined {
  return tokens.find((token) => {
    if (!token.bondingCurve.selfDeprecated) {
      return true;
    }
    return false;
  });
}

function readLiveParsedTokenAccountAmount({
  data,
  lamports,
  expectedMint,
}: {
  data: Buffer | ParsedAccountData;
  lamports: number;
  expectedMint: string;
}): bigint | null {
  if (lamports <= 0 || !("parsed" in data)) {
    return null;
  }
  const info = data.parsed.info as {
    mint?: string;
    state?: string;
    tokenAmount?: {
      amount?: string;
    };
  };
  const amount = info.tokenAmount?.amount;
  if (
    info.mint !== expectedMint ||
    info.state === "closed" ||
    typeof amount !== "string" ||
    !/^\d+$/.test(amount)
  ) {
    return null;
  }
  return BigInt(amount);
}

export function settleWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<SettledStatsSource<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<SettledStatsSource<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        ok: false,
        reason: `${label} timed out after ${timeoutMs}ms`,
        timedOut: true,
      });
    }, timeoutMs);
  });

  return Promise.race([
    promise.then(
      (value): SettledStatsSource<T> => ({ ok: true, value }),
      (error: unknown): SettledStatsSource<T> => ({
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        timedOut: false,
      }),
    ),
    timeout,
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function warningFor(label: string, result: SettledStatsSource<unknown>): string | undefined {
  if (result.ok) {
    return undefined;
  }
  return publicApiWarning(label, result.timedOut);
}

function isTransientCollectionFailure(
  tokensResult: SettledStatsSource<unknown>,
  claimsResult: SettledStatsSource<unknown>,
): boolean {
  return !tokensResult.ok || !claimsResult.ok;
}

function hasCollectionData(snapshot: PublicStatsRouteSnapshot): boolean {
  return (
    snapshot.metrics.some((metric) => metric.value !== "0") ||
    snapshot.themeDistribution.length > 0 ||
    snapshot.perTokenSoulTotals.length > 0 ||
    snapshot.recentActivity.length > 0
  );
}

function emptyLaunchedTokenPage(): LaunchedTokenPage {
  return {
    items: [],
    page: 1,
    pageSize: MAX_STATS_TOKENS,
    total: 0,
    hasNextPage: false,
  };
}

function emptyClaimedSoulPage(): ClaimedSoulNftPage {
  return {
    items: [],
    page: 1,
    pageSize: RECENT_CLAIMS,
    total: 0,
    hasNextPage: false,
  };
}
