import type { PublicKey } from "@solana/web3.js";
import type { ClaimedSoulNft } from "sdk";
import {
  hydrateMarketProvenanceWithRpc,
  marketProvenanceEvidenceState,
  marketProvenanceFromMetadataAttributes,
  marketProvenanceFromSdk,
  type MarketProvenanceDetails,
  type MarketProvenanceEvidenceState,
  type MarketProvenanceLookup,
  type ProvenanceFetch,
} from "./marketProvenance";
import { deriveSoulRarity, type SoulRarityInfo } from "./soulRarity";
import {
  appSoulGeneratedTraitsFromAttributes,
  appSoulTraitsToGeneratedTraits,
  deriveAppDefaultSoulTraits,
  type AppSoulGeneratedTrait,
} from "./soulTraits";

export interface DecodedSoulNftMetadata {
  name: string;
  symbol: string;
  imageSvg: string;
  sequence: number;
  artTheme: SoulNftArtTheme;
  generatedTraits?: AppSoulGeneratedTrait[];
  metadataRarity?: SoulMetadataRarity | null;
  marketProvenance: MarketProvenanceDetails | null;
}

export interface SoulMetadataRarity {
  tier: SoulRarityInfo["tier"];
  score: number;
}

export interface SoulNftArtTheme {
  label: string;
  source: "metadata" | "legacy";
}

export interface ParsedTokenAccountLike {
  pubkey: PublicKey;
  account: {
    data: {
      parsed?: {
        info?: {
          mint?: string;
          tokenAmount?: {
            amount?: string;
            decimals?: number;
          };
        };
      };
    };
  };
}

export interface SoulNftGalleryItem {
  tokenAccount: string;
  claim?: string;
  mint: string;
  tokenMint: string;
  tokenMintLabel: string;
  name: string;
  symbol: string;
  sanitizedSvg: string;
  sequence?: number;
  artTheme: SoulNftArtTheme;
  generatedTraits?: AppSoulGeneratedTrait[];
  metadataRarity?: SoulMetadataRarity | null;
  soulRarity: SoulRarityInfo;
  marketProvenance: MarketProvenanceDetails | null;
  marketProvenanceStatus: Exclude<MarketProvenanceEvidenceState, "not-applicable">;
  marketProvenanceLookup?: MarketProvenanceLookup;
  receiptAccount?: string;
  receiptLifecycleState?: ClaimedSoulNft["receiptLifecycleState"];
  receiptLifecycleLabel?: string;
  receiptLifecycleActive?: boolean;
  receiptBoundQuantity?: string;
  receiptBoundBoundary?: string;
}

export interface ClaimedSoulNftGalleryItem {
  claim: string;
  claimer: string;
  claimerLabel: string;
  nftMint: string;
  tokenMint: string | null;
  tokenMintLabel: string;
  name: string;
  symbol: string;
  sanitizedSvg: string;
  sequence: number;
  artTheme: SoulNftArtTheme;
  generatedTraits?: AppSoulGeneratedTrait[];
  metadataRarity?: SoulMetadataRarity | null;
  soulRarity: SoulRarityInfo;
  marketProvenance: MarketProvenanceDetails | null;
  marketProvenanceStatus: Exclude<MarketProvenanceEvidenceState, "not-applicable">;
  marketProvenanceLookup?: MarketProvenanceLookup;
  receiptAccount?: string;
  receiptLifecycleState?: ClaimedSoulNft["receiptLifecycleState"];
  receiptLifecycleLabel?: string;
  receiptLifecycleActive?: boolean;
  receiptBoundQuantity?: string;
  receiptBoundBoundary?: string;
}

export interface BuildClaimedSoulNftGalleryItemsOptions {
  tokenMint?: string;
}

export interface SoulNftAssociation {
  tokenMint: string;
  claim?: string;
  soul?: string;
  generation?: string | number | bigint;
  sequence?: string | number | bigint;
}

const DEFAULT_PROVENANCE_HYDRATION_BATCH_SIZE = 2;

