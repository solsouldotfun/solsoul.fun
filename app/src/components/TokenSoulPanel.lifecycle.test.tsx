// @ts-nocheck — justified: pre-curve-refactor props not in current component type; pre-existing fixture drift
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  LifecycleCurveVisual,
  MarketCurveOverview,
  QuoteBreakdown,
  BoundarySettlementPreviewCard,
  PreSignTransactionReviewCard,
  SoulRarityPreviewCard,
  SoulLifecycleStateMachine,
  TokenDetailSurfaceHeader,
  TradeGenerationMoment,
  buildBoundarySettlementDisplay,
  fallbackGenerationProvenance,
  getDirectTransferDisabledReason,
  getSoulLifecycleState,
  getTradeDisabledReason,
  type SoulLifecycleStage,
} from "./TokenSoulPanel";
import { TokenTimelineEventList, type TokenTimelineLabels } from "./TokenTimeline";
import { PublicKey } from "@solana/web3.js";
import {
  SOUL_PROVENANCE_SIDE,
  MIN_CLAIM_BALANCE,
  decodeReceiptAccount,
  deriveReceiptPda,
  RECEIPT_ACCOUNT_SIZE,
  RECEIPT_BOUND_BOUNDARY_OFFSET,
  RECEIPT_CLAIMANT_OFFSET,
  RECEIPT_LIFECYCLE_STATE,
  RECEIPT_LIFECYCLE_STATE_OFFSET,
  RECEIPT_NFT_MINT_OFFSET,
  RECEIPT_SEQUENCE_OFFSET,
  RECEIPT_SOUL_OFFSET,
  RECEIPT_TOKEN_MINT_OFFSET,
  type GenerationProvenance,
  type SettlementReceiptCandidate,
  type SoulAccount,
} from "sdk";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string; className?: string }>) =>
    React.createElement("a", { href, ...props }, children),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) => {
    const labels: Record<string, string> = {
      "soulTraits.title": "Generated traits",
      "soulTraits.systemTitle": "System-generated traits",
      "soulTraits.launchGuidedTitle": "Launch-guided core traits",
      "soulTraits.launchGuidedEmpty": "No launch-guided core trait was selected.",
      "soulTraits.categories.character_archetype": "Character",
      "soulTraits.categories.goggles_eyes": "Goggles/Eyes",
      "soulTraits.coreCategories.palette": "Palette",
      "soulTraits.coreCategories.mood": "Mood",
      "soulTraits.coreCategories.form": "Form",
      "soulTraits.coreCategories.background": "Background",
      "soulTraits.coreValues.palette.ember": "Ember",
      "soulTraits.coreValues.mood.serene": "Serene",
      "soulTraits.coreValues.form.crystal": "Crystal",
      "soulTraits.coreValues.background.grid": "Grid",
      "soulTraits.values.character_archetype.neonpuff_unicorn": "NeonPuff Unicorn",
      "soulTraits.values.goggles_eyes.rainbow_goggles": "Rainbow Goggles",
      "soulRarity.title": "Soul rarity",
      "soulRarity.score": "Soul Score {score}",
      "soulRarity.generation": "Generation",
      "soulRarity.traits": "Key traits",
      "soulRarity.tiers.rare": "Rare",
      "soulRarity.traitKinds.generationBand": "Generation band",
      "soulRarity.traitKinds.tradeSignal": "Trade signal",
      "soulRarity.traitKinds.seedSource": "Seed source",
      "soulRarity.traitKinds.claimRank": "Claim rank",
      "soulRarity.traitKinds.artTheme": "Art theme",
      "soulRarity.traitValues.generationBand.early": "Early run",
      "soulRarity.traitValues.tradeSignal.buy": "Buy-generated",
      "soulRarity.traitValues.seedSource.onChainSeedHash": "Seed hash present",
      "soulRarity.traitValues.claimRank.earlyClaim": "Early claim",
      "soulRarity.traitValues.artTheme.monochrome": "Monochrome renderer",
      "preSignReview.ariaLabel": "Pre-sign decoded transaction review",
      "preSignReview.title": "Pre-sign decoded transaction review",
      "preSignReview.summary": "Cluster: {cluster}; blockhash: {blockhash}; fee payer: {feePayer}",
      "preSignReview.pending": "pending",
      "preSignReview.programIds": "Program IDs: {programIds}",
      "preSignReview.instructionTitle": "#{index} Program {programId}",
      "preSignReview.accounts": "Accounts: {accounts}",
      "preSignReview.receiptIntentTitle": "Receipt settlement intent",
      "preSignReview.receiptIntentBody": "{state} {amount} base units from {source}.",
      "preSignReview.unknownSource": "unknown source",
      "preSignReview.unknown": "unknown",
      "preSignReview.receiptCapacity": "Active receipts: {activeReceiptCount}; post-move whole-token capacity: {postWholeUnits}.",
      "preSignReview.selectedReceipts": "Selected receipts: {receipts}",
      "preSignReview.none": "none",
      "preSignReview.receiptSettlementStates.burned": "烧毁选中的收据",
      "preSignReview.receiptSettlementStates.forfeited": "失效选中的收据",
      "preSignReview.flags.signer": "signer",
      "preSignReview.flags.nonSigner": "non-signer",
      "preSignReview.flags.writable": "writable",
      "preSignReview.flags.readonly": "readonly",
    };
    const message = labels[`${namespace}.${key}`] ?? key;
    return Object.entries(values ?? {}).reduce(
      (text, [valueKey, value]) => text.replace(`{${valueKey}}`, value),
      message,
    );
  },
}));

type TradeDisabledParams = Parameters<typeof getTradeDisabledReason>[0];
type DirectTransferDisabledParams = Parameters<typeof getDirectTransferDisabledReason>[0];

const sellReadyParams: TradeDisabledParams = {
  action: "sell",
  connected: true,
  hasPublicKey: true,
  riskAcknowledged: true,
  curveStatus: "loaded",
  isGraduated: false,
  hasValidQuote: true,
  tokenBalanceStatus: "loaded",
  tokenBalanceBaseUnits: 2_000_000n,
};

function sellDisabledReason(overrides: Partial<TradeDisabledParams> = {}) {
  return getTradeDisabledReason({
    ...sellReadyParams,
    ...overrides,
  });
}

const directTransferReadyParams: DirectTransferDisabledParams = {
  connected: true,
  hasPublicKey: true,
  tokenBalanceStatus: "loaded",
  tokenBalanceBaseUnits: 2_000_000n,
  requestedTransferBaseUnits: 1_000_000n,
  hasRecipient: true,
};

