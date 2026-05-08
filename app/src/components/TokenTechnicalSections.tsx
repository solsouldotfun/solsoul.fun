"use client";

import type { ReactNode } from "react";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

export function TokenTechnicalSections({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-5" data-testid="token-secondary-technical-sections">
      <div className={joinClasses(uiPrimitives.denseRow, "p-4")}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soul-glow">
          {title}
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">{body}</p>
      </div>
      {children}
    </section>
  );
}
