import { joinClasses, uiPrimitives } from "./uiPrimitives";

type GenerationRulesTranslator = (key: string) => string;

export type GenerationRulesCopy = {
  eyebrow: string;
  title: string;
  body: string;
  inputsTitle: string;
  inputs: string[];
  standardTitle: string;
  standardBody: string;
  mvpScope: string;
};

const inputKeys = [
  "side",
  "amount",
  "wallet",
  "tokenSoul",
  "generation",
  "chainEntropy",
] as const;

export function buildGenerationRulesCopy(t: GenerationRulesTranslator): GenerationRulesCopy {
  return {
    eyebrow: t("eyebrow"),
    title: t("title"),
    body: t("body"),
    inputsTitle: t("inputsTitle"),
    inputs: inputKeys.map((key) => t(`inputs.${key}`)),
    standardTitle: t("standardTitle"),
    standardBody: t("standardBody"),
    mvpScope: t("mvpScope"),
  };
}

export function GenerationRulesCard({
  copy,
  compact = false,
}: {
  copy: GenerationRulesCopy;
  compact?: boolean;
}) {
  return (
    <section
      className={joinClasses(
        uiPrimitives.panel,
        compact ? "p-4" : "p-5"
      )}
      data-testid="generation-rules-card"
    >
      <p className={uiPrimitives.label}>
        {copy.eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-black text-white">{copy.title}</h2>
      <p className="mt-3 text-sm leading-6 text-white/70">{copy.body}</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={joinClasses(uiPrimitives.denseRow, "p-4")}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            {copy.inputsTitle}
          </p>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-white/65">
            {copy.inputs.map((input) => (
              <li className="flex gap-2" key={input}>
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-soul-mint" />
                <span>{input}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={joinClasses(uiPrimitives.denseRow, "p-4")}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            {copy.standardTitle}
          </p>
          <p className="mt-3 text-sm leading-6 text-white/65">{copy.standardBody}</p>
          <p className="mt-3 text-sm leading-6 text-white/55">{copy.mvpScope}</p>
        </div>
      </div>
    </section>
  );
}
