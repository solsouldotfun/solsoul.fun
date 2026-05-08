import {
  resolveMtClaimQuantum,
  resolveSoulTheme,
  type LaunchedToken,
  type ResolvedSoulTheme,
  type SoulAccount,
} from "sdk";
import { buildCurveEconomicsView } from "./curveEconomics";
import { formatSolUnits, formatTokenUnits } from "./curveMath";
import {
  hydrateMarketProvenanceWithRpc,
  marketProvenanceEvidenceState,
  marketProvenanceFromSdk,
  type MarketProvenanceDetails,
  type MarketProvenanceEvidenceState,
  type MarketProvenanceLookup,
  type ProvenanceFetch,
} from "./marketProvenance";
import { deriveSoulRarity, type SoulRarityTierId } from "./soulRarity";
import { truncateWallet } from "./soulGallery";

export type SoulDiscoveryStatus = "no-generation" | "generated-unclaimed" | "claimed";
export type TokenDiscoverySegmentKey =
  | "fresh-souls"
  | "hot-flow"
  | "most-generated"
  | "rare-energy"
  | "top-volume"
  | "new-launches";

export const TOKEN_DISCOVERY_SEGMENTS: TokenDiscoverySegmentKey[] = [
  "fresh-souls",
  "hot-flow",
  "most-generated",
  "rare-energy",
  "top-volume",
  "new-launches",
];

export interface LaunchedTokenFeedItem {
  mint: string;
  mintLabel: string;
  href: string;
  symbol: string;
  creator: string;
  creatorLabel: string;
  currentPrice: string;
  availability: string;
  createdAtLabel: string;
  latestSoulSvg: string | null;
  soulStatus: SoulDiscoveryStatus;
  soulStatusLabel: string;
  flowLabel: string;
  latestFlowLabel: string | null;
  marketProgressLabel: string;
  latestEnergyScore: number | null;
  latestRarityTier: SoulRarityTierId | null;
  generationCount: string;
  claimCount: string;
  claimStatusLabel: string;
  holderGateLabel: string;
  artTheme: {
    id: ResolvedSoulTheme["id"];
    label: string;
    renderer: ResolvedSoulTheme["renderer"];
  };
  marketProvenance: MarketProvenanceDetails | null;
  marketProvenanceStatus: MarketProvenanceEvidenceState;
  marketProvenanceLookup?: MarketProvenanceLookup;
  discoverySort: {
    createdAtUnix: number;
    cumulativeSolLamports: string;
    totalMintedBaseUnits: string;
    generationCount: string;
    claimCount: string;
    latestTradeAmount: string;
    energyScore: number;
    hasSoul: boolean;
  };
}

export function buildLaunchedTokenFeedItems(
  tokens: LaunchedToken[],
  locale: string,
): LaunchedTokenFeedItem[] {
  const feedLocale = resolveFeedLocale(locale);

  return tokens.map((token) => {
    const mint = token.mint.toBase58();
    const creator = (token.soulAccount?.authority ?? token.mint).toBase58();
    const economics = buildCurveEconomicsView(token.bondingCurve);
    const soulFields = buildSoulDiscoveryFields(token.soulAccount, token, feedLocale);

    return {
      mint,
      mintLabel: truncateWallet(mint),
      href: `/token/${mint}`,
      symbol: token.soulAccount?.memeSymbol || "Token",
      creator,
      creatorLabel: truncateWallet(creator),
      currentPrice: economics.currentPrice,
      availability: availabilityLabel(token, feedLocale),
      createdAtLabel: formatCreatedAt(token.createdAt, feedLocale),
      flowLabel: formatFlowLabel(token.bondingCurve.cumulativeSol, feedLocale),
      latestFlowLabel: formatLatestFlowLabel(soulFields.marketProvenance, feedLocale),
      marketProgressLabel: economics.percentMinted,
      discoverySort: {
        createdAtUnix: normalizeCreatedAt(token.createdAt),
        cumulativeSolLamports: token.bondingCurve.cumulativeSol.toString(),
        totalMintedBaseUnits: token.bondingCurve.totalMinted.toString(),
        generationCount: soulFields.generationCount,
        claimCount: soulFields.claimCount,
        latestTradeAmount: soulFields.marketProvenance?.amount ?? "0",
        energyScore: soulFields.latestEnergyScore ?? 0,
        hasSoul: soulFields.latestSoulSvg !== null,
      },
      ...soulFields,
    };
  });
}

