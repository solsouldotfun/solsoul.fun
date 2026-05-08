"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  isValidPublicStatsSnapshot,
  readPublicStatsSnapshot,
  writePublicStatsSnapshot,
  type CachedPublicStatsSnapshot,
} from "@/lib/publicStatsCache";
import { credentialSafeRpcLabel } from "@/lib/rpcSource";
import type {
  PublicStatsSnapshot,
  StatsActivityLink,
  StatsMetric,
  StatsThemeDistributionEntry,
  StatsTokenSoulTotals,
} from "@/lib/stats";
import { joinClasses, uiPrimitives } from "./uiPrimitives";
import { SoulFlowLeaderboards, RecentActivity } from "./StatsSoulFlowModules";

type StatsState =
  | { status: "idle" | "loading" }
  | { status: "loaded"; snapshot: PublicStatsResponse }
  | { status: "error"; message: string; snapshot?: PublicStatsResponse };

type PublicStatsResponse = PublicStatsSnapshot & {
  ok: true;
};

const STATS_FETCH_TIMEOUT_MS = 20_000;


export function StatsDashboard() {
  const t = useTranslations("stats");
  const [state, setState] = useState<StatsState>({ status: "idle" });

  const loadStats = useCallback(async () => {
    setState((current) => (current.status === "loaded" ? current : { status: "loading" }));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, STATS_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch("/api/stats", {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      const body = (await response.json()) as PublicStatsResponse | { ok: false; error?: string };
      if (!response.ok || !body.ok) {
        throw new StatsLoadError("unavailable");
      }
      const snapshot = body as CachedPublicStatsSnapshot;
      if (!isValidPublicStatsSnapshot(snapshot)) {
        throw new StatsLoadError("partial");
      }
      writePublicStatsSnapshot(snapshot);
      setState({ status: "loaded", snapshot });
    } catch (error: unknown) {
      const cached = readPublicStatsSnapshot();
      const message = formatStatsLoadMessage(error, t);
      setState({
        status: "error",
        message,
        snapshot: cached,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }, [t]);

  useEffect(() => {
    const cached = readPublicStatsSnapshot();
    if (cached) {
      setState({ status: "loaded", snapshot: cached });
    } else {
      setState({ status: "loading" });
    }
    void loadStats();
  }, [loadStats]);

  const snapshot = state.status === "loaded" || state.status === "error" ? state.snapshot : undefined;

  return (
    <section className="mt-6 space-y-4" aria-label={t("dashboardLabel")}>
      <div className={joinClasses(uiPrimitives.panel, "grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center")}>
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/45">{t("sourceLabel")}</p>
          <p className="mt-1 break-words text-sm text-white/75">
            {snapshot
              ? t("sourceValue", { provider: credentialSafeRpcLabel(snapshot.source) })
              : state.status === "error"
                ? t("unavailable")
                : t("loading")}
          </p>
          {snapshot ? (
            <div className="mt-1 space-y-1 text-xs text-white/45">
              <p>{t("fetchedAt", { timestamp: snapshot.source.fetchedAt })}</p>
              <p>{t("sourceCommitment", { commitment: snapshot.source.commitment })}</p>
              {snapshot.source.slot !== undefined ? (
                <p>{t("sourceSlot", { slot: snapshot.source.slot.toString() })}</p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                {snapshot.source.partial === true ? <SourceBadge label={t("dust.partialBadge")} /> : null}
                {snapshot.source.stale === true ? <SourceBadge label={t("dust.staleBadge")} /> : null}
              </div>
            </div>
          ) : null}
        </div>
        <button
          className={joinClasses(uiPrimitives.buttonSecondary, "px-4 py-2 text-sm disabled:cursor-wait disabled:opacity-60")}
          disabled={state.status === "loading"}
          onClick={() => void loadStats()}
          type="button"
        >
          {state.status === "loading" ? t("refreshing") : t("refresh")}
        </button>
      </div>

      {state.status === "error" ? (
        <div className={uiPrimitives.statusError}>
          {snapshot ? t("cachedWarning", { message: state.message }) : state.message}
        </div>
      ) : null}

      {snapshot ? (
        <>
          <DashboardScopeLinks />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {snapshot.metrics.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </div>
          <SoulFlowLeaderboards snapshot={snapshot} />
          <DustStatsSummary snapshot={snapshot} />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
            <ThemeDistribution rows={snapshot.themeDistribution} />
            <PerTokenTotals rows={snapshot.perTokenSoulTotals} />
          </div>
          <RecentActivity rows={snapshot.recentActivity} />
        </>
      ) : state.status === "error" ? null : (
        <div className={uiPrimitives.statusNeutral}>{t("loading")}</div>
      )}
    </section>
  );
}

function SourceBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber-100">
      {label}
    </span>
  );
}

function DashboardScopeLinks() {
  const t = useTranslations("stats");
  const links = [
    { key: "allSouls", href: "/souls" },
    { key: "tokenFeed", href: "/tokens" },
  ] as const;

  return (
    <nav
      aria-label={t("scopeLinksLabel")}
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
      data-dashboard-scope-links="true"
    >
      {links.map((link) => (
        <Link
          className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white/75 transition hover:border-soul-mint/45 hover:text-soul-mint"
          href={link.href}
          key={link.key}
        >
          {t(`scopeLinks.${link.key}`)}
        </Link>
      ))}
    </nav>
  );
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

type StatsLoadErrorReason = "partial" | "unavailable";

class StatsLoadError extends Error {
  readonly reason: StatsLoadErrorReason;

  constructor(reason: StatsLoadErrorReason) {
    super(reason);
    this.name = "StatsLoadError";
    this.reason = reason;
  }
}

function formatStatsLoadMessage(
  error: unknown,
  t: ReturnType<typeof useTranslations<"stats">>,
): string {
  if (isAbortError(error)) {
    return t("timeoutError");
  }
  if (error instanceof StatsLoadError && error.reason === "partial") {
    return t("invalidData");
  }
  return t("loadError");
}

function MetricCard({ metric }: { metric: StatsMetric }) {
  const t = useTranslations("stats");
  const href = metricHref(metric.id);
  return (
    <article
      className={joinClasses(uiPrimitives.card, "flex min-w-0 flex-col p-4")}
      data-proof-metric={metric.id}
    >
      <p className="text-xs uppercase tracking-[0.25em] text-white/45">{t(`metrics.${metric.id}.label`)}</p>
      <p className="mt-2 font-mono text-3xl font-black tabular-nums text-white">{metric.value}</p>
      <p className="mt-2 flex-1 text-sm text-white/55">{t(`metrics.${metric.id}.help`)}</p>
      <Link
        className={joinClasses(uiPrimitives.buttonSecondary, "mt-4 px-3 py-2 text-center text-xs")}
        href={href}
      >
        {t(`metricLinks.${metric.id}`)}
      </Link>
    </article>
  );
}

function ThemeDistribution({ rows }: { rows: StatsThemeDistributionEntry[] }) {
  const t = useTranslations("stats");

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-soul-mint">{t("themesEyebrow")}</p>
      <h2 className="mt-2 text-2xl font-black">{t("themesTitle")}</h2>
      {rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/30 p-4 text-sm text-white/60">
          {t("emptyThemes")}
        </div>
      ) : (
        <div className="mt-4 grid gap-2">
          {rows.map((theme) => (
            <article
              className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-3"
              data-theme-distribution={theme.id}
              key={theme.id}
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <h3 className="break-words text-sm font-black text-white">{theme.label}</h3>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[0.7rem] uppercase tracking-[0.14em] text-white/50">
                  {theme.renderer}
                </span>
              </div>
              <dl className="mt-3 grid gap-2 text-xs text-white/60 sm:grid-cols-3">
                <DistributionFact label={t("themeTokens", { count: theme.tokenCount })} />
                <DistributionFact label={t("themeGenerated", { count: theme.generatedSoulCandidates })} />
                <DistributionFact label={t("themeClaimed", { count: theme.claimedSouls })} />
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PerTokenTotals({ rows }: { rows: StatsTokenSoulTotals[] }) {
  const t = useTranslations("stats");

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-soul-mint">{t("tokenTotalsEyebrow")}</p>
          <h2 className="mt-2 text-2xl font-black">{t("tokenTotalsTitle")}</h2>
        </div>
        <Link className="text-sm font-semibold text-soul-mint underline" href="/tokens">
          {t("scopeLinks.tokenFeed")}
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/30 p-4 text-sm text-white/60">
          {t("emptyTokenTotals")}
        </div>
      ) : (
        <div className="mt-4 grid gap-2">
          {rows.map((row) => (
            <article
              className="grid min-w-0 gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 md:grid-cols-[minmax(0,1fr)_auto]"
              data-token-total={row.tokenMint}
              key={row.tokenMint}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="break-words text-base font-black text-white">{row.tokenLabel}</h3>
                  <span className="rounded-full border border-soul-mint/30 bg-soul-mint/10 px-2.5 py-1 text-xs font-semibold text-soul-mint">
                    {t("tokenTotalsTheme", { theme: row.theme.label })}
                  </span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/55">
                    {t("tokenTotalsStatus", { status: t(row.active ? "tokenStatus.active" : "tokenStatus.inactive") })}
                  </span>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-white/45">{row.tokenMint}</p>
                <p className="mt-2 text-sm text-white/60">
                  {t("tokenTotalsGenerated", { count: row.generatedSoulCandidates })} ·{" "}
                  {t("tokenTotalsClaimed", { count: row.claimedSouls })}
                </p>
                <TokenDustMetrics row={row} />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
                <ActivityLink
                  className="rounded-xl bg-soul-glow px-3 py-2 text-center text-sm font-semibold text-black transition hover:bg-white"
                  link={row.primaryLink}
                />
                <ActivityLink
                  className="rounded-xl border border-white/15 px-3 py-2 text-center text-sm text-white/70 transition hover:border-white/35 hover:text-white"
                  link={{ ...row.galleryLink, label: t("tokenTotalsGalleryLink") }}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

const GLOBAL_DUST_FIELDS = [
  "whole_units_in_pool",
  "fractional_remainder",
  "active_receipts",
  "burned_receipts",
  "forfeited_receipts",
  "inactive_receipts",
  "whole_units_outside_liquidity",
  "outside_liquidity_audited_tokens",
] as const;

const SOURCE_COVERAGE_FIELDS = [
  "bonding_curve_reserve_tokens",
  "raydium_cp_swap_vault_tokens",
  "unavailable_tokens",
  "source_verified_tokens",
  "source_unverified_tokens",
  "warning_tokens",
] as const;

const TOKEN_DUST_FIELDS = [
  "whole_units_in_pool",
  "fractional_remainder",
  "fractional_fill_ratio",
  "liquidity_dust_ratio",
  "active_receipts",
  "burned_receipts",
  "forfeited_receipts",
  "inactive_receipts",
  "whole_units_outside_liquidity",
] as const;

type GlobalDustField = (typeof GLOBAL_DUST_FIELDS)[number];
type SourceCoverageField = (typeof SOURCE_COVERAGE_FIELDS)[number];
type TokenDustField = (typeof TOKEN_DUST_FIELDS)[number];

function DustStatsSummary({ snapshot }: { snapshot: PublicStatsResponse }) {
  const t = useTranslations("stats");
  const warnings = collectDustWarnings(snapshot);

  return (
    <section
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-4"
      data-dust-dashboard="true"
    >
      <p className="text-xs uppercase tracking-[0.25em] text-amber-100">{t("dust.eyebrow")}</p>
      <div className="mt-2 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)]">
        <div>
          <h2 className="text-2xl font-black text-white">{t("dust.title")}</h2>
          <p className="mt-2 text-sm text-white/60">{t("dust.description")}</p>
          <p className="mt-2 text-xs text-amber-100/80">{t("dust.prototypeNotice")}</p>
        </div>
        <SourceWarningList warnings={warnings} />
      </div>
      <div className="mt-4">
        <p className="text-sm font-black text-white">{t("dust.globalTitle")}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" data-dust-global="true">
          {GLOBAL_DUST_FIELDS.map((field) => (
            <DustFact
              help={t(`dust.fields.${field}.help`)}
              key={field}
              label={t(`dust.fields.${field}.label`)}
              value={globalDustValue(snapshot, field, t("dust.outsideLiquidityUnavailable"))}
            />
          ))}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-sm font-black text-white">{t("dust.sourceCoverageTitle")}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-dust-source-coverage="true">
          {SOURCE_COVERAGE_FIELDS.map((field) => (
            <DustFact
              help={t(`dust.sourceCoverage.${field}.help`)}
              key={field}
              label={t(`dust.sourceCoverage.${field}.label`)}
              value={sourceCoverageValue(snapshot, field)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function TokenDustMetrics({ row }: { row: StatsTokenSoulTotals }) {
  const t = useTranslations("stats");

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3" data-token-dust={row.tokenMint}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-100">
          {t("dust.perTokenTitle")}
        </p>
        <p className="font-mono text-[0.7rem] text-white/45">
          {t("dust.tokenUnit", { unit: row.dustSource.token_unit })}
        </p>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {TOKEN_DUST_FIELDS.map((field) => (
          <DustFact
            help={t(`dust.fields.${field}.help`)}
            key={field}
            label={t(`dust.fields.${field}.label`)}
            value={tokenDustValue(row, field, t("dust.outsideLiquidityUnavailable"))}
          />
        ))}
      </div>
      <DustSourceDetails row={row} />
    </div>
  );
}

function DustSourceDetails({ row }: { row: StatsTokenSoulTotals }) {
  const t = useTranslations("stats");
  const warnings = row.dustSource.warnings ?? [];
  const raydiumSourceMetadata =
    row.dustSource.liquidity === "raydium_cp_swap_vault"
      ? raydiumSourceMetadataLines(row.dustSource, t)
      : [];

  return (
    <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/20 p-3 text-xs text-white/55">
      <p className="font-semibold text-white/70">{t("dust.limitationsTitle")}</p>
      <ul className="mt-2 grid gap-1">
        <li>{t(`dust.liquiditySources.${row.dustSource.liquidity}`)}</li>
        <li>{t("dust.receiptSource")}</li>
        <li>{t(`dust.outsideSources.${row.dustSource.outside_liquidity}`)}</li>
        <li>{t("dust.burnedIncludes", { states: row.dustSource.burned_receipts_includes.join(", ") })}</li>
        {warnings.length === 0 ? (
          <li>{t("dust.noWarnings")}</li>
        ) : (
          warnings.map((warning) => (
            <li key={warning}>{localizeDustWarning(warning, t)}</li>
          ))
        )}
      </ul>
      {raydiumSourceMetadata.length > 0 ? (
        <div className="mt-3 rounded-lg border border-soul-mint/15 bg-soul-mint/[0.04] p-2">
          <p className="font-semibold text-soul-mint">{t("dust.raydiumSourceTitle")}</p>
          <ul className="mt-2 grid gap-1">
            {raydiumSourceMetadata.map((line) => (
              <li className="break-all font-mono" key={line}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function raydiumSourceMetadataLines(
  source: StatsTokenSoulTotals["dustSource"],
  t: ReturnType<typeof useTranslations<"stats">>,
): string[] {
  const entries = [
    ["sourceVerified", source.source_verified ? "true" : "false"],
    ["activeLiquidityAccount", source.active_liquidity_account],
    ["activeLiquidityBaseUnits", source.active_liquidity_base_units],
    ["raydiumProgramId", source.raydium_program_id],
    ["raydiumPoolState", source.raydium_pool_state],
    ["raydiumToken0Vault", source.raydium_token0_vault],
    ["raydiumToken1Vault", source.raydium_token1_vault],
    ["raydiumToken0Mint", source.raydium_token0_mint],
    ["raydiumToken1Mint", source.raydium_token1_mint],
    ["raydiumNonSelectedVault", source.raydium_non_selected_vault],
    ["tokenProgram", source.token_program],
    ["fetchedSlot", source.fetched_slot],
    ["commitment", source.commitment],
  ] as const;

  return entries.flatMap(([key, value]) =>
    value ? [t(`dust.sourceMetadata.${key}`, { value })] : [],
  );
}

function SourceWarningList({ warnings }: { warnings: string[] }) {
  const t = useTranslations("stats");

  return (
    <div className="rounded-2xl border border-dashed border-amber-300/20 bg-black/20 p-3 text-xs text-white/60">
      <p className="font-semibold uppercase tracking-[0.16em] text-amber-100">{t("dust.sourceWarnings")}</p>
      {warnings.length === 0 ? (
        <p className="mt-2">{t("dust.noWarnings")}</p>
      ) : (
        <ul className="mt-2 grid gap-1">
          {warnings.map((warning) => (
            <li className="break-words" key={warning}>
              {localizeDustWarning(warning, t)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DustFact({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="text-[0.65rem] uppercase tracking-[0.16em] text-white/45">{label}</p>
      <p className="mt-1 break-all font-mono text-sm font-black tabular-nums text-white">{value}</p>
      <p className="mt-1 text-[0.7rem] leading-relaxed text-white/45">{help}</p>
    </div>
  );
}

function globalDustValue(
  snapshot: PublicStatsResponse,
  field: GlobalDustField,
  unavailableLabel: string,
): string {
  return snapshot.dustTotals[field] ?? unavailableLabel;
}

function sourceCoverageValue(
  snapshot: PublicStatsResponse,
  field: SourceCoverageField,
): string {
  return snapshot.dustTotals.source_coverage[field];
}

function tokenDustValue(
  row: StatsTokenSoulTotals,
  field: TokenDustField,
  unavailableLabel: string,
): string {
  return row[field] ?? unavailableLabel;
}

function collectDustWarnings(snapshot: PublicStatsResponse): string[] {
  const warnings = new Set<string>();
  for (const warning of snapshot.source.warnings ?? []) {
    warnings.add(warning);
  }
  for (const warning of snapshot.source.rpcCapability?.outsideLiquidity.warningCodes ?? []) {
    warnings.add(warning);
  }
  for (const row of snapshot.perTokenSoulTotals) {
    for (const warning of row.dustSource.warnings ?? []) {
      warnings.add(warning);
    }
  }
  return Array.from(warnings);
}

const DUST_WARNING_MESSAGE_KEYS = {
  outsideLiquidityScanUnavailable: "dust.warningMessages.outsideLiquidityScanUnavailable",
  outsideLiquidityVenueUnavailable: "dust.warningMessages.outsideLiquidityVenueUnavailable",
  activeLiquidityZero: "dust.warningMessages.activeLiquidityZero",
  raydiumVaultUnverified: "dust.warningMessages.raydiumVaultUnverified",
  launchedTokenMetricsPartial: "dust.warningMessages.launchedTokenMetricsPartial",
  claimedSoulMetricsPartial: "dust.warningMessages.claimedSoulMetricsPartial",
  recentGenerationProvenancePartial: "dust.warningMessages.recentGenerationProvenancePartial",
  receiptLifecycleCountsPartial: "dust.warningMessages.receiptLifecycleCountsPartial",
  outsideLiquidityScanPartial: "dust.warningMessages.outsideLiquidityScanPartial",
  token2022IndexedGpaUnavailable: "dust.warningMessages.token2022IndexedGpaUnavailable",
  token2022SecondaryIndexExcluded: "dust.warningMessages.token2022SecondaryIndexExcluded",
  token2022IndexedGpaProbeFailed: "dust.warningMessages.token2022IndexedGpaProbeFailed",
  tokenMethodsBoundedSample: "dust.warningMessages.tokenMethodsBoundedSample",
  outsideLiquiditySampleLimited: "dust.warningMessages.outsideLiquiditySampleLimited",
  outsideLiquidityUnknownWhenTopSampleEmpty:
    "dust.warningMessages.outsideLiquidityUnknownWhenTopSampleEmpty",
  outsideLiquidityTokenMethodsUnavailable:
    "dust.warningMessages.outsideLiquidityTokenMethodsUnavailable",
  outsideLiquidityNoProbeTarget: "dust.warningMessages.outsideLiquidityNoProbeTarget",
  rpcFailoverUsed: "dust.warningMessages.rpcFailoverUsed",
  postGraduationRaydiumReceiptPathsBounded:
    "dust.warningMessages.postGraduationRaydiumReceiptPathsBounded",
  raydiumTransferHookMintsUnsupported:
    "dust.warningMessages.raydiumTransferHookMintsUnsupported",
  statsSourceSlotPartial: "dust.warningMessages.statsSourceSlotPartial",
  unknownPartial: "dust.warningMessages.unknownPartial",
} as const;

type DustWarningMessageKey =
  (typeof DUST_WARNING_MESSAGE_KEYS)[keyof typeof DUST_WARNING_MESSAGE_KEYS];

const KNOWN_DUST_WARNING_MESSAGE_KEYS = new Set<string>(
  Object.values(DUST_WARNING_MESSAGE_KEYS),
);

function localizeDustWarning(
  warning: string,
  t: ReturnType<typeof useTranslations<"stats">>,
): string {
  return t(resolveDustWarningMessageKey(warning));
}

function resolveDustWarningMessageKey(warning: string): DustWarningMessageKey {
  const trimmed = warning.trim();
  const normalized = trimmed.toLowerCase();

  if (KNOWN_DUST_WARNING_MESSAGE_KEYS.has(trimmed)) {
    return trimmed as DustWarningMessageKey;
  }

  switch (normalized) {
    case "outside-liquidity token account scan unavailable":
    case "outside_liquidity_scan_unavailable":
      return DUST_WARNING_MESSAGE_KEYS.outsideLiquidityScanUnavailable;
    case "outside-liquidity venue unavailable after migration":
    case "outside_liquidity_venue_unavailable":
      return DUST_WARNING_MESSAGE_KEYS.outsideLiquidityVenueUnavailable;
    case "active_liquidity_zero":
      return DUST_WARNING_MESSAGE_KEYS.activeLiquidityZero;
    case "raydium_vault_unverified":
    case "raydium_pool_missing":
    case "raydium_vault_missing":
    case "raydium_vault_mint_mismatch":
    case "raydium_pool_owner_mismatch":
    case "raydium_vault_owner_mismatch":
    case "raydium_vault_unsupported_token_program":
      return DUST_WARNING_MESSAGE_KEYS.raydiumVaultUnverified;
    case "launched_token_metrics_partial":
      return DUST_WARNING_MESSAGE_KEYS.launchedTokenMetricsPartial;
    case "claimed_soul_metrics_partial":
      return DUST_WARNING_MESSAGE_KEYS.claimedSoulMetricsPartial;
    case "recent_generation_provenance_partial":
      return DUST_WARNING_MESSAGE_KEYS.recentGenerationProvenancePartial;
    case "receipt_lifecycle_counts_partial":
      return DUST_WARNING_MESSAGE_KEYS.receiptLifecycleCountsPartial;
    case "outside_liquidity_scan_partial":
      return DUST_WARNING_MESSAGE_KEYS.outsideLiquidityScanPartial;
    case "token2022_indexed_gpa_unavailable":
      return DUST_WARNING_MESSAGE_KEYS.token2022IndexedGpaUnavailable;
    case "token2022_secondary_index_excluded":
      return DUST_WARNING_MESSAGE_KEYS.token2022SecondaryIndexExcluded;
    case "token2022_indexed_gpa_probe_failed":
      return DUST_WARNING_MESSAGE_KEYS.token2022IndexedGpaProbeFailed;
    case "token_methods_bounded_sample":
      return DUST_WARNING_MESSAGE_KEYS.tokenMethodsBoundedSample;
    case "outside_liquidity_sample_limited":
      return DUST_WARNING_MESSAGE_KEYS.outsideLiquiditySampleLimited;
    case "outside_liquidity_unknown_when_top_sample_empty":
      return DUST_WARNING_MESSAGE_KEYS.outsideLiquidityUnknownWhenTopSampleEmpty;
    case "outside_liquidity_token_methods_unavailable":
      return DUST_WARNING_MESSAGE_KEYS.outsideLiquidityTokenMethodsUnavailable;
    case "outside_liquidity_no_probe_target":
      return DUST_WARNING_MESSAGE_KEYS.outsideLiquidityNoProbeTarget;
    case "rpc_failover_used":
      return DUST_WARNING_MESSAGE_KEYS.rpcFailoverUsed;
    case "post_graduation_raydium_receipt_paths_bounded":
      return DUST_WARNING_MESSAGE_KEYS.postGraduationRaydiumReceiptPathsBounded;
    case "raydium_transfer_hook_mints_unsupported":
      return DUST_WARNING_MESSAGE_KEYS.raydiumTransferHookMintsUnsupported;
    case "stats_source_slot_partial":
      return DUST_WARNING_MESSAGE_KEYS.statsSourceSlotPartial;
    default:
      break;
  }

  if (normalized.startsWith("launched token metrics:")) {
    return DUST_WARNING_MESSAGE_KEYS.launchedTokenMetricsPartial;
  }
  if (normalized.startsWith("claimed soul metrics:")) {
    return DUST_WARNING_MESSAGE_KEYS.claimedSoulMetricsPartial;
  }
  if (normalized.startsWith("recent generation provenance:")) {
    return DUST_WARNING_MESSAGE_KEYS.recentGenerationProvenancePartial;
  }
  if (normalized.startsWith("receipt lifecycle counts:")) {
    return DUST_WARNING_MESSAGE_KEYS.receiptLifecycleCountsPartial;
  }
  if (normalized.startsWith("outside-liquidity token account scan:")) {
    return DUST_WARNING_MESSAGE_KEYS.outsideLiquidityScanPartial;
  }
  if (normalized.startsWith("stats source slot:")) {
    return DUST_WARNING_MESSAGE_KEYS.statsSourceSlotPartial;
  }

  return DUST_WARNING_MESSAGE_KEYS.unknownPartial;
}

function DistributionFact({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 font-mono">
      {label}
    </div>
  );
}

function ActivityLink({ className, link }: { className: string; link: StatsActivityLink }) {
  const isExternal = link.external === true || /^https?:\/\//i.test(link.href);
  if (isExternal) {
    return (
      <a className={className} href={link.href} rel="noreferrer" target="_blank">
        {link.label}
      </a>
    );
  }

  return (
    <Link className={className} href={link.href}>
      {link.label}
    </Link>
  );
}

function metricHref(metricId: StatsMetric["id"]): string {
  if (metricId === "launchedTokens" || metricId === "activeCurves") {
    return "/tokens";
  }
  return "/souls";
}