export function decodeSoulNftMetadataUri(uri: string): DecodedSoulNftMetadata | null {
  const jsonText = decodeDataUri(uri, "application/json");
  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as Partial<{
      name: unknown;
      symbol: unknown;
      image: unknown;
      artTheme: unknown;
      attributes: unknown;
    }>;
    if (
      typeof parsed.name !== "string" ||
      typeof parsed.symbol !== "string" ||
      typeof parsed.image !== "string"
    ) {
      return null;
    }
    const sequence = parseSoulMetadataSequence(parsed.name, parsed.symbol);
    if (sequence === null) {
      return null;
    }

    const imageSvg = decodeDataUri(parsed.image, "image/svg+xml");
    if (!imageSvg || !imageSvg.trimStart().startsWith("<svg")) {
      return null;
    }

    return {
      name: parsed.name,
      symbol: parsed.symbol,
      imageSvg,
      sequence,
      artTheme: soulNftArtThemeFromMetadata(parsed.artTheme, parsed.attributes, imageSvg),
      generatedTraits: appSoulGeneratedTraitsFromAttributes(parsed.attributes),
      metadataRarity: soulMetadataRarityFromAttributes(parsed.attributes),
      marketProvenance: marketProvenanceFromMetadataAttributes(parsed.attributes),
    };
  } catch {
    return null;
  }
}

