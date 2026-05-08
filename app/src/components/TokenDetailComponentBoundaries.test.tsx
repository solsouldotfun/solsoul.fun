import React, { type PropsWithChildren } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";
import type { BondingCurveAccount } from "sdk";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: PropsWithChildren<{ href: string; className?: string }>) =>
    React.createElement("a", { href, ...props }, children),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import {
  SoulLifecycleStateMachine,
  getSoulLifecycleState,
  type SoulLifecyclePrimaryAction,
  type SoulLifecycleStage,
} from "./TokenDetailLifecycle";
import { resolveTokenDetailFieldLabel } from "./TokenDetailFallbacks";
import { TokenDetailProofRail } from "./TokenDetailProofRail";
import { BondingCurveChart, LifecycleCurveVisual, QuoteBreakdown } from "./TokenDetailMarket";
import { TokenDetailSurfaceHeader } from "./TokenDetailSoulHero";
import { TokenMtSoulExplainer } from "./TokenMtSoulExplainer";
import {
  deriveAnimatedSoulProfileForPreview,
  deriveSoulEvolutionDisplayState,
} from "@/lib/animatedSoulSurfaces";

const lifecycleLabels = {
  eyebrow: "Soul lifecycle",
  title: "Awaken and collect the Soul",
  body: "Trade activity generates the next Soul before collection.",
  currentState: "Current state",
  nextAction: "Next action",
  generation: "Generation 0",
  requiredBalance: "Hold one token",
  steps: {
    noSoulYet: { label: "Trade to generate", description: "No Soul has been generated yet." },
    generatedUnclaimed: { label: "Generated", description: "Connect the generating wallet." },
    claimable: { label: "Claimable", description: "This Soul can be collected." },
    ineligible: { label: "Keep trading", description: "Eligibility is not ready yet." },
    claimedInCollection: { label: "Collected", description: "View it in the gallery." },
  } satisfies Record<SoulLifecycleStage, { label: string; description: string }>,
  actions: {
    tradeToGenerate: "Trade to generate",
    connectWallet: "Connect wallet",
    claimSoul: "Claim Soul",
    buyOrHold: "Buy or hold",
    viewCollection: "View collection",
  } satisfies Record<SoulLifecyclePrimaryAction, string>,
};

const chartLabels = {
  title: "First-phase bonding curve",
  eyebrow: "Curve chart",
  body: "Sampled curve with MT markers.",
  summary:
    "Current price 0.000028 SOL/token; minted progress 42.50%; total minted 8,925,000 tokens.",
  unavailableTitle: "Curve chart unavailable",
  unavailableBody: "Live curve data is missing or outside the expected range.",
  currentPoint: "Current point",
  mintedProgress: "Minted progress",
  priceAxis: "Price",
  tokenAxis: "Minted tokens",
  firstMtMarker: "10,000 tokens / MT",
  capMarker: "2,100 MT cap",
  capHelper:
    "The 2,100 MT/Soul cap is the collectible layer above the 21,000,000 fungible-token curve supply.",
  currentPrice: "Current price",
  totalMinted: "Total minted",
  percentMinted: "Minted",
};

function bondingCurve(overrides: Partial<BondingCurveAccount> = {}): BondingCurveAccount {
  return {
    mint: PublicKey.default,
    cumulativeSol: 100_000_000_000n,
    totalMinted: 8_925_000_000_000n,
    selfDeprecated: false,
    lastInteractionSlot: 7n,
    ...overrides,
  };
}

