"use client";

import { useTranslations } from "next-intl";
import {
  APP_CORE_ART_TRAIT_METADATA_ATTRIBUTE_TYPES,
  deriveAppFinalCoreArtTraits,
  type AppFinalCoreArtTraits,
} from "@/lib/soulTraits";
import { deriveAnimatedSoulProfileForPreview } from "@/lib/animatedSoulSurfaces";
import { AnimatedSoulPreview } from "./AnimatedSoulPreview";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

const SAMPLE_SEED = "solsoul:launch-preview:sample-v1";

type LaunchSoulArtPreviewProps = {
  themeId: string;
  styleParams: string;
  selectedTraitCount: number;
};

const paletteStops = {
  solana: ["#14f195", "#9945ff", "#38d5ff"],
  aurora: ["#38d5ff", "#14f195", "#d7ff3f"],
  ember: ["#ff6b35", "#ff4f64", "#ffd166"],
  mono: ["#f8f8f2", "#a1a1aa", "#27272a"],
} satisfies Record<AppFinalCoreArtTraits["palette"], [string, string, string]>;

const backgroundFills = {
  midnight: "#050507",
  nebula: "#12081f",
  grid: "#061312",
  eclipse: "#140f07",
} satisfies Record<AppFinalCoreArtTraits["background"], string>;

const moodOpacity = {
  serene: "0.42",
  charged: "0.68",
  mystic: "0.56",
  radiant: "0.76",
} satisfies Record<AppFinalCoreArtTraits["mood"], string>;

