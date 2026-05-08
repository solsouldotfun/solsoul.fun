"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type {
  TokenTimelineEvent,
  TokenTimelineEventKind,
  TokenTimelineLinkLabel,
  TokenTimelineSnapshot,
} from "@/lib/tokenTimeline";
import {
  isValidTokenTimelineSnapshot,
  readCachedTokenTimeline,
  writeCachedTokenTimeline,
} from "@/lib/tokenTimelineCache";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

const TOKEN_TIMELINE_FETCH_TIMEOUT_MS = 10_000;

type TimelineErrorKind = "transient" | "invalidData" | "unavailable";

type TimelineState =
  | { status: "idle" }
  | { status: "loading"; snapshot: TokenTimelineSnapshot | null }
  | { status: "loaded"; snapshot: TokenTimelineSnapshot }
  | {
      status: "error";
      kind: TimelineErrorKind;
      snapshot: TokenTimelineSnapshot | null;
    };

export interface TokenTimelineLabels {
  title: string;
  body: string;
  loading: string;
  loadError: string;
  unavailableTitle: string;
  unavailableBody: string;
  retryHint: string;
  cachedNotice: string;
  timeoutError: string;
  invalidData: string;
  empty: string;
  source: string;
  signature: string;
  slot: string;
  evidence: {
    show: string;
    hide: string;
    title: string;
    source: string;
    address: string;
    blockTime: string;
    eventId: string;
    tokenMint: string;
    soulAccount: string;
    rawEvent: string;
  };
  details: {
    side: string;
    amount: string;
    trader: string;
    tokenAccount: string;
    seedHash: string;
    receiptLifecycle: string;
    receiptAccount: string;
    receiptBoundQuantity: string;
    receiptBoundBoundary: string;
  };
  eventTitles: Record<TokenTimelineEventKind, string>;
  eventDescriptions: Record<TokenTimelineEventKind, string>;
  linkLabels: Record<TokenTimelineLinkLabel, string>;
}

export function TokenTimeline({ mint }: { mint: string }) {
  const t = useTranslations("token.timeline");
  const locale = useLocale();
  const [state, setState] = useState<TimelineState>({ status: "idle" });
  const labels = buildLabels(t);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const cachedSnapshot = readCachedTokenTimeline(mint);
    setState({ status: "loading", snapshot: cachedSnapshot });

    const softTimeoutId = setTimeout(() => {
      if (!isMounted) {
        return;
      }
      setState({
        status: "error",
        kind: "transient",
        snapshot: cachedSnapshot,
      });
    }, TOKEN_TIMELINE_FETCH_TIMEOUT_MS);

    fetch(`/api/token/${mint}/timeline`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new TimelineLoadError(
            isTransientTimelineStatus(response.status) ? "transient" : "unavailable",
            typeof data.error === "string" ? data.error : labels.loadError,
          );
        }
        return data as TokenTimelineSnapshot & { ok: true };
      })
      .then((snapshot) => {
        if (!isMounted) {
          return;
        }
        const publicSnapshot = stripOk(snapshot);
        if (!isValidTokenTimelineSnapshot(publicSnapshot, mint)) {
          throw new TimelineLoadError("invalidData", labels.invalidData);
        }
        clearTimeout(softTimeoutId);
        writeCachedTokenTimeline(mint, publicSnapshot);
        setState({ status: "loaded", snapshot: publicSnapshot });
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }
        clearTimeout(softTimeoutId);
        setState({
          status: "error",
          kind: classifyTimelineError(error),
          snapshot: cachedSnapshot,
        });
      });

    return () => {
      isMounted = false;
      clearTimeout(softTimeoutId);
      controller.abort();
    };
  }, [labels.invalidData, labels.loadError, labels.timeoutError, mint]);

  const snapshot = "snapshot" in state ? state.snapshot : null;

  return (
    <section className={joinClasses(uiPrimitives.panel, "p-5")} aria-labelledby="token-public-timeline">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={joinClasses(uiPrimitives.label, "w-fit")}>
            {labels.title}
          </p>
          <h2 id="token-public-timeline" className="mt-2 text-2xl font-black text-white">
            {labels.body}
          </h2>
        </div>
        {state.status === "loading" ? (
          <span className={joinClasses(uiPrimitives.pill, "px-3 py-1 text-xs")}>
            {labels.loading}
          </span>
        ) : null}
      </div>

      {state.status === "error" ? <TimelineFallbackNotice labels={labels} state={state} /> : null}

      {snapshot ? (
        <TokenTimelineEventList labels={labels} locale={locale} snapshot={snapshot} />
      ) : state.status === "loading" || state.status === "idle" ? (
        <p className={joinClasses(uiPrimitives.statusNeutral, "mt-4 text-sm")}>{labels.loading}</p>
      ) : (
        <p className={joinClasses(uiPrimitives.statusNeutral, "mt-4 text-sm")}>{labels.empty}</p>
      )}
    </section>
  );
}