function directTransferDisabledReason(
  overrides: Partial<DirectTransferDisabledParams> = {},
) {
  return getDirectTransferDisabledReason({
    ...directTransferReadyParams,
    ...overrides,
  });
}

function soul(overrides: Partial<SoulAccount> = {}): SoulAccount {
  return {
    mint: PublicKey.default,
    authority: PublicKey.default,
    createdAt: 0n,
    generationCount: 0n,
    lastSvgLen: 0,
    lastSvg: "",
    lastSvgBytes: new Uint8Array(),
    templateLen: 0,
    baseSvgTemplate: "",
    baseSvgTemplateBytes: new Uint8Array(),
    styleParamsLen: 0,
    styleParams: "",
    styleParamsBytes: new Uint8Array(),
    minClaimBalance: MIN_CLAIM_BALANCE,
    claimCount: 0n,
    memeSymbol: "SOUL",
    memeSymbolBytes: new Uint8Array(),
    memeSymbolLen: 4,
    targetAmm: 0,
    provenanceGeneration: 0n,
    provenanceSide: SOUL_PROVENANCE_SIDE.None,
    provenanceAmount: 0n,
    provenanceTokenAmount: 0n,
    provenanceTrader: PublicKey.default,
    provenanceTokenAccount: PublicKey.default,
    provenanceMint: PublicKey.default,
    provenanceSoul: PublicKey.default,
    provenanceSeedHash: new Uint8Array(8),
    provenanceSeedHashHex: "0000000000000000",
    ...overrides,
  };
}

function publicKey(byte: number): PublicKey {
  return new PublicKey(new Uint8Array(32).fill(byte));
}

function writeU64(data: Uint8Array, value: bigint, offset: number) {
  new DataView(data.buffer).setBigUint64(offset, value, true);
}

function receiptCandidate({
  owner,
  mint,
  soul,
  sequence,
  boundary,
}: {
  owner: PublicKey;
  mint: PublicKey;
  soul: PublicKey;
  sequence: bigint;
  boundary: bigint;
}): SettlementReceiptCandidate {
  const data = new Uint8Array(RECEIPT_ACCOUNT_SIZE);
  data.set(soul.toBytes(), RECEIPT_SOUL_OFFSET);
  data.set(owner.toBytes(), RECEIPT_CLAIMANT_OFFSET);
  data.set(mint.toBytes(), RECEIPT_TOKEN_MINT_OFFSET);
  data.set(PublicKey.unique().toBytes(), RECEIPT_NFT_MINT_OFFSET);
  writeU64(data, sequence, RECEIPT_SEQUENCE_OFFSET);
  writeU64(data, boundary, RECEIPT_BOUND_BOUNDARY_OFFSET);
  data[RECEIPT_LIFECYCLE_STATE_OFFSET] = RECEIPT_LIFECYCLE_STATE.Active;
  return {
    receiptAccount: deriveReceiptPda(soul, sequence),
    receipt: decodeReceiptAccount(data),
  };
}

const provenanceMint = publicKey(1);
const provenanceTrader = publicKey(2);
const provenanceTokenAccount = publicKey(3);
const provenanceSoul = publicKey(4);

function generationProvenance(
  overrides: Partial<GenerationProvenance> = {},
): GenerationProvenance {
  return {
    generation: 7n,
    side: "buy",
    amount: 990_000n,
    trader: provenanceTrader,
    tokenAccount: provenanceTokenAccount,
    tokenMint: provenanceMint,
    soul: provenanceSoul,
    seedHash: "abcdef0123456789",
    source: "on-chain-soul-account",
    ...overrides,
  };
}

function expectLifecycleStage(
  expected: SoulLifecycleStage,
  params: Parameters<typeof getSoulLifecycleState>[0],
) {
  expect(getSoulLifecycleState(params).stage).toBe(expected);
}

function firstImageSrc(markup: string): string {
  const src = markup.match(/<img[^>]+src="([^"]+)"/)?.[1];
  expect(src).toBeTruthy();
  return src ?? "";
}

