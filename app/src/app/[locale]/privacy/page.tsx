// TODO(legal): replace with reviewed privacy policy text before mainnet launch

import { PrivacyPageView } from "@/components/PrivacyPageView";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";

type PrivacyPageProps = {
  params: {
    locale: AppLocale;
  };
};

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  setRequestLocale(params.locale);
  const t = await getTranslations({ locale: params.locale, namespace: "privacy" });

  return (
    <PrivacyPageView
      copy={{
        eyebrow: t("eyebrow"),
        title: t("title"),
        updated: t("updated"),
        placeholder: t("placeholder"),
        sections: [
          {
            title: t("sections.data.title"),
            body: t("sections.data.body"),
          },
          {
            title: t("sections.usage.title"),
            body: t("sections.usage.body"),
          },
          {
            title: t("sections.mainnet.title"),
            body: t("sections.mainnet.body"),
          },
        ],
        contact: t("contact"),
      }}
    />
  );
}
