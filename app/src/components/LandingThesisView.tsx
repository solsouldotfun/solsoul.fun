import type { ReactNode } from "react";
import { uiPrimitives } from "./uiPrimitives";

export type LandingThesisStep = {
  title: string;
  body: string;
};

export type LandingThesisViewProps = {
  eyebrow: string;
  headline: string;
  body: string;
  loopTitle: string;
  steps: LandingThesisStep[];
  actions?: ReactNode;
};

export function LandingThesisView({
  eyebrow,
  headline,
  body,
  loopTitle,
  steps,
  actions,
}: LandingThesisViewProps) {
  return (
    <section className="mx-auto max-w-2xl text-center">
      <p className={`mb-8 ${uiPrimitives.label}`}>
        {eyebrow}
      </p>
      <h1 className="font-serif text-5xl font-medium leading-[0.95] tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
        {headline}
      </h1>
      <p className="mx-auto mt-8 max-w-lg text-base leading-7 text-white/50 sm:text-lg sm:leading-8">
        {body}
      </p>
      {actions ? (
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center" data-testid="landing-first-viewport-ctas">
          {actions}
        </div>
      ) : null}
      <div className="mt-20 border-t border-white/10 pt-12">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/30">
          {loopTitle}
        </p>
        <ol className="mt-10 grid gap-8 sm:gap-10">
          {steps.map((step, index) => (
            <li className="flex flex-col items-start gap-3 border-l border-white/10 pl-4 text-left" key={step.title}>
              <span className="font-mono text-sm text-white/30">
                0{index + 1}
              </span>
              <span className="text-base font-medium text-white/90">
                {step.title}
              </span>
              <span className="max-w-sm text-sm leading-6 text-white/45">
                {step.body}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}