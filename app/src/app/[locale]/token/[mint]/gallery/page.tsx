"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { listClaimedSoulNftsByMint, type ClaimedSoulNftPage } from "sdk";
import {
  buildClaimedSoulNftGalleryItems,
  hydrateSoulNftGalleryItemsWithRpcProvenanceProgressively,
  type ClaimedSoulNftGalleryItem,
} from "@/lib/soulGallery";
import {
  buildClaimedSoulGalleryCacheKey,
  formatGalleryFallbackMessage,
  readCachedClaimedSoulGalleryPage,
  runBoundedGalleryRequest,
  writeCachedClaimedSoulGalleryPage,
  type CachedClaimedSoulGalleryPage,
} from "@/lib/galleryRecovery";
import { GalleryStatusCard } from "@/components/GalleryStatusCard";
import { SoulGalleryCard } from "@/components/SoulGalleryCard";
import { joinClasses, uiPrimitives } from "@/components/uiPrimitives";
import { Link } from "@/i18n/navigation";

type TokenGalleryPageProps = {
  params: {
    mint: string;
  };
};

type GalleryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; page: ClaimedSoulNftPage; items: ClaimedSoulNftGalleryItem[] }
  | { status: "error"; message: string };

const PAGE_SIZE = 24;
const LIVE_GALLERY_TIMEOUT_MS = 12_000;
const HYDRATION_TIMEOUT_MS = 12_000;

