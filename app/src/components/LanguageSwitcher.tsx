"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

const LOCALES: Array<{ locale: AppLocale; labelKey: "english" | "chinese" }> = [
  { locale: "en", labelKey: "english" },
  { locale: "zh", labelKey: "chinese" },
];

export function LanguageSwitcher() {
  const t = useTranslations("navigation");
  const pathname = usePathname();

  return (
    <div className="hidden items-center gap-2 text-xs text-white/50 sm:flex" aria-label={t("languageSwitcher")}>
      {LOCALES.map(({ locale, labelKey }, index) => (
        <span className="contents" key={locale}>
          {index > 0 ? <span aria-hidden="true">/</span> : null}
          <Link className="transition hover:text-white" href={pathname} locale={locale}>
            {t(labelKey)}
          </Link>
        </span>
      ))}
    </div>
  );
}
