"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="mb-6 mt-2 text-3xl font-bold text-white">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-4 mt-10 border-b border-white/10 pb-2 text-2xl font-bold text-white">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-3 mt-8 text-xl font-bold text-white">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="mb-4 leading-relaxed text-white/70">{children}</p>
        ),
        a: ({ href, children }) => (
          <a
            className="text-sky-400 no-underline transition hover:underline"
            href={href}
            rel="noopener noreferrer"
            target="_blank"
          >
            {children}
          </a>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="my-4 overflow-x-auto rounded-xl border border-white/10 bg-neutral-900 p-4 text-sm">
                <code className={className}>{children}</code>
              </pre>
            );
          }
          return (
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-sm text-white/90">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-4 overflow-x-auto rounded-xl border border-white/10 bg-neutral-900 p-4 text-sm">
            {children}
          </pre>
        ),
        ul: ({ children }) => (
          <ul className="mb-4 list-disc space-y-1 pl-6 text-white/70">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-4 list-decimal space-y-1 pl-6 text-white/70">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="border-b border-white/10">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-white/50">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-b border-white/5 px-3 py-2 text-white/70">
            {children}
          </td>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-4 border-l-4 border-sky-400/30 bg-sky-400/5 pl-4 text-white/60">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-8 border-white/10" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