export function LaunchSoulArtPreview({
  themeId,
  styleParams,
  selectedTraitCount,
}: LaunchSoulArtPreviewProps) {
  const t = useTranslations("launch.form");
  const traitT = useTranslations("soulTraits");
  const traits = deriveAppFinalCoreArtTraits({
    seed: SAMPLE_SEED,
    theme: themeId,
    styleParams,
    provenanceSide: "buy",
    generation: 1,
    amount: 100_000_000,
    tokenAmount: 10_000_000_000,
  });
  const animationProfile = deriveAnimatedSoulProfileForPreview(
    {
      seed: SAMPLE_SEED,
      theme: themeId,
      styleParams,
      provenanceSide: "buy",
      generation: 1,
      amount: 100_000_000,
      tokenAmount: 10_000_000_000,
    },
    {
      displayState: { surface: "launch", density: "hero", motion: "auto" },
    },
  );
  const sampleSvg = buildLaunchSampleSoulSvg(traits);

  return (
    <section
      className={joinClasses(
        uiPrimitives.denseRow,
        "grid gap-4 p-3 sm:grid-cols-[minmax(8rem,11rem)_minmax(0,1fr)] sm:items-center",
      )}
      data-testid="launch-soul-sample-preview"
    >
      <AnimatedSoulPreview
        alt={t("samplePreviewAlt")}
        caption={t("samplePreviewCaveat")}
        className="rounded-2xl border border-white/10 bg-black/35 shadow-[0_0_36px_rgba(153,69,255,0.12)]"
        profile={animationProfile}
        staticSvg={sampleSvg}
        testId="launch-animated-soul-preview"
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soul-glow">
          {t("samplePreviewTitle")}
        </p>
        <p className="mt-2 text-sm leading-6 text-white/60">{t("samplePreviewBody")}</p>
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-soul-mint">
          {t("samplePreviewSelected", { count: selectedTraitCount.toString() })}
        </p>
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          {APP_CORE_ART_TRAIT_METADATA_ATTRIBUTE_TYPES.map(({ category, key }) => (
            <div key={category} className="rounded-xl border border-white/10 bg-black/20 p-2">
              <dt className="text-white/40">{traitT(`coreCategories.${category}`)}</dt>
              <dd className="mt-1 font-mono text-white">
                {traitT(`coreValues.${category}.${traits[key]}`)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs leading-5 text-white/50">{t("samplePreviewCaveat")}</p>
      </div>
    </section>
  );
}

function buildLaunchSampleSoulSvg(traits: AppFinalCoreArtTraits) {
  const [primary, secondary, tertiary] = paletteStops[traits.palette];
  const background = backgroundFills[traits.background];
  const glowOpacity = moodOpacity[traits.mood];
  const formMarkup = buildFormMarkup(traits.form, primary, secondary, tertiary);
  const gridMarkup =
    traits.background === "grid"
      ? `<path d="M24 48H136M24 80H136M24 112H136M48 24V136M80 24V136M112 24V136" stroke="${secondary}" stroke-opacity="0.18" stroke-width="1"/>`
      : "";
  const nebulaMarkup =
    traits.background === "nebula"
      ? `<circle cx="118" cy="42" r="34" fill="${secondary}" opacity="0.12"/><circle cx="46" cy="112" r="28" fill="${tertiary}" opacity="0.10"/>`
      : "";
  const eclipseMarkup =
    traits.background === "eclipse"
      ? `<circle cx="112" cy="44" r="23" fill="${tertiary}" opacity="0.22"/><circle cx="104" cy="38" r="23" fill="${background}" opacity="0.9"/>`
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="Deterministic sample Soul preview" data-soul-preview="deterministic-sample" data-palette="${traits.palette}" data-mood="${traits.mood}" data-form="${traits.form}" data-background="${traits.background}">
    <rect width="160" height="160" rx="26" fill="${background}"/>
    ${gridMarkup}${nebulaMarkup}${eclipseMarkup}
    <circle cx="80" cy="80" r="54" fill="${primary}" opacity="0.08"/>
    <circle cx="80" cy="80" r="42" fill="none" stroke="${primary}" stroke-opacity="${glowOpacity}" stroke-width="2"/>
    ${formMarkup}
    <circle cx="80" cy="80" r="5" fill="${tertiary}"/>
  </svg>`;
}

function buildFormMarkup(
  form: AppFinalCoreArtTraits["form"],
  primary: string,
  secondary: string,
  tertiary: string,
) {
  if (form === "wave") {
    return `<g fill="none" stroke-linecap="round">
      <path d="M28 82 C44 46 60 118 80 82 S116 46 132 82" stroke="${primary}" stroke-width="5"/>
      <path d="M34 100 C52 72 64 120 82 100 S112 72 128 100" stroke="${secondary}" stroke-opacity="0.72" stroke-width="3"/>
    </g>`;
  }
  if (form === "crystal") {
    return `<g fill="none" stroke-linejoin="round">
      <path d="M80 28 L122 80 L80 132 L38 80 Z" stroke="${primary}" stroke-width="4"/>
      <path d="M80 28 L80 132 M38 80 H122 M56 58 L104 102 M104 58 L56 102" stroke="${secondary}" stroke-opacity="0.7" stroke-width="2"/>
    </g>`;
  }
  if (form === "orb") {
    return `<g fill="none">
      <circle cx="80" cy="80" r="34" stroke="${primary}" stroke-width="4"/>
      <ellipse cx="80" cy="80" rx="46" ry="15" stroke="${secondary}" stroke-opacity="0.72" stroke-width="2"/>
      <ellipse cx="80" cy="80" rx="15" ry="46" stroke="${tertiary}" stroke-opacity="0.58" stroke-width="2"/>
    </g>`;
  }
  return `<g fill="none" stroke-linecap="round">
    <path d="M80 80 m-34 0 a34 34 0 1 0 68 0 a34 34 0 1 0 -68 0" stroke="${primary}" stroke-width="3"/>
    <path d="M80 80 C74 48 116 46 116 76 C116 114 58 120 54 84 C50 48 96 36 104 64" stroke="${secondary}" stroke-width="5"/>
    <path d="M80 80 C88 62 98 82 84 96 C70 110 58 92 70 78" stroke="${tertiary}" stroke-width="3"/>
  </g>`;
}