describe("Token lifecycle above-the-fold UX", () => {
  it("does not ship a fake fallback Soul SVG when no real generation exists", () => {
    const source = readFileSync(fileURLToPath(import.meta.url).replace(/\.lifecycle\.test\.tsx$/, ".tsx"), "utf8");

    expect(source).not.toContain('data-soul-art="pd9-monochrome-sample"');
    expect(source).toContain("autoIssue.noPreview");
    expect(source).not.toContain("🦄");
    expect(source.toLowerCase()).not.toContain("rainbow");
    expect(source.toLowerCase()).not.toContain("unicorn");
    expect(source.toLowerCase()).not.toContain("hsl(");
  });

  it("separates identity, preview, trade, claim, progress, and provenance access in the above-fold command grid", () => {
    const markup = renderToStaticMarkup(
      <TokenDetailSurfaceHeader
        mint="TokenMint111111111111111111111111111111"
        previewSvg="<svg><circle /></svg>"
        previewAlt="Latest generated Soul preview"
        artTheme="Monochrome Soul"
        generationCount="8"
        claimCount="3"
        currentPrice="0.000028 SOL/token"
        percentMinted="42.50%"
        claimState="Claimable"
        nextAction="Claim Soul"
        tradeHref="#trade-to-generate-souls"
        claimHref="#claim-soul"
        timelineHref="#token-timeline"
        galleryHref="/en/token/TokenMint111111111111111111111111111111/gallery"
        generatedTraits={[
          { category: "character_archetype", traitType: "Character", value: "neonpuff_unicorn" },
          { category: "goggles_eyes", traitType: "Goggles/Eyes", value: "rainbow_goggles" },
        ]}
        labels={{
          eyebrow: "Token command center",
          title: "Token detail above-fold command grid",
          identity: "Identity",
          latestSoul: "Latest Soul",
          trade: "Buy / sell panel",
          claim: "Claim state",
          progress: "Bonding progress",
          provenance: "Provenance access",
          artTheme: "Art theme",
          generations: "Generations",
          claims: "Claims",
          currentPrice: "Current price",
          openTrade: "Open buy / sell",
          openClaim: "Open claim",
          openTimeline: "Timeline / provenance",
          openGallery: "Token gallery",
          nextAction: "Next action",
          mint: "Mint",
        }}
      />,
    );

    expect(markup).toContain('data-testid="token-detail-command-grid"');
    expect(markup).toContain('data-section="identity"');
    expect(markup).toContain('data-section="latest-soul-preview"');
    expect(markup).toContain('data-section="trade-panel-access"');
    expect(markup).toContain('data-section="claim-state"');
    expect(markup).toContain('data-section="bonding-progress"');
    expect(markup).toContain('data-section="provenance-access"');
    expect(markup).toContain("TokenMint111111111111111111111111111111");
    expect(markup).toContain("Latest generated Soul preview");
    expect(markup).toContain("Buy / sell panel");
    expect(markup).toContain("Claimable");
    expect(markup).toContain("42.50%");
    expect(markup).toContain("Generations");
    expect(markup).toContain("Claims");
    expect(markup).toContain("System-generated traits");
    expect(markup).toContain("NeonPuff Unicorn");
    expect(markup).toContain("Rainbow Goggles");
    expect(markup).toContain('href="#trade-to-generate-souls"');
    expect(markup).toContain('href="#claim-soul"');
    expect(markup).toContain('href="#token-timeline"');
    expect(markup).not.toContain("Soul PDA");
    expect(markup).not.toContain("RPC endpoint");
  });

  it("normalizes the token detail latest Soul preview SVG for browser image rendering", () => {
    const markup = renderToStaticMarkup(
      <TokenDetailSurfaceHeader
        mint="TokenMint111111111111111111111111111111"
        previewSvg='<svg viewBox="0 0 256 256" data-soul="pd9-monochrome"><rect width="256" height="256" fill="#f7f7f2"/></svg>'
        previewAlt="Latest generated Soul preview"
        artTheme="Monochrome Soul"
        generationCount="8"
        claimCount="3"
        currentPrice="0.000028 SOL/token"
        percentMinted="42.50%"
        claimState="Claimable"
        nextAction="Claim Soul"
        tradeHref="#trade-to-generate-souls"
        claimHref="#claim-soul"
        timelineHref="#token-timeline"
        galleryHref="/en/token/TokenMint111111111111111111111111111111/gallery"
        labels={{
          eyebrow: "Token command center",
          title: "Token detail above-fold command grid",
          identity: "Identity",
          latestSoul: "Latest Soul",
          trade: "Buy / sell panel",
          claim: "Claim state",
          progress: "Bonding progress",
          provenance: "Provenance access",
          artTheme: "Art theme",
          generations: "Generations",
          claims: "Claims",
          currentPrice: "Current price",
          openTrade: "Open buy / sell",
          openClaim: "Open claim",
          openTimeline: "Timeline / provenance",
          openGallery: "Token gallery",
          nextAction: "Next action",
          mint: "Mint",
        }}
      />,
    );
    const decoded = decodeURIComponent(firstImageSrc(markup).replace("data:image/svg+xml;charset=utf-8,", ""));

    expect(decoded).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"');
    expect(decoded).toContain('data-soul="pd9-monochrome"');
  });

  it("shows the token detail art theme alongside generation and claim totals", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TokenDetailSurfaceHeader as unknown as React.ComponentType<Record<string, unknown>>, {
        mint: "TokenMint111111111111111111111111111111",
        previewSvg: "<svg><circle /></svg>",
        previewAlt: "Latest generated Soul preview",
        artTheme: "Hexagram Oracle",
        generationCount: "8",
        claimCount: "3",
        currentPrice: "0.000028 SOL/token",
        claimState: "Claimable",
        nextAction: "Claim Soul",
        tradeHref: "#trade-to-generate-souls",
        claimHref: "#claim-soul",
        timelineHref: "#token-timeline",
        galleryHref: "/en/token/TokenMint111111111111111111111111111111/gallery",
        labels: {
          eyebrow: "Token command center",
          title: "Token detail above-fold command grid",
          identity: "Identity",
          latestSoul: "Latest Soul",
          trade: "Buy / sell panel",
          claim: "Claim state",
          progress: "Bonding progress",
          provenance: "Provenance access",
          artTheme: "Art theme",
          generations: "Generations",
          claims: "Claims",
          currentPrice: "Current price",
          openTrade: "Open buy / sell",
          openClaim: "Open claim",
          openTimeline: "Timeline / provenance",
          openGallery: "Token gallery",
          nextAction: "Next action",
          mint: "Mint",
        },
      }),
    );

    expect(markup).toContain('data-section="art-theme"');
    expect(markup).toContain("Art theme");
    expect(markup).toContain("Hexagram Oracle");
    expect(markup).toContain("Generations");
    expect(markup).toContain("Claims");
  });

  it("derives each visible Soul lifecycle state and its primary next action", () => {
    expect(getSoulLifecycleState({ connected: false }).primaryAction).toBe("tradeToGenerate");
    expectLifecycleStage("noSoulYet", {
      connected: false,
      soul: soul({ generationCount: 0n, lastSvgLen: 0, claimCount: 0n }),
    });

    expect(getSoulLifecycleState({
      connected: false,
      soul: soul({
        generationCount: 2n,
        lastSvgLen: 128,
        lastSvg: "<svg />",
        claimCount: 0n,
        provenanceGeneration: 2n,
        provenanceSide: SOUL_PROVENANCE_SIDE.Buy,
        provenanceAmount: 5_000_000_000n,
        provenanceTokenAmount: MIN_CLAIM_BALANCE,
        provenanceTrader,
      }),
    })).toMatchObject({
      stage: "generatedUnclaimed",
      primaryAction: "connectWallet",
      generation: "2",
    });

    expect(getSoulLifecycleState({
      connected: true,
      walletTokenBalanceBaseUnits: MIN_CLAIM_BALANCE,
      walletPublicKey: provenanceTrader,
      soul: soul({
        generationCount: 2n,
        lastSvgLen: 128,
        lastSvg: "<svg />",
        claimCount: 1n,
        provenanceGeneration: 2n,
        provenanceSide: SOUL_PROVENANCE_SIDE.Buy,
        provenanceAmount: 5_000_000_000n,
        provenanceTokenAmount: MIN_CLAIM_BALANCE,
        provenanceTrader,
      }),
    })).toMatchObject({
      stage: "claimable",
      primaryAction: "claimSoul",
      activeStepIndex: 2,
    });

    expect(getSoulLifecycleState({
      connected: true,
      walletTokenBalanceBaseUnits: MIN_CLAIM_BALANCE - 1n,
      walletPublicKey: provenanceTrader,
      soul: soul({
        generationCount: 2n,
        lastSvgLen: 128,
        lastSvg: "<svg />",
        claimCount: 1n,
        provenanceGeneration: 2n,
        provenanceSide: SOUL_PROVENANCE_SIDE.Buy,
        provenanceAmount: 5_000_000_000n,
        provenanceTokenAmount: MIN_CLAIM_BALANCE,
        provenanceTrader,
      }),
    })).toMatchObject({
      stage: "ineligible",
      primaryAction: "buyOrHold",
    });

    expect(getSoulLifecycleState({
      connected: true,
      walletTokenBalanceBaseUnits: 9_000_000n,
      walletPublicKey: provenanceTrader,
      soul: soul({
        generationCount: 2n,
        lastSvgLen: 128,
        lastSvg: "<svg />",
        claimCount: 1n,
        provenanceGeneration: 2n,
        provenanceSide: SOUL_PROVENANCE_SIDE.Buy,
        provenanceAmount: 5_000_000_000n,
        provenanceTokenAmount: MIN_CLAIM_BALANCE - 1n,
        provenanceTrader,
      }),
    })).toMatchObject({
      stage: "ineligible",
      primaryAction: "tradeToGenerate",
      eligibilityReason: "subWholeProvenance",
    });

    expect(getSoulLifecycleState({
      connected: true,
      walletTokenBalanceBaseUnits: 2_000_000n,
      soul: soul({ generationCount: 2n, lastSvgLen: 128, lastSvg: "<svg />", claimCount: 2n }),
    })).toMatchObject({
      stage: "claimedInCollection",
      primaryAction: "viewCollection",
      activeStepIndex: 3,
    });
  });

  it("renders the visible state machine before technical account details", () => {
    const state = getSoulLifecycleState({
      connected: true,
      walletTokenBalanceBaseUnits: MIN_CLAIM_BALANCE - 1n,
      walletPublicKey: provenanceTrader,
      soul: soul({
        generationCount: 4n,
        lastSvgLen: 128,
        lastSvg: "<svg />",
        claimCount: 3n,
        provenanceGeneration: 4n,
        provenanceSide: SOUL_PROVENANCE_SIDE.Buy,
        provenanceAmount: 5_000_000_000n,
        provenanceTokenAmount: MIN_CLAIM_BALANCE,
        provenanceTrader,
      }),
    });
    const markup = renderToStaticMarkup(
      <SoulLifecycleStateMachine
        state={state}
        claimHref="#claim-soul"
        galleryHref="/en/token/TokenMint111111111111111111111111111111/gallery"
        tradeHref="#trade-to-generate-souls"
        labels={{
          eyebrow: "Soul lifecycle",
          title: "Visible Soul lifecycle state machine",
          body: "Trades generate Soul candidates and holder balance decides claim eligibility.",
          currentState: "Current state",
          nextAction: "One clear next action",
          generation: "Generation #4",
          requiredBalance: "Claim gate: hold 1.000000 meme token",
          steps: {
            noSoulYet: {
              label: "No Soul yet",
              description: "Trade on the bonding curve to generate the first Soul.",
            },
            generatedUnclaimed: {
              label: "Generated / unclaimed",
              description: "A generated Soul candidate exists.",
            },
            claimable: {
              label: "Claimable",
              description: "Claim the generated Soul into your collection.",
            },
            ineligible: {
              label: "Ineligible",
              description: "Buy or hold at least 10,000 tokens before claiming.",
            },
            claimedInCollection: {
              label: "Claimed / in collection",
              description: "View the collection or trade to generate another candidate.",
            },
          },
          actions: {
            tradeToGenerate: "Trade to generate",
            connectWallet: "Connect wallet to check eligibility",
            claimSoul: "Claim Soul",
            buyOrHold: "Buy or hold 1 token",
            viewCollection: "View collection",
          },
        }}
      />,
    );

    expect(markup).toContain("Visible Soul lifecycle state machine");
    expect(markup).toContain("No Soul yet");
    expect(markup).toContain("Generated / unclaimed");
    expect(markup).toContain("Ineligible");
    expect(markup).toContain("Claimed / in collection");
    expect(markup).toContain("One clear next action");
    expect(markup).toContain("Buy or hold 1 token");
    expect(markup).not.toContain("Soul PDA");
    expect(markup).not.toContain("RPC endpoint");
  });

  it("does not link generated/unclaimed wallet-connect CTA to the trade section", () => {
    const state = getSoulLifecycleState({
      connected: false,
      soul: soul({
        generationCount: 2n,
        lastSvgLen: 128,
        lastSvg: "<svg />",
        claimCount: 0n,
        provenanceGeneration: 2n,
        provenanceSide: SOUL_PROVENANCE_SIDE.Buy,
        provenanceAmount: 5_000_000_000n,
        provenanceTokenAmount: MIN_CLAIM_BALANCE,
        provenanceTrader,
      }),
    });
    const markup = renderToStaticMarkup(
      <SoulLifecycleStateMachine
        state={state}
        claimHref="#claim-soul"
        galleryHref="/en/token/TokenMint111111111111111111111111111111/gallery"
        tradeHref="#trade-to-generate-souls"
        labels={{
          eyebrow: "Soul lifecycle",
          title: "Visible Soul lifecycle state machine",
          body: "Trades generate Soul candidates and holder balance decides claim eligibility.",
          currentState: "Current state",
          nextAction: "One clear next action",
          generation: "Generation #2",
          requiredBalance: "Claim gate: hold 1.000000 meme token",
          steps: {
            noSoulYet: {
              label: "No Soul yet",
              description: "Trade on the bonding curve to generate the first Soul.",
            },
            generatedUnclaimed: {
              label: "Generated / unclaimed",
              description: "A generated Soul candidate exists.",
            },
            claimable: {
              label: "Claimable",
              description: "Claim the generated Soul into your collection.",
            },
            ineligible: {
              label: "Ineligible",
              description: "Buy or hold at least 10,000 tokens before claiming.",
            },
            claimedInCollection: {
              label: "Claimed / in collection",
              description: "View the collection or trade to generate another candidate.",
            },
          },
          actions: {
            tradeToGenerate: "Trade to generate",
            connectWallet: "Connect wallet to check eligibility",
            claimSoul: "Claim Soul",
            buyOrHold: "Buy or hold 1 token",
            viewCollection: "View collection",
          },
        }}
      />,
    );

    expect(markup).toContain("Connect wallet to check eligibility");
    expect(markup).toContain('href="#connect-wallet"');
    expect(markup).not.toContain(
      'href="#trade-to-generate-souls">Connect wallet to check eligibility',
    );
  });

  it("keeps trade-to-generate lifecycle action linked to the trade section", () => {
    const state = getSoulLifecycleState({
      connected: false,
      soul: soul({ generationCount: 0n, lastSvgLen: 0, claimCount: 0n }),
    });
    const markup = renderToStaticMarkup(
      <SoulLifecycleStateMachine
        state={state}
        claimHref="#claim-soul"
        galleryHref="/en/token/TokenMint111111111111111111111111111111/gallery"
        tradeHref="#trade-to-generate-souls"
        labels={{
          eyebrow: "Soul lifecycle",
          title: "Visible Soul lifecycle state machine",
          body: "Trades generate Soul candidates and holder balance decides claim eligibility.",
          currentState: "Current state",
          nextAction: "One clear next action",
          generation: "Generation #0",
          requiredBalance: "Claim gate: hold 1.000000 meme token",
          steps: {
            noSoulYet: {
              label: "No Soul yet",
              description: "Trade on the bonding curve to generate the first Soul.",
            },
            generatedUnclaimed: {
              label: "Generated / unclaimed",
              description: "A generated Soul candidate exists.",
            },
            claimable: {
              label: "Claimable",
              description: "Claim the generated Soul into your collection.",
            },
            ineligible: {
              label: "Ineligible",
              description: "Buy or hold at least 10,000 tokens before claiming.",
            },
            claimedInCollection: {
              label: "Claimed / in collection",
              description: "View the collection or trade to generate another candidate.",
            },
          },
          actions: {
            tradeToGenerate: "Trade to generate",
            connectWallet: "Connect wallet to check eligibility",
            claimSoul: "Claim Soul",
            buyOrHold: "Buy or hold 1 token",
            viewCollection: "View collection",
          },
        }}
      />,
    );

    expect(markup).toContain('href="#trade-to-generate-souls">Trade to generate');
  });

  it("renders the Unipeg-like lifecycle terminology and progress visual", () => {
    const markup = renderToStaticMarkup(
      <LifecycleCurveVisual
        currentPrice="0.000028 SOL/token"
        percentMinted="42.50%"
        graduated={false}
        heading="Bonding curve"
        currentPriceLabel="Current price"
        progressLabel="Graduation progress"
        tradePromptLabel="Trade to generate Souls"
        spreadLabel="Spread curve visual"
      />,
    );

    expect(markup).toContain("Bonding curve");
    expect(markup).toContain("Current price");
    expect(markup).toContain("Graduation progress");
    expect(markup).toContain("Trade to generate Souls");
    expect(markup).toContain("Spread curve visual");
    expect(markup).toContain("width:42.50%");
  });

  it("renders Sat0-like market metrics and a compact curve chart", () => {
    const markup = renderToStaticMarkup(
      <MarketCurveOverview
        currentPrice="0.000028 SOL/token"
        cumulativeSol="12.5 SOL"
        totalMinted="1,000 tokens"
        percentMinted="42.50%"
        oneSolQuote="1 SOL → 15 tokens"
        selfDeprecated={false}
        labels={{
          title: "Curve market",
          body: "Quick read before swapping.",
          price: "Price",
          reserve: "Reserve",
          circulating: "Circulating",
          progress: "Curve filled",
          oneSolQuote: "1 SOL quote",
          maxBuy: "Max buy: 5 SOL per transaction",
          lockFee: "Buy quotes include the 0.1% lock fee.",
          live: "Live",
          deprecated: "Curve deprecated",
        }}
      />,
    );

    expect(markup).toContain('data-testid="market-curve-overview"');
    expect(markup).toContain("Curve market");
    expect(markup).toContain("0.000028 SOL/token");
    expect(markup).toContain("12.5 SOL");
    expect(markup).toContain("1 SOL → 15 tokens");
    expect(markup).toContain("width:42.50%");
  });

  it("renders quote explanation rows for route, fee, slippage, and balance", () => {
    const markup = renderToStaticMarkup(
      <QuoteBreakdown
        title="Buy quote"
        quoteText="12.000000 tokens"
        minReceivedText="11.880000 tokens"
        lockFeeText="0.000100000 SOL"
        priceImpactText="+0.42%"
        balanceText="SOL balance: 2.000000000"
        routeText="Wallet → SolSoul bonding curve → Token-2022 tokens + new Soul seed"
        prompt="Enter an amount."
        labels={{
          youReceive: "You receive",
          minReceived: "Minimum received",
          lockFee: "Locked fee",
          priceImpact: "Price impact",
          balance: "Wallet balance",
          route: "Route",
        }}
      />,
    );

    expect(markup).toContain('data-testid="quote-breakdown"');
    expect(markup).toContain("Buy quote");
    expect(markup).toContain("12.000000 tokens");
    expect(markup).toContain("Minimum received");
    expect(markup).toContain("0.000100000 SOL");
    expect(markup).toContain("+0.42%");
    expect(markup).toContain("Token-2022 tokens + new Soul seed");
  });

  it("renders deterministic Soul rarity preview with score, seed, and traits", () => {
    const markup = renderToStaticMarkup(
      <SoulRarityPreviewCard
        previewSvg="<svg><circle /></svg>"
        rarity={{
          tier: "rare",
          score: 777,
          generation: "7",
          traits: [
            { kind: "generationBand", value: "early" },
            { kind: "tradeSignal", value: "buy" },
            { kind: "seedSource", value: "onChainSeedHash" },
            { kind: "claimRank", value: "earlyClaim" },
            { kind: "artTheme", value: "monochrome" },
          ],
        }}
        generation="7"
        seedHash="abcdef0123456789"
        claimState="Claimable"
        generatedTraits={[
          { category: "character_archetype", traitType: "Character", value: "neonpuff_unicorn" },
        ]}
        labels={{
          title: "Soul rarity preview",
          body: "Rarity is deterministic.",
          deterministicSeed: "Deterministic seed",
          claimStatus: "Claim status",
          generated: "Generated Soul rarity is previewable before claim.",
          notGenerated: "Trade first.",
          previewAlt: "Soul rarity preview artwork",
        }}
      />,
    );

    expect(markup).toContain('data-testid="soul-rarity-preview"');
    expect(markup).toContain("Soul rarity preview");
    expect(markup).toContain("Rare");
    expect(markup).toContain("Soul Score 777");
    expect(markup).toContain("abcdef0123456789");
    expect(markup).toContain("Buy-generated");
    expect(markup).toContain("NeonPuff Unicorn");
  });

  it("renders a post-trade generated Soul moment with preview and next actions", () => {
    const markup = renderToStaticMarkup(
      <TradeGenerationMoment
        action="sell"
        amount="1.000000"
        amountLabel="Trade amount"
        claimLabel="Review buy-backed claim rules"
        claimSemantics="This sell-generated Soul is a visual market moment only. It is not a claimable MT/Soul NFT."
        generation="3"
        generatedLabel="Generated Soul #3"
        nextActionLabel="Next action"
        previewAlt="Generated Soul preview"
        seedHash="abcdef0123456789"
        seedHashLabel="Seed hash"
        signature="SellSig11111111111111111111111111111111111111"
        signatureLabel="Finalized sell signature"
        side="Sell"
        sideLabel="Side"
        tradeAgainLabel="Trade again"
        trader="8uAP…cd1i"
        traderLabel="Trader"
        transactionHref="https://explorer.solana.com/tx/SellSig11111111111111111111111111111111111111?cluster=devnet"
        transactionLabel="Explorer transaction"
        viewGalleryLabel="View collection"
        viewTokenGalleryHref="/en/token/TokenMint111111111111111111111111111111/gallery"
        svg="<svg><circle /></svg>"
      />,
    );

    expect(markup).toContain("Generated Soul #3");
    expect(markup).toContain("Side");
    expect(markup).toContain("Sell");
    expect(markup).toContain("Generated Soul preview");
    expect(markup).toContain("Finalized sell signature");
    expect(markup).toContain("SellSig11111111111111111111111111111111111111");
    expect(markup).toContain("Trade amount");
    expect(markup).toContain("1.000000");
    expect(markup).toContain("Trader");
    expect(markup).toContain("8uAP…cd1i");
    expect(markup).toContain("Seed hash");
    expect(markup).toContain("abcdef0123456789");
    expect(markup).toContain("Explorer transaction");
    expect(markup).toContain(
      "https://explorer.solana.com/tx/SellSig11111111111111111111111111111111111111?cluster=devnet",
    );
    expect(markup).toContain("Review buy-backed claim rules");
    expect(markup).toContain("visual market moment only");
    expect(markup).toContain("not a claimable MT/Soul NFT");
    expect(markup).toContain("View collection");
    expect(markup).toContain("Trade again");
    expect(markup).toContain("data:image/svg+xml;charset=utf-8");
  });

  it("does not attach the current buy signature to stale same-side provenance with an amount mismatch", () => {
    const result = fallbackGenerationProvenance({
      soul: soul({
        generationCount: 7n,
        latestGenerationProvenance: generationProvenance({ amount: 990_000n }),
      }),
      signature: "CurrentBuySig1111111111111111111111111111111111",
      action: "buy",
      amount: 1_000_000n,
      trader: provenanceTrader,
      tokenAccount: provenanceTokenAccount,
      mint: provenanceMint,
      generation: 7n,
    });

    expect(result).toBeNull();
  });

  it("does not attach the current sell signature to stale same-side provenance with a trader mismatch", () => {
    const result = fallbackGenerationProvenance({
      soul: soul({
        generationCount: 7n,
        latestGenerationProvenance: generationProvenance({ side: "sell" }),
      }),
      signature: "CurrentSellSig111111111111111111111111111111111",
      action: "sell",
      amount: 990_000n,
      trader: publicKey(9),
      tokenAccount: provenanceTokenAccount,
      mint: provenanceMint,
      generation: 7n,
    });

    expect(result).toBeNull();
  });

  it("does not attach the current sell signature to stale same-side provenance with a token account mismatch", () => {
    const result = fallbackGenerationProvenance({
      soul: soul({
        generationCount: 7n,
        latestGenerationProvenance: generationProvenance({ side: "sell" }),
      }),
      signature: "CurrentSellSig222222222222222222222222222222222",
      action: "sell",
      amount: 990_000n,
      trader: provenanceTrader,
      tokenAccount: publicKey(10),
      mint: provenanceMint,
      generation: 7n,
    });

    expect(result).toBeNull();
  });

  it("does not attach the current buy signature to stale same-side provenance with a mint mismatch", () => {
    const result = fallbackGenerationProvenance({
      soul: soul({
        generationCount: 7n,
        latestGenerationProvenance: generationProvenance(),
      }),
      signature: "CurrentBuySig2222222222222222222222222222222222",
      action: "buy",
      amount: 990_000n,
      trader: provenanceTrader,
      tokenAccount: provenanceTokenAccount,
      mint: publicKey(11),
      generation: 7n,
    });

    expect(result).toBeNull();
  });

  it("does not attach the current transaction signature when the known generation differs", () => {
    const result = fallbackGenerationProvenance({
      soul: soul({
        generationCount: 8n,
        latestGenerationProvenance: generationProvenance({ generation: 7n }),
      }),
      signature: "CurrentBuySig3333333333333333333333333333333333",
      action: "buy",
      amount: 990_000n,
      trader: provenanceTrader,
      tokenAccount: provenanceTokenAccount,
      mint: provenanceMint,
      generation: 8n,
    });

    expect(result).toBeNull();
  });

  it("attaches the current transaction signature only when all strict provenance criteria match", () => {
    const signature = "CurrentBuySig4444444444444444444444444444444444";
    const result = fallbackGenerationProvenance({
      soul: soul({
        generationCount: 7n,
        latestGenerationProvenance: generationProvenance(),
      }),
      signature,
      action: "buy",
      amount: 990_000n,
      trader: provenanceTrader,
      tokenAccount: provenanceTokenAccount,
      mint: provenanceMint,
      generation: 7n,
    });

    expect(result).toMatchObject({
      generation: 7n,
      side: "buy",
      amount: 990_000n,
      signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    });
  });

  it("renders localized public timeline story cards with evidence collapsed by default", () => {
    const labels: TokenTimelineLabels = {
      title: "公开时间线",
      body: "按时间顺序展示发射、交易、生成与 claim 证据",
      loading: "正在加载时间线证据…",
      loadError: "无法加载时间线证据",
      timeoutError: "时间线请求超时。",
      invalidData: "时间线响应不完整。",
      empty: "目前还没有时间线证据。",
      source: "来自公开 RPC",
      signature: "交易签名",
      slot: "Slot",
      evidence: {
        show: "查看证据",
        hide: "收起证据",
        title: "技术证据",
        source: "证据来源",
        address: "证据地址",
        blockTime: "区块时间",
        eventId: "事件 ID",
        tokenMint: "Token mint",
        soulAccount: "Soul account",
        rawEvent: "原始事件证据",
      },
      details: {
        side: "方向",
        amount: "数量",
        trader: "交易者",
        tokenAccount: "Token account",
        seedHash: "Seed hash",
        receiptLifecycle: "收据生命周期",
        receiptAccount: "收据账户",
        receiptBoundQuantity: "绑定数量",
        receiptBoundBoundary: "绑定边界",
      },
      eventTitles: {
        launch: "发射",
        trade: "交易",
        generation: "Soul 生成",
        claim: "Claim",
      },
      eventDescriptions: {
        launch: "{token} 初始化了代币 / Soul 生命周期。",
        trade: "{token} 记录了 bonding-curve 交易活动。",
        generation: "{token} 生成了 Soul #{generation}。",
        claim: "{token} Soul claim 序号 #{sequence}。",
      },
      linkLabels: {
        token: "代币",
        gallery: "画廊",
        soul: "Soul PDA",
        transaction: "Explorer 交易",
        mint: "Mint",
        nft: "Soul NFT",
      },
    };
    const markup = renderToStaticMarkup(
      <TokenTimelineEventList
        labels={labels}
        snapshot={{
          tokenMint: "TokenMint111111111111111111111111111111",
          source: {
            fetchedAt: "2026-04-29T00:00:00.000Z",
            rpcEndpoint: "https://api.devnet.solana.com",
          },
          events: [
            {
              id: "launch:TokenMint111111111111111111111111111111",
              kind: "launch",
              tokenMint: "TokenMint111111111111111111111111111111",
              tokenLabel: "SOUL",
              signature: "LaunchSig1111111111111111111111111111111111",
              slot: 123,
              links: [
                { labelKey: "token", href: "/token/TokenMint111111111111111111111111111111" },
                {
                  labelKey: "transaction",
                  href: "https://explorer.solana.com/tx/LaunchSig1111111111111111111111111111111111?cluster=devnet",
                  external: true,
                },
              ],
            },
            {
              id: "claim:Claim11111111111111111111111111111111111",
              kind: "claim",
              tokenMint: "TokenMint111111111111111111111111111111",
              tokenLabel: "SOUL",
              generation: "2",
              sequence: "1",
              signature: "ClaimSig11111111111111111111111111111111111",
              slot: 128,
              links: [
                { labelKey: "gallery", href: "/token/TokenMint111111111111111111111111111111/gallery" },
              ],
            },
          ],
        }}
      />,
    );

    expect(markup).toContain("发射");
    expect(markup).toContain("SOUL 初始化了代币 / Soul 生命周期。");
    expect(markup).toContain("查看证据");
    expect(markup).toContain("代币");
    expect(markup).toContain("画廊");
    expect(markup).not.toContain("交易签名");
    expect(markup).not.toContain("LaunchSig1111111111111111111111111111111111");
    expect(markup).not.toContain("Slot");
    expect(markup).not.toContain("123");
    expect(markup).not.toContain("Explorer 交易");
    expect(markup).not.toContain("ClaimSig11111111111111111111111111111111111");
    expect(markup).not.toContain("来自公开 RPC");
  });

  it("explains exactly what unlocks disabled buy/sell controls", () => {
    expect(
      getTradeDisabledReason({
        action: "buy",
        connected: false,
        hasPublicKey: false,
        riskAcknowledged: false,
        curveStatus: "loaded",
        isGraduated: false,
        hasValidQuote: true,
      }),
    ).toBe("connectWallet");

    expect(
      getTradeDisabledReason({
        action: "buy",
        connected: true,
        hasPublicKey: true,
        riskAcknowledged: false,
        curveStatus: "loaded",
        isGraduated: false,
        hasValidQuote: true,
      }),
    ).toBe("acknowledgeRisk");

    expect(
      getTradeDisabledReason({
        action: "sell",
        connected: true,
        hasPublicKey: true,
        riskAcknowledged: true,
        curveStatus: "loaded",
        isGraduated: false,
        hasValidQuote: true,
        tokenBalanceStatus: "loaded",
        tokenBalanceBaseUnits: 0n,
      }),
    ).toBe("buyTokensFirst");
  });

  it("compares the requested sell amount against the loaded token balance", () => {
    expect(
      sellDisabledReason({
        tokenBalanceBaseUnits: 1_000_000n,
        requestedSellBaseUnits: 1_000_001n,
      }),
    ).toBe("sellAmountExceedsBalance");

    expect(
      sellDisabledReason({
        tokenBalanceBaseUnits: 1_000_000n,
        requestedSellBaseUnits: 1_000_000n,
      }),
    ).toBeNull();

    expect(
      sellDisabledReason({
        tokenBalanceBaseUnits: 1_000_000n,
        requestedSellBaseUnits: 999_999n,
      }),
    ).toBeNull();
  });

  it("preserves sell disabled reason precedence for existing states", () => {
    expect(sellDisabledReason({ hasValidQuote: false })).toBe("invalidAmount");
    expect(sellDisabledReason({ tokenBalanceStatus: "loading" })).toBe("balanceLoading");
    expect(sellDisabledReason({ tokenBalanceBaseUnits: 0n })).toBe("buyTokensFirst");
    expect(sellDisabledReason({ isPaused: true })).toBe("paused");
    expect(sellDisabledReason({ isGraduated: true })).toBe("graduated");
    expect(sellDisabledReason({ riskAcknowledged: false })).toBe("acknowledgeRisk");
  });

  it("gates hook-aware direct transfers on wallet, balance, amount, and recipient", () => {
    expect(directTransferDisabledReason({ connected: false, hasPublicKey: false })).toBe(
      "connectWallet",
    );
    expect(directTransferDisabledReason({ tokenBalanceStatus: "loading" })).toBe(
      "balanceLoading",
    );
    expect(directTransferDisabledReason({ tokenBalanceBaseUnits: 0n })).toBe(
      "buyTokensFirst",
    );
    expect(directTransferDisabledReason({ requestedTransferBaseUnits: undefined })).toBe(
      "invalidAmount",
    );
    expect(
      directTransferDisabledReason({
        tokenBalanceBaseUnits: 999_999n,
        requestedTransferBaseUnits: 1_000_000n,
      }),
    ).toBe("amountExceedsBalance");
    expect(directTransferDisabledReason({ hasRecipient: false })).toBe("recipientRequired");
    expect(directTransferDisabledReason()).toBeNull();
  });

  it("renders localized boundary settlement consequences and exact selected receipt set", () => {
    const owner = publicKey(21);
    const mint = publicKey(22);
    const soul = publicKey(23);
    const selectedReceipt = receiptCandidate({
      owner,
      mint,
      soul,
      sequence: 2n,
      boundary: 2n * MIN_CLAIM_BALANCE,
    });
    const preview = buildBoundarySettlementDisplay({
      owner,
      mint,
      currentBalanceBaseUnits: 25_000_000_000n,
      movementAmountBaseUnits: 10_000_000_001n,
      settlementState: "forfeited",
      receiptState: {
        status: "loaded",
        activeReceiptCount: 2n,
        candidates: [
          receiptCandidate({ owner, mint, soul, sequence: 1n, boundary: MIN_CLAIM_BALANCE }),
          selectedReceipt,
        ],
      },
      sourceTokenAccount: owner,
      sourceTokenBalanceBaseUnits: 2_500_000n,
    });
    const markup = renderToStaticMarkup(
      <BoundarySettlementPreviewCard
        preview={preview}
        labels={{
          title: "Boundary settlement required",
          burnMode: "Burn selected receipts",
          forfeitMode: "Forfeit selected receipts",
          body: "{mode} before this boundary move.",
          selectedReceipts: "Selected receipt set",
          postWholeUnits: "Post-move whole-token capacity",
          blocked: "Boundary move is blocked",
          sourceSelectionNotice: "Preview uses selected source token account.",
          sourceAccount: "Preview source token account",
          sourceBalance: "Preview source balance",
          activeReceipts: "Active receipts",
          boundary: "boundary",
        }}
      />,
    );

    expect(preview).toMatchObject({
      status: "required",
      state: "forfeited",
      activeReceiptCount: 2n,
      postWholeUnits: 1n,
    });
    expect(markup).toContain("Forfeit selected receipts");
    expect(markup).toContain("Selected receipt set");
    expect(markup).toContain("Preview uses selected source token account.");
    expect(markup).toContain("Preview source token account");
    expect(markup).toContain("Preview source balance");
    expect(markup).toContain(selectedReceipt.receiptAccount.toBase58());
    expect(markup).toContain("20000.000000");
  });

  it("keeps blocked settlement preview errors sanitized by default", () => {
    const preview = buildBoundarySettlementDisplay({
      owner: publicKey(41),
      mint: publicKey(42),
      currentBalanceBaseUnits: MIN_CLAIM_BALANCE,
      movementAmountBaseUnits: 1n,
      settlementState: "burned",
      receiptState: {
        status: "loaded",
        activeReceiptCount: 1n,
        candidates: [],
      },
      blockedMessage: "Settlement evidence is temporarily unavailable. Refresh the preview and try again.",
    });
    const markup = renderToStaticMarkup(
      <BoundarySettlementPreviewCard
        preview={preview}
        labels={{
          title: "Boundary settlement required",
          burnMode: "Burn selected receipts",
          forfeitMode: "Forfeit selected receipts",
          body: "{mode} before this boundary move.",
          selectedReceipts: "Selected receipt set",
          postWholeUnits: "Post-move whole-token capacity",
          blocked: "Boundary move is blocked",
          sourceSelectionNotice: "Preview uses selected source token account.",
          sourceAccount: "Preview source token account",
          sourceBalance: "Preview source balance",
          activeReceipts: "Active receipts",
          boundary: "boundary",
        }}
      />,
    );

    expect(preview).toMatchObject({ status: "blocked" });
    expect(markup).toContain("Settlement evidence is temporarily unavailable");
    expect(markup).not.toMatch(/receipt registry|activeReceipt|custom program|RPC|HTTP/i);
  });

  it("renders decoded pre-sign transaction review with signer/writable flags and receipt intent", () => {
    const selectedReceipt = publicKey(31).toBase58();
    const markup = renderToStaticMarkup(
      <PreSignTransactionReviewCard
        review={{
          cluster: "devnet",
          feePayer: publicKey(32).toBase58(),
          recentBlockhash: "11111111111111111111111111111111",
          receiptIntent: {
            state: "burned",
            movementAmountBaseUnits: "1000001",
            sourceTokenAccount: publicKey(33).toBase58(),
            sourceTokenBalanceBaseUnits: "2500000",
            activeReceiptCount: "2",
            postWholeUnits: "1",
            selectedReceipts: [selectedReceipt],
          },
          instructions: [
            {
              index: 0,
              programId: publicKey(34).toBase58(),
              accounts: [
                {
                  pubkey: publicKey(35).toBase58(),
                  isSigner: true,
                  isWritable: true,
                },
                {
                  pubkey: publicKey(36).toBase58(),
                  isSigner: false,
                  isWritable: false,
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(markup).toContain("Pre-sign decoded transaction review");
    expect(markup).toContain("Cluster: devnet");
    expect(markup).toContain("Receipt settlement intent");
    expect(markup).toContain("烧毁选中的收据");
    expect(markup).not.toContain(">burned ");
    expect(markup).toContain(selectedReceipt);
    expect(markup).toContain("signer");
    expect(markup).toContain("writable");
    expect(markup).toContain("readonly");
  });

  it("renders localized forfeited receipt state labels without raw English protocol values", () => {
    const selectedReceipt = publicKey(37).toBase58();
    const markup = renderToStaticMarkup(
      <PreSignTransactionReviewCard
        review={{
          cluster: "devnet",
          feePayer: publicKey(38).toBase58(),
          recentBlockhash: "11111111111111111111111111111111",
          receiptIntent: {
            state: "forfeited",
            movementAmountBaseUnits: "1000001",
            sourceTokenAccount: publicKey(39).toBase58(),
            sourceTokenBalanceBaseUnits: "2500000",
            activeReceiptCount: "2",
            postWholeUnits: "1",
            selectedReceipts: [selectedReceipt],
          },
          instructions: [
            {
              index: 0,
              programId: publicKey(40).toBase58(),
              accounts: [
                {
                  pubkey: publicKey(41).toBase58(),
                  isSigner: true,
                  isWritable: true,
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(markup).toContain("失效选中的收据");
    expect(markup).not.toContain(">forfeited ");
    expect(markup).toContain(selectedReceipt);
  });
});
