import type {
  AnimatedSoulDisplayState,
  AnimatedSoulEvolutionState,
  AnimatedSoulProfile,
} from "./animatedSoulProfile";
import { deriveAnimatedSoulProfile } from "./animatedSoulProfile";
import type { SoulRarityTierId } from "./soulRarity";
import {
  deriveAppBlendedSoulTraits,
  type AppBlendedSoulTraitInput,
} from "./soulTraits";

export interface AnimatedSoulProfilePreviewOptions {
  evolutionState?: AnimatedSoulEvolutionState;
  displayState?: AnimatedSoulDisplayState;
}

export type SoulEvolutionDisplayStage =
  | "seed"
  | "awakening"
  | "flow"
  | "radiant"
  | "archival";

export type SoulEvolutionDisplayProvenance = "buy" | "sell" | "unknown";

export interface SoulEvolutionDisplayState {
  level: number;
  stage: SoulEvolutionDisplayStage;
  energy: number;
  generation: number;
  rarityTier: SoulRarityTierId | "unranked";
  rarityScore: number | null;
  provenance: SoulEvolutionDisplayProvenance;
  claimCount: number;
  receiptState?: string;
}

export interface SoulEvolutionDisplayStateInput {
  generation?: string | number | bigint | null;
  provenanceSide?: string | number | bigint | null;
  amount?: string | number | bigint | null;
  tokenAmount?: string | number | bigint | null;
  rarityTier?: SoulRarityTierId | null;
  rarityScore?: string | number | bigint | null;
  claimCount?: string | number | bigint | null;
  receiptState?: string | null;
}

export function deriveAnimatedSoulProfileForPreview(
  input: AppBlendedSoulTraitInput,
  options: AnimatedSoulProfilePreviewOptions = {},
): AnimatedSoulProfile {
  const traits = deriveAppBlendedSoulTraits(input);
  const displayEvolutionState = deriveSoulEvolutionDisplayState({
    generation: input.generation,
    provenanceSide: input.provenanceSide,
    amount: input.amount,
    tokenAmount: input.tokenAmount,
  });

  return deriveAnimatedSoulProfile({
    seed: input.seed,
    finalizedTraits: {
      core: traits.core,
      generated: traits.defaults,
    },
    animationBehavior: traits.defaults.animationBehavior,
    evolutionState: {
      ...animatedSoulEvolutionStateForProfile(displayEvolutionState),
      ...options.evolutionState,
    },
    displayState: options.displayState,
  });
}

export function deriveSoulEvolutionDisplayState(
  input: SoulEvolutionDisplayStateInput,
): SoulEvolutionDisplayState {
  const generation = clampInteger(safeInteger(input.generation), 0, 10_000);
  const claimCount = clampInteger(safeInteger(input.claimCount), 0, 10_000);
  const rarityTier = input.rarityTier ?? "unranked";
  const rarityScore = normalizedRarityScore(input.rarityScore);
  const rarityBonus = rarityTierBonus(rarityTier);
  const provenance = normalizeProvenance(input.provenanceSide);
  const amountEnergy = amountMagnitudeEnergy(input.tokenAmount ?? input.amount);
  const generationEnergy = Math.min(34, Math.round(Math.sqrt(generation) * 5));
  const provenanceEnergy = provenance === "buy" ? 4 : provenance === "sell" ? 2 : 0;
  const rarityEnergy =
    rarityScore == null
      ? rarityBonus * 5
      : Math.round(clamp((rarityScore - 100) / 900, 0, 1) * 30);
  const energy = clampInteger(
    18 + generationEnergy + rarityEnergy + amountEnergy + provenanceEnergy,
    generation === 0 ? 8 : 12,
    99,
  );
  const level = clampInteger(
    1 +
      (generation <= 0 ? 0 : Math.floor(Math.log2(generation + 1))) +
      rarityBonus +
      Math.min(6, Math.floor(claimCount / 3)),
    1,
    64,
  );

  return {
    level,
    stage: stageForEvolution({ generation, level, energy, rarityTier, claimCount }),
    energy,
    generation,
    rarityTier,
    rarityScore,
    provenance,
    claimCount,
    receiptState: input.receiptState ?? undefined,
  };
}

export function animatedSoulEvolutionStateForProfile(
  displayState: SoulEvolutionDisplayState,
): AnimatedSoulEvolutionState {
  return {
    level: displayState.level,
    stage: displayState.stage,
    energy: displayState.energy,
    generation: displayState.generation,
    rarityTier: displayState.rarityTier,
    rarityScore: displayState.rarityScore,
    provenanceSide: displayState.provenance,
    claimCount: displayState.claimCount,
    receiptState: displayState.receiptState,
  };
}

function stageForEvolution({
  generation,
  level,
  energy,
  rarityTier,
  claimCount,
}: {
  generation: number;
  level: number;
  energy: number;
  rarityTier: SoulEvolutionDisplayState["rarityTier"];
  claimCount: number;
}): SoulEvolutionDisplayStage {
  if (generation <= 0) {
    return "seed";
  }
  if (claimCount >= 12 || (claimCount > 0 && generation >= 50)) {
    return "archival";
  }
  if (rarityTier === "mythic" || rarityTier === "legendary" || energy >= 86) {
    return "radiant";
  }
  if (level <= 3 || generation <= 2) {
    return "awakening";
  }
  return "flow";
}

function normalizeProvenance(
  value: SoulEvolutionDisplayStateInput["provenanceSide"],
): SoulEvolutionDisplayProvenance {
  const normalized = value == null ? "" : value.toString().trim().toLowerCase();
  if (normalized === "buy" || normalized === "1") {
    return "buy";
  }
  if (normalized === "sell" || normalized === "2") {
    return "sell";
  }
  return "unknown";
}

function normalizedRarityScore(
  value: SoulEvolutionDisplayStateInput["rarityScore"],
): number | null {
  if (value == null) {
    return null;
  }
  const parsed = Number(value.toString());
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return clampInteger(parsed, 100, 1000);
}

function rarityTierBonus(tier: SoulEvolutionDisplayState["rarityTier"]): number {
  switch (tier) {
    case "mythic":
      return 6;
    case "legendary":
      return 5;
    case "epic":
      return 4;
    case "rare":
      return 3;
    case "uncommon":
      return 2;
    case "common":
      return 1;
    case "unranked":
      return 0;
  }
}

function amountMagnitudeEnergy(
  value: SoulEvolutionDisplayStateInput["amount"],
): number {
  if (value == null) {
    return 0;
  }
  const normalized = value.toString().replace(/^-/, "").replace(/\D/g, "");
  if (normalized.length === 0 || /^0+$/.test(normalized)) {
    return 0;
  }
  return clampInteger((normalized.length - 1) * 3, 0, 24);
}

function safeInteger(value: string | number | bigint | null | undefined): number {
  if (value == null) {
    return 0;
  }
  if (typeof value === "bigint") {
    return Number(value > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : value);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.trunc(numeric);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
