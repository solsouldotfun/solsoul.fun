"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useConnection } from "@solana/wallet-adapter-react";
import { useLocale, useTranslations } from "next-intl";
import { listBondingCurveTokens, type LaunchedTokenPage } from "sdk";
import { GalleryStatusCard } from "@/components/GalleryStatusCard";
import { TokenFeedRow } from "@/components/TokenFeedRow";
import { joinClasses, uiPrimitives } from "@/components/uiPrimitives";
import { Link } from "@/i18n/navigation";
import {
  TOKEN_DISCOVERY_SEGMENTS,
  buildLaunchedTokenFeedItems,
  getTokenDiscoverySegmentItems,
  hydrateLaunchedTokenFeedItemsWithRpcProvenanceProgressively,
  type LaunchedTokenFeedItem,
  type TokenDiscoverySegmentKey,
} from "@/lib/tokenFeed";
import {
  formatGalleryFallbackMessage,
  runBoundedGalleryRequest,
} from "@/lib/galleryRecovery";

type TokenFeedState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; page: LaunchedTokenPage; items: LaunchedTokenFeedItem[] }
  | { status: "error"; message: string };

const PAGE_SIZE = 24;
const LIVE_TOKEN_FEED_TIMEOUT_MS = 12_000;
const HYDRATION_TIMEOUT_MS = 12_000;

export default function PublicTokensPage() {
  return (
    <Suspense fallback={null}>
      <PublicTokensClient />
    </Suspense>
  );
}

