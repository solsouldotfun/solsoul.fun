import { MIN_CLAIM_BALANCE } from "sdk";
import type { PublicStatsSnapshot } from "./stats";

export const PUBLIC_STATS_CACHE_KEY = "solsoul.publicStatsSnapshot.v6";

export type CachedPublicStatsSnapshot = PublicStatsSnapshot & {
  ok: true;
};

const STABLE_DUST_SOURCE_WARNING_CODES = new Set([
  "outside_liquidity_scan_unavailable",
  "outside_liquidity_venue_unavailable",
  "token2022_indexed_gpa_unavailable",
  "token2022_secondary_index_excluded",
  "token2022_indexed_gpa_probe_failed",
  "token_methods_bounded_sample",
  "outside_liquidity_sample_limited",
  "outside_liquidity_unknown_when_top_sample_empty",
  "outside_liquidity_token_methods_unavailable",
  "outside_liquidity_no_probe_target",
  "rpc_failover_used",
  "active_liquidity_zero",
  "raydium_pool_missing",
  "raydium_pool_owner_mismatch",
  "raydium_vault_missing",
  "raydium_vault_owner_mismatch",
  "raydium_vault_mint_mismatch",
  "raydium_vault_unsupported_token_program",
  "raydium_vault_unverified",
  "post_graduation_raydium_receipt_paths_bounded",
  "raydium_transfer_hook_mints_unsupported",
]);

const RAYDIUM_ACTIVE_LIQUIDITY_WARNING_CODES = new Set([
  "raydium_pool_missing",
  "raydium_pool_owner_mismatch",
  "raydium_vault_missing",
  "raydium_vault_owner_mismatch",
  "raydium_vault_mint_mismatch",
  "raydium_vault_unsupported_token_program",
  "raydium_vault_unverified",
]);

