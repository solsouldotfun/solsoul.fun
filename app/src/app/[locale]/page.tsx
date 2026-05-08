import { getTranslations, setRequestLocale } from "next-intl/server";
import { AmbientSoulBackground } from "@/components/AmbientSoulBackground";
import { LandingThesisView } from "@/components/LandingThesisView";
import { RiskDisclaimerModal } from "@/components/RiskDisclaimerModal";
import { uiPrimitives } from "@/components/uiPrimitives";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

type HomePageProps = {
  params: {
    locale: AppLocale;
  };
};

export default async function HomePage({ params }: HomePageProps) {
  setRequestLocale(params.locale);
  const t = await getTranslations({ locale: params.locale, namespace: "landing" });

  return (
    <>
      <RiskDisclaimerModal />
      <main className="relative isolate mx-auto flex min-h-[calc(100vh-73px)] max-w-screen-sm flex-col items-center justify-center overflow-hidden px-6 py-20 sm:px-8 md:max-w-2xl lg:py-32"
      >
        <AmbientSoulBackground variant="home" />
        <div className="relative z-10 flex flex-col items-center">
          <LandingThesisView
            body={t("body")}
            eyebrow={t("eyebrow")}
            headline={t("headline")}
            loopTitle={t("loopTitle")}
            actions={
              <>
                <figure role="img" aria-labelledby="landing-art-label" className="sr-only">
                  <figcaption id="landing-art-label">{t("eyebrow")}</figcaption>
                </figure>
                <span className={`${uiPrimitives.label}`} aria-hidden="true">
                  SolSoul
                </span>
                <Link
                  href="/tokens"
                  locale={params.locale}
                  className={`${uiPrimitives.buttonPrimary} px-8 py-4 text-base`}
                >
                  {t("primaryCta")}
                </Link>
                <Link
                  href="/launch"
                  locale={params.locale}
                  className={`${uiPrimitives.buttonSecondary} px-8 py-4 text-base`}
                >
                  {t("secondaryCta")}
                </Link>
              </>
            }
            steps={[
              { title: t("steps.launch.title"), body: t("steps.launch.body") },
              { title: t("steps.trade.title"), body: t("steps.trade.body") },
              { title: t("steps.claim.title"), body: t("steps.claim.body") },
            ]}
          />
          <nav
            className="mt-20 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-white/40"
            aria-label={t("routeNavLabel")}
          >
            <Link className="transition hover:text-white/70" href="/tokens" locale={params.locale}>
              {t("routes.trade")}
            </Link>
            <Link className="transition hover:text-white/70" href="/souls" locale={params.locale}>
              {t("routes.collection")}
            </Link>
            <Link className="transition hover:text-white/70" href="/stats" locale={params.locale}>
              {t("routes.stats")}
            </Link>
            <Link className="transition hover:text-white/70" href="/launch" locale={params.locale}>
              {t("routes.launch")}
            </Link>
          </nav>
        </div>
      </main>
    </>
  );
}