export default function TokenGalleryPage({ params }: TokenGalleryPageProps) {
  const t = useTranslations("tokenGallery");
  const searchParams = useSearchParams();
  const { connection } = useConnection();
  const parsedMint = useMemo(() => parseMint(params.mint), [params.mint]);
  const pageNumber = useMemo(() => parsePage(searchParams.get("page")), [searchParams]);
  const [galleryState, setGalleryState] = useState<GalleryState>({ status: "idle" });
  const galleryHref = `/token/${params.mint}/gallery`;
  const cacheKey = useMemo(
    () => buildClaimedSoulGalleryCacheKey("token", pageNumber, params.mint),
    [pageNumber, params.mint],
  );

  useEffect(() => {
    if (!parsedMint) {
      setGalleryState({ status: "error", message: t("invalidMint") });
      return;
    }

    let isMounted = true;
    const cached = readCachedClaimedSoulGalleryPage(cacheKey);
    if (cached) {
      setGalleryState({ status: "loaded", page: pageFromCachedGallery(cached), items: cached.items });
    } else {
      setGalleryState({ status: "loading" });
    }

    runBoundedGalleryRequest(
      () =>
        listClaimedSoulNftsByMint(connection, parsedMint, {
          page: pageNumber,
          pageSize: PAGE_SIZE,
        }),
      { timeoutMs: LIVE_GALLERY_TIMEOUT_MS, retryDelaysMs: [] },
    )
      .then(async (page) => {
        const items = buildClaimedSoulNftGalleryItems(page.items);
        if (isMounted) {
          setGalleryState({ status: "loaded", page, items });
        }
        writeCachedClaimedSoulGalleryPage(cacheKey, cachedGalleryFromPage(page, items));

        void runBoundedGalleryRequest(
          () =>
            hydrateSoulNftGalleryItemsWithRpcProvenanceProgressively(items, (partialItems) => {
              if (isMounted) {
                setGalleryState({ status: "loaded", page, items: partialItems });
              }
              writeCachedClaimedSoulGalleryPage(cacheKey, cachedGalleryFromPage(page, partialItems));
            }),
          { timeoutMs: HYDRATION_TIMEOUT_MS, retryDelaysMs: [] },
        )
          .then((hydratedItems) => {
            if (isMounted) {
              setGalleryState({ status: "loaded", page, items: hydratedItems });
            }
            writeCachedClaimedSoulGalleryPage(cacheKey, cachedGalleryFromPage(page, hydratedItems));
          })
          .catch(() => {
            // Keep the bounded live page visible; finalized provenance hydration is best-effort and honest.
          });
      })
      .catch((error: unknown) => {
        if (isMounted && !cached) {
          setGalleryState({
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
  }, [cacheKey, connection, pageNumber, parsedMint, t]);

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] max-w-screen-sm px-4 py-8 sm:px-6 sm:py-12 lg:max-w-7xl">
      <section className={joinClasses(uiPrimitives.panel, "mb-5 min-w-0 p-5")}>
        <p className={joinClasses(uiPrimitives.label, "w-fit")}>{t("eyebrow")}</p>
        <h1 className="mt-2 break-words text-3xl font-black sm:text-4xl">{t("title")}</h1>
        <p className="mt-4 max-w-3xl text-white/65">{t("description")}</p>
        <dl className="mt-5 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
          <div className={joinClasses(uiPrimitives.denseRow, "p-3")}>
            <dt className="text-white/45">{t("mint")}</dt>
            <dd className="mt-2 break-all font-mono text-white">{params.mint}</dd>
          </div>
          <div className={joinClasses(uiPrimitives.denseRow, "p-3")}>
            <dt className="text-white/45">{t("page")}</dt>
            <dd className="mt-2 font-mono text-white">{pageNumber}</dd>
          </div>
        </dl>
        <Link className={joinClasses(uiPrimitives.buttonSecondary, "mt-5 px-4 py-2 text-sm")} href={`/token/${params.mint}`}>
          {t("backToToken")}
        </Link>
      </section>

      {galleryState.status === "loading" ? (
        <GalleryStatusCard>{t("loading")}</GalleryStatusCard>
      ) : null}

      {galleryState.status === "error" ? (
        <GalleryStatusCard tone="error">{galleryState.message}</GalleryStatusCard>
      ) : null}

      {galleryState.status === "loaded" && galleryState.items.length === 0 ? (
        <GalleryStatusCard>{t("empty")}</GalleryStatusCard>
      ) : null}

      {galleryState.status === "loaded" && galleryState.items.length > 0 ? (
        <>
          <div className={joinClasses(uiPrimitives.statusNeutral, "mb-5 text-sm text-white/65")}>
            {t("summary", {
              total: galleryState.page.total,
              page: galleryState.page.page,
              pageSize: galleryState.page.pageSize,
            })}
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {galleryState.items.map((item) => (
              <SoulGalleryCard item={item} key={item.claim} scope="tokenGallery" showTokenLink={false} />
            ))}
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <PaginationLink
              disabled={pageNumber <= 1}
              href={pageNumber <= 2 ? galleryHref : `${galleryHref}?page=${pageNumber - 1}`}
            >
              {t("previous")}
            </PaginationLink>
            <PaginationLink
              disabled={!galleryState.page.hasNextPage}
              href={`${galleryHref}?page=${pageNumber + 1}`}
            >
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
      <span className={joinClasses(uiPrimitives.buttonSecondary, "px-5 py-3 text-center text-white/35 opacity-60")}>
        {children}
      </span>
    );
  }

  return (
    <Link className={joinClasses(uiPrimitives.buttonSecondary, "px-5 py-3 text-center")} href={href}>
      {children}
    </Link>
  );
}

function parseMint(mint: string): PublicKey | null {
  try {
    return new PublicKey(mint);
  } catch {
    return null;
  }
}

function parsePage(page: string | null): number {
  if (!page) {
    return 1;
  }
  const parsed = Number(page);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function cachedGalleryFromPage(
  page: ClaimedSoulNftPage,
  items: ClaimedSoulNftGalleryItem[],
): CachedClaimedSoulGalleryPage {
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    page: {
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      hasNextPage: page.hasNextPage,
    },
    items,
  };
}

function pageFromCachedGallery(cached: CachedClaimedSoulGalleryPage): ClaimedSoulNftPage {
  return {
    ...cached.page,
    items: [],
  };
}
