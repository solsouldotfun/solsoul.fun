import { setRequestLocale } from "next-intl/server";
import { TokenSoulPanel } from "@/components/TokenSoulPanel";
import type { AppLocale } from "@/i18n/routing";

type TokenPageProps = {
  params: {
    locale: AppLocale;
    mint: string;
  };
};

export default function TokenPage({ params }: TokenPageProps) {
  setRequestLocale(params.locale);

  return (
    <main className="relative isolate mx-auto min-h-[calc(100vh-73px)] max-w-screen-sm overflow-hidden px-4 py-10 sm:px-6 sm:py-16 lg:max-w-6xl">
      <TokenSoulPanel mint={params.mint} />
    </main>
  );
}
