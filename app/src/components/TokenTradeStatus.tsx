import type { ReactNode } from "react";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

export type TokenTradeEvidenceRow = {
  label: string;
  value: ReactNode;
};

export function TokenTradeSuccessCard({
  title,
  body,
  detailsLabel,
  evidence,
}: {
  title: string;
  body: string;
  detailsLabel: string;
  evidence: TokenTradeEvidenceRow[];
}) {
  return (
    <div
      className={joinClasses(uiPrimitives.statusNeutral, "grid gap-3 break-words text-sm text-soul-mint")}
      role="status"
    >
      <div data-testid="trade-result-primary">
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-1 text-white/75">{body}</p>
      </div>
      <details className="group" data-testid="trade-result-evidence">
        <summary className="cursor-pointer list-none text-sm font-semibold text-white/75 transition group-open:text-white">
          {detailsLabel}
        </summary>
        <dl className="mt-3 grid gap-2">
          {evidence.map((row) => (
            <div
              className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3"
              key={row.label}
            >
              <dt className="text-xs uppercase tracking-[0.12em] text-white/45">
                {row.label}
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-soul-mint">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

export function TokenSellClaimSemanticsNotice({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div
      className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-white/75"
      data-testid="sell-claim-semantics-notice"
      role="note"
    >
      <p className="font-semibold text-amber-100">{title}</p>
      <p className="mt-2 leading-6">{body}</p>
    </div>
  );
}

export function TokenClaimPriorityNotice({
  title,
  body,
  href,
  ctaLabel,
  note,
  testId = "claimable-next-action",
}: {
  title: string;
  body: string;
  href: string;
  ctaLabel: string;
  note?: string;
  testId?: string;
}) {
  return (
    <div
      className="rounded-2xl border border-soul-mint/35 bg-soul-mint/10 p-4 text-sm text-white/75 shadow-[0_0_32px_rgba(20,241,149,0.08)]"
      data-testid={testId}
      role="status"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-white">{title}</p>
          <p className="mt-2 leading-6">{body}</p>
          {note ? <p className="mt-2 text-xs uppercase tracking-[0.12em] text-white/45">{note}</p> : null}
        </div>
        <a
          className={joinClasses(uiPrimitives.buttonPrimary, "shrink-0 px-4 py-3 text-center")}
          href={href}
        >
          {ctaLabel}
        </a>
      </div>
    </div>
  );
}

export function TokenTradeErrorAlert({ message }: { message: string }) {
  return (
    <p
      className={joinClasses(uiPrimitives.statusError, "break-words text-sm text-white/75")}
      role="alert"
    >
      {message}
    </p>
  );
}
