import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { deriveAnimatedSoulProfileForPreview } from "@/lib/animatedSoulSurfaces";
import type { ClaimedSoulNftGalleryItem, SoulNftGalleryItem } from "@/lib/soulGallery";
import { AnimatedSoulPreview } from "./AnimatedSoulPreview";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

type SoulGalleryCardScope = "gallery" | "publicGallery" | "tokenGallery";

const RARITY_COLORS: Record<string, string> = {
  common: "border-white/10 bg-white/5 text-white/60",
  uncommon: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  rare: "border-sky-400/25 bg-sky-400/10 text-sky-300",
  epic: "border-violet-400/25 bg-violet-400/10 text-violet-300",
  legendary: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  mythic: "border-rose-400/25 bg-rose-400/10 text-rose-300",
};

type SoulGalleryCardProps = {
  item: ClaimedSoulNftGalleryItem | SoulNftGalleryItem;
  scope: SoulGalleryCardScope;
  showTokenLink?: boolean;
};

export function SoulGalleryCard({ item, scope, showTokenLink = true }: SoulGalleryCardProps) {
  const t = useTranslations(scope);
  const rarityT = useTranslations("soulRarity");
  const rarity = item.soulRarity;
  const tokenMint = item.tokenMint;
  const rarityClass = RARITY_COLORS[rarity.tier] ?? RARITY_COLORS.common;
  const rarityLabel = rarityT(`tiers.${rarity.tier}`);
  const animationProfile = deriveAnimatedSoulProfileForPreview(
    {
      seed:
        item.marketProvenance?.seedHash ??
        ("claim" in item && item.claim ? item.claim : "mint" in item ? item.mint : item.nftMint),
      theme: item.artTheme.label,
      provenanceSide: item.marketProvenance?.side ?? "none",
      generation: item.marketProvenance?.generation ?? ("sequence" in item ? item.sequence : 0),
      amount: item.marketProvenance?.amount ?? 0,
    },
    {
      displayState: { surface: "gallery", density: "compact", motion: "reduced" },
    },
  );

  return (
    <article
      className={joinClasses(
        uiPrimitives.card,
        "group grid min-w-0 gap-0 overflow-hidden p-0 transition hover:border-white/20 sm:grid-cols-[minmax(7.5rem,9rem)_minmax(0,1fr)]",
      )}
      data-preview-density="compact"
      data-soul-gallery-card={"mint" in item ? item.mint : item.nftMint}
    >
      {/* Soul SVG — the hero */}
      <AnimatedSoulPreview
        alt={t("imageLabel", { name: item.name })}
        caption={t("previewMotionCaveat")}
        className="h-44 w-full rounded-none sm:h-full sm:min-h-[9rem]"
        imageClassName="object-contain"
        motion="reduced"
        profile={animationProfile}
        staticSvg={item.sanitizedSvg}
        testId="soul-gallery-animated-preview"
      />

      {/* Content */}
      <div className="flex min-w-0 flex-col justify-center gap-2 px-4 py-4">
        {/* Name */}
        <h2 className="text-base font-bold text-white sm:text-lg">{item.name}</h2>

        {/* Rarity badge */}
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${rarityClass}`}>
            {rarityLabel}
          </span>
          <span className="text-xs text-white/40">{item.symbol}</span>
        </div>

        {/* Actions */}
        <div className="mt-1 flex flex-col gap-2">
          {showTokenLink && tokenMint ? (
            <Link
              className={joinClasses(
                uiPrimitives.buttonPrimary,
                "flex-1 py-2 text-center text-sm font-semibold",
              )}
              href={`/token/${tokenMint}`}
            >
              {t("tokenMint")}
            </Link>
          ) : null}
          {"claim" in item && item.claim ? (
            <Link
              className={joinClasses(
                uiPrimitives.buttonSecondary,
                "flex-1 py-2 text-center text-sm font-semibold",
              )}
              href={`/token/${tokenMint}#claim-soul`}
            >
              {t("claimer")}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