export function sanitizeInlineSvg(svg: string): string {
  const trimmed = svg.trim();
  if (!trimmed.startsWith("<svg")) {
    return "";
  }

  return trimmed
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<image\b[^>]*\/?>/gi, "")
    .replace(/\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g, "")
    .replace(/\s+(?:href|xlink:href)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "")
    .replace(/\s+(?:href|xlink:href)\s*=\s*javascript:[^\s>]+/gi, "")
    .replace(/\s+(?:href|xlink:href)\s*=\s*(["'])(?!\s*#)[\s\S]*?\1/gi, "")
    .replace(/\s+(?:href|xlink:href)\s*=\s*(?!#)[^\s>]+/gi, "")
    .replace(
      /\s+[a-zA-Z_:][\w:.-]*\s*=\s*(["'])[^"']*url\([^"']*\)[^"']*\1/gi,
      "",
    )
    .replace(/\s+[a-zA-Z_:][\w:.-]*\s*=\s*[^\s>]*url\([^\s>]*\)[^\s>]*/gi, "");
}

export function buildSoulNftGalleryItems(
  accounts: ParsedTokenAccountLike[],
  metadataByMint: Map<string, DecodedSoulNftMetadata | null>,
  tokenMintByNftMint: Map<string, string | SoulNftAssociation> = new Map(),
): SoulNftGalleryItem[] {
  return accounts.flatMap((account) => {
    const info = account.account.data.parsed?.info;
    const mint = info?.mint;
    const amount = info?.tokenAmount?.amount;
    const decimals = info?.tokenAmount?.decimals;

    if (!mint || amount !== "1" || decimals !== 0) {
      return [];
    }
    const association = soulNftAssociationFromMapValue(tokenMintByNftMint.get(mint));
    if (!association) {
      return [];
    }

    const metadata = metadataByMint.get(mint);
    if (!metadata) {
      return [];
    }

    const sanitizedSvg = sanitizeInlineSvg(metadata.imageSvg);
    if (!sanitizedSvg) {
      return [];
    }
    const marketProvenanceLookup = marketProvenanceLookupFromAssociation(
      association,
      metadata.marketProvenance,
    );
    const generation =
      metadata.marketProvenance?.generation ??
      association.generation ??
      metadata.sequence.toString();
    const tokenAccount = account.pubkey.toBase58();
    const claim = association.claim;
    const sequence = association.sequence ?? metadata.sequence;

    const soulRarity = soulRarityWithMetadata(
      metadata.metadataRarity,
      deriveSoulRarity({
        claim,
        nftMint: mint,
        tokenMint: association.tokenMint,
        tokenAccount: claim ? undefined : tokenAccount,
        soul: association.soul ?? metadata.marketProvenance?.soul,
        generation,
        sequence,
        artTheme: metadata.artTheme.label,
        seedHash: metadata.marketProvenance?.seedHash,
        side: metadata.marketProvenance?.side,
        amount: metadata.marketProvenance?.amount,
        trader: metadata.marketProvenance?.trader,
      }),
    );

    return [
      {
        tokenAccount,
        ...(claim ? { claim, sequence: Number(sequence) } : {}),
        mint,
        tokenMint: association.tokenMint,
        tokenMintLabel: truncateWallet(association.tokenMint),
        name: metadata.name,
        symbol: metadata.symbol,
        sanitizedSvg,
        artTheme: metadata.artTheme,
        generatedTraits: metadata.generatedTraits,
        metadataRarity: metadata.metadataRarity,
        soulRarity,
        marketProvenance: metadata.marketProvenance,
        marketProvenanceStatus: claimedMarketProvenanceStatus(
          metadata.marketProvenance,
          marketProvenanceLookup,
        ),
        marketProvenanceLookup,
      },
    ];
  });
}

export function buildClaimedSoulNftGalleryItems(
  claims: ClaimedSoulNft[],
  options: BuildClaimedSoulNftGalleryItemsOptions = {},
): ClaimedSoulNftGalleryItem[] {
  return claims.flatMap((claim) => {
    const tokenMint = claim.tokenMint?.toBase58() ?? options.tokenMint;
    const decoded = claim.metadata ? decodeSoulNftMetadataUri(claim.metadata.uri) : null;
    const mirroredSvg = claimSoulAccountSvgForClaim(claim);
    const sanitizedSvg = sanitizeInlineSvg(
      decoded?.imageSvg ?? mirroredSvg ?? fallbackClaimSvg(claim.sequence, claim.generationCount),
    );
    const claimer = claim.claimer.toBase58();
    const soul = claim.soul.toBase58();
    const mirroredProvenance = claimSoulAccountProvenanceForClaim(claim);
    const marketProvenance = decoded?.marketProvenance ?? mirroredProvenance;
    const generation = marketProvenance?.generation ?? claim.generationCount.toString();
    const artTheme = claimedSoulArtTheme(decoded?.artTheme, claim);
    const nftMint = claim.nftMint.toBase58();
    const claimAddress = claim.claim.toBase58();
    const generatedTraits =
      decoded?.generatedTraits?.length
        ? decoded.generatedTraits
        : claimSoulAccountGeneratedTraitsForClaim(claim, artTheme);
    const metadataRarity = decoded?.metadataRarity ?? null;
    const marketProvenanceLookup = tokenMint
      ? {
          tokenMint,
          soul,
          generation,
        }
      : undefined;

    const soulRarity = soulRarityWithMetadata(
      metadataRarity,
      deriveSoulRarity({
        claim: claimAddress,
        nftMint,
        tokenMint: tokenMint ?? undefined,
        soul,
        generation,
        sequence: claim.sequence,
        artTheme: artTheme.label,
        seedHash: marketProvenance?.seedHash,
        side: marketProvenance?.side,
        amount: marketProvenance?.amount,
        trader: marketProvenance?.trader,
      }),
    );

    return [
      {
        claim: claimAddress,
        claimer,
        claimerLabel: truncateWallet(claimer),
        nftMint,
        tokenMint: tokenMint ?? null,
        tokenMintLabel: tokenMint ? truncateWallet(tokenMint) : "Token enrichment pending",
        name: decoded?.name ?? `Soul claim #${claim.sequence.toString()}`,
        symbol: decoded?.symbol ?? "SOUL",
        sanitizedSvg,
        sequence: Number(claim.sequence),
        artTheme,
        generatedTraits,
        metadataRarity,
        soulRarity,
        marketProvenance,
        marketProvenanceStatus: claimedMarketProvenanceStatus(
          marketProvenance,
          marketProvenanceLookup,
        ),
        ...(marketProvenanceLookup ? { marketProvenanceLookup } : {}),
        ...(claim.receiptAccount
          ? { receiptAccount: claim.receiptAccount.toBase58() }
          : {}),
        ...(claim.receiptLifecycleState
          ? {
              receiptLifecycleState: claim.receiptLifecycleState,
              receiptLifecycleLabel: receiptLifecycleLabel(claim.receiptLifecycleState),
              receiptLifecycleActive: claim.receiptLifecycleState === "active",
            }
          : {}),
        ...(claim.receipt
          ? {
              receiptBoundQuantity: claim.receipt.boundQuantity.toString(),
              receiptBoundBoundary: claim.receipt.boundBoundary.toString(),
            }
          : {}),
      },
    ];
  });
}

function receiptLifecycleLabel(state: NonNullable<ClaimedSoulNft["receiptLifecycleState"]>): string {
  switch (state) {
    case "active":
      return "Active bound receipt";
    case "burned":
      return "Burned receipt";
    case "forfeited":
      return "Forfeited receipt";
  }
}

function soulNftArtThemeFromMetadata(
  artTheme: unknown,
  attributes: unknown,
  imageSvg?: string,
): SoulNftArtTheme {
  if (typeof artTheme === "string" && artTheme.trim().length > 0) {
    return { label: normalizeKnownArtThemeLabel(artTheme.trim()), source: "metadata" };
  }

  if (Array.isArray(attributes)) {
    const attributeTheme = attributes
      .map((attribute) =>
        isMetadataAttribute(attribute) &&
        (attribute.trait_type === "Art theme" ||
          attribute.trait_type === "Art engine/theme")
          ? attribute.value
          : null,
      )
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (attributeTheme) {
      return { label: normalizeKnownArtThemeLabel(attributeTheme.trim()), source: "metadata" };
    }
  }

  const svgTheme = imageSvg ? inferArtThemeFromSvg(imageSvg) : null;
  if (svgTheme) {
    return { label: svgTheme, source: "legacy" };
  }

  return { label: "Legacy / unknown art theme", source: "legacy" };
}

function claimedSoulArtTheme(
  decodedTheme: SoulNftArtTheme | undefined,
  claim: ClaimedSoulNft,
): SoulNftArtTheme {
  if (decodedTheme && decodedTheme.label !== "Legacy / unknown art theme") {
    return decodedTheme;
  }
  const soulAccountTheme = claim.soulAccount?.artTheme;
  if (soulAccountTheme) {
    return {
      label: normalizeKnownArtThemeLabel(soulAccountTheme.label),
      source: "metadata",
    };
  }
  return decodedTheme ?? { label: "Legacy / unknown art theme", source: "legacy" };
}

function claimSoulAccountSvgForClaim(claim: ClaimedSoulNft): string | null {
  const soulAccount = claim.soulAccount;
  if (
    !soulAccount ||
    soulAccount.lastSvgLen <= 0 ||
    soulAccount.generationCount !== claim.generationCount
  ) {
    return null;
  }
  return soulAccount.lastSvg;
}

function claimSoulAccountProvenanceForClaim(
  claim: ClaimedSoulNft,
): MarketProvenanceDetails | null {
  const provenance = marketProvenanceFromSdk(claim.soulAccount?.latestGenerationProvenance);
  if (!provenance || provenance.generation !== claim.generationCount.toString()) {
    return null;
  }
  return provenance;
}

function claimSoulAccountGeneratedTraitsForClaim(
  claim: ClaimedSoulNft,
  artTheme: SoulNftArtTheme,
): AppSoulGeneratedTrait[] {
  const soulAccount = claim.soulAccount;
  if (
    !soulAccount ||
    soulAccount.provenanceGeneration === 0n ||
    soulAccount.provenanceGeneration !== claim.generationCount
  ) {
    return [];
  }
  return appSoulTraitsToGeneratedTraits(
    deriveAppDefaultSoulTraits({
      seed: soulAccount.provenanceSeedHash,
      theme: soulAccount.artTheme?.id ?? soulTraitThemeIdFromLabel(artTheme.label),
      provenanceSide: soulAccount.provenanceSide,
      generation: soulAccount.provenanceGeneration,
      amount: soulAccount.provenanceAmount,
      tokenAmount: soulAccount.provenanceTokenAmount,
    }),
  );
}

function soulTraitThemeIdFromLabel(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes("soulpuff") || normalized.includes("soul puff")) {
    return "soulpuff";
  }
  if (normalized.includes("hexagram") || normalized.includes("oracle")) {
    return "hexagram";
  }
  if (normalized.includes("signal")) {
    return "signal";
  }
  if (normalized.includes("fractal structure") || normalized === "fractal") {
    return "fractal";
  }
  if (normalized.includes("vector field") || normalized === "field") {
    return "field";
  }
  if (normalized.includes("crystal lattice") || normalized === "lattice") {
    return "lattice";
  }
  if (normalized.includes("strange attractor") || normalized === "chaos") {
    return "chaos";
  }
  if (normalized.includes("harmonic wave") || normalized === "harmonic") {
    return "harmonic";
  }
  if (
    normalized.includes("pixel fractal") ||
    normalized.includes("pixel_fractal") ||
    normalized.includes("pixelfractal")
  ) {
    return "pixel_fractal";
  }
  if (
    normalized.includes("pixel art") ||
    normalized.includes("pixel_art") ||
    normalized.includes("pixelart")
  ) {
    return "pixel_art";
  }
  if (normalized.includes("symphony")) {
    return "symphony";
  }
  if (normalized.includes("custom")) {
    return "custom";
  }
  if (normalized.includes("monochrome")) {
    return "monochrome";
  }
  return "neonpuff";
}

function soulRarityWithMetadata(
  metadataRarity: SoulMetadataRarity | null | undefined,
  derived: SoulRarityInfo,
): SoulRarityInfo {
  return metadataRarity
    ? { ...derived, tier: metadataRarity.tier, score: metadataRarity.score }
    : derived;
}

function normalizeKnownArtThemeLabel(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes("neonpuff") || normalized.includes("neon puff")) {
    return "NeonPuff Soul";
  }
  if (normalized.includes("soulpuff") || normalized.includes("soul puff")) {
    return "SoulPuff";
  }
  if (normalized.includes("hexagram") || normalized.includes("oracle")) {
    return "Hexagram Oracle";
  }
  if (normalized.includes("signal") || normalized.includes("unipeg")) {
    return "Signal Field";
  }
  if (normalized.includes("fractal structure") || normalized === "fractal") {
    return "Fractal Structure";
  }
  if (normalized.includes("vector field") || normalized === "field") {
    return "Vector Field";
  }
  if (normalized.includes("crystal lattice") || normalized === "lattice") {
    return "Crystal Lattice";
  }
  if (normalized.includes("strange attractor") || normalized === "chaos") {
    return "Strange Attractor";
  }
  if (normalized.includes("harmonic wave") || normalized === "harmonic") {
    return "Harmonic Wave";
  }
  if (
    normalized.includes("pixel fractal") ||
    normalized.includes("pixel_fractal") ||
    normalized.includes("pixelfractal")
  ) {
    return "Pixel Fractal";
  }
  if (
    normalized.includes("pixel art") ||
    normalized.includes("pixel_art") ||
    normalized.includes("pixelart")
  ) {
    return "Pixel Art";
  }
  if (normalized.includes("symphony")) {
    return "Symphony";
  }
  if (normalized.includes("custom")) {
    return "Custom Template";
  }
  if (normalized.includes("monochrome")) {
    return "Monochrome Soul";
  }
  return label;
}

function inferArtThemeFromSvg(svg: string): string | null {
  const normalized = svg.toLowerCase();
  if (
    normalized.includes("pd14-neonpuff") ||
    normalized.includes("neonpuff-unicorn-profile") ||
    normalized.includes("premium-neon-vector")
  ) {
    return "NeonPuff Soul";
  }
  if (
    normalized.includes("pd12-soulpuff") ||
    normalized.includes("soulpuff-figure") ||
    normalized.includes("rainbow-puff")
  ) {
    return "SoulPuff";
  }
  if (normalized.includes("hexagram") || normalized.includes("data-soul=\"hexagram")) {
    return "Hexagram Oracle";
  }
  if (normalized.includes("pd9-monochrome") || normalized.includes("monochrome")) {
    return "Monochrome Soul";
  }
  return null;
}

function fallbackClaimSvg(sequence: bigint, generationCount: bigint): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Claim metadata pending">',
    '<rect width="256" height="256" rx="28" fill="#080808"/>',
    '<circle cx="128" cy="98" r="36" fill="#f6f6f1"/>',
    '<path d="M72 214c12-54 34-82 56-82s44 28 56 82H72z" fill="#f6f6f1"/>',
    '<path d="M70 52h116M54 82h148M46 112h164" stroke="#7dd3fc" stroke-width="5" stroke-linecap="round" opacity=".68"/>',
    '<text x="128" y="236" fill="#f6f6f1" font-size="16" text-anchor="middle" font-family="monospace">Claim metadata pending</text>',
    `<text x="128" y="28" fill="#f6f6f1" font-size="14" text-anchor="middle" font-family="monospace">#${sequence.toString()} · gen ${generationCount.toString()}</text>`,
    "</svg>",
  ].join("");
}

function isMetadataAttribute(
  value: unknown,
): value is { trait_type: string; value: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "trait_type" in value &&
    typeof value.trait_type === "string" &&
    "value" in value &&
    typeof value.value === "string"
  );
}

