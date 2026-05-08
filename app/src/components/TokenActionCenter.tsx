"use client";

import type { ReactNode } from "react";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

export function TokenActionCenter({
  eyebrow,
  title,
  body,
  children,
  claimPanel,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
  claimPanel: ReactNode;
}) {
  return (
    <section
      aria-labelledby="trade-to-generate-souls"
      className={joinClasses(
        uiPrimitives.card,
        "grid min-w-0 gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]",
      )}
      data-testid="token-action-center"
    >
      <div className="grid min-w-0 gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soul-mint">
            {eyebrow}
          </p>
          <h2 id="trade-to-generate-souls" className="mt-2 text-2xl font-black text-white">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-white/60">{body}</p>
        </div>
        {children}
      </div>

      <aside className="grid min-w-0 gap-4 self-start" data-testid="token-claim-action">
        {claimPanel}
      </aside>
    </section>
  );
}

export function TokenClaimActionCard({
  title,
  body,
  statusLabel,
  nextActionLabel,
  children,
}: {
  title: string;
  body: string;
  statusLabel: string;
  nextActionLabel: string;
  children: ReactNode;
}) {
  return (
    <div className={joinClasses(uiPrimitives.denseRow, "grid gap-4 p-4")}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-soul-glow">
          {statusLabel}
        </p>
        <h3 className="mt-2 text-xl font-black text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-white/60">{body}</p>
      </div>
      <div>
        <p className="mb-2 text-xs uppercase tracking-[0.14em] text-white/45">
          {nextActionLabel}
        </p>
        {children}
      </div>
    </div>
  );
}
