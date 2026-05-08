import { joinClasses, uiPrimitives } from "./uiPrimitives";

export type TokenMtSoulExplainerStep = {
  label: string;
  value: string;
  body: string;
};

export type TokenMtSoulExplainerCopy = {
  eyebrow: string;
  title: string;
  body: string;
  steps: [TokenMtSoulExplainerStep, TokenMtSoulExplainerStep, TokenMtSoulExplainerStep];
  capProgress: string;
};

export function TokenMtSoulExplainer({
  copy,
  claimCount,
  className,
}: {
  copy: TokenMtSoulExplainerCopy;
  claimCount?: string;
  className?: string;
}) {
  return (
    <section
      aria-label={copy.title}
      className={joinClasses(uiPrimitives.denseRow, "grid gap-4 p-4", className)}
      data-claim-count={claimCount}
      data-testid="token-mt-soul-explainer"
    >
      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-soul-mint">
          {copy.eyebrow}
        </p>
        <h3 className="text-lg font-black text-white">{copy.title}</h3>
        <p className="text-sm leading-6 text-white/60">{copy.body}</p>
      </div>
      <ol className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch">
        {copy.steps.map((step, index) => (
          <ExplainerStep key={step.label} step={step} showArrow={index < copy.steps.length - 1} />
        ))}
      </ol>
      <p className="rounded-2xl border border-soul-mint/20 bg-soul-mint/10 px-3 py-2 text-sm font-semibold text-soul-mint">
        {copy.capProgress}
      </p>
    </section>
  );
}

function ExplainerStep({
  step,
  showArrow,
}: {
  step: TokenMtSoulExplainerStep;
  showArrow: boolean;
}) {
  return (
    <>
      <li className="grid gap-2 rounded-2xl border border-white/10 bg-black/25 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
          {step.label}
        </p>
        <p className="text-base font-black text-white">{step.value}</p>
        <p className="text-sm leading-5 text-white/55">{step.body}</p>
      </li>
      {showArrow ? (
        <li
          aria-hidden="true"
          className="grid place-items-center text-xl font-black text-soul-mint/70 max-lg:hidden"
        >
          →
        </li>
      ) : null}
    </>
  );
}
