import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { docPages } from "@/lib/docs";
import { joinClasses, uiPrimitives } from "@/components/uiPrimitives";

const categories = [
  { key: "protocol" as const, title: "Protocol", description: "Core protocol concepts and economics" },
  { key: "technical" as const, title: "Technical", description: "Architecture, math, and implementation details" },
  { key: "reference" as const, title: "Reference", description: "API docs and changelogs" },
  { key: "community" as const, title: "Community", description: "Guides for contributors and developers" },
];

export default function DocsIndexPage() {
  const t = useTranslations("docs");

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-white">{t("title")}</h1>
        <p className="text-lg text-white/50">{t("subtitle")}</p>
      </div>

      {categories.map((cat) => {
        const pages = docPages.filter((d) => d.category === cat.key);
        if (pages.length === 0) return null;
        return (
          <section className="space-y-4" key={cat.key}>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white">{cat.title}</h2>
              <p className="text-sm text-white/40">{cat.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {pages.map((page) => (
                <Link
                  className={joinClasses(
                    uiPrimitives.card,
                    "group flex flex-col gap-2 p-5 transition hover:border-white/20",
                  )}
                  href={`/docs/${page.slug}`}
                  key={page.slug}
                >
                  <h3 className="text-base font-semibold text-white group-hover:text-sky-400 transition">
                    {page.title}
                  </h3>
                  <p className="text-sm text-white/40 leading-relaxed">
                    {page.description}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
