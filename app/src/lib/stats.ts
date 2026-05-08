import {
  DEVNET_PROGRAM_IDS,
  MIN_CLAIM_BALANCE,
  RAYDIUM_CP_SWAP_DEVNET_PROGRAM_ID,
  TARGET_AMM,
  deriveVaultPda,
  resolveSoulTheme,
  type ArtThemeId,
  type ClaimedSoulNft,
  type LaunchedToken,
  type RaydiumDustWarningCode,
  type ReceiptLifecycleState,
  type ResolvedSoulTheme,
} from "sdk";
import type { GenerationProvenanceRow, GenerationSide } from "./generationProvenance";
import type {
  OutsideLiquidityAudit,
  OutsideLiquidityByMint,
  OutsideLiquidityClassification,
  OutsideLiquidityWarningCode,
  RpcOutsideLiquidityCapability,
} from "./rpcCapability";
import { describeRpcSource, type RpcCluster } from "./rpcSource";
import { truncateWallet } from "./soulGallery";

export type StatsMetricId =
  | "launchedTokens"
  | "generatedSoulCandidates"
  | "claimedSouls"
  | "activeCurves";

export type StatsActivityKind = "launch" | "tradeGeneration" | "claim";

export interface StatsMetric {
  id: StatsMetricId;
  value: string;
}

export interface StatsActivityLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface StatsArtThemeSummary {
  id: ArtThemeId;
  label: string;
  renderer: ResolvedSoulTheme["renderer"];
}

export interface StatsThemeDistributionEntry extends StatsArtThemeSummary {
  tokenCount: string;
  generatedSoulCandidates: string;
  claimedSouls: string;
}

export interface StatsTokenSoulTotals {
  tokenMint: string;
  tokenLabel: string;
  soul: string;
  theme: StatsArtThemeSummary;
  generatedSoulCandidates: string;
  claimedSouls: string;
  active: boolean;
  launchedAt?: string;
  active_liquidity_base_units: string | null;
  whole_units_in_pool: string | null;
  fractional_remainder: string | null;
  fractional_fill_ratio: string | null;
  liquidity_dust_ratio: string | null;
  active_receipts: string;
  burned_receipts: string;
  forfeited_receipts: string;
  inactive_receipts: string;
  whole_units_outside_liquidity?: string;
  dustSource: StatsDustSource;
  primaryLink: StatsActivityLink;
  galleryLink: StatsActivityLink;
}

export interface StatsDustSource {
  token_unit: string;
  liquidity: "bonding_curve_reserve" | "raydium_cp_swap_vault" | "unavailable";
  source_verified: boolean;
  receipts: "receipt_binding_state";
  outside_liquidity: "token_account_scan" | "top_accounts_bounded_audit" | "unavailable";
  outside_liquidity_completeness?: OutsideLiquidityClassification;
  token2022_indexed_gpa_supported?: boolean;
  outside_liquidity_warning_codes?: OutsideLiquidityWarningCode[];
  active_liquidity_account?: string;
  active_liquidity_base_units?: string;
  curve?: string;
  liquidity_vault?: string;
  raydium_program_id?: string;
  raydium_pool_state?: string;
  raydium_token0_vault?: string;
  raydium_token1_vault?: string;
  raydium_token0_mint?: string;
  raydium_token1_mint?: string;
  raydium_non_selected_vault?: string;
  token_program?: string;
  fetched_slot?: string;
  commitment?: string;
  outside_liquidity_accounts?: string;
  outside_liquidity_excluded_accounts?: string;
  outside_liquidity_account_limit?: string;
  outside_liquidity_sampled_accounts?: string;
  outside_liquidity_observed_base_units?: string;
  outside_liquidity_observed_whole_units?: string;
  outside_liquidity_token_supply_base_units?: string;
  outside_liquidity_excluded_vaults?: string[];
  burned_receipts_includes: ReceiptLifecycleState[];
  warnings?: (RaydiumDustWarningCode | string)[];
}

export interface StatsDustTotals {
  whole_units_in_pool: string;
  fractional_remainder: string;
  active_receipts: string;
  burned_receipts: string;
  forfeited_receipts: string;
  inactive_receipts: string;
  whole_units_outside_liquidity?: string;
  outside_liquidity_audited_tokens: string;
  source_coverage: StatsDustSourceCoverage;
}

export interface StatsDustSourceCoverage {
  bonding_curve_reserve_tokens: string;
  raydium_cp_swap_vault_tokens: string;
  unavailable_tokens: string;
  source_verified_tokens: string;
  source_unverified_tokens: string;
  warning_tokens: string;
  warnings?: string[];
}

