import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { LaunchedTokenFeedItem } from "@/lib/tokenFeed";
import { deriveAnimatedSoulProfileForPreview } from "@/lib/animatedSoulSurfaces";
import { svgToDataUri } from "@/lib/svgPreview";
import { AnimatedSoulPreview } from "./AnimatedSoulPreview";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="24" fill="#1a1a1a"/><rect x="14" y="14" width="132" height="132" rx="18" fill="none" stroke="#333" stroke-width="4"/><circle cx="80" cy="80" r="40" fill="none" stroke="#333" stroke-width="3"/></svg>';

export function TokenFeedRow({ item }: { item: LaunchedTokenFeedItem }) {
  const t = useTranslations("tokens");
  const soulSvg = item.latestSoulSvg;
  const hasSoul = soulSvg != null && soulSvg.length > 0;
  const energyLabel =
    item.latestEnergyScore !== null && item.latestRarityTier !== null
      ? t("stats.energyValue", {
          tier: t(`rarityTiers.${item.latestRarityTier}`),
          score: item.latestEnergyScore,
        })
      : t("stats.energyPending");
  const animationProfile = hasSoul
    ? deriveAnimatedSoulProfileForPreview(
        {
          seed: item.marketProvenance?.seedHash ?? item.mint,
          theme: item.artTheme.id,
          provenanceSide: item.marketProvenance?.side ?? "none",
          generation: item.marketProvenance?.generation ?? item.generationCount,
          amount: item.marketProvenance?.amount ?? 0,
        },
        {
          displayState: { surface: "feed", density: "compact", motion: "auto" },
        },
      )
    : null;

  return (
    <article
      className={joinClasses(
        uiPrimitives.card,
        "group flex min-w-0 flex-col gap-4 overflow-hidden p-0 transition hover:border-white/20",
      )}
      data-token-feed-row={item.mint}
    >
      {/* Soul preview — compact market affordance */}
      <div
        className="relative h-40 w-full overflow-hidden bg-soul-ink sm:h-44"
        data-preview-state={hasSoul ? "animated-soul" : "awaiting-soul"}
      >
        {hasSoul && animationProfile ? (
          <AnimatedSoulPreview
            alt={t("latestSoulAlt", { symbol: item.symbol })}
            caption={t("previewMotionCaveat")}
            className="h-full w-full rounded-none transition duration-500 group-hover:scale-[1.015]"
            imageClassName="object-contain"
            motion="auto"
            profile={animationProfile}
            staticSvg={soulSvg}
            testId="token-feed-animated-soul-preview"
          />
        ) : (
          <div
            className="relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden border border-dashed border-soul-mint/20 bg-[radial-gradient(circle_at_50%_35%,rgba(20,241,149,0.18),transparent_32%),linear-gradient(135deg,rgba(153,69,255,0.14),rgba(0,0,0,0.2))] px-5 text-center"
            data-testid="token-feed-soul-placeholder"
          >
            <div
              aria-hidden="true"
              className="absolute inset-x-8 top-8 h-20 rounded-full bg-soul-mint/10 blur-2xl motion-safe:animate-pulse"
            />
            <img
              alt={t("noGenerationTitle")}
              className="relative h-14 w-14 opacity-70"
              src={svgToDataUri(PLACEHOLDER_SVG)}
            />
            <p className="relative text-xs font-semibold uppercase tracking-[0.16em] text-soul-mint/80">
              {t("noGenerationTitle")}
            </p>
            <p className="relative max-w-[12rem] text-xs leading-5 text-white/45">
              {t("noGenerationBody")}
            </p>
          </div>
        )}
        {/* Price badge floating */}
        <div className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-sm font-bold text-white backdrop-blur">
          {item.currentPrice}
        </div>
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-col gap-2 px-4 pb-4">
        {/* Symbol + availability */}
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white">{item.symbol}</h2>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/40">
            {item.availability}
          </span>
        </div>

        {/* One-line status */}
        <p className="text-sm text-white/50">
          {item.soulStatusLabel}
        </p>

        <dl className="grid grid-cols-2 gap-2 py-1 text-xs sm:grid-cols-3">
          <MicroStat label={t("stats.flow")} value={item.latestFlowLabel ?? item.flowLabel} />
          <MicroStat label={t("stats.generated")} value={t("stats.generatedValue", { count: item.generationCount })} />
          <MicroStat label={t("stats.energy")} value={energyLabel} />
          <MicroStat label={t("stats.collectors")} value={t("stats.collectorsValue", { count: item.claimCount })} />
          <MicroStat label={t("stats.progress")} value={item.marketProgressLabel} />
          <MicroStat label={t("stats.freshness")} value={item.createdAtLabel} />
        </dl>

        <p className="line-clamp-2 text-xs leading-5 text-white/40">
          {item.holderGateLabel}
        </p>

        {/* CTA */}
        <Link
          className={joinClasses(
            uiPrimitives.buttonPrimary,
            "mt-1 w-full py-2.5 text-center text-sm font-semibold",
          )}
          href={item.href}
        >
          {t("viewToken")}
        </Link>
      </div>
    </article>
  );
}

function MicroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2">
      <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.13em] text-white/35">
        {label}
      </dt>
      <dd className="mt-1 truncate text-white/75">{value}</dd>
    </div>
  );
}