function soulMetadataRarityFromAttributes(attributes: unknown): SoulMetadataRarity | null {
  if (!Array.isArray(attributes)) {
    return null;
  }
  const metadataAttributes = attributes.filter(isMetadataAttribute);
  const tier = metadataAttributes.find(
    (attribute) => attribute.trait_type === "Rarity tier",
  )?.value;
  const scoreRaw = metadataAttributes.find(
    (attribute) => attribute.trait_type === "Soul Score",
  )?.value;
  if (!isRarityTier(tier) || !scoreRaw || !/^\d+$/.test(scoreRaw)) {
    return null;
  }
  const score = Number(scoreRaw);
  return Number.isSafeInteger(score) ? { tier, score } : null;
}

function isRarityTier(value: unknown): value is SoulRarityInfo["tier"] {
  return (
    value === "common" ||
    value === "uncommon" ||
    value === "rare" ||
    value === "epic" ||
    value === "legendary" ||
    value === "mythic"
  );
}

export async function hydrateSoulNftGalleryItemsWithRpcProvenance<
  T extends SoulNftGalleryItem | ClaimedSoulNftGalleryItem,
>(
  items: T[],
  fetchImpl: ProvenanceFetch = globalThis.fetch,
  batchSize = DEFAULT_PROVENANCE_HYDRATION_BATCH_SIZE,
): Promise<T[]> {
  const normalizedBatchSize = normalizeHydrationBatchSize(batchSize);
  const hydratedItems = [...items];
  const orderedItems = orderItemsForProvenanceHydration(items);

  for (let index = 0; index < orderedItems.length; index += normalizedBatchSize) {
    const batch = orderedItems.slice(index, index + normalizedBatchSize);
    const hydratedBatch = await hydrateSoulNftGalleryItemBatch(
      batch.map(({ item }) => item),
      fetchImpl,
    );
    for (const [batchIndex, hydratedItem] of hydratedBatch.entries()) {
      const originalIndex = batch[batchIndex]?.index;
      if (originalIndex !== undefined) {
        hydratedItems[originalIndex] = hydratedItem;
      }
    }
  }

  return hydratedItems;
}