describe("token detail extracted component boundaries", () => {
  it("renders the Token to MT to Soul relationship with cap progress", () => {
    const markup = renderToStaticMarkup(
      <TokenMtSoulExplainer
        claimCount="17"
        copy={{
          eyebrow: "Token → MT → Soul",
          title: "How the supply layers fit",
          body: "Fungible tokens power the market; MT gates and Souls sit above it.",
          steps: [
            {
              label: "Token",
              value: "21,000,000 fungible tokens",
              body: "Tradeable market supply.",
            },
            {
              label: "MT gate",
              value: "10,000 tokens per MT",
              body: "Each MT requires a holder gate.",
            },
            {
              label: "Soul",
              value: "2,100 MT/Soul cap",
              body: "Scarce collectible supply.",
            },
          ],
          capProgress: "Claim progress: 17 of 2,100 MT/Soul NFTs claimed.",
        }}
      />,
    );

    expect(markup).toContain('data-testid="token-mt-soul-explainer"');
    expect(markup).toContain("Token → MT → Soul");
    expect(markup).toContain("21,000,000 fungible tokens");
    expect(markup).toContain("10,000 tokens per MT");
    expect(markup).toContain("2,100 MT/Soul cap");
    expect(markup).toContain("Claim progress: 17 of 2,100");
  });

  it("uses localized unavailable copy for forced-error token detail metrics", () => {
    const labels = {
      unavailableLabel: "Unavailable",
      loadingPrice: "Loading current price…",
      loadingProgress: "Loading market progress…",
      loadingArtTheme: "Loading art theme…",
    };

    expect(
      resolveTokenDetailFieldLabel({
        status: "error",
        loadingLabel: labels.loadingPrice,
        unavailableLabel: labels.unavailableLabel,
      }),
    ).toBe("Unavailable");
    expect(
      resolveTokenDetailFieldLabel({
        status: "error",
        loadingLabel: labels.loadingProgress,
        unavailableLabel: labels.unavailableLabel,
      }),
    ).toBe("Unavailable");
    expect(
      resolveTokenDetailFieldLabel({
        status: "error",
        loadingLabel: labels.loadingArtTheme,
        unavailableLabel: labels.unavailableLabel,
      }),
    ).toBe("Unavailable");
  });

  it("keeps loading copy only while token detail fields are idle or loading", () => {
    expect(
      resolveTokenDetailFieldLabel({
        status: "idle",
        loadingLabel: "Loading current price…",
        unavailableLabel: "Unavailable",
      }),
    ).toBe("Loading current price…");
    expect(
      resolveTokenDetailFieldLabel({
        status: "loading",
        loadingLabel: "Loading art theme…",
        unavailableLabel: "Unavailable",
      }),
    ).toBe("Loading art theme…");
    expect(
      resolveTokenDetailFieldLabel({
        status: "loaded",
        loadedValue: "   ",
        loadingLabel: "Loading market progress…",
        unavailableLabel: "Unavailable",
      }),
    ).toBe("Unavailable");
  });

  it("marks invalid token detail mints as curve errors instead of idle loading", () => {
    const source = readFileSync(
      fileURLToPath(import.meta.url).replace(
        /TokenDetailComponentBoundaries\.test\.tsx$/,
        "TokenSoulPanel.tsx",
      ),
      "utf8",
    );
    const invalidMintBlock = source.match(/if \(!parsedMint\) \{[\s\S]*?return;\n    \}/)?.[0];

    expect(invalidMintBlock).toContain('setLoadState({ status: "error"');
    expect(invalidMintBlock).toContain('setCurveLoadState({ status: "error"');
  });

  it("derives lifecycle state independently from the TokenSoulPanel monolith", () => {
    const state = getSoulLifecycleState({ connected: false });

    expect(state).toMatchObject({
      stage: "noSoulYet",
      activeStepIndex: 0,
      primaryAction: "tradeToGenerate",
      generation: "0",
      eligibilityReason: "noGeneratedSoul",
    });

    const markup = renderToStaticMarkup(
      <SoulLifecycleStateMachine
        state={state}
        labels={lifecycleLabels}
        claimHref="#claim-soul"
        galleryHref="/en/token/Mint/gallery"
        tradeHref="#trade-to-generate-souls"
      />,
    );

    expect(markup).toContain("Soul lifecycle");
    expect(markup).toContain("Trade to generate");
    expect(markup).toContain('href="#trade-to-generate-souls"');
    expect(markup).toContain('aria-current="step"');
  });

  it("renders the lightweight Soul Flow chart with volume and Soul event markers", () => {
    const markup = renderToStaticMarkup(
      <BondingCurveChart
        curve={bondingCurve()}
        currentPrice="0.000028 SOL/token"
        percentMinted="42.50%"
        totalMinted="8,925,000 tokens"
        labels={chartLabels}
        soulFlow={{
          generationCount: "7",
          claimCount: "2",
          labels: {
            volumeMovement: "Market / volume movement",
            generationMarker: "Soul generation",
            claimMarker: "Soul claim",
            noMarkers: "No markers yet",
          },
        }}
      />,
    );

    expect(markup).toContain('data-testid="soul-flow-chart"');
    expect(markup).toContain('data-testid="soul-flow-volume-bar"');
    expect(markup).toContain('data-testid="soul-flow-generation-marker"');
    expect(markup).toContain('data-testid="soul-flow-claim-marker"');
    expect(markup).toContain("Market / volume movement");
    expect(markup).toContain("Soul generation");
    expect(markup).toContain("Soul claim");
  });

  it("renders localized Soul Flow fallback copy when market data is missing", () => {
    const markup = renderToStaticMarkup(
      <BondingCurveChart
        curve={null}
        currentPrice="Unavailable"
        percentMinted="Unavailable"
        totalMinted="Unavailable"
        labels={chartLabels}
        soulFlow={{
          generationCount: "0",
          claimCount: "0",
          labels: {
            volumeMovement: "Market / volume movement",
            generationMarker: "Soul generation",
            claimMarker: "Soul claim",
            noMarkers: "No generation or claim markers yet",
          },
        }}
      />,
    );

    expect(markup).toContain('data-testid="bonding-curve-chart-fallback"');
    expect(markup).toContain('data-testid="soul-flow-chart-fallback"');
    expect(markup).toContain('data-testid="soul-flow-volume-bar"');
    expect(markup).toContain('data-testid="soul-flow-generation-marker"');
    expect(markup).toContain('data-testid="soul-flow-claim-marker"');
    expect(markup).toContain("No generation or claim markers yet");
  });

  it("renders a sticky proof rail without opening raw provenance by default", () => {
    const markup = renderToStaticMarkup(
      <TokenDetailProofRail
        galleryHref="/en/token/Mint/gallery"
        tradeHref="#trade-to-generate-souls"
        labels={{
          eyebrow: "Proof rail",
          title: "Market proof at a glance",
          body: "Sticky proof summary.",
          tradeSoul: "Trade Soul",
          openTrade: "Open trade",
          claimStatus: "Claim status",
          latestSoul: "Latest generated Soul",
          holders: "Holders",
          collectors: "Collectors",
          progress: "Progress",
          lockedSol: "Locked SOL",
          provenance: "Provenance",
          advancedSummary: "Advanced provenance",
        }}
        items={[
          { label: "Claim status", value: "Claimable", testId: "proof-rail-claim-status" },
          { label: "Latest generated Soul", value: "Generation #7", testId: "proof-rail-latest-soul" },
          { label: "Holders", value: "10,000", testId: "proof-rail-holders" },
          { label: "Collectors", value: "2", testId: "proof-rail-collectors" },
          { label: "Progress", value: "42.50%", testId: "proof-rail-progress" },
          { label: "Locked SOL", value: "100 SOL", testId: "proof-rail-locked-sol" },
          { label: "Provenance", value: "Seed…Hash", testId: "proof-rail-provenance" },
        ]}
        provenanceDetails={[{ label: "Soul account", value: "Soul1111111111111111111111111111111111111" }]}
      />,
    );

    expect(markup).toContain('data-testid="token-detail-proof-rail"');
    expect(markup).toContain("Trade Soul");
    expect(markup).toContain("Claim status");
    expect(markup).toContain("Latest generated Soul");
    expect(markup).toContain("Holders");
    expect(markup).toContain("Collectors");
    expect(markup).toContain("Progress");
    expect(markup).toContain("Locked SOL");
    expect(markup).toContain("Provenance");
    expect(markup).toContain("<details");
    expect(markup).not.toContain("<details open");
  });

  it("renders a stable Soul-first surface header contract outside TokenSoulPanel", () => {
    const markup = renderToStaticMarkup(
      <TokenDetailSurfaceHeader
        mint="Mint111111111111111111111111111111111111111"
        previewSvg="<svg><circle /></svg>"
        previewAlt="Latest generated Soul"
        artTheme="Symphony"
        generationCount="7"
        claimCount="2"
        currentPrice="0.000028 SOL/token"
        percentMinted="42.50%"
        claimState="Claimable"
        nextAction="Buy or sell to awaken the next Soul"
        animationProfile={deriveAnimatedSoulProfileForPreview({
          seed: "surface-header-test",
          theme: "fractal",
          provenanceSide: "buy",
          generation: 7,
          amount: 1_000_000,
        })}
        evolutionDisplay={deriveSoulEvolutionDisplayState({
          generation: 7,
          provenanceSide: "buy",
          tokenAmount: 10_000_000_000n,
          rarityTier: "epic",
          rarityScore: 820,
          claimCount: 2,
        })}
        tradeHref="#trade-to-generate-souls"
        claimHref="#claim-soul"
        timelineHref="#token-timeline"
        galleryHref="/en/token/Mint111111111111111111111111111111111111111/gallery"
        labels={{
          eyebrow: "Token detail",
          title: "Soul-first token detail",
          identity: "Token identity",
          latestSoul: "Latest Soul",
          trade: "Trade",
          claim: "Claim",
          progress: "Curve progress",
          provenance: "Story",
          artTheme: "Art theme",
          generations: "Generations",
          claims: "Claims",
          currentPrice: "Price",
          percentMinted: "Minted",
          openTrade: "Buy / Sell",
          openClaim: "Claim",
          openTimeline: "Story timeline",
          openGallery: "Gallery",
          nextAction: "Next action",
          mint: "Mint",
          motionCaveat: "Website motion preview only; on-chain art stays static.",
        }}
      />,
    );

    expect(markup).toContain('data-testid="token-detail-command-grid"');
    expect(markup).toContain('data-section="latest-soul-preview"');
    expect(markup).toContain('data-preview-density="compact-detail"');
    expect(markup).toContain('data-testid="token-detail-animated-soul-preview"');
    expect(markup).toContain('data-testid="token-detail-animated-soul-preview-flow-canvas"');
    expect(markup).toContain('data-testid="token-detail-animated-soul-preview-three-layer"');
    expect(markup).toContain('data-flow-motion="auto"');
    expect(markup).toContain('data-three-renderer="client-only"');
    expect(markup).toContain('data-three-fallback="none"');
    expect(markup).toContain('data-three-layer-state="client-pending"');
    expect(markup).toContain('data-motion-source="website-only"');
    expect(markup).toContain('data-testid="soul-evolution-display-state"');
    expect(markup).toContain('data-evolution-field="level"');
    expect(markup).toContain('data-evolution-field="stage"');
    expect(markup).toContain('data-evolution-field="energy"');
    expect(markup).toContain('data-evolution-field="generation"');
    expect(markup).toContain('data-evolution-field="rarity"');
    expect(markup).toContain('data-evolution-field="provenance"');
    expect(markup).toContain("staticLayerTitle");
    expect(markup).toContain("dynamicLayerTitle");
    expect(markup).toContain("data:image/svg+xml;charset=utf-8");
    expect(markup.indexOf('data-section="latest-soul-preview"')).toBeLessThan(
      markup.indexOf('data-section="trade-panel-access"'),
    );
    expect(markup.indexOf("Buy / Sell")).toBeLessThan(markup.indexOf("Story timeline"));
  });

  it("separates launch-guided core traits from system-generated traits without raw style params", () => {
    const markup = renderToStaticMarkup(
      <TokenDetailSurfaceHeader
        mint="Mint111111111111111111111111111111111111111"
        previewSvg="<svg><circle /></svg>"
        previewAlt="Latest generated Soul"
        artTheme="Fractal Structure"
        generationCount="7"
        claimCount="2"
        currentPrice="0.000028 SOL/token"
        percentMinted="42.50%"
        claimState="Claimable"
        nextAction="Buy or sell to awaken the next Soul"
        tradeHref="#trade-to-generate-souls"
        claimHref="#claim-soul"
        timelineHref="#token-timeline"
        galleryHref="/en/token/Mint111111111111111111111111111111111111111/gallery"
        traitGroups={{
          launchGuidedCoreTraits: [
            { category: "palette", traitType: "Palette", value: "ember", source: "launch" },
            { category: "form", traitType: "Form", value: "crystal", source: "launch" },
          ],
          systemCoreTraits: [
            { category: "mood", traitType: "Mood", value: "serene", source: "system" },
          ],
          generatedTraits: [
            { category: "character_archetype", traitType: "Character", value: "fractal_structure" },
          ],
        }}
        labels={{
          eyebrow: "Token detail",
          title: "Soul-first token detail",
          identity: "Token identity",
          latestSoul: "Latest Soul",
          trade: "Trade",
          claim: "Claim",
          progress: "Curve progress",
          provenance: "Story",
          artTheme: "Art theme",
          generations: "Generations",
          claims: "Claims",
          currentPrice: "Price",
          percentMinted: "Minted",
          openTrade: "Buy / Sell",
          openClaim: "Claim",
          openTimeline: "Story timeline",
          openGallery: "Gallery",
          nextAction: "Next action",
          mint: "Mint",
        }}
      />,
    );

    expect(markup).toContain('data-section="launch-guided-core-traits"');
    expect(markup).toContain('data-section="system-generated-traits"');
    expect(markup.indexOf('data-section="launch-guided-core-traits"')).toBeLessThan(
      markup.indexOf('data-section="system-generated-traits"'),
    );
    expect(markup).toContain("launchGuidedTitle");
    expect(markup).toContain("systemTitle");
    expect(markup).toContain("coreValues.palette.ember");
    expect(markup).toContain("coreValues.form.crystal");
    expect(markup).toContain("coreValues.mood.serene");
    expect(markup).toContain("values.character_archetype.fractal_structure");
    expect(markup).not.toContain("trait_palette=ember");
    expect(markup).not.toContain("styleParams");
    expect(markup).not.toContain("style_params");
  });

  it("keeps no-selection launch guidance separate from deterministic system-filled core traits", () => {
    const markup = renderToStaticMarkup(
      <TokenDetailSurfaceHeader
        mint="Mint111111111111111111111111111111111111111"
        previewSvg="<svg><circle /></svg>"
        previewAlt="Latest generated Soul"
        artTheme="Fractal Structure"
        generationCount="7"
        claimCount="2"
        currentPrice="0.000028 SOL/token"
        percentMinted="42.50%"
        claimState="Claimable"
        nextAction="Buy or sell to awaken the next Soul"
        tradeHref="#trade-to-generate-souls"
        claimHref="#claim-soul"
        timelineHref="#token-timeline"
        galleryHref="/en/token/Mint111111111111111111111111111111111111111/gallery"
        traitGroups={{
          launchGuidedCoreTraits: [],
          systemCoreTraits: [
            { category: "palette", traitType: "Palette", value: "solana", source: "system" },
            { category: "mood", traitType: "Mood", value: "radiant", source: "system" },
            { category: "form", traitType: "Form", value: "wave", source: "system" },
            { category: "background", traitType: "Background Style", value: "grid", source: "system" },
          ],
          generatedTraits: [],
        }}
        labels={{
          eyebrow: "Token detail",
          title: "Soul-first token detail",
          identity: "Token identity",
          latestSoul: "Latest Soul",
          trade: "Trade",
          claim: "Claim",
          progress: "Curve progress",
          provenance: "Story",
          artTheme: "Art theme",
          generations: "Generations",
          claims: "Claims",
          currentPrice: "Price",
          percentMinted: "Minted",
          openTrade: "Buy / Sell",
          openClaim: "Claim",
          openTimeline: "Story timeline",
          openGallery: "Gallery",
          nextAction: "Next action",
          mint: "Mint",
        }}
      />,
    );

    expect(markup).toContain('data-section="launch-guided-core-traits"');
    expect(markup).toContain("launchGuidedEmpty");
    expect(markup).toContain('data-section="system-generated-traits"');
    expect(markup).toContain("coreValues.palette.solana");
    expect(markup).toContain("coreValues.background.grid");
  });

  it("keeps market visuals and quote disclosure testable without panel internals", () => {
    const markup = renderToStaticMarkup(
      <>
        <LifecycleCurveVisual
          currentPrice="0.000028 SOL/token"
          percentMinted="42.50%"
          selfDeprecated={false}
          heading="Curve position"
          currentPriceLabel="Current price"
          progressLabel="Curve filled"
          tradePromptLabel="Trade to awaken Souls"
          spreadLabel="Price path"
        />
        <QuoteBreakdown
          title="Buy quote"
          quoteText="12.000000 tokens"
          minReceivedText="11.880000 tokens"
          lockFeeText="0.000100000 SOL"
          priceImpactText="+0.42%"
          balanceText="SOL balance: 2.000000000"
          routeText="Wallet → SolSoul curve → new Soul seed"
          prompt="Enter an amount."
          labels={{
            youReceive: "You receive",
            minReceived: "Minimum received",
            lockFee: "Locked fee",
            priceImpact: "Price impact",
            balance: "Wallet balance",
            route: "Route",
          }}
        />
      </>,
    );

    expect(markup).toContain("Curve position");
    expect(markup).toContain("width:42.50%");
    expect(markup).toContain('data-testid="quote-breakdown"');
    expect(markup).toContain("Wallet → SolSoul curve → new Soul seed");
  });

  it("renders the lightweight bonding curve chart with current point and MT markers", () => {
    const markup = renderToStaticMarkup(
      <BondingCurveChart
        curve={bondingCurve()}
        currentPrice="0.000028 SOL/token"
        percentMinted="42.50%"
        totalMinted="8,925,000 tokens"
        labels={chartLabels}
      />,
    );

    expect(markup).toContain('data-testid="bonding-curve-chart"');
    expect(markup).toContain('data-testid="bonding-curve-chart-svg"');
    expect(markup).toContain('data-testid="bonding-curve-current-point"');
    expect(markup).toContain('data-testid="bonding-curve-chart-mt-marker"');
    expect(markup).toContain('data-testid="bonding-curve-chart-cap-marker"');
    expect(markup).toContain("10,000 tokens / MT");
    expect(markup).toContain("2,100 MT cap");
    expect(markup).toContain("Current point");
    expect(markup).toContain("Minted progress");
    expect(markup).toContain("42.50%");
    expect(markup).toContain("21,000,000 fungible-token curve supply");
  });

  it("shows a safe localized chart fallback when curve data is missing or invalid", () => {
    const missingMarkup = renderToStaticMarkup(
      <BondingCurveChart
        curve={null}
        currentPrice="Unavailable"
        percentMinted="Unavailable"
        totalMinted="Unavailable"
        labels={chartLabels}
      />,
    );
    const invalidMarkup = renderToStaticMarkup(
      <BondingCurveChart
        curve={bondingCurve({ totalMinted: 21_000_000_000_001n })}
        currentPrice="Unavailable"
        percentMinted="Unavailable"
        totalMinted="Unavailable"
        labels={chartLabels}
      />,
    );

    for (const markup of [missingMarkup, invalidMarkup]) {
      expect(markup).toContain('data-testid="bonding-curve-chart-fallback"');
      expect(markup).toContain("Curve chart unavailable");
      expect(markup).toContain("Live curve data is missing");
      expect(markup).not.toContain('data-testid="bonding-curve-current-point"');
      expect(markup).not.toContain("10,000 tokens / MT");
      expect(markup).not.toContain("2,100 MT cap");
      expect(markup).not.toContain("0.000028 SOL/token");
      expect(markup).not.toContain("42.50%");
      expect(markup).not.toContain("8,925,000 tokens");
    }
  });
});