export function TokenTimelineEventList({
  labels,
  locale = "en",
  snapshot,
}: {
  labels: TokenTimelineLabels;
  locale?: string;
  snapshot: TokenTimelineSnapshot;
}) {
  const [expandedEventIds, setExpandedEventIds] = useState<Record<string, boolean>>({});

  if (snapshot.events.length === 0) {
    return <p className={joinClasses(uiPrimitives.statusNeutral, "mt-4 text-sm")}>{labels.empty}</p>;
  }

  return (
    <div className="mt-5 grid gap-4">
      <ol className="relative grid gap-4">
        {snapshot.events.map((event, eventIndex) => {
          const primaryLink = event.links[0];
          const evidenceExpanded = expandedEventIds[event.id] === true;

          return (
            <li
              className={joinClasses(
                uiPrimitives.card,
                "overflow-hidden p-0 shadow-[0_24px_90px_rgba(0,0,0,0.48)]",
              )}
              key={event.id}
            >
              <div className="grid gap-4 p-4 sm:grid-cols-[84px_minmax(0,1fr)] sm:p-5">
                <div className="flex items-center gap-3 sm:block">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-soul-mint/20 bg-soul-mint/[0.08] font-mono text-sm font-semibold text-soul-mint shadow-[0_0_28px_rgba(215,255,63,0.12)]">
                    {String(eventIndex + 1).padStart(2, "0")}
                  </span>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-soul-glow sm:mt-3">
                    {labels.eventTitles[event.kind]}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-black leading-tight text-white">
                    {formatEventDescription(event, labels)}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {primaryLink ? (
                      <TimelineLink
                        className={joinClasses(uiPrimitives.buttonSecondary, "px-3 py-1 text-xs")}
                        label={labels.linkLabels[primaryLink.labelKey]}
                        link={primaryLink}
                        locale={locale}
                      />
                    ) : null}
                    <button
                      aria-controls={`timeline-evidence-${event.id}`}
                      aria-expanded={evidenceExpanded}
                      className={joinClasses(uiPrimitives.buttonSecondary, "px-3 py-1 text-xs")}
                      onClick={() =>
                        setExpandedEventIds((current) => ({
                          ...current,
                          [event.id]: !current[event.id],
                        }))
                      }
                      type="button"
                    >
                      {evidenceExpanded ? labels.evidence.hide : labels.evidence.show}
                    </button>
                  </div>
                </div>
              </div>
              {evidenceExpanded ? (
                <TimelineEventEvidence
                  event={event}
                  labels={labels}
                  locale={locale}
                  snapshot={snapshot}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function buildLabels(t: ReturnType<typeof useTranslations<"token.timeline">>): TokenTimelineLabels {
  return {
    title: t("title"),
    body: t("body"),
    loading: t("loading"),
    loadError: t("loadError"),
    unavailableTitle: t("unavailableTitle"),
    unavailableBody: t("unavailableBody"),
    retryHint: t("retryHint"),
    cachedNotice: t("cachedNotice"),
    timeoutError: t("timeoutError"),
    invalidData: t("invalidData"),
    empty: t("empty"),
    source: t("source"),
    signature: t("signature"),
    slot: t("slot"),
    evidence: {
      show: t("evidence.show"),
      hide: t("evidence.hide"),
      title: t("evidence.title"),
      source: t("evidence.source"),
      address: t("evidence.address"),
      blockTime: t("evidence.blockTime"),
      eventId: t("evidence.eventId"),
      tokenMint: t("evidence.tokenMint"),
      soulAccount: t("evidence.soulAccount"),
      rawEvent: t("evidence.rawEvent"),
    },
    details: {
      side: t("details.side"),
      amount: t("details.amount"),
      trader: t("details.trader"),
      tokenAccount: t("details.tokenAccount"),
      seedHash: t("details.seedHash"),
      receiptLifecycle: t("details.receiptLifecycle"),
      receiptAccount: t("details.receiptAccount"),
      receiptBoundQuantity: t("details.receiptBoundQuantity"),
      receiptBoundBoundary: t("details.receiptBoundBoundary"),
    },
    eventTitles: {
      launch: t("events.launch.title"),
      trade: t("events.trade.title"),
      generation: t("events.generation.title"),
      claim: t("events.claim.title"),
    },
    eventDescriptions: {
      launch: t("events.launch.description", { token: "{token}" }),
      trade: t("events.trade.description", { token: "{token}" }),
      generation: t("events.generation.description", {
        generation: "{generation}",
        token: "{token}",
      }),
      claim: t("events.claim.description", {
        sequence: "{sequence}",
        token: "{token}",
      }),
    },
    linkLabels: {
      token: t("links.token"),
      gallery: t("links.gallery"),
      soul: t("links.soul"),
      transaction: t("links.transaction"),
      mint: t("links.mint"),
      nft: t("links.nft"),
    },
  };
}

function TimelineFallbackNotice({
  labels,
  state,
}: {
  labels: TokenTimelineLabels;
  state: Extract<TimelineState, { status: "error" }>;
}) {
  if (state.kind === "invalidData") {
    return (
      <p className={joinClasses(uiPrimitives.statusNeutral, "mt-3 p-3 text-sm text-white/75")}>
        {labels.invalidData}
      </p>
    );
  }

  return (
    <div
      className={joinClasses(
        uiPrimitives.statusNeutral,
        "mt-3 space-y-1 p-3 text-sm text-white/75",
      )}
      role="status"
    >
      <p className="font-semibold text-white">{labels.unavailableTitle}</p>
      <p>{state.snapshot ? labels.cachedNotice : labels.unavailableBody}</p>
      <p className="text-white/55">{labels.retryHint}</p>
    </div>
  );
}

function TimelineEventEvidence({
  event,
  labels,
  locale,
  snapshot,
}: {
  event: TokenTimelineEvent;
  labels: TokenTimelineLabels;
  locale: string;
  snapshot: TokenTimelineSnapshot;
}) {
  const evidenceRows: Array<[string, string]> = [
    [labels.evidence.eventId, event.id],
    [labels.evidence.tokenMint, event.tokenMint],
  ];
  addEvidenceRow(evidenceRows, labels.evidence.source, event.evidenceSource);
  addEvidenceRow(evidenceRows, labels.evidence.address, event.evidenceAddress);
  addEvidenceRow(evidenceRows, labels.signature, event.signature);
  addEvidenceRow(
    evidenceRows,
    labels.slot,
    event.slot !== undefined ? event.slot.toString() : undefined,
  );
  addEvidenceRow(
    evidenceRows,
    labels.evidence.blockTime,
    event.blockTime !== undefined && event.blockTime !== null
      ? event.blockTime.toString()
      : undefined,
  );
  addEvidenceRow(evidenceRows, labels.details.side, event.side);
  addEvidenceRow(evidenceRows, labels.details.amount, event.amount);
  addEvidenceRow(evidenceRows, labels.details.trader, event.trader);
  addEvidenceRow(evidenceRows, labels.details.tokenAccount, event.tokenAccount);
  addEvidenceRow(evidenceRows, labels.details.seedHash, event.seedHash);
  addEvidenceRow(evidenceRows, labels.evidence.soulAccount, event.soul);
  addEvidenceRow(evidenceRows, labels.details.receiptLifecycle, event.receiptLifecycleState);
  addEvidenceRow(evidenceRows, labels.details.receiptAccount, event.receiptAccount);
  addEvidenceRow(evidenceRows, labels.details.receiptBoundQuantity, event.receiptBoundQuantity);
  addEvidenceRow(evidenceRows, labels.details.receiptBoundBoundary, event.receiptBoundBoundary);
  evidenceRows.push([labels.source, `${snapshot.source.rpcEndpoint} · ${snapshot.source.fetchedAt}`]);

  const rawEvent = JSON.stringify(event, null, 2);

  return (
    <div
      className="border-t border-white/10 bg-black/35 p-4 sm:p-5"
      id={`timeline-evidence-${event.id}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className={joinClasses(uiPrimitives.label, "text-white/55")}>
          {labels.evidence.title}
        </p>
        {event.links.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {event.links.slice(1).map((link) => (
              <TimelineLink
                className={joinClasses(uiPrimitives.buttonSecondary, "px-3 py-1 text-xs")}
                key={`${event.id}-${link.labelKey}-${link.href}`}
                label={labels.linkLabels[link.labelKey]}
                link={link}
                locale={locale}
              />
            ))}
          </div>
        ) : null}
      </div>
      <dl className="mt-3 grid gap-2 text-xs text-white/55 sm:grid-cols-2">
        {evidenceRows.map(([label, value]) => (
          <div className={joinClasses(uiPrimitives.denseRow, "p-2")} key={`${label}:${value}`}>
            <dt className="font-semibold uppercase tracking-[0.12em] text-white/35">{label}</dt>
            <dd className="mt-1 break-all font-mono text-white/70">{value}</dd>
          </div>
        ))}
      </dl>
      <details className={joinClasses(uiPrimitives.denseRow, "mt-2 p-2")} data-testid="timeline-raw-event-disclosure">
        <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.12em] text-white/35 transition hover:text-white/70">
          {labels.evidence.rawEvent}
        </summary>
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-white/65">
          {rawEvent}
        </pre>
      </details>
    </div>
  );
}

function addEvidenceRow(rows: Array<[string, string]>, label: string, value: string | undefined) {
  if (!value) {
    return;
  }
  rows.push([label, value]);
}

function TimelineLink({
  className,
  label,
  link,
  locale,
}: {
  className: string;
  label: string;
  link: TokenTimelineEvent["links"][number];
  locale: string;
}) {
  if (link.external) {
    return (
      <a className={className} href={link.href} rel="noreferrer" target="_blank">
        {label}
      </a>
    );
  }

  return (
    <Link className={joinClasses(className, "text-soul-mint")} href={localizeHref(link.href, locale)}>
      {label}
    </Link>
  );
}

function formatEventDescription(event: TokenTimelineEvent, labels: TokenTimelineLabels): string {
  return labels.eventDescriptions[event.kind]
    .replace("{token}", event.tokenLabel)
    .replace("{generation}", event.generation ?? "0")
    .replace("{sequence}", event.sequence ?? "0");
}

function stripOk(snapshot: TokenTimelineSnapshot & { ok?: true }): TokenTimelineSnapshot {
  const { ok: _ok, ...publicSnapshot } = snapshot;
  return publicSnapshot;
}

class TimelineLoadError extends Error {
  constructor(
    readonly kind: TimelineErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "TimelineLoadError";
  }
}

function classifyTimelineError(error: unknown): TimelineErrorKind {
  if (error instanceof TimelineLoadError) {
    return error.kind;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return "transient";
  }

  const message = error instanceof Error ? error.message : String(error);
  return isTransientTimelineMessage(message) ? "transient" : "unavailable";
}

function isTransientTimelineStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function isTransientTimelineMessage(message: string): boolean {
  return /timeout|timed out|temporarily|unavailable|unable to load token timeline|failed to fetch|network|rpc/i.test(
    message,
  );
}

function localizeHref(href: string, locale: string): string {
  if (!href.startsWith("/") || href.startsWith(`/${locale}/`) || href === `/${locale}`) {
    return href;
  }
  return `/${locale}${href}`;
}
