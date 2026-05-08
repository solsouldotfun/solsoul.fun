"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { svgToDataUri } from "@/lib/svgPreview";
import type {
  PublicStatsSnapshot,
  StatsActivity,
  StatsTokenSoulTotals,
} from "@/lib/stats";

type PublicStatsResponse = PublicStatsSnapshot & {
  ok: true;
};

const PD9_STATS_THUMBNAIL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" data-soul-art="pd9-monochrome-stats-thumbnail"><rect width="96" height="96" rx="18" fill="#f7f7f2"/><rect x="10" y="10" width="76" height="76" rx="12" fill="none" stroke="#050505" stroke-width="3"/><path d="M24 72 C31 52 36 35 48 27 C60 35 65 52 72 72 Z" fill="#050505"/><circle cx="48" cy="43" r="15" fill="#f7f7f2" stroke="#050505" stroke-width="3"/><path d="M38 45 H43 M53 45 H58" stroke="#050505" stroke-width="2" stroke-linecap="round"/></svg>';

type LeaderboardModuleId =
  | "topFlowingTokens"
  | "latestRareSouls"
  | "mostGenerated"
  | "highestLocked"
  | "recentGenerations";

type LeaderboardItem = {
  id: string;
  title: string;
  metric: string;
  helper: string;
  href: string;
  accent?: string;
};

const LEADERBOARD_MODULES: LeaderboardModuleId[] = [
  "topFlowingTokens",
  "latestRareSouls",
  "mostGenerated",
  "highestLocked",
  "recentGenerations",
];

export function SoulFlowLeaderboards({ snapshot }: { snapshot: PublicStatsResponse }) {
  const t = useTranslations("stats");
  const flowRows = buildFlowActivityRows(snapshot.recentActivity, t);
  const modules: Record<LeaderboardModuleId, LeaderboardItem[]> = {
    topFlowingTokens: topFlowingTokenItems(snapshot.perTokenSoulTotals, t),
    latestRareSouls: latestRareSoulItems(flowRows, t),
    mostGenerated: mostGeneratedItems(snapshot.perTokenSoulTotals, t),
    highestLocked: highestLockedItems(snapshot.perTokenSoulTotals, t),
    recentGenerations: recentGenerationItems(flowRows, t),
  };

  return (
    <section className="rounded-3xl border border-soul-mint/15 bg-soul-mint/[0.04] p-4" data-soul-flow-leaderboards="true">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-soul-mint">{t("leaderboards.eyebrow")}</p>
          <h2 className="mt-2 text-2xl font-black">{t("leaderboards.title")}</h2>
        </div>
        <p className="max-w-xl text-sm text-white/55">{t("leaderboards.description")}</p>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
        {LEADERBOARD_MODULES.map((moduleId) => (
          <LeaderboardModule
            id={moduleId}
            items={modules[moduleId]}
            key={moduleId}
          />
        ))}
      </div>
    </section>
  );
}