export async function hydrateSoulNftGalleryItemsWithRpcProvenanceProgressively<
  T extends SoulNftGalleryItem | ClaimedSoulNftGalleryItem,
>(
  items: T[],
  onItems: (items: T[]) => void,
  fetchImpl: ProvenanceFetch = globalThis.fetch,
  batchSize = 2,
): Promise<T[]> {
  let hydratedItems = [...items];
  const normalizedBatchSize = normalizeHydrationBatchSize(batchSize);
  const orderedItems = orderItemsForProvenanceHydration(items);

  for (let index = 0; index < orderedItems.length; index += normalizedBatchSize) {
    const batch = orderedItems.slice(index, index + normalizedBatchSize);
    const hydratedBatch = await hydrateSoulNftGalleryItemBatch(
      batch.map(({ item }) => item),
      fetchImpl,
    );
    for (const [batchIndex, hydratedItem] of hydratedBatch.entries()) {
      const originalIndex = batch[batchIndex]?.index;
      if (originalIndex !== undefined) {
        hydratedItems[originalIndex] = hydratedItem;
      }
    }
    onItems(hydratedItems);
  }
  return hydratedItems;
}

async function hydrateSoulNftGalleryItemBatch<T extends SoulNftGalleryItem | ClaimedSoulNftGalleryItem>(
  items: T[],
  fetchImpl: ProvenanceFetch,
): Promise<T[]> {
  return Promise.all(
    items.map(async (item) => {
      const marketProvenance = await hydrateMarketProvenanceWithRpc(
        item.marketProvenance,
        fetchImpl,
        item.marketProvenanceLookup,
      );
      return {
        ...item,
        soulRarity: deriveSoulRarityForGalleryItem(item, marketProvenance),
        marketProvenance,
        marketProvenanceStatus: claimedMarketProvenanceStatus(
          marketProvenance,
          item.marketProvenanceLookup,
        ),
      };
    }),
  );
}

