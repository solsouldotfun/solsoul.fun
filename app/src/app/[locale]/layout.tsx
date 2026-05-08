import type { ReactNode } from "react";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppWalletProvider } from "@/components/AppWalletProvider";
import { DevnetBanner } from "@/components/DevnetBanner";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { buildProductNavItems } from "@/components/navigationItems";
import { PauseBanner, PauseProvider } from "@/components/PauseBanner";
import { joinClasses, uiPrimitives } from "@/components/uiPrimitives";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { Link } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";

type LocaleLayoutProps = {
  children: ReactNode;
  params: {
    locale: string;
  };
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const typedLocale = locale as AppLocale;
  setRequestLocale(typedLocale);
  const messages = await getMessages({ locale: typedLocale });
  const t = await getTranslations({ locale: typedLocale, namespace: "navigation" });
  const navItems = buildProductNavItems({
    explore: t("explore"),
    market: t("market"),
    souls: t("souls"),
    docs: t("docs"),
    launch: t("launch"),
  });

  return (
    <NextIntlClientProvider locale={typedLocale} messages={messages}>
      <AppWalletProvider>
        <PauseProvider>
          <DevnetBanner />
          <PauseBanner />
          <header className="sticky top-0 z-20 border-b border-white/10 bg-black/85 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur">
            <nav className="mx-auto flex max-w-screen-sm items-center justify-between gap-3 px-4 py-3 sm:px-6 md:max-w-6xl">
              <Link
                className="relative shrink-0 rounded-full border border-soul-mint/25 bg-soul-mint/[0.08] px-3 py-1 text-lg font-semibold tracking-tight text-soul-mint shadow-[0_0_26px_rgba(215,255,63,0.12)]"
                href="/"
                locale={typedLocale}
              >
                SolSoul.fun
              </Link>
              <div className="flex min-w-0 items-center gap-3">
                {navItems.map((item) => (
                  <Link
                    className={joinClasses(
                      item.variant === "cta"
                        ? uiPrimitives.navLink
                        : uiPrimitives.navLinkMuted,
                    )}
                    href={item.href}
                    key={item.key}
                    locale={typedLocale}
                  >
                    {item.label}
                  </Link>
                ))}
                <LanguageSwitcher />
                <div id="connect-wallet">
                  <WalletConnectButton />
                </div>
              </div>
            </nav>
          </header>
          <div className="pb-24 sm:pb-0">{children}</div>
          <MobileBottomNav
            labels={{
              explore: t("explore"),
              market: t("market"),
              souls: t("souls"),
              docs: t("docs"),
              launch: t("launch"),
            }}
          />
        </PauseProvider>
      </AppWalletProvider>
    </NextIntlClientProvider>
  );
}
