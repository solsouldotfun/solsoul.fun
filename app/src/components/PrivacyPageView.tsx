import React from "react";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

export type PrivacyPageCopy = {
  eyebrow: string;
  title: string;
  updated: string;
  placeholder: string;
  sections: Array<{
    title: string;
    body: string;
  }>;
  contact: string;
};

type PrivacyPageViewProps = {
  copy: PrivacyPageCopy;
};

export function PrivacyPageView({ copy }: PrivacyPageViewProps) {
  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] max-w-screen-sm px-4 py-10 sm:px-6 sm:py-16 md:max-w-3xl">
      <p className={joinClasses(uiPrimitives.label, "mb-7 w-fit px-4 py-2")}>{copy.eyebrow}</p>
      <h1 className="mt-3 text-4xl font-black sm:text-5xl">{copy.title}</h1>
      <p className="mt-4 text-sm font-semibold text-white/60">{copy.updated}</p>
      <div className={joinClasses(uiPrimitives.statusNeutral, "mt-6 text-sm leading-6")}>
        {copy.placeholder}
      </div>

      <div className="mt-8 grid gap-4">
        {copy.sections.map((section) => (
          <section key={section.title} className={joinClasses(uiPrimitives.denseRow, "p-5")}>
            <h2 className="text-xl font-bold text-white">{section.title}</h2>
            <p className="mt-3 text-sm leading-6 text-white/70">{section.body}</p>
          </section>
        ))}
      </div>

      <p className="mt-8 text-sm leading-6 text-white/60">{copy.contact}</p>
    </main>
  );
}
