"use client";

import Link from "next/link";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

export type TokenProofRailItem = {
  label: string;
  value: string;
  helper?: string;
  testId?: string;
};

export type TokenProofRailLabels = {
  eyebrow: string;
  title: string;
  body: string;
  tradeSoul: string;
  openTrade: string;
  claimStatus: string;
  latestSoul: string;
  holders: string;
  collectors: string;
  progress: string;
  lockedSol: string;
  provenance: string;
  advancedSummary: string;
};

export function TokenDetailProofRail({
  labels,
  tradeHref,
  galleryHref,
  items,
  provenanceDetails,
}: {
  labels: TokenProofRailLabels;
  tradeHref: string;
  galleryHref: string;
  items: TokenProofRailItem[];
  provenanceDetails: TokenProofRailItem[];
}) {
  return (
    <aside
      aria-labelledby="token-proof-rail-title"
      className={joinClasses(
        uiPrimitives.card,
        "grid gap-4 p-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto",
      )}
      data-testid="token-detail-proof-rail"
    >
      <div>
        <p className={joinClasses(uiPrimitives.label, "w-fit")}>{labels.eyebrow}</p>
        <h2 className="mt-2 text-xl font-black text-white" id="token-proof-rail-title">
          {labels.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-white/58">{labels.body}</p>
      </div>

      <div className={joinClasses(uiPrimitives.denseRow, "grid gap-3 p-3")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-soul-mint">
              {labels.tradeSoul}
            </p>
            <p className="mt-1 text-sm text-white/60">{labels.claimStatus}</p>
          </div>
          <Link className={joinClasses(uiPrimitives.buttonSecondary, "px-3 py-2 text-xs")} href={tradeHref}>
            {labels.openTrade}
          </Link>
        </div>
      </div>

      <dl className="grid gap-2">
        {items.map((item) => (
          <div
            className={joinClasses(uiPrimitives.denseRow, "p-3")}
            data-testid={item.testId}
            key={item.label}
          >
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
              {item.label}
            </dt>
            <dd className="mt-1 break-words font-mono text-sm font-semibold text-white">
              {item.value}
            </dd>
            {item.helper ? <p className="mt-1 text-xs leading-5 text-white/45">{item.helper}</p> : null}
          </div>
        ))}
      </dl>

      <details className={joinClasses(uiPrimitives.denseRow, "group p-3")} data-testid="proof-rail-provenance-disclosure">
        <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.14em] text-soul-glow transition hover:text-white">
          {labels.advancedSummary}
        </summary>
        <dl className="mt-3 grid gap-2">
          {provenanceDetails.map((item) => (
            <div className="rounded-xl border border-white/10 bg-black/25 p-2" key={item.label}>
              <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-white/35">
                {item.label}
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-white/65">{item.value}</dd>
            </div>
          ))}
        </dl>
      </details>

      <Link
        className={joinClasses(uiPrimitives.buttonSecondary, "px-4 py-3 text-center text-sm")}
        href={galleryHref}
      >
        {labels.latestSoul}
      </Link>
    </aside>
  );
}
