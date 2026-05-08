"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { docPages } from "@/lib/docs";
import { joinClasses } from "./uiPrimitives";

const categories = [
  { key: "protocol" as const, label: "Protocol", labelZh: "协议" },
  { key: "technical" as const, label: "Technical", labelZh: "技术" },
  { key: "reference" as const, label: "Reference", labelZh: "参考" },
  { key: "community" as const, label: "Community", labelZh: "社区" },
];

export function DocsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("docs");
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:px-8">
      {/* Mobile sidebar toggle */}
      <button
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-900 px-4 py-2 text-sm font-medium text-white/70 lg:hidden"
        onClick={() => setMobileOpen((v) => !v)}
        type="button"
      >
        <span>{mobileOpen ? "✕" : "☰"}</span>
        <span>{t("navTitle")}</span>
      </button>

      {/* Sidebar */}
      <aside
        className={joinClasses(
          "shrink-0 lg:w-64",
          mobileOpen ? "block" : "hidden lg:block",
        )}
      >
        <div className="sticky top-24 space-y-6">
          <div>
            <Link
              className="text-sm font-bold text-white/40 hover:text-white/60"
              href="/docs"
            >
              ← {t("backToDocs")}
            </Link>
          </div>

          {categories.map((cat) => {
            const pages = docPages.filter((d) => d.category === cat.key);
            if (pages.length === 0) return null;
            return (
              <div key={cat.key}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-white/30">
                  {cat.label}
                </h3>
                <ul className="space-y-1">
                  {pages.map((page) => {
                    const href = `/docs/${page.slug}`;
                    const active = pathname === href;
                    return (
                      <li key={page.slug}>
                        <Link
                          className={joinClasses(
                            "block rounded-lg px-3 py-2 text-sm transition",
                            active
                              ? "bg-white/10 font-semibold text-white"
                              : "text-white/50 hover:bg-white/5 hover:text-white/70",
                          )}
                          href={href}
                          onClick={() => setMobileOpen(false)}
                        >
                          {page.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1">
        <article className="prose prose-invert max-w-none prose-headings:text-white prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:text-white/70 prose-a:text-sky-400 prose-a:no-underline hover:prose-a:underline prose-code:rounded prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-pre:rounded-xl prose-pre:border prose-pre:border-white/10 prose-pre:bg-neutral-900 prose-table:text-sm prose-th:text-white/50 prose-td:text-white/70 prose-strong:text-white">
          {children}
        </article>
      </main>
    </div>
  );
}