export function getTokenDiscoverySegmentItems(
  items: LaunchedTokenFeedItem[],
  segment: TokenDiscoverySegmentKey,
): LaunchedTokenFeedItem[] {
  const ranked = items.map((item, index) => ({ item, index }));
  ranked.sort((left, right) => {
    const result = compareDiscoveryItems(left.item, right.item, segment);
    return result === 0 ? left.index - right.index : result;
  });
  return ranked.map(({ item }) => item);
}

type FeedLocale = "en" | "zh";

const FEED_LABELS = {
  en: {
    migrated: "Curve migrated",
    graduated: "Curve completed",
    tradeAvailable: "Curve buy/sell available",
    recentLaunch: "Recent launch",
    noSoulYet: "No Soul yet",
    generatedUnclaimed: "Generated / unclaimed",
    claimed: "Claimed / in collection",
    noClaimsYet: "No claims yet",
    claimedSouls: (count: string) => `${count} claimed Soul${count === "1" ? "" : "s"}`,
    unclaimedSouls: (count: string) => `${count} unclaimed Soul candidate${count === "1" ? "" : "s"}`,
    tradeToGenerate: "Trade to generate a Soul candidate before holders can claim.",
    holderGated: (required: string) => `Holder-gated claimable: hold at least ${required} meme token.`,
    allClaimed: "All generated Souls are claimed; trade again to create a new claimable candidate.",
    lockedFlow: (value: string) => `${value} SOL locked`,
    buyFlow: (value: string) => `latest buy ${value} tokens`,
    sellFlow: (value: string) => `latest sell ${value} tokens`,
  },
  zh: {
    migrated: "曲线已迁移",
    graduated: "曲线已完成",
    tradeAvailable: "曲线买入/卖出可用",
    recentLaunch: "最近发射",
    noSoulYet: "还没有 Soul",
    generatedUnclaimed: "已生成 / 未领取",
    claimed: "已领取 / 在收藏中",
    noClaimsYet: "还没有领取",
    claimedSouls: (count: string) => `已领取 ${count} 个 Soul`,
    unclaimedSouls: (count: string) => `${count} 个未领取 Soul 候选`,
    tradeToGenerate: "先交易以生成 Soul 候选，然后持有人才能领取。",
    holderGated: (required: string) => `持有人门槛：至少持有 ${required} 个代币才能领取。`,
    allClaimed: "所有已生成 Soul 均已领取；继续交易可生成新的可领取候选。",
    lockedFlow: (value: string) => `锁定 ${value} SOL`,
    buyFlow: (value: string) => `最新买入 ${value} 枚`,
    sellFlow: (value: string) => `最新卖出 ${value} 枚`,
  },
} satisfies Record<
  FeedLocale,
  {
    migrated: string;
    graduated: string;
    tradeAvailable: string;
    recentLaunch: string;
    noSoulYet: string;
    generatedUnclaimed: string;
    claimed: string;
    noClaimsYet: string;
    claimedSouls: (count: string) => string;
    unclaimedSouls: (count: string) => string;
    tradeToGenerate: string;
    holderGated: (required: string) => string;
    allClaimed: string;
    lockedFlow: (value: string) => string;
    buyFlow: (value: string) => string;
    sellFlow: (value: string) => string;
  }