export function readPublicStatsSnapshot(
  storage: Storage | undefined = browserStorage(),
): CachedPublicStatsSnapshot | undefined {
  if (!storage) {
    return undefined;
  }

  try {
    const raw = storage.getItem(PUBLIC_STATS_CACHE_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as CachedPublicStatsSnapshot;
    return isStorablePublicStatsSnapshot(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writePublicStatsSnapshot(
  snapshot: CachedPublicStatsSnapshot,
  storage: Storage | undefined = browserStorage(),
): boolean {
  if (!storage) {
    return false;
  }

  try {
    if (!isStorablePublicStatsSnapshot(snapshot) || isTransientEmptyPartialSnapshot(snapshot)) {
      return false;
    }
    storage.setItem(PUBLIC_STATS_CACHE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function isValidPublicStatsSnapshot(
  snapshot: CachedPublicStatsSnapshot,
): snapshot is CachedPublicStatsSnapshot {
  return (
    isObject(snapshot) &&
    snapshot.ok === true &&
    Array.isArray(snapshot.metrics) &&
    snapshot.metrics.every(
      (metric) => isObject(metric) && isNonEmptyString(metric.id) && isNonEmptyString(metric.value),
    ) &&
    isValidDustTotals(snapshot.dustTotals) &&
    Array.isArray(snapshot.themeDistribution) &&
    snapshot.themeDistribution.every(isValidThemeDistributionEntry) &&
    Array.isArray(snapshot.perTokenSoulTotals) &&
    snapshot.perTokenSoulTotals.every(isValidPerTokenSoulTotal) &&
    isValidDustSourceCoverage(snapshot.dustTotals.source_coverage, snapshot.perTokenSoulTotals) &&
    Array.isArray(snapshot.recentActivity) &&
    snapshot.recentActivity.every(isValidStatsActivity) &&
    isObject(snapshot.source) &&
    isNonEmptyString(snapshot.source.fetchedAt) &&
    isNonEmptyString(snapshot.source.rpcEndpoint) &&
    isNonEmptyString(snapshot.source.commitment) &&
    isValidOptionalBoolean(snapshot.source.partial) &&
    isValidOptionalBoolean(snapshot.source.stale) &&
    (snapshot.source.warnings === undefined ||
      (Array.isArray(snapshot.source.warnings) && snapshot.source.warnings.every(isNonEmptyString))) &&
    (snapshot.source.rpcCapability === undefined ||
      (isValidRpcCapability(snapshot.source.rpcCapability) &&
        isRpcCapabilityConsistentWithRows(
          snapshot.source.rpcCapability,
          snapshot.perTokenSoulTotals,
        ))) &&
    isObject(snapshot.source.deployment) &&
    isNonEmptyString(snapshot.source.deployment.bondingCurveProgramId) &&
    isNonEmptyString(snapshot.source.deployment.soulGeneratorProgramId) &&
    (snapshot.source.slot === undefined ||
      (typeof snapshot.source.slot === "number" &&
        Number.isSafeInteger(snapshot.source.slot) &&
        snapshot.source.slot >= 0))
  );
}

function isRpcCapabilityConsistentWithRows(
  capability: CachedPublicStatsSnapshot["source"]["rpcCapability"],
  rows: CachedPublicStatsSnapshot["perTokenSoulTotals"],
): boolean {
  const outsideLiquidity = capability?.outsideLiquidity;
  if (!isObject(outsideLiquidity) || rows.length === 0) {
    return true;
  }

  const rowClassifications = rows.map((row) =>
    conservativeRowOutsideLiquidityClassification(row.dustSource),
  );
  const leastComplete = rowClassifications.includes("unavailable")
    ? "unavailable"
    : rowClassifications.includes("bounded_top_accounts_audit")
      ? "bounded_top_accounts_audit"
      : "indexed_rpc_verified";
  if (outsideLiquidity.classification !== leastComplete) {
    return false;
  }
  if (
    outsideLiquidity.indexedGpaSupported !==
    (leastComplete === "indexed_rpc_verified")
  ) {
    return false;
  }

  const requiredWarnings = new Set(
    rows.flatMap((row) => row.dustSource.outside_liquidity_warning_codes ?? []),
  );
  for (const warning of requiredWarnings) {
    if (!outsideLiquidity.warningCodes.includes(warning)) {
      return false;
    }
  }

  return true;
}

function conservativeRowOutsideLiquidityClassification(
  source: CachedPublicStatsSnapshot["perTokenSoulTotals"][number]["dustSource"],
): "indexed_rpc_verified" | "bounded_top_accounts_audit" | "unavailable" {
  if (
    source.outside_liquidity_completeness === "indexed_rpc_verified" &&
    source.token2022_indexed_gpa_supported === true
  ) {
    return "indexed_rpc_verified";
  }
  if (
    source.outside_liquidity_completeness === "bounded_top_accounts_audit" ||
    source.outside_liquidity === "top_accounts_bounded_audit" ||
    source.outside_liquidity === "token_account_scan"
  ) {
    return "bounded_top_accounts_audit";
  }
  return "unavailable";
}

function isStorablePublicStatsSnapshot(snapshot: CachedPublicStatsSnapshot): snapshot is CachedPublicStatsSnapshot {
  return isValidPublicStatsSnapshot(snapshot) && snapshot.source.stale !== true;
}

function isValidRpcCapability(
  capability: CachedPublicStatsSnapshot["source"]["rpcCapability"],
): boolean {
  const outsideLiquidity = capability?.outsideLiquidity;
  if (!isObject(capability) || !isObject(outsideLiquidity)) {
    return false;
  }

  return (
    (outsideLiquidity.classification === "indexed_rpc_verified" ||
      outsideLiquidity.classification === "bounded_top_accounts_audit" ||
      outsideLiquidity.classification === "unavailable") &&
    typeof outsideLiquidity.indexedGpaSupported === "boolean" &&
    isNonEmptyString(outsideLiquidity.programLabel) &&
    Array.isArray(outsideLiquidity.requestedFilters) &&
    outsideLiquidity.requestedFilters.every(
      (filter) =>
        isObject(filter) &&
        isObject(filter.memcmp) &&
        filter.memcmp.offset === 0 &&
        isNonEmptyString(filter.memcmp.bytes),
    ) &&
    isNonEmptyString(outsideLiquidity.endpointLabel) &&
    !outsideLiquidity.endpointLabel.includes("://") &&
    !outsideLiquidity.endpointLabel.includes("?") &&
    isNonEmptyString(outsideLiquidity.rpcProvider) &&
    (outsideLiquidity.rpcCluster === "devnet" ||
      outsideLiquidity.rpcCluster === "localnet" ||
      outsideLiquidity.rpcCluster === "unknown") &&
    typeof outsideLiquidity.rpcCredentialRedacted === "boolean" &&
    Array.isArray(outsideLiquidity.warningCodes) &&
    outsideLiquidity.warningCodes.every(isStableDustSourceWarningCode) &&
    (outsideLiquidity.failover === undefined ||
      (isObject(outsideLiquidity.failover) &&
        isNonEmptyString(outsideLiquidity.failover.primaryEndpointLabel) &&
        isNonEmptyString(outsideLiquidity.failover.fallbackEndpointLabel) &&
        isNonEmptyString(outsideLiquidity.failover.usedEndpointLabel) &&
        isNonEmptyString(outsideLiquidity.failover.reason) &&
        (outsideLiquidity.failover.status === undefined ||
          (typeof outsideLiquidity.failover.status === "number" &&
            Number.isSafeInteger(outsideLiquidity.failover.status)))))
  );
}

function isValidDustTotals(totals: CachedPublicStatsSnapshot["dustTotals"]): boolean {
  return (
    isObject(totals) &&
    isDecimalString(totals.whole_units_in_pool) &&
    isDecimalString(totals.fractional_remainder) &&
    isDecimalString(totals.active_receipts) &&
    isDecimalString(totals.burned_receipts) &&
    isDecimalString(totals.forfeited_receipts) &&
    isDecimalString(totals.inactive_receipts) &&
    isDecimalString(totals.outside_liquidity_audited_tokens) &&
    isObject(totals.source_coverage) &&
    (totals.whole_units_outside_liquidity === undefined ||
      isDecimalString(totals.whole_units_outside_liquidity))
  );
}

function isValidDustSourceCoverage(
  coverage: CachedPublicStatsSnapshot["dustTotals"]["source_coverage"],
  rows: CachedPublicStatsSnapshot["perTokenSoulTotals"],
): boolean {
  if (
    !isObject(coverage) ||
    !isDecimalString(coverage.bonding_curve_reserve_tokens) ||
    !isDecimalString(coverage.raydium_cp_swap_vault_tokens) ||
    !isDecimalString(coverage.unavailable_tokens) ||
    !isDecimalString(coverage.source_verified_tokens) ||
    !isDecimalString(coverage.source_unverified_tokens) ||
    !isDecimalString(coverage.warning_tokens) ||
    (coverage.warnings !== undefined &&
      (!Array.isArray(coverage.warnings) || !coverage.warnings.every(isNonEmptyString)))
  ) {
    return false;
  }

  const expected = rows.reduce(
    (accumulator, row) => {
      if (row.dustSource.liquidity === "bonding_curve_reserve") {
        accumulator.bondingCurveReserveTokens += 1n;
      } else if (row.dustSource.liquidity === "raydium_cp_swap_vault") {
        accumulator.raydiumCpSwapVaultTokens += 1n;
      } else {
        accumulator.unavailableTokens += 1n;
      }
      if (row.dustSource.source_verified) {
        accumulator.sourceVerifiedTokens += 1n;
      } else {
        accumulator.sourceUnverifiedTokens += 1n;
      }
      if (row.dustSource.warnings && row.dustSource.warnings.length > 0) {
        accumulator.warningTokens += 1n;
      }
      for (const warning of row.dustSource.warnings ?? []) {
        accumulator.warnings.add(warning);
      }
      return accumulator;
    },
    {
      bondingCurveReserveTokens: 0n,
      raydiumCpSwapVaultTokens: 0n,
      unavailableTokens: 0n,
      sourceVerifiedTokens: 0n,
      sourceUnverifiedTokens: 0n,
      warningTokens: 0n,
      warnings: new Set<string>(),
    },
  );
  const expectedWarnings = Array.from(expected.warnings).sort();
  const actualWarnings = [...(coverage.warnings ?? [])].sort();

  return (
    coverage.bonding_curve_reserve_tokens === expected.bondingCurveReserveTokens.toString() &&
    coverage.raydium_cp_swap_vault_tokens === expected.raydiumCpSwapVaultTokens.toString() &&
    coverage.unavailable_tokens === expected.unavailableTokens.toString() &&
    coverage.source_verified_tokens === expected.sourceVerifiedTokens.toString() &&
    coverage.source_unverified_tokens === expected.sourceUnverifiedTokens.toString() &&
    coverage.warning_tokens === expected.warningTokens.toString() &&
    JSON.stringify(actualWarnings) === JSON.stringify(expectedWarnings)
  );
}

function isValidThemeDistributionEntry(
  entry: CachedPublicStatsSnapshot["themeDistribution"][number],
): boolean {
  return (
    isObject(entry) &&
    isValidThemeSummary(entry) &&
    isDecimalString(entry.tokenCount) &&
    isDecimalString(entry.generatedSoulCandidates) &&
    isDecimalString(entry.claimedSouls)
  );
}

function isValidPerTokenSoulTotal(
  total: CachedPublicStatsSnapshot["perTokenSoulTotals"][number],
): boolean {
  return (
    isObject(total) &&
    isNonEmptyString(total.tokenMint) &&
    isNonEmptyString(total.tokenLabel) &&
    isNonEmptyString(total.soul) &&
    isValidThemeSummary(total.theme) &&
    isDecimalString(total.generatedSoulCandidates) &&
    isDecimalString(total.claimedSouls) &&
    typeof total.active === "boolean" &&
    isOptionalDustDecimalString(total.active_liquidity_base_units) &&
    isOptionalDustDecimalString(total.whole_units_in_pool) &&
    isOptionalFractionalRemainder(total.fractional_remainder) &&
    isOptionalFractionalFillRatioForRemainder(total.fractional_fill_ratio, total.fractional_remainder) &&
    isLiquidityRawComponentsConsistent(total) &&
    isDecimalString(total.active_receipts) &&
    isDecimalString(total.burned_receipts) &&
    isDecimalString(total.forfeited_receipts) &&
    isDecimalString(total.inactive_receipts) &&
    (total.whole_units_outside_liquidity === undefined ||
      isDecimalString(total.whole_units_outside_liquidity)) &&
    isValidDustSource(total.dustSource, total) &&
    (total.launchedAt === undefined || isDecimalString(total.launchedAt)) &&
    isStatsLink(total.primaryLink) &&
    total.primaryLink.href === `/token/${total.tokenMint}` &&
    isStatsLink(total.galleryLink) &&
    total.galleryLink.href === `/token/${total.tokenMint}/gallery`
  );
}

function isValidDustSource(
  source: CachedPublicStatsSnapshot["perTokenSoulTotals"][number]["dustSource"],
  total: CachedPublicStatsSnapshot["perTokenSoulTotals"][number],
): boolean {
  return (
    isObject(source) &&
    isDecimalString(source.token_unit) &&
    source.token_unit === MIN_CLAIM_BALANCE.toString() &&
    (source.liquidity === "bonding_curve_reserve" ||
      source.liquidity === "raydium_cp_swap_vault" ||
      source.liquidity === "unavailable") &&
    typeof source.source_verified === "boolean" &&
    (source.active_liquidity_base_units === undefined ||
      isDecimalString(source.active_liquidity_base_units)) &&
    (source.active_liquidity_base_units === undefined ||
      source.active_liquidity_base_units === total.active_liquidity_base_units) &&
    (source.active_liquidity_account === undefined ||
      isNonEmptyString(source.active_liquidity_account)) &&
    source.receipts === "receipt_binding_state" &&
    (source.outside_liquidity === "token_account_scan" ||
      source.outside_liquidity === "top_accounts_bounded_audit" ||
      source.outside_liquidity === "unavailable") &&
    (source.outside_liquidity_completeness === undefined ||
      source.outside_liquidity_completeness === "indexed_rpc_verified" ||
      source.outside_liquidity_completeness === "bounded_top_accounts_audit" ||
      source.outside_liquidity_completeness === "unavailable") &&
    (source.token2022_indexed_gpa_supported === undefined ||
      typeof source.token2022_indexed_gpa_supported === "boolean") &&
    (source.outside_liquidity_warning_codes === undefined ||
      (Array.isArray(source.outside_liquidity_warning_codes) &&
        source.outside_liquidity_warning_codes.every(isStableDustSourceWarningCode))) &&
    Array.isArray(source.burned_receipts_includes) &&
    source.burned_receipts_includes.includes("burned") &&
    source.burned_receipts_includes.includes("forfeited") &&
    (source.outside_liquidity_accounts === undefined ||
      isDecimalString(source.outside_liquidity_accounts)) &&
    (source.outside_liquidity_excluded_accounts === undefined ||
      isDecimalString(source.outside_liquidity_excluded_accounts)) &&
    (source.outside_liquidity_account_limit === undefined ||
      isDecimalString(source.outside_liquidity_account_limit)) &&
    (source.outside_liquidity_sampled_accounts === undefined ||
      isDecimalString(source.outside_liquidity_sampled_accounts)) &&
    (source.outside_liquidity_observed_base_units === undefined ||
      isDecimalString(source.outside_liquidity_observed_base_units)) &&
    (source.outside_liquidity_observed_whole_units === undefined ||
      isDecimalString(source.outside_liquidity_observed_whole_units)) &&
    (source.outside_liquidity_token_supply_base_units === undefined ||
      isDecimalString(source.outside_liquidity_token_supply_base_units)) &&
    (source.outside_liquidity_excluded_vaults === undefined ||
      (Array.isArray(source.outside_liquidity_excluded_vaults) &&
        source.outside_liquidity_excluded_vaults.every(isNonEmptyString))) &&
    (source.warnings === undefined ||
      (Array.isArray(source.warnings) && source.warnings.every(isNonEmptyString))) &&
    isValidDustSourceSpecifics(source, total)
  );
}

function isValidDustSourceSpecifics(
  source: CachedPublicStatsSnapshot["perTokenSoulTotals"][number]["dustSource"],
  total: CachedPublicStatsSnapshot["perTokenSoulTotals"][number],
): boolean {
  if (source.liquidity === "bonding_curve_reserve") {
    // Old CPMM model: verified with stored reserves.
    if (source.source_verified === true) {
      return total.active_liquidity_base_units !== null;
    }
    // Exponential curve model: no stored reserves, liquidity is implicit in the curve math.
    return total.active_liquidity_base_units === null;
  }

  if (source.liquidity === "unavailable") {
    return (
      source.source_verified === false &&
      total.active_liquidity_base_units === null &&
      hasRequiredUnavailableLiquidityWarningMetadata(source)
    );
  }

  return isValidVerifiedRaydiumDustSource(source, total);
}

function hasRequiredUnavailableLiquidityWarningMetadata(
  source: CachedPublicStatsSnapshot["perTokenSoulTotals"][number]["dustSource"],
): boolean {
  if (!hasRaydiumActiveLiquidityMetadata(source)) {
    return true;
  }

  return (
    Array.isArray(source.warnings) &&
    source.warnings.length > 0 &&
    source.warnings.every(isStableDustSourceWarningCode) &&
    source.warnings.some((warning) => RAYDIUM_ACTIVE_LIQUIDITY_WARNING_CODES.has(warning))
  );
}

function hasRaydiumActiveLiquidityMetadata(
  source: CachedPublicStatsSnapshot["perTokenSoulTotals"][number]["dustSource"],
): boolean {
  return (
    source.liquidity === "raydium_cp_swap_vault" ||
    isNonEmptyString(source.raydium_program_id) ||
    isNonEmptyString(source.raydium_pool_state) ||
    isNonEmptyString(source.raydium_token0_vault) ||
    isNonEmptyString(source.raydium_token1_vault) ||
    isNonEmptyString(source.raydium_token0_mint) ||
    isNonEmptyString(source.raydium_token1_mint)
  );
}

function isStableDustSourceWarningCode(warning: string): boolean {
  return STABLE_DUST_SOURCE_WARNING_CODES.has(warning);
}

function isValidVerifiedRaydiumDustSource(
  source: CachedPublicStatsSnapshot["perTokenSoulTotals"][number]["dustSource"],
  total: CachedPublicStatsSnapshot["perTokenSoulTotals"][number],
): boolean {
  if (
    source.source_verified !== true ||
    total.active_liquidity_base_units === null ||
    source.active_liquidity_base_units !== total.active_liquidity_base_units ||
    !isNonEmptyString(source.active_liquidity_account) ||
    !isNonEmptyString(source.raydium_program_id) ||
    !isNonEmptyString(source.raydium_pool_state) ||
    !isNonEmptyString(source.raydium_token0_vault) ||
    !isNonEmptyString(source.raydium_token1_vault) ||
    !isNonEmptyString(source.raydium_token0_mint) ||
    !isNonEmptyString(source.raydium_token1_mint) ||
    !isNonEmptyString(source.token_program) ||
    !isDecimalString(source.fetched_slot) ||
    !isNonEmptyString(source.commitment)
  ) {
    return false;
  }

  const selectedToken0 =
    source.active_liquidity_account === source.raydium_token0_vault &&
    source.raydium_token0_mint === total.tokenMint;
  const selectedToken1 =
    source.active_liquidity_account === source.raydium_token1_vault &&
    source.raydium_token1_mint === total.tokenMint;
  if (!selectedToken0 && !selectedToken1) {
    return false;
  }

  if (
    source.raydium_non_selected_vault !== undefined &&
    source.raydium_non_selected_vault === source.active_liquidity_account
  ) {
    return false;
  }

  return true;
}

function isValidFractionalRemainder(value: unknown): value is string {
  if (!isDecimalString(value)) {
    return false;
  }
  return BigInt(value) < MIN_CLAIM_BALANCE;
}

function isOptionalDustDecimalString(value: unknown): boolean {
  return value === null || isDecimalString(value);
}

function isOptionalFractionalRemainder(value: unknown): boolean {
  return value === null || isValidFractionalRemainder(value);
}

function isOptionalFractionalFillRatioForRemainder(ratio: unknown, remainder: unknown): boolean {
  if (ratio === null || remainder === null) {
    return ratio === null && remainder === null;
  }
  return isFractionalFillRatioForRemainder(ratio, remainder);
}

function isOptionalLiquidityDustRatio(value: unknown): boolean {
  return value === null || (typeof value === "string" && /^\d+\.\d{18}$/.test(value));
}

function isLiquidityRawComponentsConsistent(
  total: CachedPublicStatsSnapshot["perTokenSoulTotals"][number],
): boolean {
  if (total.active_liquidity_base_units === null) {
    return (
      total.whole_units_in_pool === null &&
      total.fractional_remainder === null &&
      total.fractional_fill_ratio === null &&
      total.liquidity_dust_ratio === null
    );
  }

  if (
    !isDecimalString(total.active_liquidity_base_units) ||
    !isDecimalString(total.whole_units_in_pool) ||
    !isValidFractionalRemainder(total.fractional_remainder) ||
    !isFractionalFillRatioForRemainder(total.fractional_fill_ratio, total.fractional_remainder) ||
    !isOptionalLiquidityDustRatio(total.liquidity_dust_ratio)
  ) {
    return false;
  }

  const activeLiquidity = BigInt(total.active_liquidity_base_units);
  const wholeUnits = BigInt(total.whole_units_in_pool);
  const remainder = BigInt(total.fractional_remainder);
  if (
    wholeUnits !== activeLiquidity / MIN_CLAIM_BALANCE ||
    remainder !== activeLiquidity % MIN_CLAIM_BALANCE
  ) {
    return false;
  }

  if (activeLiquidity === 0n) {
    return total.liquidity_dust_ratio === null;
  }

  return total.liquidity_dust_ratio === formatLiquidityDustRatio(remainder, activeLiquidity);
}

function isFractionalFillRatioForRemainder(ratio: unknown, remainder: unknown): boolean {
  if (typeof ratio !== "string" || !/^0\.\d{6}$/.test(ratio) || !isDecimalString(remainder)) {
    return false;
  }
  const scaled = (BigInt(remainder) * 1_000_000n) / MIN_CLAIM_BALANCE;
  return ratio === `0.${scaled.toString().padStart(6, "0")}`;
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

function isValidThemeSummary(theme: unknown): boolean {
  return (
    isObject(theme) &&
    ["neonpuff", "soulpuff", "monochrome", "hexagram", "signal", "custom"].includes(
      String(theme.id),
    ) &&
    isNonEmptyString(theme.label) &&
    (theme.renderer === "built-in" || theme.renderer === "custom-template")
  );
}

function isValidStatsActivity(activity: CachedPublicStatsSnapshot["recentActivity"][number]): boolean {
  if (
    !isObject(activity) ||
    !isNonEmptyString(activity.id) ||
    !["launch", "tradeGeneration", "claim"].includes(activity.kind) ||
    typeof activity.sortKey !== "number" ||
    !Number.isFinite(activity.sortKey) ||
    !isStatsLink(activity.primaryLink)
  ) {
    return false;
  }

  if (activity.kind === "launch") {
    return true;
  }
  if (activity.kind === "claim") {
    return isValidClaimActivity(activity);
  }

  return isValidTradeGenerationActivity(activity);
}

function isValidClaimActivity(
  activity: CachedPublicStatsSnapshot["recentActivity"][number],
): boolean {
  return (
    isNonEmptyString(activity.tokenMint) &&
    isNonEmptyString(activity.tokenLabel) &&
    isNonEmptyString(activity.soul) &&
    isDecimalString(activity.sequence) &&
    isDecimalString(activity.generation) &&
    activity.primaryLink.href === `/token/${activity.tokenMint}/gallery` &&
    isStatsLink(activity.secondaryLink) &&
    activity.secondaryLink.external === true &&
    activity.secondaryLink.href.includes("/address/") &&
    Array.isArray(activity.extraLinks) &&
    activity.extraLinks.some(
      (link) =>
        isStatsLink(link) &&
        link.external === true &&
        link.href.includes(`/address/${activity.soul}`),
    )
  );
}

function isValidTradeGenerationActivity(
  activity: CachedPublicStatsSnapshot["recentActivity"][number],
): boolean {
  if (
    (activity.side !== "buy" && activity.side !== "sell") ||
    !isDecimalString(activity.amount) ||
    !isDecimalString(activity.generation) ||
    !isNonEmptyString(activity.tokenMint) ||
    !hasTraderOrOwner(activity) ||
    !isHexString(activity.seedHash) ||
    activity.primaryLink.href !== `/token/${activity.tokenMint}`
  ) {
    return false;
  }

  if (isNonEmptyString(activity.signature)) {
    return isFinalizedTradeGenerationActivity(activity);
  }

  return isSignaturelessFallbackTradeGenerationActivity(activity);
}

function isFinalizedTradeGenerationActivity(
  activity: CachedPublicStatsSnapshot["recentActivity"][number],
): boolean {
  return (
    isNonEmptyString(activity.soul) &&
    isNonEmptyString(activity.trader) &&
    isNonEmptyString(activity.tokenAccount) &&
    typeof activity.slot === "number" &&
    Number.isSafeInteger(activity.slot) &&
    activity.slot >= 0 &&
    isStatsLink(activity.secondaryLink) &&
    activity.secondaryLink.external === true &&
    activity.secondaryLink.href.includes(`/tx/${activity.signature}`) &&
    Array.isArray(activity.extraLinks) &&
    activity.extraLinks.some(
      (link) =>
        isStatsLink(link) &&
        link.external === true &&
        link.href.includes(`/address/${activity.soul}`),
    )
  );
}

function isSignaturelessFallbackTradeGenerationActivity(
  activity: CachedPublicStatsSnapshot["recentActivity"][number],
): boolean {
  return (
    isUnavailable(activity.signature) &&
    isUnavailable(activity.slot) &&
    isStatsLink(activity.secondaryLink) &&
    activity.secondaryLink.external !== true &&
    activity.secondaryLink.href === `/token/${activity.tokenMint}#token-timeline`
  );
}

function isTransientEmptyPartialSnapshot(snapshot: CachedPublicStatsSnapshot): boolean {
  return (
    snapshot.source.partial === true &&
    snapshot.metrics.every((metric) => metric.value === "0") &&
    snapshot.themeDistribution.length === 0 &&
    snapshot.perTokenSoulTotals.length === 0 &&
    snapshot.recentActivity.length === 0
  );
}

function isStatsLink(link: unknown): link is CachedPublicStatsSnapshot["recentActivity"][number]["primaryLink"] {
  return (
    isObject(link) &&
    isNonEmptyString(link.label) &&
    isNonEmptyString(link.href) &&
    (link.external === undefined || typeof link.external === "boolean")
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function isUnavailable(value: unknown): boolean {
  return value === undefined || value === null;
}

function hasTraderOrOwner(
  activity: CachedPublicStatsSnapshot["recentActivity"][number] & { owner?: unknown },
): boolean {
  return isNonEmptyString(activity.trader) || isNonEmptyString(activity.owner);
}

function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

function isHexString(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F]+$/.test(value);
}

function browserStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
