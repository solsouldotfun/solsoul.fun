"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  validateTemplateSvg,
  type TemplateDomParser,
  type TemplateValidation,
} from "../lib/templateValidation";

export {
  MAX_TEMPLATE_BYTES,
  validateTemplateSvg,
  type TemplateValidation,
} from "../lib/templateValidation";

type PreviewPlaceholderValues = {
  hue: string;
  accent: string;
  seedHex: string;
  holderTier: string;
};

const DEFAULT_TEMPLATE = `<svg viewBox="0 0 320 320" data-soul-art="pd9-monochrome-template" data-seed-hue="{{HUE}}">
  <rect width="320" height="320" rx="44" fill="#f7f7f2"/>
  <rect x="24" y="24" width="272" height="272" rx="34" fill="none" stroke="#070707" stroke-width="6"/>
  <path d="M68 230 C92 178 101 112 160 84 C219 112 228 178 252 230 Z" fill="#070707"/>
  <circle cx="160" cy="132" r="54" fill="#f7f7f2" stroke="#070707" stroke-width="6"/>
  <path d="M125 137 H146 M174 137 H195" stroke="#070707" stroke-width="{{HOLDER_TIER}}" stroke-linecap="round"/>
  <path d="M126 194 C145 205 175 205 194 194" fill="none" stroke="#f7f7f2" stroke-width="5" stroke-linecap="round"/>
  <text x="160" y="274" text-anchor="middle" fill="#070707" font-size="13">{{SEED_HEX}}</text>
</svg>`;

const SAMPLE_SEED = new TextEncoder().encode("solsoul-template-preview");
const SAMPLE_HOLDER_BALANCE = 25_000_000;

class LenientXmlParser implements TemplateDomParser {
  parseFromString() {
    return {
      getElementsByTagName: () => [],
    } as unknown as Document;
  }
}

function rotateSampleHue(seed: Uint8Array) {
  return seed.reduce((sum, byte, index) => (sum + byte * (index + 1)) % 360, 0);
}

function sampleSeedHex(seed: Uint8Array) {
  return Array.from(seed.slice(0, 8))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function holderTier(balance: number) {
  if (balance === 0) {
    return 0;
  }
  if (balance < 1_000_000) {
    return 1;
  }
  if (balance < 10_000_000) {
    return 2;
  }
  if (balance < 100_000_000) {
    return 3;
  }
  return 4;
}

function samplePlaceholderValues(): PreviewPlaceholderValues {
  const hue = rotateSampleHue(SAMPLE_SEED);
  return {
    hue: String(hue),
    accent: String((hue + 180) % 360),
    seedHex: sampleSeedHex(SAMPLE_SEED),
    holderTier: String(holderTier(SAMPLE_HOLDER_BALANCE)),
  };
}

export function populateTemplatePlaceholders(
  template: string,
  values: PreviewPlaceholderValues = samplePlaceholderValues(),
) {
  return template
    .replaceAll("{{HUE}}", values.hue)
    .replaceAll("{{ACCENT}}", values.accent)
    .replaceAll("{{SEED_HEX}}", values.seedHex)
    .replaceAll("{{HOLDER_TIER}}", values.holderTier);
}

function ValidationBadge({ ok, label }: { ok: boolean; label: string }) {
  const t = useTranslations("launch.templateEditor");

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
        ok
          ? "border-soul-mint/40 bg-soul-mint/10 text-soul-mint"
          : "border-white/20 bg-white/10 text-white/75"
      }`}
    >
      {ok ? t("valid") : t("invalid")} {label}
    </span>
  );
}

export function TemplateEditor({
  starterTemplate,
  onTemplateChange,
  onValidationChange,
}: {
  starterTemplate?: string;
  onTemplateChange?: (template: string) => void;
  onValidationChange?: (validation: TemplateValidation) => void;
}) {
  const t = useTranslations("launch.templateEditor");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [previewSvg, setPreviewSvg] = useState(() => populateTemplatePlaceholders(DEFAULT_TEMPLATE));
  const [useBrowserParser, setUseBrowserParser] = useState(false);
  const validation = useMemo(
    () => validateTemplateSvg(template, useBrowserParser ? undefined : LenientXmlParser),
    [template, useBrowserParser],
  );

  useEffect(() => {
    setUseBrowserParser(true);
  }, []);

  useEffect(() => {
    onValidationChange?.(validation);
  }, [validation, onValidationChange]);

  useEffect(() => {
    onTemplateChange?.(template);
  }, [onTemplateChange, template]);

  useEffect(() => {
    if (!starterTemplate) {
      return;
    }

    setTemplate(starterTemplate);
    setPreviewSvg(populateTemplatePlaceholders(starterTemplate));
    onTemplateChange?.(starterTemplate);
  }, [starterTemplate]);

  return (
    <section
      className="grid min-w-0 gap-4 rounded-2xl border border-white/10 bg-black/20 p-4"
      data-testid="template-editor-readable-panel"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-soul-mint">
          {t("eyebrow")}
        </p>
        <h2 className="mt-2 text-xl font-bold text-white">{t("title")}</h2>
        <p className="mt-2 text-sm leading-6 text-white/60">
          {t("description", {
            hue: "{{HUE}}",
            accent: "{{ACCENT}}",
            seedHex: "{{SEED_HEX}}",
            holderTier: "{{HOLDER_TIER}}",
          })}
        </p>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-semibold text-white" htmlFor="template-svg">
          {t("svgLabel")}
        </label>
        <textarea
          id="template-svg"
          name="templateSvg"
          className="min-h-64 w-full min-w-0 max-w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-sm text-white outline-none transition placeholder:text-white/35 focus:border-soul-mint"
          value={template}
          spellCheck={false}
          onChange={(event) => {
            setTemplate(event.target.value);
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2" aria-label={t("validationLabel")}>
        <ValidationBadge ok={validation.sizeOk} label={t("sizeOk")} />
        <ValidationBadge ok={validation.startsWithSvg} label={t("startsWithSvg")} />
        <ValidationBadge ok={validation.parseableXml} label={t("xmlParseable")} />
        <ValidationBadge ok={validation.externalRefsOk} label={t("noExternalRefs")} />
      </div>

      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)] lg:items-start">
        <button
          className="w-fit rounded-xl border border-soul-mint/40 px-4 py-2 text-sm font-semibold text-soul-mint transition hover:bg-soul-mint/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/35 lg:col-span-2"
          type="button"
          disabled={!validation.isValid}
          onClick={() => setPreviewSvg(populateTemplatePlaceholders(template))}
        >
          {t("preview")}
        </button>

        <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white">
          <iframe
            className="h-80 w-full bg-white"
            title={t("previewTitle")}
            sandbox=""
            srcDoc={previewSvg}
          />
        </div>
      </div>
    </section>
  );
}