function deriveSoulRarityForGalleryItem(
  item: SoulNftGalleryItem | ClaimedSoulNftGalleryItem,
  marketProvenance: MarketProvenanceDetails | null | undefined = item.marketProvenance,
): SoulRarityInfo {
  const claim = "claim" in item ? item.claim : undefined;
  return soulRarityWithMetadata(
    item.metadataRarity,
    deriveSoulRarity({
      claim,
      nftMint: "nftMint" in item ? item.nftMint : item.mint,
      tokenMint: item.tokenMint ?? undefined,
      tokenAccount: claim ? undefined : "tokenAccount" in item ? item.tokenAccount : undefined,
      soul: item.marketProvenanceLookup?.soul ?? marketProvenance?.soul,
      generation:
        marketProvenance?.generation ??
        item.marketProvenanceLookup?.generation ??
        item.soulRarity.generation ??
        undefined,
      sequence: item.sequence,
      artTheme: item.artTheme.label,
      seedHash: marketProvenance?.seedHash,
      side: marketProvenance?.side,
      amount: marketProvenance?.amount,
      trader: marketProvenance?.trader,
    }),
  );
}

function orderItemsForProvenanceHydration<T extends SoulNftGalleryItem | ClaimedSoulNftGalleryItem>(
  items: T[],
): Array<{ index: number; item: T }> {
  return items
    .map((item, index) => ({ index, item }))
    .sort(
      (left, right) =>
        provenanceHydrationPriority(right.item) - provenanceHydrationPriority(left.item) ||
        left.index - right.index,
    );
}