export interface StatsActivity {
  id: string;
  kind: StatsActivityKind;
  tokenMint?: string;
  tokenLabel?: string;
  theme?: StatsArtThemeSummary;
  generation?: string;
  sequence?: string;
  side?: GenerationSide;
  amount?: string;
  trader?: string;
  tokenAccount?: string;
  seedHash?: string;
  signature?: string;
  slot?: number;
  soul?: string;
  sortKey: number;
  primaryLink: StatsActivityLink;
  secondaryLink?: StatsActivityLink;
  extraLinks?: StatsActivityLink[];
}

export interface PublicStatsSnapshot {
  metrics: StatsMetric[];
  dustTotals: StatsDustTotals;
  themeDistribution: StatsThemeDistributionEntry[];
  perTokenSoulTotals: StatsTokenSoulTotals[];
  recentActivity: StatsActivity[];
  source: {
    fetchedAt: string;
    rpcEndpoint: string;
    rpcEndpointLabel?: string;
    rpcProvider?: string;
    rpcCluster?: RpcCluster;
    rpcCredentialRedacted?: boolean;
    commitment: string;
    slot?: number;
    deployment: {
      bondingCurveProgramId: string;
      soulGeneratorProgramId: string;
      deploymentId?: string;
      gitRef?: string;
      deployedAt?: string;
    };
    partial?: boolean;
    warnings?: string[];
    stale?: boolean;
    rpcCapability?: {
      outsideLiquidity: RpcOutsideLiquidityCapability;
    };
  };
}

export type ReceiptLifecycleCountsByMint = Record<
  string,
  Partial<Record<ReceiptLifecycleState, bigint | number | string>>
>;

export type { OutsideLiquidityAudit, OutsideLiquidityByMint };

export interface RaydiumLiquidityAudit {
  verified: boolean;
  warnings: (RaydiumDustWarningCode | string)[];
  raydiumProgramId: string;
  poolState: string;
  token0Vault: string;
  token1Vault: string;
  token0Mint: string;
  token1Mint: string;
  selectedVault: string | null;
  selectedVaultTokenProgram: string | null;
  activeLiquidityBaseUnits: bigint | number | string | null;
  nonSelectedVault: string | null;
  slot?: number;
  commitment?: string;
}

export type RaydiumLiquidityByMint = Record<string, RaydiumLiquidityAudit>;

export interface BuildPublicStatsSnapshotInput {
  tokens: LaunchedToken[];
  claims: ClaimedSoulNft[];
  fetchedAt?: Date;
  rpcEndpoint?: string;
  commitment?: string;
  slot?: number;
  deployment?: Partial<PublicStatsSnapshot["source"]["deployment"]>;
  totalClaimedSouls?: number;
  totalLaunchedTokens?: number;
  generationRows?: GenerationProvenanceRow[];
  receiptLifecycleCountsByMint?: ReceiptLifecycleCountsByMint;
  outsideLiquidityByMint?: OutsideLiquidityByMint;
  raydiumLiquidityByMint?: RaydiumLiquidityByMint;
  rpcCapability?: RpcOutsideLiquidityCapability;
}

const MAX_RECENT_ACTIVITY = 12;
const MAX_PER_TOKEN_SOUL_TOTALS = 100;
const DEVNET_EXPLORER_ADDRESS = "https://explorer.solana.com/address";
const DEVNET_EXPLORER_TX = "https://explorer.solana.com/tx";
const POST_GRADUATION_RAYDIUM_RECEIPT_WARNING_CODES = [
  "post_graduation_raydium_receipt_paths_bounded",
  "raydium_transfer_hook_mints_unsupported",
] as const;

