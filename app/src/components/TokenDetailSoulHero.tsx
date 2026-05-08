"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SoulRarityInfo } from "../lib/soulRarity";
import type {
  AppSoulCoreTrait,
  AppSoulGeneratedTrait,
  AppSoulTraitDisplayGroups,
} from "../lib/soulTraits";
import type { AnimatedSoulProfile } from "../lib/animatedSoulProfile";
import type { SoulEvolutionDisplayState } from "../lib/animatedSoulSurfaces";
import { svgToDataUri } from "../lib/svgPreview";
import { AnimatedSoulPreview } from "./AnimatedSoulPreview";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

export type TokenDetailTradeAction = "buy" | "sell";
export type TokenDetailSoulTraitGroups = AppSoulTraitDisplayGroups;

export function SoulRarityPreviewCard({
  previewSvg,
  rarity,
  generation,
  seedHash,
  claimState,
  animationProfile,
  generatedTraits = [],
  traitGroups,
  labels,
}: {
  previewSvg: string;
  rarity: SoulRarityInfo | null;
  generation: string;
  seedHash: string;
  claimState: string;
  animationProfile?: AnimatedSoulProfile | null;
  generatedTraits?: AppSoulGeneratedTrait[];
  traitGroups?: TokenDetailSoulTraitGroups;
  labels: {
    title: string;
    body: string;
    deterministicSeed: string;
    claimStatus: string;
    generated: string;
    notGenerated: string;
    previewAlt: string;
    motionCaveat?: string;
  };
}) {
  const rarityT = useTranslations("soulRarity");
  const traitT = useTranslations("soulTraits");
  const hasGeneratedSoul = rarity !== null;
  const resolvedGeneratedTraits = traitGroups?.generatedTraits ?? generatedTraits;
  const launchGuidedCoreTraits = traitGroups?.launchGuidedCoreTraits ?? [];
  const systemCoreTraits = traitGroups?.systemCoreTraits ?? [];
  const shouldShowLaunchGuidedTraits = Boolean(traitGroups) && hasGeneratedSoul;

  return (
    <section className={joinClasses(uiPrimitives.card, "grid gap-4 p-4")} data-testid="soul-rarity-preview">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soul-glow">
          {labels.title}
        </p>
        <p className="mt-2 text-sm leading-6 text-white/60">{labels.body}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-2xl bg-soul-ink">
          {previewSvg ? (
            animationProfile ? (
              <AnimatedSoulPreview
                alt={labels.previewAlt}
                caption={labels.motionCaveat}
                className="rounded-2xl"
                motion="reduced"
                profile={animationProfile}
                staticSvg={previewSvg}
                testId="token-rarity-animated-soul-preview"
              />
            ) : (
              <img
                alt={labels.previewAlt}
                className="aspect-square w-full object-contain"
                src={svgToDataUri(previewSvg)}
              />
            )
          ) : (
            <div className="grid aspect-square place-items-center border border-dashed border-white/15 bg-black/40 p-4 text-center text-sm text-white/45">
              {labels.notGenerated}
            </div>
          )}
        </div>
        <div className="grid min-w-0 gap-3">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div className={joinClasses(uiPrimitives.denseRow, "border-fuchsia-300/20 bg-fuchsia-300/10 p-3")}>
              <dt className="text-xs uppercase tracking-[0.14em] text-fuchsia-100">
                {rarityT("title")}
              </dt>
              <dd className="mt-2 text-lg font-black text-white">
                {hasGeneratedSoul
                  ? `${rarityT(`tiers.${rarity.tier}`)} · ${rarityT("score", { score: String(rarity.score) })}`
                  : labels.notGenerated}
              </dd>
            </div>
            <div className={joinClasses(uiPrimitives.denseRow, "p-3")}>
              <dt className="text-xs uppercase tracking-[0.14em] text-white/45">
                {rarityT("generation")}
              </dt>
              <dd className="mt-2 font-mono text-white">{generation}</dd>
            </div>
            <div className={joinClasses(uiPrimitives.denseRow, "p-3 sm:col-span-2")}>
              <dt className="text-xs uppercase tracking-[0.14em] text-white/45">
                {labels.deterministicSeed}
              </dt>
              <dd className="mt-2 break-all font-mono text-xs text-white">{seedHash}</dd>
            </div>
            <div className={joinClasses(uiPrimitives.denseRow, "p-3 sm:col-span-2")}>
              <dt className="text-xs uppercase tracking-[0.14em] text-white/45">
                {labels.claimStatus}
              </dt>
              <dd className="mt-2 text-sm text-white">{claimState}</dd>
            </div>
          </dl>
          {rarity ? (
            <div className={joinClasses(uiPrimitives.denseRow, "p-3")}>
              <p className="text-xs uppercase tracking-[0.14em] text-white/45">
                {rarityT("traits")}
              </p>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                {rarity.traits.map((trait) => (
                  <div key={`${trait.kind}:${trait.value}`}>
                    <dt className="text-white/45">{rarityT(`traitKinds.${trait.kind}`)}</dt>
                    <dd className="font-mono text-white">
                      {rarityT(`traitValues.${trait.kind}.${trait.value}`)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {shouldShowLaunchGuidedTraits ? (
            <div
              className={joinClasses(uiPrimitives.denseRow, "border-soul-mint/20 bg-soul-mint/10 p-3")}
              data-section="launch-guided-core-traits"
            >
              <p className="text-xs uppercase tracking-[0.14em] text-white/45">
                {traitT("launchGuidedTitle")}
              </p>
              {launchGuidedCoreTraits.length > 0 ? (
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  {launchGuidedCoreTraits.map((trait) => (
                    <CoreTraitDefinition
                      key={`${trait.category}:${trait.value}`}
                      trait={trait}
                    />
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-sm text-white/60">{traitT("launchGuidedEmpty")}</p>
              )}
            </div>
          ) : null}
          {systemCoreTraits.length > 0 || resolvedGeneratedTraits.length > 0 ? (
            <div
              className={joinClasses(uiPrimitives.denseRow, "p-3")}
              data-section="system-generated-traits"
            >
              <p className="text-xs uppercase tracking-[0.14em] text-white/45">
                {traitT("systemTitle")}
              </p>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                {systemCoreTraits.map((trait) => (
                  <CoreTraitDefinition
                    key={`core:${trait.category}:${trait.value}`}
                    trait={trait}
                  />
                ))}
                {resolvedGeneratedTraits.map((trait) => (
                  <div key={`generated:${trait.category}:${trait.value}`}>
                    <dt className="text-white/45">{traitT(`categories.${trait.category}`)}</dt>
                    <dd className="font-mono text-white">
                      {traitT(`values.${trait.category}.${trait.value}`)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          <p className="text-sm text-soul-mint">{hasGeneratedSoul ? labels.generated : labels.notGenerated}</p>
        </div>
      </div>
    </section>
  );
}

export function TokenDetailSurfaceHeader({
  mint,
  previewSvg,
  previewAlt,
  artTheme,
  generationCount,
  claimCount,
  currentPrice,
  percentMinted,
  claimState,
  nextAction,
  animationProfile,
  evolutionDisplay,
  tradeHref,
  claimHref,
  timelineHref,
  galleryHref,
  generatedTraits = [],
  traitGroups,
  labels,
}: {
  mint: string;
  previewSvg: string;
  previewAlt: string;
  artTheme: string;
  generationCount: string;
  claimCount: string;
  currentPrice: string;
  percentMinted: string;
  claimState: string;
  nextAction: string;
  animationProfile?: AnimatedSoulProfile | null;
  evolutionDisplay?: SoulEvolutionDisplayState | null;
  tradeHref: string;
  claimHref: string;
  timelineHref: string;
  galleryHref: string;
  labels: {
    eyebrow: string;
    title: string;
    identity: string;
    latestSoul: string;
    trade: string;
    claim: string;
    progress: string;
    provenance: string;
    artTheme: string;
    generations: string;
    claims: string;
    currentPrice: string;
    percentMinted: string;
    openTrade: string;
    openClaim: string;
    openTimeline: string;
    openGallery: string;
    nextAction: string;
    mint: string;
    motionCaveat?: string;
  };
  generatedTraits?: AppSoulGeneratedTrait[];
  traitGroups?: TokenDetailSoulTraitGroups;
}) {
  const traitT = useTranslations("soulTraits");
  const resolvedGeneratedTraits = traitGroups?.generatedTraits ?? generatedTraits;
  const launchGuidedCoreTraits = traitGroups?.launchGuidedCoreTraits ?? [];
  const systemCoreTraits = traitGroups?.systemCoreTraits ?? [];
  const shouldShowLaunchGuidedTraits = Boolean(traitGroups) && generationCount !== "0";
  return (
    <section
      aria-label={labels.title}
      className={joinClasses(
        uiPrimitives.card,
        "grid min-w-0 gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(180px,0.42fr)_minmax(0,1fr)]",
      )}
      data-testid="token-detail-command-grid"
    >
      <div
        className="relative mx-auto w-full max-w-[22rem] min-w-0 overflow-hidden rounded-[1.75rem] border border-white/10 bg-black shadow-[0_30px_100px_rgba(0,0,0,0.55)] lg:max-w-none"
        data-preview-density="compact-detail"
        data-section="latest-soul-preview"
      >
        {previewSvg ? (
          animationProfile ? (
            <AnimatedSoulPreview
              alt={previewAlt}
              caption={labels.motionCaveat}
              className="rounded-[1.75rem]"
              profile={animationProfile}
              staticSvg={previewSvg}
              testId="token-detail-animated-soul-preview"
            />
          ) : (
            <img
              alt={previewAlt}
              className="aspect-square w-full object-contain"
              src={svgToDataUri(previewSvg)}
            />
          )
        ) : (
          <div className="grid aspect-square place-items-center border border-dashed border-white/15 bg-black/40 p-6 text-center text-sm text-white/45">
            {previewAlt}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soul-mint">
            {labels.latestSoul}
          </p>
          <p className="mt-1 font-mono text-xs text-white/65">#{generationCount}</p>
        </div>
      </div>

      <div className="grid min-w-0 content-center gap-5" data-section="identity">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-soul-mint">
            {labels.eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            {labels.title}
          </h1>
          <p className="mt-3 break-all text-sm leading-6 text-white/55">
            {labels.identity}: <span className="font-mono text-white/70">{mint}</span>
          </p>
        </div>

        <SoulEvolutionDisplayPanel state={evolutionDisplay} />

        <dl className="grid gap-2 sm:grid-cols-2">
          <div
            className={joinClasses(uiPrimitives.denseRow, "border-soul-mint/25 bg-soul-mint/10 p-3")}
            data-section="trade-panel-access"
          >
            <dt className="text-xs uppercase tracking-[0.14em] text-soul-mint">{labels.trade}</dt>
            <dd className="mt-2 text-sm font-semibold text-white">{nextAction}</dd>
          </div>
          <div
            className={joinClasses(uiPrimitives.denseRow, "p-3")}
            data-section="claim-state"
          >
            <dt className="text-xs uppercase tracking-[0.14em] text-white/45">{labels.claim}</dt>
            <dd className="mt-2 text-sm font-semibold text-white">{claimState}</dd>
          </div>
          <div
            className={joinClasses(uiPrimitives.denseRow, "p-3 sm:col-span-2")}
            data-section="bonding-progress"
          >
            <dt className="text-xs uppercase tracking-[0.14em] text-white/45">{labels.progress}</dt>
            <dd className="mt-2 grid gap-2 font-mono text-sm text-white sm:grid-cols-2">
              <span>{currentPrice}</span>
              <span>{percentMinted}</span>
            </dd>
          </div>
        </dl>

        <div className="grid gap-2 sm:grid-cols-3">
          <a className={joinClasses(uiPrimitives.buttonPrimary, "px-4 py-3 text-center text-sm sm:col-span-2")} href={tradeHref}>
            {labels.openTrade}
          </a>
          <a className={joinClasses(uiPrimitives.buttonSecondary, "px-4 py-3 text-center text-sm")} href={claimHref}>
            {labels.openClaim}
          </a>
        </div>

        <details
          className={joinClasses(uiPrimitives.denseRow, "group p-4")}
          data-section="provenance-access"
        >
          <summary className="cursor-pointer list-none text-sm font-semibold text-white/75 transition group-open:text-white">
            {labels.provenance}
          </summary>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-[0.14em] text-white/45">{labels.mint}</dt>
              <dd className="mt-1 break-all font-mono text-white/70">{mint}</dd>
            </div>
            <div data-section="art-theme">
              <dt className="text-xs uppercase tracking-[0.14em] text-white/45">{labels.artTheme}</dt>
              <dd className="mt-1 break-words font-mono text-white/70">{artTheme}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-white/45">{labels.generations}</dt>
              <dd className="mt-1 font-mono text-white/70">{generationCount}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-white/45">{labels.claims}</dt>
              <dd className="mt-1 font-mono text-white/70">{claimCount}</dd>
            </div>
            {shouldShowLaunchGuidedTraits ? (
              <div
                className="sm:col-span-2"
                data-section="launch-guided-core-traits"
              >
                <dt className="text-xs uppercase tracking-[0.14em] text-soul-mint">
                  {traitT("launchGuidedTitle")}
                </dt>
                <dd className="mt-2 grid gap-1 font-mono text-xs text-white sm:grid-cols-2">
                  {launchGuidedCoreTraits.length > 0 ? (
                    launchGuidedCoreTraits.map((trait) => (
                      <CompactCoreTrait key={`${trait.category}:${trait.value}`} trait={trait} />
                    ))
                  ) : (
                    <span className="font-sans text-white/60 sm:col-span-2">
                      {traitT("launchGuidedEmpty")}
                    </span>
                  )}
                </dd>
              </div>
            ) : null}
            {systemCoreTraits.length > 0 || resolvedGeneratedTraits.length > 0 ? (
              <div
                className="sm:col-span-2"
                data-section="system-generated-traits"
              >
                <dt className="text-xs uppercase tracking-[0.14em] text-fuchsia-100">
                  {traitT("systemTitle")}
                </dt>
                <dd className="mt-2 grid gap-1 font-mono text-xs text-white sm:grid-cols-2">
                  {systemCoreTraits.map((trait) => (
                    <CompactCoreTrait key={`core:${trait.category}:${trait.value}`} trait={trait} />
                  ))}
                  {resolvedGeneratedTraits.map((trait) => (
                    <span className="break-all" key={`generated:${trait.category}:${trait.value}`}>
                      <span className="text-white/45">{traitT(`categories.${trait.category}`)}: </span>
                      <span title={trait.value}>
                        {traitT(`values.${trait.category}.${trait.value}`)}
                      </span>
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <a className={joinClasses(uiPrimitives.buttonSecondary, "px-4 py-2 text-center text-sm")} href={timelineHref}>
              {labels.openTimeline}
            </a>
            <Link className={joinClasses(uiPrimitives.buttonSecondary, "px-4 py-2 text-center text-sm")} href={galleryHref}>
              {labels.openGallery}
            </Link>
          </div>
        </details>
      </div>
    </section>
  );
}

function SoulEvolutionDisplayPanel({
  state,
}: {
  state?: SoulEvolutionDisplayState | null;
}) {
  const evolutionT = useTranslations("token.soulEvolution");
  const rarityT = useTranslations("soulRarity");

  if (!state) {
    return null;
  }

  const rarityLabel =
    state.rarityTier === "unranked"
      ? evolutionT("rarityUnranked")
      : rarityT(`tiers.${state.rarityTier}`);
  const fieldItems = [
    {
      key: "level",
      label: evolutionT("level"),
      value: `${state.level}`,
    },
    {
      key: "stage",
      label: evolutionT("stage"),
      value: evolutionT(`stages.${state.stage}`),
    },
    {
      key: "generation",
      label: evolutionT("generation"),
      value: `#${state.generation}`,
    },
    {
      key: "rarity",
      label: evolutionT("rarity"),
      value:
        state.rarityScore == null
          ? rarityLabel
          : `${rarityLabel} · ${rarityT("score", { score: String(state.rarityScore) })}`,
    },
    {
      key: "provenance",
      label: evolutionT("provenance"),
      value: evolutionT(`provenanceValues.${state.provenance}`),
    },
  ];

  return (
    <section
      className={joinClasses(
        uiPrimitives.denseRow,
        "border-soul-glow/20 bg-soul-glow/10 p-4",
      )}
      data-energy={state.energy}
      data-level={state.level}
      data-provenance={state.provenance}
      data-stage={state.stage}
      data-testid="soul-evolution-display-state"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soul-glow">
            {evolutionT("badge")}
          </p>
          <h2 className="mt-2 text-lg font-black text-white">{evolutionT("title")}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
            {evolutionT("body")}
          </p>
        </div>
        <div className="rounded-full border border-soul-mint/30 bg-soul-mint/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-soul-mint">
          {evolutionT(`stages.${state.stage}`)}
        </div>
      </div>

      <dl className="mt-4 grid gap-2 sm:grid-cols-5">
        {fieldItems.map((item) => (
          <div
            className="rounded-2xl border border-white/10 bg-black/25 p-3"
            data-evolution-field={item.key}
            key={item.key}
          >
            <dt className="text-[0.68rem] uppercase tracking-[0.14em] text-white/45">
              {item.label}
            </dt>
            <dd className="mt-1 break-words text-sm font-semibold text-white">{item.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem]">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
            {evolutionT("staticLayerTitle")}
          </p>
          <p className="mt-2 text-sm leading-6 text-white/65">{evolutionT("staticLayerBody")}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
            {evolutionT("dynamicLayerTitle")}
          </p>
          <p className="mt-2 text-sm leading-6 text-white/65">{evolutionT("dynamicLayerBody")}</p>
        </div>
        <div
          className="rounded-2xl border border-soul-mint/20 bg-soul-mint/10 p-3"
          data-evolution-field="energy"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-soul-mint">
            {evolutionT("energy")}
          </p>
          <p className="mt-1 font-mono text-lg font-black text-white">{state.energy}%</p>
          <div
            aria-hidden="true"
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-soul-mint via-cyan-300 to-fuchsia-400"
              style={{ width: `${state.energy}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function CoreTraitDefinition({ trait }: { trait: AppSoulCoreTrait }) {
  const traitT = useTranslations("soulTraits");
  return (
    <div>
      <dt className="text-white/45">{traitT(`coreCategories.${trait.category}`)}</dt>
      <dd className="font-mono text-white">
        {traitT(`coreValues.${trait.category}.${trait.value}`)}
      </dd>
    </div>
  );
}

function CompactCoreTrait({ trait }: { trait: AppSoulCoreTrait }) {
  const traitT = useTranslations("soulTraits");
  return (
    <span className="break-all">
      <span className="text-white/45">{traitT(`coreCategories.${trait.category}`)}: </span>
      <span title={trait.value}>{traitT(`coreValues.${trait.category}.${trait.value}`)}</span>
    </span>
  );
}

export function TradeGenerationMoment({
  action,
  amount,
  amountLabel,
  claimLabel,
  claimSemantics,
  generatedLabel,
  nextActionLabel,
  previewAlt,
  seedHash,
  seedHashLabel,
  signature,
  signatureLabel,
  side,
  sideLabel,
  tradeAgainLabel,
  trader,
  traderLabel,
  transactionHref,
  transactionLabel,
  viewGalleryLabel,
  viewTokenGalleryHref,
  svg,
  animationProfile,
  onTradeAgain,
}: {
  action: TokenDetailTradeAction;
  amount: string;
  amountLabel: string;
  claimLabel: string;
  claimSemantics?: string;
  generation: string;
  generatedLabel: string;
  nextActionLabel: string;
  previewAlt: string;
  seedHash: string;
  seedHashLabel: string;
  signature: string;
  signatureLabel: string;
  side: string;
  sideLabel: string;
  tradeAgainLabel: string;
  trader: string;
  traderLabel: string;
  transactionHref?: string;
  transactionLabel: string;
  viewGalleryLabel: string;
  viewTokenGalleryHref: string;
  svg: string;
  animationProfile?: AnimatedSoulProfile | null;
  onTradeAgain?: () => void;
}) {
  return (
    <section
      className={joinClasses(uiPrimitives.card, "grid gap-4 p-4 text-sm text-white sm:grid-cols-[160px_minmax(0,1fr)]")}
      role="status"
    >
      <div className="overflow-hidden rounded-2xl bg-soul-ink">
        {animationProfile ? (
          <AnimatedSoulPreview
            alt={previewAlt}
            className="rounded-2xl"
            profile={animationProfile}
            staticSvg={svg}
            testId="trade-generation-animated-soul-preview"
          />
        ) : (
          <img
            alt={previewAlt}
            className="aspect-square w-full object-contain"
            src={svgToDataUri(svg)}
          />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soul-mint">
          {nextActionLabel}
        </p>
        <h3 className="mt-2 text-2xl font-black text-white">{generatedLabel}</h3>
        <p className="mt-3 break-all text-white/65">
          {signatureLabel}: {signature}
        </p>
        <dl className="mt-3 grid gap-2 text-white/70 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <dt className="text-xs uppercase tracking-[0.14em] text-white/45">
              {sideLabel}
            </dt>
            <dd className="mt-1 break-all font-mono text-white">{side}</dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <dt className="text-xs uppercase tracking-[0.14em] text-white/45">
              {amountLabel}
            </dt>
            <dd className="mt-1 break-all font-mono text-white">{amount}</dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <dt className="text-xs uppercase tracking-[0.14em] text-white/45">
              {traderLabel}
            </dt>
            <dd className="mt-1 break-all font-mono text-white">{trader}</dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 sm:col-span-2">
            <dt className="text-xs uppercase tracking-[0.14em] text-white/45">
              {seedHashLabel}
            </dt>
            <dd className="mt-1 break-all font-mono text-white">{seedHash}</dd>
          </div>
        </dl>
        {claimSemantics ? (
          <p
            className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 leading-6 text-amber-50/90"
            data-testid="trade-generation-claim-semantics"
          >
            {claimSemantics}
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <a
            className={joinClasses(
              action === "sell" ? uiPrimitives.buttonSecondary : uiPrimitives.buttonPrimary,
              "px-4 py-2 text-center",
            )}
            href="#claim-soul"
          >
            {claimLabel}
          </a>
          <Link
            className="rounded-xl border border-soul-mint/40 px-4 py-2 text-center font-semibold text-soul-mint transition hover:border-soul-mint"
            href={viewTokenGalleryHref}
          >
            {viewGalleryLabel}
          </Link>
          <button
            className={joinClasses(uiPrimitives.buttonSecondary, "px-4 py-2")}
            onClick={onTradeAgain}
            type="button"
          >
            {tradeAgainLabel}
          </button>
          {transactionHref ? (
            <a
              className={joinClasses(uiPrimitives.buttonSecondary, "px-4 py-2 text-center")}
              href={transactionHref}
              rel="noreferrer"
              target="_blank"
            >
              {transactionLabel}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

