export type SoulRarityTierId =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic";

export type SoulRarityTraitKind =
  | "generationBand"
  | "tradeSignal"
  | "seedSource"
  | "claimRank"
  | "artTheme";

export type SoulGenerationBandTrait = "unknown" | "genesis" | "early" | "established" | "deepCycle";
export type SoulTradeSignalTrait = "unknown" | "buy" | "sell";
export type SoulSeedSourceTrait = "onChainSeedHash" | "metadataFallback";
export type SoulClaimRankTrait = "unranked" | "firstClaim" | "earlyClaim" | "archivalClaim";
export type SoulArtThemeTrait =
  | "neonpuff"
  | "soulpuff"
  | "monochrome"
  | "hexagram"
  | "signal"
  | "fractal"
  | "field"
  | "lattice"
  | "chaos"
  | "harmonic"
  | "pixel_fractal"
  | "pixel_art"
  | "symphony"
  | "custom"
  | "legacy";

export type SoulRarityTraitValue =
  | SoulGenerationBandTrait
  | SoulTradeSignalTrait
  | SoulSeedSourceTrait
  | SoulClaimRankTrait
  | SoulArtThemeTrait;

export interface SoulRarityTrait {
  kind: SoulRarityTraitKind;
  value: SoulRarityTraitValue;
}

export interface SoulRarityInput {
  nftMint?: string;
  tokenMint?: string;
  tokenAccount?: string;
  claim?: string;
  soul?: string;
  generation?: string | number | bigint;
  sequence?: string | number | bigint;
  artTheme?: string;
  seedHash?: string;
  side?: string;
  amount?: string | number | bigint;
  trader?: string;
}

export interface SoulRarityInfo {
  tier: SoulRarityTierId;
  score: number;
  generation: string | null;
  traits: SoulRarityTrait[];
}

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const FNV_MASK_64 = 0xffffffffffffffffn;

export function deriveSoulRarity(input: SoulRarityInput): SoulRarityInfo {
  const generation = normalizePositiveInteger(input.generation);
  const sequence = normalizePositiveInteger(input.sequence);
  const seedHash = normalizeSignal(input.seedHash);
  const claim = normalizeSignal(input.claim);
  const tokenAccount = claim ? null : normalizeSignal(input.tokenAccount);
  const scoreSeed = [
    ["nft", input.nftMint],
    ["token", input.tokenMint],
    ["account", tokenAccount],
    ["claim", claim],
    ["soul", input.soul],
    ["generation", generation],
    ["sequence", sequence],
    ["theme", input.artTheme],
    ["seedHash", seedHash],
    ["side", normalizeSide(input.side)],
    ["amount", normalizeSignal(input.amount)],
    ["trader", input.trader],
  ]
    .map(([key, value]) => `${key}:${normalizeSignal(value) ?? "unknown"}`)
    .join("|");

  const percentile = Number(fnv1a64(scoreSeed) % 1000n);
  const score = 100 + Math.floor((percentile * 900) / 999);

  return {
    tier: tierForPercentile(percentile),
    score,
    generation,
    traits: [
      { kind: "generationBand", value: generationBand(generation) },
      { kind: "tradeSignal", value: normalizeSide(input.side) ?? "unknown" },
      { kind: "seedSource", value: seedHash ? "onChainSeedHash" : "metadataFallback" },
      { kind: "claimRank", value: claimRank(sequence) },
      { kind: "artTheme", value: artThemeTrait(input.artTheme) },
    ],
  };
}

function normalizeSignal(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = value.toString().trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePositiveInteger(value: unknown): string | null {
  const normalized = normalizeSignal(value);
  if (!normalized || !/^\d+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeSide(value: unknown): SoulTradeSignalTrait | null {
  return value === "buy" || value === "sell" ? value : null;
}

function generationBand(generation: string | null): SoulGenerationBandTrait {
  if (!generation) {
    return "unknown";
  }
  const value = BigInt(generation);
  if (value <= 1n) {
    return "genesis";
  }
  if (value <= 10n) {
    return "early";
  }
  if (value <= 100n) {
    return "established";
  }
  return "deepCycle";
}

function claimRank(sequence: string | null): SoulClaimRankTrait {
  if (!sequence) {
    return "unranked";
  }
  const value = BigInt(sequence);
  if (value === 0n) {
    return "firstClaim";
  }
  if (value <= 10n) {
    return "earlyClaim";
  }
  return "archivalClaim";
}

function artThemeTrait(value: unknown): SoulArtThemeTrait {
  const normalized = normalizeSignal(value)?.toLowerCase() ?? "";
  if (normalized.includes("neonpuff") || normalized.includes("neon puff")) {
    return "neonpuff";
  }
  if (normalized.includes("soulpuff") || normalized.includes("soul puff")) {
    return "soulpuff";
  }
  if (normalized.includes("hexagram") || normalized.includes("oracle")) {
    return "hexagram";
  }
  if (normalized.includes("signal") || normalized.includes("unipeg")) {
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
  if (normalized.includes("monochrome") || normalized.includes("pd9")) {
    return "monochrome";
  }
  return "legacy";
}

function tierForPercentile(percentile: number): SoulRarityTierId {
  if (percentile >= 995) {
    return "mythic";
  }
  if (percentile >= 970) {
    return "legendary";
  }
  if (percentile >= 900) {
    return "epic";
  }
  if (percentile >= 750) {
    return "rare";
  }
  if (percentile >= 500) {
    return "uncommon";
  }
  return "common";
}

function fnv1a64(value: string): bigint {
  let hash = FNV_OFFSET_64;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * FNV_PRIME_64) & FNV_MASK_64;
  }
  return hash;
}
