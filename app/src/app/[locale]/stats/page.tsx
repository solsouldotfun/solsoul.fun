import { getTranslations, setRequestLocale } from "next-intl/server";
import { StatsDashboard } from "@/components/StatsDashboard";
import { joinClasses, uiPrimitives } from "@/components/uiPrimitives";
import type { AppLocale } from "@/i18n/routing";

type StatsPageProps = {
  params: {
    locale: AppLocale;
  };
};

export default async function StatsPage({ params }: StatsPageProps) {
  setRequestLocale(params.locale);
  const t = await getTranslations({ locale: params.locale, namespace: "stats" });

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] max-w-screen-sm px-4 py-8 sm:px-6 sm:py-12 lg:max-w-7xl">
      <section className={joinClasses(uiPrimitives.panel, "p-5")}>
        <p className={joinClasses(uiPrimitives.label, "w-fit")}>{t("eyebrow")}</p>
        <h1 className="mt-2 break-words text-3xl font-black sm:text-4xl">{t("title")}</h1>
        <p className="mt-4 max-w-3xl text-white/65">{t("description")}</p>
      </section>
      <StatsDashboard />
    </main>
  );
}
