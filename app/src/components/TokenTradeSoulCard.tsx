"use client";

import type { ReactNode } from "react";
import type { TokenDetailTradeAction } from "./TokenDetailSoulHero";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

type TradeAction = TokenDetailTradeAction;

export function TokenTradeSoulCard({
  eyebrow,
  title,
  body,
  buyLabel,
  sellLabel,
  activeTrade,
  onTradeChange,
  walletStatus,
  walletAction,
  controls,
  quote,
  advancedLabel,
  advanced,
}: {
  eyebrow: string;
  title: string;
  body: string;
  buyLabel: string;
  sellLabel: string;
  activeTrade: TradeAction;
  onTradeChange: (action: TradeAction) => void;
  walletStatus: string;
  walletAction: ReactNode;
  controls: ReactNode;
  quote: ReactNode;
  advancedLabel: string;
  advanced: ReactNode;
}) {
  return (
    <section
      aria-labelledby="trade-soul-card-title"
      className={joinClasses(uiPrimitives.denseRow, "grid min-w-0 scroll-mt-24 gap-4 p-4")}
      data-testid="trade-soul-card"
      id="trade-soul-card"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soul-mint">
            {eyebrow}
          </p>
          <h3 className="mt-2 text-2xl font-black text-white" id="trade-soul-card-title">
            {title}
          </h3>
          <p className="mt-1 text-sm leading-6 text-white/60">{body}</p>
        </div>
        <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/25 p-2 sm:min-w-48">
          <p className="px-2 text-xs uppercase tracking-[0.14em] text-white/45" role="status">
            {walletStatus}
          </p>
          {walletAction}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/25 p-1">
        {([
          ["buy", buyLabel],
          ["sell", sellLabel],
        ] as const).map(([action, label]) => {
          const active = activeTrade === action;
          return (
            <button
              aria-pressed={active}
              className={joinClasses(
                "rounded-xl px-4 py-3 text-sm font-black transition",
                active
                  ? "bg-soul-mint text-black"
                  : "text-white/65 hover:bg-white/10 hover:text-white",
              )}
              key={action}
              onClick={() => onTradeChange(action)}
              type="button"
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="grid min-w-0 gap-4">{controls}</div>
        <div className="min-w-0">{quote}</div>
      </div>

      <details className="group rounded-2xl border border-white/10 bg-black/20 p-3">
        <summary className="cursor-pointer list-none text-sm font-semibold text-white/70 transition group-open:text-white">
          {advancedLabel}
        </summary>
        <div className="mt-4 grid min-w-0 gap-4">{advanced}</div>
      </details>
    </section>
  );
}