>;

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function resolveFeedLocale(locale: string): FeedLocale {
  return locale.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function availabilityLabel(token: LaunchedToken, locale: FeedLocale): string {
  const labels = FEED_LABELS[locale];

  if (token.bondingCurve.selfDeprecated) {
    return labels.graduated;
  }
  return labels.tradeAvailable;
}

function buildSoulDiscoveryFields(
  soul: SoulAccount | null,
  token: LaunchedToken,
  locale: FeedLocale,
): Pick<
  LaunchedTokenFeedItem,
  | "latestSoulSvg"
  | "soulStatus"
  | "soulStatusLabel"
  | "generationCount"
  | "claimCount"
  | "claimStatusLabel"
  | "holderGateLabel"
  | "latestEnergyScore"
  | "latestRarityTier"
  | "artTheme"
  | "marketProvenance"
  | "marketProvenanceStatus"
  | "marketProvenanceLookup"
> {
  const labels = FEED_LABELS[locale];
  const generationCount = soul?.generationCount ?? 0n;
  const claimCount = soul?.claimCount ?? 0n;
  const unclaimedCount = generationCount > claimCount ? generationCount - claimCount : 0n;
  const hasPreview = Boolean(soul && soul.lastSvgLen > 0 && soul.lastSvg.length > 0);
  const lookup = soul
    ? {
        tokenMint: token.mint.toBase58(),
        soul: token.soul.toBase58(),
        generation: generationCount,
      }
    : undefined;

  if (!soul || !hasPreview || generationCount === 0n) {
    return {
      latestSoulSvg: null,
      soulStatus: "no-generation",
      soulStatusLabel: labels.noSoulYet,
      latestEnergyScore: null,
      latestRarityTier: null,
      generationCount: generationCount.toString(),
      claimCount: claimCount.toString(),
      claimStatusLabel: labels.noClaimsYet,
      holderGateLabel: labels.tradeToGenerate,
      artTheme: resolveTokenTheme(soul),
      marketProvenance: null,
      marketProvenanceStatus: "not-applicable",
      marketProvenanceLookup: undefined,
    };
  }

  const marketProvenance = marketProvenanceFromSdk(soul.latestGenerationProvenance);
  const marketProvenanceStatus = marketProvenanceEvidenceState(marketProvenance, lookup);
  const rarity = deriveSoulRarity({
    tokenMint: token.mint.toBase58(),
    soul: token.soul.toBase58(),
    generation: generationCount,
    artTheme: resolveTokenTheme(soul).id,
    seedHash: marketProvenance?.seedHash,
    side: marketProvenance?.side,
    amount: marketProvenance?.amount,
    trader: marketProvenance?.trader,
  });

  if (unclaimedCount > 0n) {
    return {
      latestSoulSvg: soul.lastSvg,
      soulStatus: "generated-unclaimed",
      soulStatusLabel: labels.generatedUnclaimed,
      latestEnergyScore: rarity.score,
      latestRarityTier: rarity.tier,
      generationCount: generationCount.toString(),
      claimCount: claimCount.toString(),
      claimStatusLabel: labels.unclaimedSouls(unclaimedCount.toString()),
      holderGateLabel: labels.holderGated(formatTokenAmount(getRequiredClaimBalance(soul))),
      artTheme: resolveTokenTheme(soul),
      marketProvenance,
      marketProvenanceStatus,
      marketProvenanceLookup: lookup,
    };
  }

  return {
    latestSoulSvg: soul.lastSvg,
    soulStatus: "claimed",
    soulStatusLabel: labels.claimed,
    latestEnergyScore: rarity.score,
    latestRarityTier: rarity.tier,
    generationCount: generationCount.toString(),
    claimCount: claimCount.toString(),
    claimStatusLabel: labels.claimedSouls(claimCount.toString()),
    holderGateLabel: labels.allClaimed,
    artTheme: resolveTokenTheme(soul),
    marketProvenance,
    marketProvenanceStatus,
    marketProvenanceLookup: lookup,
  };
}

function resolveTokenTheme(soul: SoulAccount | null) {
  const theme =
    soul?.artTheme ??
    resolveSoulTheme({
      templateLen: soul?.templateLen ?? 0,
      styleParams: soul?.styleParamsBytes ?? soul?.styleParams ?? "",
    });
  return {
    id: theme.id,
    label: theme.label,
    renderer: theme.renderer,
  };
}

export async function hydrateLaunchedTokenFeedItemsWithRpcProvenance(
  items: LaunchedTokenFeedItem[],
  fetchImpl: ProvenanceFetch = globalThis.fetch,
): Promise<LaunchedTokenFeedItem[]> {
  return Promise.all(
    items.map(async (item) => {
      const marketProvenance = await hydrateMarketProvenanceWithRpc(
        item.marketProvenance,
        fetchImpl,
        item.marketProvenanceLookup,
      );
      return {
        ...item,
        marketProvenance,
        marketProvenanceStatus: marketProvenanceEvidenceState(
          marketProvenance,
          item.marketProvenanceLookup,
        ),
      };
    }),
  );
}

export async function hydrateLaunchedTokenFeedItemsWithRpcProvenanceProgressively(
  items: LaunchedTokenFeedItem[],
  onItems: (items: LaunchedTokenFeedItem[]) => void,
  fetchImpl: ProvenanceFetch = globalThis.fetch,
  batchSize = 2,
): Promise<LaunchedTokenFeedItem[]> {
  let hydratedItems = [...items];
  const orderedItems = items
    .map((item, index) => ({ index, item }))
    .sort((left, right) => provenanceHydrationPriority(right.item) - provenanceHydrationPriority(left.item));

  for (let index = 0; index < orderedItems.length; index += batchSize) {
    const batch = orderedItems.slice(index, index + batchSize);
    const hydratedBatch = await hydrateLaunchedTokenFeedItemsWithRpcProvenance(
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

function provenanceHydrationPriority(item: LaunchedTokenFeedItem): number {
  const generation = Number(item.marketProvenanceLookup?.generation ?? item.marketProvenance?.generation ?? 0);
  if (!item.marketProvenance && item.marketProvenanceLookup && generation > 1) {
    return 5;
  }
  if (!item.marketProvenance && item.marketProvenanceLookup) {
    return 4;
  }
  if (item.marketProvenance && !item.marketProvenance.signature) {
    return 3;
  }
  return 1;
}

function getRequiredClaimBalance(soul: SoulAccount): bigint {
  return resolveMtClaimQuantum(soul.minClaimBalance);
}

function formatTokenAmount(baseUnits: bigint): string {
  const whole = baseUnits / 1_000_000n;
  const fractional = (baseUnits % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${fractional}`;
}

function compareDiscoveryItems(
  left: LaunchedTokenFeedItem,
  right: LaunchedTokenFeedItem,
  segment: TokenDiscoverySegmentKey,
): number {
  switch (segment) {
    case "fresh-souls":
      return (
        compareBoolean(left.discoverySort.hasSoul, right.discoverySort.hasSoul) ||
        compareBigInt(left.discoverySort.generationCount, right.discoverySort.generationCount) ||
        compareNumber(left.discoverySort.createdAtUnix, right.discoverySort.createdAtUnix)
      );
    case "hot-flow":
      return (
        compareBigInt(left.discoverySort.latestTradeAmount, right.discoverySort.latestTradeAmount) ||
        compareBigInt(left.discoverySort.cumulativeSolLamports, right.discoverySort.cumulativeSolLamports)
      );
    case "most-generated":
      return compareBigInt(left.discoverySort.generationCount, right.discoverySort.generationCount);
    case "rare-energy":
      return (
        compareNumber(left.discoverySort.energyScore, right.discoverySort.energyScore) ||
        compareBigInt(left.discoverySort.generationCount, right.discoverySort.generationCount)
      );
    case "top-volume":
      return compareBigInt(left.discoverySort.cumulativeSolLamports, right.discoverySort.cumulativeSolLamports);
    case "new-launches":
      return compareNumber(left.discoverySort.createdAtUnix, right.discoverySort.createdAtUnix);
  }
}

function compareBigInt(left: string, right: string): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  if (leftValue === rightValue) {
    return 0;
  }
  return leftValue > rightValue ? -1 : 1;
}

function compareNumber(left: number, right: number): number {
  return left === right ? 0 : left > right ? -1 : 1;
}

function compareBoolean(left: boolean, right: boolean): number {
  return left === right ? 0 : left ? -1 : 1;
}

function formatFlowLabel(cumulativeSol: bigint, locale: FeedLocale): string {
  return FEED_LABELS[locale].lockedFlow(formatSolUnits(cumulativeSol));
}

function formatLatestFlowLabel(
  marketProvenance: MarketProvenanceDetails | null,
  locale: FeedLocale,
): string | null {
  if (!marketProvenance) {
    return null;
  }
  const amount = BigInt(marketProvenance.amount);
  const value = formatTokenUnits(amount);
  return marketProvenance.side === "sell"
    ? FEED_LABELS[locale].sellFlow(value)
    : FEED_LABELS[locale].buyFlow(value);
}

function normalizeCreatedAt(createdAt: bigint | null): number {
  if (createdAt === null || createdAt <= 0n) {
    return 0;
  }
  return Number(createdAt);
}

function formatCreatedAt(createdAt: bigint | null, locale: FeedLocale): string {
  if (createdAt === null || createdAt <= 0n) {
    return FEED_LABELS[locale].recentLaunch;
  }

  const date = new Date(Number(createdAt) * 1000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");

  if (locale === "zh") {
    return `${year}年${month + 1}月${day}日 ${hour}:${minute} UTC`;
  }

  return `${EN_MONTHS[month]} ${day}, ${year}, ${hour}:${minute} UTC`;
}
