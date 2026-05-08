import { notFound } from "next/navigation";
import { getDocBySlug } from "@/lib/docs";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

export function generateStaticParams() {
  return [
    { slug: "whitepaper" },
    { slug: "architecture" },
    { slug: "bonding-curve" },
    { slug: "fee-model" },
    { slug: "soul-engine" },
    { slug: "renderers" },
    { slug: "api" },
    { slug: "contributing" },
    { slug: "changelog" },
  ];
}

export default function DocPage({ params }: { params: { slug: string } }) {
  const doc = getDocBySlug(params.slug);
  if (!doc) {
    notFound();
  }

  return (
    <div>
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold text-white">{doc.title}</h1>
        <p className="text-white/40">{doc.description}</p>
      </div>
      <MarkdownRenderer content={doc.content} />
    </div>
  );
}