export function buildPublicStatsSnapshot(input: BuildPublicStatsSnapshotInput): PublicStatsSnapshot {
  const rpcSource = describeRpcSource(input.rpcEndpoint ?? "https://api.devnet.solana.com");
  const totalLaunchedTokens = input.totalLaunchedTokens ?? input.tokens.length;
  const generatedSoulCandidates = input.tokens.reduce(
    (total, token) => total + (token.soulAccount?.generationCount ?? 0n),
    0n,
  );
  const claimedSoulsFromTokens = input.tokens.reduce(
    (total, token) => total + (token.soulAccount?.claimCount ?? 0n),
    0n,
  );
  const totalClaimedSouls = maxBigInt(
    BigInt(input.totalClaimedSouls ?? input.claims.length),
    claimedSoulsFromTokens,
  );
  const activeCurves = input.tokens.filter(
    (token) => !token.bondingCurve.selfDeprecated,
  ).length;
  const perTokenSoulTotals = buildPerTokenSoulTotals(input.tokens, {
    receiptLifecycleCountsByMint: input.receiptLifecycleCountsByMint ?? {},
    outsideLiquidityByMint: input.outsideLiquidityByMint ?? {},
    raydiumLiquidityByMint: input.raydiumLiquidityByMint ?? {},
  });

  return {
    metrics: [
      { id: "launchedTokens", value: totalLaunchedTokens.toString() },
      { id: "generatedSoulCandidates", value: generatedSoulCandidates.toString() },
      { id: "claimedSouls", value: totalClaimedSouls.toString() },
      { id: "activeCurves", value: activeCurves.toString() },
    ],
    dustTotals: buildDustTotals(perTokenSoulTotals),
    themeDistribution: buildThemeDistribution(input.tokens),
    perTokenSoulTotals,
    recentActivity: buildRecentActivity(input.tokens, input.claims, input.generationRows ?? []),
    source: {
      fetchedAt: (input.fetchedAt ?? new Date()).toISOString(),
      rpcEndpoint: rpcSource.rpcEndpointLabel,
      rpcEndpointLabel: rpcSource.rpcEndpointLabel,
      rpcProvider: rpcSource.rpcProvider,
      rpcCluster: rpcSource.rpcCluster,
      rpcCredentialRedacted: rpcSource.rpcCredentialRedacted,
      commitment: input.commitment ?? "confirmed",
      ...(input.slot !== undefined ? { slot: input.slot } : {}),
      deployment: {
        bondingCurveProgramId:
          input.deployment?.bondingCurveProgramId ?? DEVNET_PROGRAM_IDS.bondingCurve,
        soulGeneratorProgramId:
          input.deployment?.soulGeneratorProgramId ?? DEVNET_PROGRAM_IDS.soulGenerator,
        ...(input.deployment?.deploymentId ? { deploymentId: input.deployment.deploymentId } : {}),
        ...(input.deployment?.gitRef ? { gitRef: input.deployment.gitRef } : {}),
        ...(input.deployment?.deployedAt ? { deployedAt: input.deployment.deployedAt } : {}),
      },
      ...(input.rpcCapability
        ? { rpcCapability: { outsideLiquidity: input.rpcCapability } }
        : {}),
    },
  };
}

function buildThemeDistribution(tokens: LaunchedToken[]): StatsThemeDistributionEntry[] {
  const byTheme = new Map<
    ArtThemeId,
    StatsArtThemeSummary & {
      tokenCount: number;
      generatedSoulCandidates: bigint;
      claimedSouls: bigint;
    }
  >();

  for (const token of tokens) {
    const theme = resolveTokenTheme(token);
    const current =
      byTheme.get(theme.id) ??
      {
        ...theme,
        tokenCount: 0,
        generatedSoulCandidates: 0n,
        claimedSouls: 0n,
      };
    current.tokenCount += 1;
    current.generatedSoulCandidates += token.soulAccount?.generationCount ?? 0n;
    current.claimedSouls += token.soulAccount?.claimCount ?? 0n;
    byTheme.set(theme.id, current);
  }

  return Array.from(byTheme.values())
    .sort((left, right) => {
      if (left.generatedSoulCandidates !== right.generatedSoulCandidates) {
        return left.generatedSoulCandidates > right.generatedSoulCandidates ? -1 : 1;
      }
      if (left.tokenCount !== right.tokenCount) {
        return right.tokenCount - left.tokenCount;
      }
      return left.label.localeCompare(right.label);
    })
    .map((theme) => ({
      id: theme.id,
      label: theme.label,
      renderer: theme.renderer,
      tokenCount: theme.tokenCount.toString(),
      generatedSoulCandidates: theme.generatedSoulCandidates.toString(),
      claimedSouls: theme.claimedSouls.toString(),
    }));
}