function LeaderboardModule({
  id,
  items,
}: {
  id: LeaderboardModuleId;
  items: LeaderboardItem[];
}) {
  const t = useTranslations("stats");

  return (
    <article
      className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-black/30 p-3"
      data-leaderboard-module={id}
    >
      <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/45">
        {t(`leaderboards.modules.${id}.eyebrow`)}
      </p>
      <h3 className="mt-1 text-base font-black text-white">
        {t(`leaderboards.modules.${id}.title`)}
      </h3>
      {items.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-3 text-sm text-white/55">
          {t(`leaderboards.modules.${id}.empty`)}
        </div>
      ) : (
        <ol className="mt-3 grid gap-2">
          {items.slice(0, 4).map((item, index) => (
            <li className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-2" key={item.id}>
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 rounded-full border border-soul-mint/25 px-2 py-0.5 font-mono text-[0.65rem] text-soul-mint">
                  #{index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Link className="break-words text-sm font-black text-white hover:text-soul-mint" href={item.href}>
                    {item.title}
                  </Link>
                  <p className="mt-1 font-mono text-xs text-soul-mint">{item.metric}</p>
                  <p className="mt-1 text-xs text-white/45">{item.helper}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function topFlowingTokenItems(
  rows: StatsTokenSoulTotals[],
  t: ReturnType<typeof useTranslations<"stats">>,
): LeaderboardItem[] {
  return [...rows]
    .sort((left, right) => tokenFlowScore(right) - tokenFlowScore(left) || left.tokenMint.localeCompare(right.tokenMint))
    .map((row) => ({
      id: `top-flowing:${row.tokenMint}`,
      title: row.tokenLabel,
      metric: t("leaderboards.metrics.flowScore", { score: tokenFlowScore(row).toString() }),
      helper: t("leaderboards.metrics.generatedClaimed", {
        generated: row.generatedSoulCandidates,
        claimed: row.claimedSouls,
      }),
      href: row.primaryLink.href,
    }));
}

function latestRareSoulItems(
  rows: FlowActivityRow[],
  t: ReturnType<typeof useTranslations<"stats">>,
): LeaderboardItem[] {
  return rows
    .filter((row) => row.kind === "soulGenerated" || row.kind === "soulClaimed")
    .map((row) => ({
      id: `rare:${row.id}`,
      title: row.tokenLabel,
      metric: row.generation
        ? t("leaderboards.metrics.rareGeneration", { generation: row.generation })
        : t("leaderboards.metrics.rareClaim", { sequence: row.sequence ?? "0" }),
      helper: row.themeLabel
        ? t("leaderboards.metrics.theme", { theme: row.themeLabel })
        : t("leaderboards.metrics.soul", { soul: shortDisplay(row.soul ?? row.tokenMint) }),
      href: row.href,
    }));
}

function mostGeneratedItems(
  rows: StatsTokenSoulTotals[],
  t: ReturnType<typeof useTranslations<"stats">>,
): LeaderboardItem[] {
  return [...rows]
    .sort((left, right) => numericString(right.generatedSoulCandidates) - numericString(left.generatedSoulCandidates) || left.tokenMint.localeCompare(right.tokenMint))
    .map((row) => ({
      id: `most-generated:${row.tokenMint}`,
      title: row.tokenLabel,
      metric: t("leaderboards.metrics.generated", { count: row.generatedSoulCandidates }),
      helper: t("leaderboards.metrics.claimed", { count: row.claimedSouls }),
      href: row.primaryLink.href,
    }));
}

function highestLockedItems(
  rows: StatsTokenSoulTotals[],
  t: ReturnType<typeof useTranslations<"stats">>,
): LeaderboardItem[] {
  return [...rows]
    .sort((left, right) => tokenLockedScore(right) - tokenLockedScore(left) || left.tokenMint.localeCompare(right.tokenMint))
    .map((row) => ({
      id: `highest-locked:${row.tokenMint}`,
      title: row.tokenLabel,
      metric: t("leaderboards.metrics.locked", { count: tokenLockedScore(row).toString() }),
      helper: t("leaderboards.metrics.receipts", {
        active: row.active_receipts,
        inactive: row.inactive_receipts,
      }),
      href: row.primaryLink.href,
    }));
}

function recentGenerationItems(
  rows: FlowActivityRow[],
  t: ReturnType<typeof useTranslations<"stats">>,
): LeaderboardItem[] {
  return rows
    .filter((row) => row.kind === "soulGenerated")
    .map((row) => ({
      id: `recent-generation:${row.id}`,
      title: row.tokenLabel,
      metric: t("leaderboards.metrics.generated", { count: row.generation ?? "0" }),
      helper: row.timestamp,
      href: row.href,
    }));
}

function tokenFlowScore(row: StatsTokenSoulTotals): number {
  return (
    numericString(row.generatedSoulCandidates) * 3 +
    numericString(row.claimedSouls) * 5 +
    numericString(row.active_receipts)
  );
}

function tokenLockedScore(row: StatsTokenSoulTotals): number {
  return (
    numericString(row.active_receipts) +
    numericString(row.whole_units_in_pool ?? "0") +
    numericString(row.whole_units_outside_liquidity ?? "0")
  );
}

function numericString(value: string | null | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}


type FlowActivityKind = "buy" | "sell" | "soulGenerated" | "soulClaimed" | "settlement";

type FlowActivityRow = {
  id: string;
  kind: FlowActivityKind;
  tokenMint: string;
  tokenLabel: string;
  title: string;
  timestamp: string;
  actor: string;
  value: string;
  context: string;
  href: string;
  sortKey: number;
  generation?: string;
  sequence?: string;
  soul?: string;
  themeLabel?: string;
  fixture?: boolean;
};

const REQUIRED_FLOW_ACTIVITY_KINDS: FlowActivityKind[] = [
  "buy",
  "sell",
  "soulGenerated",
  "soulClaimed",
  "settlement",
];

function buildFlowActivityRows(
  rows: StatsActivity[],
  t: ReturnType<typeof useTranslations<"stats">>,
): FlowActivityRow[] {
  const flowRows = rows.flatMap((row) => flowRowsFromStatsActivity(row, t));
  return withDeterministicFlowFixtures(flowRows, rows, t)
    .sort((left, right) => right.sortKey - left.sortKey || left.id.localeCompare(right.id))
    .slice(0, 16);
}

function flowRowsFromStatsActivity(
  row: StatsActivity,
  t: ReturnType<typeof useTranslations<"stats">>,
): FlowActivityRow[] {
  const tokenMint = row.tokenMint ?? "";
  const tokenLabel = row.tokenLabel ?? row.primaryLink.label;
  const timestamp = activityTime(row, t);
  const actor = row.trader ?? t("activityDetails.protocolActor");
  const amount = row.amount ?? t("unavailable");
  const themeLabel = row.theme?.label;
  const href = row.primaryLink.href;

  if (row.kind === "tradeGeneration") {
    const sideKind: FlowActivityKind = row.side === "sell" ? "sell" : "buy";
    return [
      {
        id: `${row.id}:${sideKind}`,
        kind: sideKind,
        tokenMint,
        tokenLabel,
        title: t(`activityTitles.${sideKind}`, { token: tokenLabel }),
        timestamp,
        actor,
        value: t("activityValues.amount", { amount }),
        context: t("activityValues.tokenSoul", {
          token: tokenLabel,
          soul: shortDisplay(row.soul ?? tokenMint),
        }),
        href,
        sortKey: row.sortKey + (sideKind === "buy" ? 0.02 : 0.01),
        generation: row.generation,
        soul: row.soul,
        themeLabel,
      },
      {
        id: `${row.id}:soul-generated`,
        kind: "soulGenerated",
        tokenMint,
        tokenLabel,
        title: t("activityTitles.soulGenerated", {
          generation: row.generation ?? "0",
          token: tokenLabel,
        }),
        timestamp,
        actor,
        value: t("activityValues.generation", { generation: row.generation ?? "0" }),
        context: t("activityValues.seed", {
          seedHash: shortDisplay(row.seedHash ?? row.soul ?? tokenMint),
        }),
        href,
        sortKey: row.sortKey,
        generation: row.generation,
        soul: row.soul,
        themeLabel,
      },
    ];
  }

  if (row.kind === "claim") {
    return [
      {
        id: `${row.id}:soul-claimed`,
        kind: "soulClaimed",
        tokenMint,
        tokenLabel,
        title: t("activityTitles.soulClaimed", {
          sequence: row.sequence ?? "0",
          token: tokenLabel,
        }),
        timestamp,
        actor: t("activityDetails.collectorActor"),
        value: t("activityValues.sequence", { sequence: row.sequence ?? "0" }),
        context: t("activityValues.tokenSoul", {
          token: tokenLabel,
          soul: shortDisplay(row.soul ?? tokenMint),
        }),
        href,
        sortKey: row.sortKey + 0.01,
        generation: row.generation,
        sequence: row.sequence,
        soul: row.soul,
        themeLabel,
      },
      {
        id: `${row.id}:settlement`,
        kind: "settlement",
        tokenMint,
        tokenLabel,
        title: t("activityTitles.settlement", { token: tokenLabel }),
        timestamp,
        actor: t("activityDetails.protocolActor"),
        value: t("activityValues.settlement", { sequence: row.sequence ?? "0" }),
        context: t("activityValues.receiptContext", {
          soul: shortDisplay(row.soul ?? tokenMint),
        }),
        href,
        sortKey: row.sortKey,
        generation: row.generation,
        sequence: row.sequence,
        soul: row.soul,
        themeLabel,
      },
    ];
  }

  if (row.kind === "launch") {
    return [];
  }

  return [];
}

function withDeterministicFlowFixtures(
  flowRows: FlowActivityRow[],
  sourceRows: StatsActivity[],
  t: ReturnType<typeof useTranslations<"stats">>,
): FlowActivityRow[] {
  if (sourceRows.length === 0) {
    return flowRows;
  }
  const presentKinds = new Set(flowRows.map((row) => row.kind));
  const anchor = sourceRows.find((row) => row.tokenMint) ?? sourceRows[0];
  const tokenMint = anchor.tokenMint ?? "deterministic-devnet-fixture";
  const tokenLabel = anchor.tokenLabel ?? anchor.primaryLink.label;
  const soul = anchor.soul ?? tokenMint;
  const additions = REQUIRED_FLOW_ACTIVITY_KINDS.flatMap((kind, index): FlowActivityRow[] => {
    if (presentKinds.has(kind)) {
      return [];
    }
    return [
      {
        id: `fixture:${kind}:${tokenMint}`,
        kind,
        tokenMint,
        tokenLabel,
        title: t(`activityTitles.${kind}`, {
          generation: anchor.generation ?? "1",
          sequence: anchor.sequence ?? "1",
          token: tokenLabel,
        }),
        timestamp: t("activityDetails.fixtureTime"),
        actor: t("activityDetails.fixtureActor"),
        value:
          kind === "settlement"
            ? t("activityValues.settlement", { sequence: anchor.sequence ?? "1" })
            : kind === "soulClaimed"
              ? t("activityValues.sequence", { sequence: anchor.sequence ?? "1" })
              : kind === "soulGenerated"
                ? t("activityValues.generation", { generation: anchor.generation ?? "1" })
                : t("activityValues.amount", { amount: anchor.amount ?? "0" }),
        context: t("activityValues.fixtureContext", {
          soul: shortDisplay(soul),
        }),
        href: anchor.primaryLink.href,
        sortKey: Number.MAX_SAFE_INTEGER - index,
        generation: anchor.generation,
        sequence: anchor.sequence,
        soul,
        themeLabel: anchor.theme?.label,
        fixture: true,
      },
    ];
  });
  return [...flowRows, ...additions];
}

function activityTime(
  row: StatsActivity,
  t: ReturnType<typeof useTranslations<"stats">>,
): string {
  if (row.slot !== undefined) {
    return t("activityDetails.slot", { slot: row.slot.toString() });
  }
  if (row.sortKey > 0) {
    return t("activityDetails.time", { time: row.sortKey.toString() });
  }
  return t("activityDetails.timePending");
}

function shortDisplay(value: string): string {
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function RecentActivity({ rows }: { rows: StatsActivity[] }) {
  const t = useTranslations("stats");
  const flowRows = buildFlowActivityRows(rows, t);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-soul-mint">{t("activityEyebrow")}</p>
          <h2 className="mt-2 text-2xl font-black">{t("activityTitle")}</h2>
        </div>
        <p className="max-w-xl text-sm text-white/55">{t("activityDescription")}</p>
      </div>

      {flowRows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/30 p-4 text-sm text-white/60">{t("emptyActivity")}</div>
      ) : (
        <div className="mt-4 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
          {flowRows.map((row) => (
            <ActivityRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}

function ActivityRow({ row }: { row: FlowActivityRow }) {
  const t = useTranslations("stats");

  return (
    <article
      className="grid gap-3 bg-black/25 p-3 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(11rem,auto)] sm:items-center"
      data-proof-row={row.kind}
    >
      <div className="min-w-0">
        <img
          alt=""
          aria-label="PD9 monochrome Soul activity thumbnail"
          className="mb-2 h-12 w-12 rounded-xl border border-white/10 bg-white object-contain"
          data-stats-pd9-thumb={row.kind}
          src={svgToDataUri(PD9_STATS_THUMBNAIL_SVG)}
        />
        <span className="inline-flex rounded-full border border-soul-mint/30 bg-soul-mint/10 px-3 py-1 text-xs font-semibold text-soul-mint">
          {t(`activityKinds.${row.kind}`)}
        </span>
        <p className="mt-2 font-mono text-xs text-white/45">{row.timestamp}</p>
      </div>
      <div className="min-w-0">
        <h3 className="break-words text-base font-bold text-white">{row.title}</h3>
        {row.tokenMint ? (
          <p className="mt-1 break-all font-mono text-xs text-white/45">
            {t("tokenMint", { mint: row.tokenMint })}
          </p>
        ) : null}
        <ActivityDetails row={row} />
      </div>
      <div className="flex flex-col gap-2 sm:min-w-44">
        <Link
          className="rounded-xl bg-soul-glow px-3 py-2 text-center text-sm font-semibold text-black transition hover:bg-white"
          href={row.href}
        >
          {t("activityOpenToken")}
        </Link>
      </div>
    </article>
  );
}

function ActivityDetails({ row }: { row: FlowActivityRow }) {
  const t = useTranslations("stats");
  const details = [
    row.themeLabel ? t("activityDetails.theme", { theme: row.themeLabel }) : null,
    t("activityDetails.actor", { actor: row.actor }),
    t("activityDetails.value", { value: row.value }),
    t("activityDetails.context", { context: row.context }),
    row.fixture ? t("activityDetails.fixture") : null,
  ].filter((detail): detail is string => detail !== null);

  if (details.length === 0) {
    return null;
  }

  return (
    <ul className="mt-2 grid gap-1 text-xs text-white/55 md:grid-cols-2">
      {details.map((detail) => (
        <li className="break-all font-mono" key={detail}>
          {detail}
        </li>
      ))}
    </ul>
  );
}