function PublicTokensClient() {
  const t = useTranslations("tokens");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { connection } = useConnection();
  const pageNumber = useMemo(() => parsePage(searchParams.get("page")), [searchParams]);
  const [feedState, setFeedState] = useState<TokenFeedState>({ status: "idle" });
  const [activeSegment, setActiveSegment] = useState<TokenDiscoverySegmentKey>("fresh-souls");
  const feedHref = "/tokens";
  const visibleItems = useMemo(
    () =>
      feedState.status === "loaded"
        ? getTokenDiscoverySegmentItems(feedState.items, activeSegment)
        : [],
    [activeSegment, feedState],
  );

  useEffect(() => {
    let isMounted = true;
    setFeedState({ status: "loading" });
    runBoundedGalleryRequest(
      () =>
        listBondingCurveTokens(connection, {
          page: pageNumber,
          pageSize: PAGE_SIZE,
        }),
      { timeoutMs: LIVE_TOKEN_FEED_TIMEOUT_MS, retryDelaysMs: [] },
    )
      .then(async (page) => {
        const items = buildLaunchedTokenFeedItems(page.items, locale);
        if (isMounted) {
          setFeedState({ status: "loaded", page, items });
        }
        void runBoundedGalleryRequest(
          () =>
            hydrateLaunchedTokenFeedItemsWithRpcProvenanceProgressively(
              items,
              (partialItems) => {
                if (isMounted) {
                  setFeedState({ status: "loaded", page, items: partialItems });
                }
              },
            ),
          { timeoutMs: HYDRATION_TIMEOUT_MS, retryDelaysMs: [] },
        )
          .then((hydratedItems) => {
            if (isMounted) {
              setFeedState({
                status: "loaded",
                page,
                items: hydratedItems,
              });
            }
          })
          .catch(() => {
            // Keep the launched-token list visible; provenance hydration is best-effort.
          });
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setFeedState({
            status: "error",
            message: formatGalleryFallbackMessage(error, {
              loadError: t("loadError"),
              timeoutError: t("timeoutError"),
              retryGuidance: t("retryGuidance"),
            }),
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [connection, locale, pageNumber, t]);

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] max-w-screen-sm px-4 py-8 sm:px-6 sm:py-12 lg:max-w-7xl">
      <section className={joinClasses(uiPrimitives.panel, "mb-5 grid min-w-0 gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end")}>
        <div className="min-w-0">
          <p className={joinClasses(uiPrimitives.label, "w-fit")}>{t("eyebrow")}</p>
          <h1 className="mt-2 break-words text-3xl font-black sm:text-4xl">{t("title")}</h1>
          <p className="mt-4 max-w-3xl text-white/65">{t("description")}</p>
          <p className="mt-3 max-w-3xl rounded-xl border border-soul-mint/20 bg-soul-mint/10 px-4 py-3 text-sm text-soul-mint/90">
            {t("marketNotice")}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-xs text-white/55">
          {feedState.status === "loaded"
            ? t("summary", {
                total: feedState.page.total,
                page: feedState.page.page,
                pageSize: feedState.page.pageSize,
              })
            : t("loading")}
        </div>
      </section>

      <section className={joinClasses(uiPrimitives.panel, "mb-5 overflow-hidden p-3")} aria-label={t("discovery.ariaLabel")}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 px-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soul-purple/75">
              {t("discovery.eyebrow")}
            </p>
            <p className="mt-1 text-sm text-white/55">{t("discovery.description")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:justify-end" role="tablist">
            {TOKEN_DISCOVERY_SEGMENTS.map((segment) => {
              const selected = segment === activeSegment;
              return (
                <button
                  aria-selected={selected}
                  className={joinClasses(
                    "min-w-0 rounded-2xl border px-3 py-2 text-left text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-mint/60",
                    selected
                      ? "border-soul-mint/55 bg-soul-mint/15 text-soul-mint shadow-[0_0_24px_rgba(215,255,63,0.12)]"
                      : "border-white/10 bg-white/[0.035] text-white/55 hover:border-soul-purple/45 hover:bg-soul-purple/10 hover:text-white",
                  )}
                  key={segment}
                  onClick={() => setActiveSegment(segment)}
                  role="tab"
                  type="button"
                >
                  <span className="block truncate">{t(`discovery.tabs.${segment}`)}</span>
                  <span className="mt-1 block truncate text-[10px] font-medium text-white/35">
                    {t(`discovery.hints.${segment}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {feedState.status === "loading" ? (
        <GalleryStatusCard>{t("loading")}</GalleryStatusCard>
      ) : null}

      {feedState.status === "error" ? (
        <GalleryStatusCard tone="error">{feedState.message}</GalleryStatusCard>
      ) : null}

      {feedState.status === "loaded" && feedState.items.length === 0 ? (
        <GalleryStatusCard>{t("empty")}</GalleryStatusCard>
      ) : null}

      {feedState.status === "loaded" && feedState.items.length > 0 ? (
        <>
          <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/55 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {t("discovery.activeSummary", {
                label: t(`discovery.tabs.${activeSegment}`),
                count: visibleItems.length,
              })}
            </span>
            <span className="text-xs text-white/40">{t("discovery.partialDataHint")}</span>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleItems.map((item) => (
              <TokenFeedRow item={item} key={item.mint} />
            ))}
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <PaginationLink
              disabled={pageNumber <= 1}
              href={pageNumber <= 2 ? feedHref : `${feedHref}?page=${pageNumber - 1}`}
            >
              {t("previous")}
            </PaginationLink>
            <PaginationLink disabled={!feedState.page.hasNextPage} href={`${feedHref}?page=${pageNumber + 1}`}>
              {t("next")}
            </PaginationLink>
          </div>
        </>
      ) : null}
    </main>
  );
}

function PaginationLink({
  children,
  disabled,
  href,
}: {
  children: ReactNode;
  disabled: boolean;
  href: string;
}) {
  if (disabled) {
    return (
      <span className="rounded-xl border border-white/10 px-5 py-3 text-center text-white/35">
        {children}
      </span>
    );
  }

  return (
    <Link className="rounded-xl border border-white/15 px-5 py-3 text-center font-semibold transition hover:border-white/35" href={href}>
      {children}
    </Link>
  );
}

function parsePage(page: string | null): number {
  if (!page) {
    return 1;
  }
  const parsed = Number(page);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