function buildPerTokenSoulTotals(
  tokens: LaunchedToken[],
  {
    receiptLifecycleCountsByMint,
    outsideLiquidityByMint,
    raydiumLiquidityByMint,
  }: {
    receiptLifecycleCountsByMint: ReceiptLifecycleCountsByMint;
    outsideLiquidityByMint: OutsideLiquidityByMint;
    raydiumLiquidityByMint: RaydiumLiquidityByMint;
  },
): StatsTokenSoulTotals[] {
  return tokens
    .map((token): StatsTokenSoulTotals => {
      const mint = token.mint.toBase58();
      const tokenLabel = token.soulAccount?.memeSymbol || truncateWallet(mint);
      const theme = resolveTokenTheme(token);
      const receiptCounts = receiptLifecycleCountsByMint[mint] ?? {};
      const activeReceipts = toBigInt(receiptCounts.active);
      const burnedReceiptState = toBigInt(receiptCounts.burned);
      const forfeitedReceipts = toBigInt(receiptCounts.forfeited);
      const burnedReceipts = burnedReceiptState + forfeitedReceipts;
      const inactiveReceipts = burnedReceipts;
      const dust = dustMetricsForToken(token, receiptLifecycleCountsByMint, outsideLiquidityByMint, raydiumLiquidityByMint);
      return {
        tokenMint: mint,
        tokenLabel,
        soul: token.soul.toBase58(),
        theme,
        generatedSoulCandidates: (token.soulAccount?.generationCount ?? 0n).toString(),
        claimedSouls: (token.soulAccount?.claimCount ?? 0n).toString(),
        active: !token.bondingCurve.selfDeprecated,
        active_liquidity_base_units: dust.activeLiquidityBaseUnits?.toString() ?? null,
        whole_units_in_pool: dust.wholeUnitsInPool?.toString() ?? null,
        fractional_remainder: dust.fractionalRemainder?.toString() ?? null,
        fractional_fill_ratio:
          dust.fractionalRemainder === null ? null : formatFractionalFillRatio(dust.fractionalRemainder),
        liquidity_dust_ratio:
          dust.fractionalRemainder === null || dust.activeLiquidityBaseUnits === null || dust.activeLiquidityBaseUnits === 0n
            ? null
            : formatLiquidityDustRatio(dust.fractionalRemainder, dust.activeLiquidityBaseUnits),
        active_receipts: activeReceipts.toString(),
        burned_receipts: burnedReceipts.toString(),
        forfeited_receipts: forfeitedReceipts.toString(),
        inactive_receipts: inactiveReceipts.toString(),
        ...(dust.outsideLiquidity?.wholeUnitsOutsideLiquidity !== undefined
          ? { whole_units_outside_liquidity: dust.outsideLiquidity.wholeUnitsOutsideLiquidity.toString() }
          : {}),
        dustSource: dust.source,
        ...(token.createdAt && token.createdAt > 0n ? { launchedAt: token.createdAt.toString() } : {}),
        primaryLink: {
          label: tokenLabel,
          href: `/token/${mint}`,
        },
        galleryLink: {
          label: "token-gallery",
          href: `/token/${mint}/gallery`,
        },
      };
    })
    .sort((left, right) => {
      const leftGenerated = BigInt(left.generatedSoulCandidates);
      const rightGenerated = BigInt(right.generatedSoulCandidates);
      if (leftGenerated !== rightGenerated) {
        return leftGenerated > rightGenerated ? -1 : 1;
      }
      const leftClaimed = BigInt(left.claimedSouls);
      const rightClaimed = BigInt(right.claimedSouls);
      if (leftClaimed !== rightClaimed) {
        return leftClaimed > rightClaimed ? -1 : 1;
      }
      return left.tokenMint.localeCompare(right.tokenMint);
    })
    .slice(0, MAX_PER_TOKEN_SOUL_TOTALS);
}

