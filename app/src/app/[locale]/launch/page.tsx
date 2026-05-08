import { getTranslations } from "next-intl/server";
import { AmbientSoulBackground } from "@/components/AmbientSoulBackground";
import { GenerationRulesCard, buildGenerationRulesCopy } from "@/components/GenerationRulesCard";
import { LaunchForm } from "@/components/LaunchForm";
import { joinClasses, uiPrimitives } from "@/components/uiPrimitives";

type LaunchPageProps = {
  params: {
    locale: string;
  };
};

export default async function LaunchPage({ params }: LaunchPageProps) {
  const t = await getTranslations({ locale: params.locale, namespace: "launch.page" });
  const generationRulesT = await getTranslations({
    locale: params.locale,
    namespace: "generationRules",
  });
  const generationRulesCopy = buildGenerationRulesCopy(generationRulesT);

  return (
    <main className="relative isolate mx-auto grid min-h-[calc(100vh-73px)] max-w-5xl gap-6 overflow-hidden px-4 py-8 sm:px-6 sm:py-10">
      <AmbientSoulBackground variant="launch" />
      <div className="relative z-10 grid gap-6">
        <section
          className={joinClasses(
            uiPrimitives.heroPanel,
            "grid gap-6 overflow-hidden p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center",
          )}
          data-testid="launch-page-hero"
        >
          <div>
            <p className={joinClasses(uiPrimitives.label, "w-fit")}>{t("eyebrow")}</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
              {t("title")}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/70 sm:text-lg sm:leading-8">
              {t("description")}
            </p>
          </div>
          <div
            aria-hidden="true"
            className="relative min-h-56 overflow-hidden rounded-[2rem] border border-white/10 bg-black/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          >
            <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-soul-mint/40 bg-soul-mint/10 shadow-[0_0_90px_rgba(215,255,63,0.28)]" />
            <div className="absolute left-10 top-8 h-20 w-20 rounded-full border border-soul-purple/35 bg-soul-purple/10 blur-sm" />
            <div className="absolute bottom-8 right-10 h-24 w-24 rounded-full border border-cyan-300/35 bg-cyan-300/10 blur-sm" />
            <div className="absolute inset-x-10 bottom-12 h-px bg-gradient-to-r from-transparent via-soul-mint/60 to-transparent" />
            <div className="absolute inset-x-16 top-16 h-px bg-gradient-to-r from-transparent via-soul-purple/50 to-transparent" />
          </div>
        </section>
        <LaunchForm />
        <details className={joinClasses(uiPrimitives.denseRow, "p-4")}>
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.18em] text-soul-mint">
            {t("lifecycleModelTitle")}
          </summary>
          <p className="mt-3 text-sm leading-6 text-white/70">{t("lifecycleModelBody")}</p>
          <div className="mt-4">
            <GenerationRulesCard compact copy={generationRulesCopy} />
          </div>
        </details>
      </div>
    </main>
  );
}
