import { describe, expect, it } from "vitest";
import {
  animatedSoulEvolutionStateForProfile,
  deriveAnimatedSoulProfileForPreview,
  deriveSoulEvolutionDisplayState,
} from "./animatedSoulSurfaces";

const previewInput = {
  seed: "surface-evolution-display-fixture",
  theme: "fractal",
  provenanceSide: "buy",
  generation: 12n,
  amount: 1_000_000_000n,
  tokenAmount: 10_000_000_000n,
  styleParams: new Uint8Array(),
} as const;

describe("soul evolution display state", () => {
  it("derives stable website-only level, stage, energy, generation, rarity, and provenance fields", () => {
    const first = deriveSoulEvolutionDisplayState({
      generation: 12n,
      provenanceSide: "buy",
      tokenAmount: 10_000_000_000n,
      rarityTier: "epic",
      rarityScore: 880,
      claimCount: 2n,
    });
    const repeat = deriveSoulEvolutionDisplayState({
      generation: "12",
      provenanceSide: "buy",
      tokenAmount: "10000000000",
      rarityTier: "epic",
      rarityScore: "880",
      claimCount: "2",
    });

    expect(first).toEqual(repeat);
    expect(first).toMatchObject({
      generation: 12,
      rarityTier: "epic",
      rarityScore: 880,
      provenance: "buy",
      claimCount: 2,
    });
    expect(first.level).toBeGreaterThanOrEqual(1);
    expect(first.energy).toBeGreaterThan(50);
    expect(first.energy).toBeLessThanOrEqual(99);
    expect(["flow", "radiant", "archival"]).toContain(first.stage);
  });

  it("keeps unborn or unverifiable Souls in a safe seed state without inventing provenance", () => {
    const state = deriveSoulEvolutionDisplayState({
      generation: 0,
      provenanceSide: null,
      rarityTier: null,
      rarityScore: null,
      claimCount: null,
    });

    expect(state).toEqual({
      level: 1,
      stage: "seed",
      energy: 18,
      generation: 0,
      rarityTier: "unranked",
      rarityScore: null,
      provenance: "unknown",
      claimCount: 0,
      receiptState: undefined,
    });
  });

  it("maps display state into the deterministic animation profile identity", () => {
    const young = deriveSoulEvolutionDisplayState({
      generation: 1,
      provenanceSide: "buy",
      tokenAmount: 1_000_000n,
      rarityTier: "common",
      rarityScore: 210,
      claimCount: 0,
    });
    const evolved = deriveSoulEvolutionDisplayState({
      generation: 48,
      provenanceSide: "sell",
      tokenAmount: 50_000_000_000n,
      rarityTier: "legendary",
      rarityScore: 980,
      claimCount: 8,
    });

    const youngProfile = deriveAnimatedSoulProfileForPreview(previewInput, {
      evolutionState: animatedSoulEvolutionStateForProfile(young),
      displayState: { surface: "tokenDetail", density: "hero", motion: "auto" },
    });
    const evolvedProfile = deriveAnimatedSoulProfileForPreview(previewInput, {
      evolutionState: animatedSoulEvolutionStateForProfile(evolved),
      displayState: { surface: "tokenDetail", density: "hero", motion: "auto" },
    });

    expect(animatedSoulEvolutionStateForProfile(evolved)).toMatchObject({
      level: evolved.level,
      stage: evolved.stage,
      energy: evolved.energy,
      generation: evolved.generation,
      rarityTier: evolved.rarityTier,
      rarityScore: evolved.rarityScore,
      provenanceSide: evolved.provenance,
      claimCount: evolved.claimCount,
    });
    expect(evolvedProfile.flowProfile).not.toEqual(youngProfile.flowProfile);
    expect(evolvedProfile.cssVariables).not.toEqual(youngProfile.cssVariables);
  });
});