function dustMetricsForToken(
  token: LaunchedToken,
  receiptLifecycleCountsByMint: ReceiptLifecycleCountsByMint,
  outsideLiquidityByMint: OutsideLiquidityByMint,
  raydiumLiquidityByMint: RaydiumLiquidityByMint,
): {
  activeLiquidityBaseUnits: bigint | null;
  wholeUnitsInPool: bigint | null;
  fractionalRemainder: bigint | null;
  outsideLiquidity?: {
    wholeUnitsOutsideLiquidity: bigint;
  };
  source: StatsDustSource;
} {
  const mint = token.mint.toBase58();
  const outsideLiquidity = outsideLiquidityByMint[mint];
  const outsideLiquidityCompleteness = outsideLiquidity
    ? normalizeOutsideLiquidityAudit(outsideLiquidity)
    : undefined;
  const isActiveCurve = !token.bondingCurve.selfDeprecated;
  const warnings: (RaydiumDustWarningCode | string)[] = [];
  if (!outsideLiquidity) {
    warnings.push(
      isActiveCurve
        ? "outside_liquidity_scan_unavailable"
        : "outside_liquidity_venue_unavailable",
    );
  } else if ((outsideLiquidityCompleteness?.warningCodes ?? []).length > 0) {
    warnings.push(...(outsideLiquidityCompleteness?.warningCodes ?? []));
  }

  // Exponential curve: no migration, no external AMM liquidity.
  // Active liquidity is implicit in the vault; we do not store token reserves.
  const activeLiquidityBaseUnits = isActiveCurve ? null : null;
  if (activeLiquidityBaseUnits === 0n) {
    warnings.push("active_liquidity_zero");
  }
  const wholeUnitsInPool =
    activeLiquidityBaseUnits === null ? null : activeLiquidityBaseUnits / MIN_CLAIM_BALANCE;
  const fractionalRemainder =
    activeLiquidityBaseUnits === null ? null : activeLiquidityBaseUnits % MIN_CLAIM_BALANCE;
  const outsideLiquidityWarningCodes = outsideLiquidityCompleteness?.warningCodes ?? [];

  return {
    activeLiquidityBaseUnits,
    wholeUnitsInPool,
    fractionalRemainder,
    ...(outsideLiquidity?.wholeUnitsOutsideLiquidity !== undefined
      ? {
          outsideLiquidity: {
            wholeUnitsOutsideLiquidity: toBigInt(outsideLiquidity.wholeUnitsOutsideLiquidity),
          },
        }
      : {}),
    source: {
      token_unit: MIN_CLAIM_BALANCE.toString(),
      liquidity: isActiveCurve
        ? "bonding_curve_reserve"
        : "unavailable",
      source_verified: activeLiquidityBaseUnits !== null,
      receipts: "receipt_binding_state",
      outside_liquidity: outsideLiquidityCompleteness
        ? outsideLiquidityCompleteness.classification === "indexed_rpc_verified"
          ? "token_account_scan"
          : outsideLiquidityCompleteness.classification === "bounded_top_accounts_audit"
            ? "top_accounts_bounded_audit"
            : "unavailable"
        : "unavailable",
      outside_liquidity_completeness: outsideLiquidityCompleteness
        ? outsideLiquidityCompleteness.classification
        : "unavailable",
      token2022_indexed_gpa_supported:
        outsideLiquidityCompleteness?.indexedGpaSupported ??
        false,
      ...(outsideLiquidityWarningCodes.length
        ? { outside_liquidity_warning_codes: outsideLiquidityWarningCodes }
        : {}),
      active_liquidity_account: token.curve.toBase58(),
      active_liquidity_base_units: undefined,
      curve: token.curve.toBase58(),
      ...(safeVaultPda(token) ? { liquidity_vault: safeVaultPda(token) } : {}),
      // No migration / no Raydium liquidity data for exponential curve.
      outside_liquidity_accounts: outsideLiquidity?.scannedAccounts?.toString(),
      outside_liquidity_excluded_accounts: outsideLiquidity?.excludedAccounts?.toString(),
      outside_liquidity_account_limit: outsideLiquidity?.accountLimit?.toString(),
      outside_liquidity_sampled_accounts: outsideLiquidity?.scannedAccounts?.toString(),
      outside_liquidity_observed_base_units:
        outsideLiquidity?.observedOutsideLiquidityBaseUnits?.toString(),
      outside_liquidity_observed_whole_units:
        outsideLiquidity?.wholeUnitsOutsideLiquidity?.toString(),
      outside_liquidity_token_supply_base_units: outsideLiquidity?.tokenSupplyBaseUnits?.toString(),
      outside_liquidity_excluded_vaults: outsideLiquidity?.excludedVaults,
      burned_receipts_includes: ["burned", "forfeited"],
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  };
}

function buildDustTotals(perTokenSoulTotals: StatsTokenSoulTotals[]): StatsDustTotals {
  const totals = perTokenSoulTotals.reduce(
    (accumulator, row) => ({
      wholeUnitsInPool:
        row.whole_units_in_pool === null
          ? accumulator.wholeUnitsInPool
          : accumulator.wholeUnitsInPool + BigInt(row.whole_units_in_pool),
      fractionalRemainder:
        row.fractional_remainder === null
          ? accumulator.fractionalRemainder
          : accumulator.fractionalRemainder + BigInt(row.fractional_remainder),
      activeReceipts: accumulator.activeReceipts + BigInt(row.active_receipts),
      burnedReceipts: accumulator.burnedReceipts + BigInt(row.burned_receipts),
      forfeitedReceipts: accumulator.forfeitedReceipts + BigInt(row.forfeited_receipts),
      inactiveReceipts: accumulator.inactiveReceipts + BigInt(row.inactive_receipts),
      outsideLiquidity:
        row.whole_units_outside_liquidity === undefined
          ? accumulator.outsideLiquidity
          : accumulator.outsideLiquidity + BigInt(row.whole_units_outside_liquidity),
      auditedOutsideLiquidityTokens:
        row.whole_units_outside_liquidity === undefined
          ? accumulator.auditedOutsideLiquidityTokens
          : accumulator.auditedOutsideLiquidityTokens + 1n,
      bondingCurveReserveTokens:
        row.dustSource.liquidity === "bonding_curve_reserve"
          ? accumulator.bondingCurveReserveTokens + 1n
          : accumulator.bondingCurveReserveTokens,
      raydiumCpSwapVaultTokens:
        row.dustSource.liquidity === "raydium_cp_swap_vault"
          ? accumulator.raydiumCpSwapVaultTokens + 1n
          : accumulator.raydiumCpSwapVaultTokens,
      unavailableTokens:
        row.dustSource.liquidity === "unavailable"
          ? accumulator.unavailableTokens + 1n
          : accumulator.unavailableTokens,
      sourceVerifiedTokens: row.dustSource.source_verified
        ? accumulator.sourceVerifiedTokens + 1n
        : accumulator.sourceVerifiedTokens,
      sourceUnverifiedTokens: row.dustSource.source_verified
        ? accumulator.sourceUnverifiedTokens
        : accumulator.sourceUnverifiedTokens + 1n,
      warningTokens:
        row.dustSource.warnings && row.dustSource.warnings.length > 0
          ? accumulator.warningTokens + 1n
          : accumulator.warningTokens,
    }),
    {
      wholeUnitsInPool: 0n,
      fractionalRemainder: 0n,
      activeReceipts: 0n,
      burnedReceipts: 0n,
      forfeitedReceipts: 0n,
      inactiveReceipts: 0n,
      outsideLiquidity: 0n,
      auditedOutsideLiquidityTokens: 0n,
      bondingCurveReserveTokens: 0n,
      raydiumCpSwapVaultTokens: 0n,
      unavailableTokens: 0n,
      sourceVerifiedTokens: 0n,
      sourceUnverifiedTokens: 0n,
      warningTokens: 0n,
    },
  );
  const warnings = Array.from(
    new Set(perTokenSoulTotals.flatMap((row) => row.dustSource.warnings ?? [])),
  ).sort();

  return {
    whole_units_in_pool: totals.wholeUnitsInPool.toString(),
    fractional_remainder: totals.fractionalRemainder.toString(),
    active_receipts: totals.activeReceipts.toString(),
    burned_receipts: totals.burnedReceipts.toString(),
    forfeited_receipts: totals.forfeitedReceipts.toString(),
    inactive_receipts: totals.inactiveReceipts.toString(),
    ...(totals.auditedOutsideLiquidityTokens > 0n
      ? { whole_units_outside_liquidity: totals.outsideLiquidity.toString() }
      : {}),
    outside_liquidity_audited_tokens: totals.auditedOutsideLiquidityTokens.toString(),
    source_coverage: {
      bonding_curve_reserve_tokens: totals.bondingCurveReserveTokens.toString(),
      raydium_cp_swap_vault_tokens: totals.raydiumCpSwapVaultTokens.toString(),
      unavailable_tokens: totals.unavailableTokens.toString(),
      source_verified_tokens: totals.sourceVerifiedTokens.toString(),
      source_unverified_tokens: totals.sourceUnverifiedTokens.toString(),
      warning_tokens: totals.warningTokens.toString(),
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  };
}

function safeVaultPda(token: LaunchedToken): string | undefined {
  try {
    return deriveVaultPda(token.mint).toBase58();
  } catch {
    return undefined;
  }
}

function formatFractionalFillRatio(fractionalRemainder: bigint): string {
  const scale = 1_000_000n;
  const scaled = (fractionalRemainder * scale) / MIN_CLAIM_BALANCE;
  return `0.${scaled.toString().padStart(6, "0")}`;
}

function formatLiquidityDustRatio(fractionalRemainder: bigint, activeLiquidityBaseUnits: bigint): string {
  if (activeLiquidityBaseUnits === 0n) {
    return "0.000000000000000000";
  }
  const scale = 1_000_000_000_000_000_000n;
  const scaled = (fractionalRemainder * scale) / activeLiquidityBaseUnits;
  const whole = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(18, "0");
  return `${whole.toString()}.${fraction}`;
}

function toBigInt(value: bigint | number | string | undefined): bigint {
  if (value === undefined) {
    return 0n;
  }
  return BigInt(value);
}

function normalizeOutsideLiquidityAudit(outsideLiquidity: OutsideLiquidityAudit): {
  classification: OutsideLiquidityClassification;
  indexedGpaSupported: boolean;
  warningCodes: OutsideLiquidityWarningCode[];
} {
  const classification = outsideLiquidityClassification(outsideLiquidity);
  return {
    classification,
    indexedGpaSupported: classification === "indexed_rpc_verified",
    warningCodes:
      outsideLiquidity.warningCodes && outsideLiquidity.warningCodes.length > 0
        ? outsideLiquidity.warningCodes
        : defaultOutsideLiquidityWarningCodes(classification, outsideLiquidity),
  };
}

function outsideLiquidityClassification(
  outsideLiquidity: OutsideLiquidityAudit,
): OutsideLiquidityClassification {
  if (outsideLiquidity.classification === "indexed_rpc_verified") {
    return outsideLiquidity.indexedGpaSupported === true
      ? "indexed_rpc_verified"
      : hasOutsideLiquidityAuditEvidence(outsideLiquidity)
        ? "bounded_top_accounts_audit"
        : "unavailable";
  }
  if (
    outsideLiquidity.classification === "bounded_top_accounts_audit" ||
    outsideLiquidity.classification === "unavailable"
  ) {
    return outsideLiquidity.classification;
  }
  return hasOutsideLiquidityAuditEvidence(outsideLiquidity)
    ? "bounded_top_accounts_audit"
    : "unavailable";
}

function defaultOutsideLiquidityWarningCodes(
  classification: OutsideLiquidityClassification,
  outsideLiquidity: OutsideLiquidityAudit,
): OutsideLiquidityWarningCode[] {
  if (classification === "indexed_rpc_verified") {
    return [];
  }
  if (classification === "unavailable") {
    return [
      "token2022_indexed_gpa_unavailable",
      "outside_liquidity_token_methods_unavailable",
    ];
  }
  return [
    "token2022_indexed_gpa_unavailable",
    "token_methods_bounded_sample",
    ...(outsideLiquidity.accountLimit !== undefined ? ["outside_liquidity_sample_limited" as const] : []),
    ...(outsideLiquidity.wholeUnitsOutsideLiquidity === undefined
      ? ["outside_liquidity_unknown_when_top_sample_empty" as const]
      : []),
  ];
}

function hasOutsideLiquidityAuditEvidence(outsideLiquidity: OutsideLiquidityAudit): boolean {
  return (
    outsideLiquidity.wholeUnitsOutsideLiquidity !== undefined ||
    outsideLiquidity.observedOutsideLiquidityBaseUnits !== undefined ||
    outsideLiquidity.scannedAccounts !== undefined ||
    outsideLiquidity.excludedAccounts !== undefined ||
    outsideLiquidity.accountLimit !== undefined ||
    outsideLiquidity.tokenSupplyBaseUnits !== undefined
  );
}

function buildRecentActivity(
  tokens: LaunchedToken[],
  claims: ClaimedSoulNft[],
  generationRows: GenerationProvenanceRow[],
): StatsActivity[] {
  const tokenCreatedAtByMint = new Map(
    tokens.map((token) => [token.mint.toBase58(), toSortKey(token.createdAt)] as const),
  );
  const tokenLabelByMint = new Map(
    tokens.map((token) => [
      token.mint.toBase58(),
      token.soulAccount?.memeSymbol || truncateWallet(token.mint.toBase58()),
    ] as const),
  );
  const tokenThemeByMint = new Map(
    tokens.map((token) => [token.mint.toBase58(), resolveTokenTheme(token)] as const),
  );
  const launchRows = tokens.map((token) => {
    const mint = token.mint.toBase58();
    const tokenLabel = token.soulAccount?.memeSymbol || truncateWallet(mint);
    const sortKey = toSortKey(token.createdAt);
    return {
      id: `launch:${mint}`,
      kind: "launch",
      tokenMint: mint,
      tokenLabel,
      theme: tokenThemeByMint.get(mint),
      sortKey,
      primaryLink: {
        label: truncateWallet(mint),
        href: `/token/${mint}`,
      },
      secondaryLink: {
        label: "Explorer",
        href: devnetExplorerAddress(mint),
        external: true,
      },
    } satisfies StatsActivity;
  });

  const generationActivityRows = generationRows.map((row): StatsActivity => ({
    id: row.id,
    kind: "tradeGeneration",
    tokenMint: row.tokenMint,
    tokenLabel: tokenLabelByMint.get(row.tokenMint) ?? truncateWallet(row.tokenMint),
    theme: tokenThemeByMint.get(row.tokenMint),
    generation: row.generation.toString(),
    side: row.side,
    amount: row.amount,
    trader: row.trader,
    tokenAccount: row.tokenAccount,
    seedHash: row.seedHash,
    signature: row.signature,
    slot: row.slot,
    soul: row.soul,
    sortKey: row.blockTime ?? row.slot,
    primaryLink: {
      label: tokenLabelByMint.get(row.tokenMint) ?? truncateWallet(row.tokenMint),
      href: `/token/${row.tokenMint}`,
    },
    secondaryLink: {
      label: "Explorer tx",
      href: devnetExplorerTx(row.signature),
      external: true,
    },
    extraLinks: [
      {
        label: "Soul PDA",
        href: devnetExplorerAddress(row.soul),
        external: true,
      },
    ],
  }));
  const generationKeys = new Set(generationRows.map((row) => generationActivityKey(row.tokenMint, row.soul, row.generation)));
  const tokenProvenanceRows = tokens.flatMap((token): StatsActivity[] => {
    const provenance = token.soulAccount?.latestGenerationProvenance;
    if (!provenance || provenance.generation <= 0n) {
      return [];
    }
    const mint = token.mint.toBase58();
    const soul = token.soul.toBase58();
    const key = generationActivityKey(mint, soul, provenance.generation);
    if (generationKeys.has(key)) {
      return [];
    }
    const tokenLabel = tokenLabelByMint.get(mint) ?? truncateWallet(mint);
    const theme = tokenThemeByMint.get(mint);
    const signature = provenance.signature;
    return [
      {
        id: `generation:${mint}:${soul}:${provenance.generation.toString()}:timeline-fallback`,
        kind: "tradeGeneration",
        tokenMint: mint,
        tokenLabel,
        theme,
        generation: provenance.generation.toString(),
        side: provenance.side,
        amount: provenance.amount.toString(),
        trader: provenance.trader.toBase58(),
        tokenAccount: provenance.tokenAccount.toBase58(),
        seedHash: provenance.seedHash,
        signature,
        slot: provenance.slot,
        soul,
        sortKey: toSortKey(token.createdAt) + 0.3,
        primaryLink: {
          label: tokenLabel,
          href: `/token/${mint}`,
        },
        secondaryLink: signature
          ? {
              label: "Explorer tx",
              href: devnetExplorerTx(signature),
              external: true,
            }
          : {
              label: "Token timeline",
              href: `/token/${mint}#token-timeline`,
            },
        extraLinks: [
          {
            label: "Soul PDA",
            href: devnetExplorerAddress(soul),
            external: true,
          },
        ],
      },
    ];
  });

  const claimRows = claims.flatMap((claim): StatsActivity[] => {
    const tokenMint = claim.tokenMint?.toBase58();
    if (!tokenMint) {
      return [];
    }
    const soul = claim.soul.toBase58();
    const nftMint = claim.nftMint.toBase58();
    const sequence = claim.sequence.toString();
    const tokenLabel = tokenLabelByMint.get(tokenMint) ?? truncateWallet(tokenMint);

    return [
      {
        id: `claim:${claim.claim.toBase58()}`,
        kind: "claim",
        tokenMint,
        tokenLabel,
        theme: tokenThemeByMint.get(tokenMint),
        sequence,
        generation: claim.generationCount.toString(),
        soul,
        sortKey: (tokenCreatedAtByMint.get(tokenMint) ?? 0) + 0.4 + Number(claim.sequence) / 1_000_000,
        primaryLink: {
          label: tokenLabel,
          href: `/token/${tokenMint}/gallery`,
        },
        secondaryLink: {
          label: "NFT explorer",
          href: devnetExplorerAddress(nftMint),
          external: true,
        },
        extraLinks: [
          {
            label: "Soul PDA",
            href: devnetExplorerAddress(soul),
            external: true,
          },
        ],
      },
    ];
  });

  const sortedRows = [...launchRows, ...generationActivityRows, ...tokenProvenanceRows, ...claimRows]
    .sort((left, right) => {
      if (left.sortKey !== right.sortKey) {
        return right.sortKey - left.sortKey;
      }
      return left.id.localeCompare(right.id);
    });

  return ensureAvailableActivityKinds(sortedRows.slice(0, MAX_RECENT_ACTIVITY), sortedRows);
}

function resolveTokenTheme(token: LaunchedToken): StatsArtThemeSummary {
  const theme =
    token.soulAccount?.artTheme ??
    resolveSoulTheme({
      templateLen: token.soulAccount?.templateLen ?? 0,
      styleParams: token.soulAccount?.styleParamsBytes ?? token.soulAccount?.styleParams ?? "",
    });
  return {
    id: theme.id,
    label: theme.label,
    renderer: theme.renderer,
  };
}

function generationActivityKey(mint: string, soul: string, generation: number | bigint): string {
  return `${mint}:${soul}:${generation.toString()}`;
}

function maxBigInt(left: bigint, right: bigint): bigint {
  return left >= right ? left : right;
}

function toSortKey(value: bigint | null): number {
  if (value === null || value <= 0n) {
    return 0;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

function devnetExplorerAddress(address: string): string {
  return `${DEVNET_EXPLORER_ADDRESS}/${address}?cluster=devnet`;
}

function devnetExplorerTx(signature: string): string {
  return `${DEVNET_EXPLORER_TX}/${signature}?cluster=devnet`;
}

function ensureAvailableActivityKinds(
  selectedRows: StatsActivity[],
  allRows: StatsActivity[],
): StatsActivity[] {
  const requiredKinds: StatsActivityKind[] = ["claim", "tradeGeneration", "launch"];
  const selectedIds = new Set(selectedRows.map((row) => row.id));
  const selectedKinds = new Set(selectedRows.map((row) => row.kind));
  const rows = [...selectedRows];

  for (const kind of requiredKinds) {
    if (selectedKinds.has(kind)) {
      continue;
    }
    const replacement = allRows.find((row) => row.kind === kind && !selectedIds.has(row.id));
    if (!replacement) {
      continue;
    }
    if (rows.length >= MAX_RECENT_ACTIVITY) {
      removeLeastImportantRow(rows, requiredKinds, kind);
    }
    rows.push(replacement);
    selectedIds.add(replacement.id);
    selectedKinds.add(kind);
  }

  return rows;
}

function removeLeastImportantRow(
  rows: StatsActivity[],
  requiredKinds: StatsActivityKind[],
  incomingKind: StatsActivityKind,
): void {
  const requiredKindSet = new Set(requiredKinds);
  const counts = new Map<StatsActivityKind, number>();
  for (const row of rows) {
    counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  }

  const removableIndex = findLastIndex(rows, (row) => {
    if (row.kind === incomingKind) {
      return false;
    }
    if (!requiredKindSet.has(row.kind)) {
      return true;
    }
    return (counts.get(row.kind) ?? 0) > 1;
  });
  rows.splice(removableIndex >= 0 ? removableIndex : rows.length - 1, 1);
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as T)) {
      return index;
    }
  }
  return -1;
}