function normalizeHydrationBatchSize(batchSize: number): number {
  return Number.isFinite(batchSize) && batchSize > 0 ? Math.floor(batchSize) : 1;
}

export function truncateWallet(address: string): string {
  if (address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function parseSoulMetadataSequence(name: string, symbol: string): number | null {
  if (!symbol || /[^\x00-\x7f]/.test(symbol)) {
    return null;
  }
  const prefix = `${symbol} Soul #`;
  if (!name.startsWith(prefix)) {
    return null;
  }
  const rawSequence = name.slice(prefix.length);
  if (!/^\d+$/.test(rawSequence)) {
    return null;
  }
  const sequence = Number(rawSequence);
  return Number.isSafeInteger(sequence) ? sequence : null;
}

function decodeDataUri(uri: string, mimeType: string): string | null {
  const prefix = `data:${mimeType}`;
  if (!uri.startsWith(prefix)) {
    return null;
  }

  const commaIndex = uri.indexOf(",");
  if (commaIndex < 0) {
    return null;
  }

  const metadata = uri.slice(0, commaIndex).toLowerCase();
  const payload = uri.slice(commaIndex + 1);

  try {
    if (metadata.endsWith(";base64")) {
      const binary = globalThis.atob(payload);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }

    if (metadata.endsWith(";utf8") || metadata === prefix) {
      return decodeURIComponent(payload);
    }
  } catch {
    return null;
  }

  return null;
}

function soulNftAssociationFromMapValue(
  value: string | SoulNftAssociation | undefined,
): SoulNftAssociation | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return { tokenMint: value };
  }
  return value;
}

function claimedMarketProvenanceStatus(
  provenance: MarketProvenanceDetails | null | undefined,
  lookup?: MarketProvenanceLookup,
): Exclude<MarketProvenanceEvidenceState, "not-applicable"> {
  const state = marketProvenanceEvidenceState(provenance, lookup);
  return state === "not-applicable" ? "pending" : state;
}

function marketProvenanceLookupFromAssociation(
  association: SoulNftAssociation,
  provenance: MarketProvenanceDetails | null | undefined,
): MarketProvenanceLookup | undefined {
  const generation = association.generation ?? provenance?.generation;
  if (generation === undefined) {
    return undefined;
  }

  return {
    tokenMint: association.tokenMint || provenance?.tokenMint,
    soul: association.soul ?? provenance?.soul,
    generation,
  };
}

function provenanceHydrationPriority(
  item: SoulNftGalleryItem | ClaimedSoulNftGalleryItem,
): number {
  const generation = Number(item.marketProvenanceLookup?.generation ?? item.marketProvenance?.generation ?? 0);
  if (
    !item.marketProvenance &&
    item.marketProvenanceLookup?.tokenMint &&
    item.marketProvenanceLookup.soul &&
    generation <= 1
  ) {
    return 6;
  }
  if (item.marketProvenance && !item.marketProvenance.signature) {
    return 5;
  }
  if (!item.marketProvenance && item.marketProvenanceLookup && generation > 1) {
    return 4;
  }
  if (!item.marketProvenance && item.marketProvenanceLookup) {
    return 3;
  }
  return 1;
}
