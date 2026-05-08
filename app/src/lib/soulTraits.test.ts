import { describe, expect, it } from "vitest";
import {
  APP_CORE_ART_TRAIT_CATEGORIES,
  APP_DEFAULT_SOUL_TRAIT_CATEGORIES,
  deriveAppBlendedSoulTraits,
  deriveAppDefaultSoulTraits,
  deriveAppSoulTraitDisplayGroups,
  encodeAppCoreArtTraitStyleParams,
  parseAppCoreArtTraitStyleParams,
} from "./soulTraits";
import { DEFAULT_SOUL_TRAIT_CATEGORIES } from "sdk";

describe("app default Soul trait engine", () => {
  const fixture = (seed: string) =>
    deriveAppDefaultSoulTraits({
      seed,
      theme: "neonpuff",
      provenanceSide: "buy",
      generation: 7n,
      amount: 123_456_789n,
      tokenAmount: 2_000_000n,
    });

  it("exposes bounded stable trait IDs for UI metadata and localization", () => {
    expect(APP_DEFAULT_SOUL_TRAIT_CATEGORIES).toHaveLength(9);
    for (const category of APP_DEFAULT_SOUL_TRAIT_CATEGORIES) {
      expect(category.options.reduce((sum, option) => sum + option.weight, 0)).toBe(10_000);
      expect(category.options.every((option) => /^[a-z0-9_]+$/.test(option.id))).toBe(true);
    }
  });

  it("matches Rust and SDK snapshots for deterministic default Souls", () => {
    expect(fixture("pd16-fixture-alpha")).toEqual({
      characterArchetype: "neonpuff_unicorn",
      gogglesEyes: "rainbow_goggles",
      expression: "diamond_grin",
      gasAuraCloud: "green_gas_puff",
      background: "solana_sky",
      outfit: "hoodie",
      relic: "raydium_orb",
      animationBehavior: "background_pulse",
      gasLevel: "level_2",
    });
    expect(fixture("pd16-fixture-alpha")).toEqual(fixture("pd16-fixture-alpha"));
  });

  it("varies trait IDs across seeds while preserving the same schema", () => {
    const first = fixture("pd16-fixture-alpha");
    const second = fixture("pd16-fixture-beta");

    expect(second).not.toEqual(first);
    expect(Object.keys(second)).toEqual(Object.keys(first));
    expect(second.characterArchetype).toBe("vapor_fox");
    expect(second.gasAuraCloud).toBe("rainbow_aura");
  });

  it("matches Rust/SDK reconstruction for a persisted 8-byte seed hash", () => {
    // PD16-Followup parity guard. Snapshot is mirrored byte-for-byte
    // by programs/soul-generator/src/svg/traits.rs and
    // sdk/src/trait.test.ts. Bumping any value here is a parity break.
    const persistedSeedHash = Uint8Array.of(
      0xc6,
      0x13,
      0xe0,
      0x2a,
      0xa4,
      0x84,
      0x60,
      0xb1,
    );
    const reconstructed = deriveAppDefaultSoulTraits({
      seed: persistedSeedHash,
      theme: "neonpuff",
      provenanceSide: "buy",
      generation: 7n,
      amount: 123_456_789n,
      tokenAmount: 2_000_000n,
    });
    expect(reconstructed).toEqual({
      characterArchetype: "gas_goblin",
      gogglesEyes: "starry_eyes",
      expression: "zen_smirk",
      gasAuraCloud: "green_gas_puff",
      background: "solana_sky",
      outfit: "space_jacket",
      relic: "ancient_receipt",
      animationBehavior: "aura_flow",
      gasLevel: "level_3",
    });
    expect(
      deriveAppDefaultSoulTraits({
        seed: persistedSeedHash,
        theme: "neonpuff",
        provenanceSide: "buy",
        generation: 7n,
        amount: 123_456_789n,
        tokenAmount: 2_000_000n,
      }),
    ).toEqual(reconstructed);
  });

  it("matches the byte-array fixture shared with Rust and SDK", () => {
    expect(
      deriveAppDefaultSoulTraits({
        seed: Uint8Array.from({ length: 32 }, (_, index) => index),
        theme: "soulpuff",
        provenanceSide: "sell",
        generation: 42n,
        amount: 555n,
        tokenAmount: 0n,
      }),
    ).toEqual({
      characterArchetype: "neonpuff_unicorn",
      gogglesEyes: "rainbow_goggles",
      expression: "surprised_puff",
      gasAuraCloud: "rainbow_aura",
      background: "checker_stars",
      outfit: "raydium_racer",
      relic: "none",
      animationBehavior: "lens_shine",
      gasLevel: "level_4",
    });
  });

  it("validates compact user-selected core art trait style params", () => {
    expect(APP_CORE_ART_TRAIT_CATEGORIES).toHaveLength(4);
    for (const category of APP_CORE_ART_TRAIT_CATEGORIES) {
      expect(category.options.reduce((sum, option) => sum + option.weight, 0)).toBe(10_000);
    }

    expect(
      parseAppCoreArtTraitStyleParams(
        "theme=fractal;trait_palette=aurora;trait_mood=serene;trait_form=wave",
      ),
    ).toEqual({ palette: "aurora", mood: "serene", form: "wave" });
    expect(parseAppCoreArtTraitStyleParams("theme=fractal;legacy=1")).toEqual({});
    expect(() => parseAppCoreArtTraitStyleParams("trait_palette=unknown")).toThrow(
      /Invalid palette/,
    );
    expect(() =>
      parseAppCoreArtTraitStyleParams(
        "trait_palette=aurora;trait_mood=serene;trait_form=wave;trait_background=grid",
      ),
    ).toThrow(/at most 3/);
    expect(
      encodeAppCoreArtTraitStyleParams(
        { palette: "ember", form: "crystal" },
        "theme=fractal;trait_palette=solana",
      ),
    ).toBe("theme=fractal;trait_palette=ember;trait_form=crystal");
  });

  it("keeps app launch/token default trait schema aligned with the SDK schema", () => {
    expect(
      APP_DEFAULT_SOUL_TRAIT_CATEGORIES.map((category) => ({
        id: category.id,
        options: category.options.map((option) => ({
          id: option.id,
          weight: option.weight,
        })),
      })),
    ).toEqual(
      DEFAULT_SOUL_TRAIT_CATEGORIES.map((category) => ({
        id: category.id,
        options: category.options.map((option) => ({
          id: option.id,
          weight: option.weight,
        })),
      })),
    );
  });

  it("derives final blended core traits deterministically from unselected seed context", () => {
    const first = deriveAppBlendedSoulTraits({
      seed: "pd19-core-trait-alpha",
      theme: "fractal",
      provenanceSide: "buy",
      generation: 7n,
      amount: 123_456_789n,
      tokenAmount: 2_000_000n,
      styleParams: "trait_palette=ember;trait_form=crystal",
    });
    const repeat = deriveAppBlendedSoulTraits({
      seed: "pd19-core-trait-alpha",
      theme: "fractal",
      provenanceSide: "buy",
      generation: 7n,
      amount: 123_456_789n,
      tokenAmount: 2_000_000n,
      styleParams: "trait_palette=ember;trait_form=crystal",
    });

    expect(first).toEqual(repeat);
    expect(first.core.palette).toBe("ember");
    expect(first.core.form).toBe("crystal");
    const filledPairs = new Set<string>();
    for (let index = 0; index < 16; index += 1) {
      const swept = deriveAppBlendedSoulTraits({
        seed: Uint8Array.from({ length: 16 }, () => index),
        theme: "fractal",
        provenanceSide: "buy",
        generation: 7n,
        amount: 123_456_789n,
        tokenAmount: 2_000_000n,
        styleParams: "trait_palette=ember;trait_form=crystal",
      });
      expect(swept.core.palette).toBe("ember");
      expect(swept.core.form).toBe("crystal");
      filledPairs.add(`${swept.core.mood}:${swept.core.background}`);
    }
    expect(filledPairs.size).toBeGreaterThan(1);
  });

  it("separates launch-guided core traits from deterministic system-filled traits for display", () => {
    const groups = deriveAppSoulTraitDisplayGroups({
      seed: "pd19-core-trait-alpha",
      theme: "fractal",
      provenanceSide: "buy",
      generation: 7n,
      amount: 123_456_789n,
      tokenAmount: 2_000_000n,
      styleParams: "theme=fractal;trait_palette=ember;trait_form=crystal",
    });

    expect(groups.launchGuidedCoreTraits).toEqual([
      { category: "palette", traitType: "Palette", value: "ember", source: "launch" },
      { category: "form", traitType: "Form", value: "crystal", source: "launch" },
    ]);
    expect(groups.systemCoreTraits.map((trait) => trait.category)).toEqual([
      "mood",
      "background",
    ]);
    expect(groups.systemCoreTraits.every((trait) => trait.source === "system")).toBe(true);
    expect(groups.generatedTraits).toHaveLength(9);
  });

  it("falls back to deterministic system core traits when no launch-guided style params exist", () => {
    const groups = deriveAppSoulTraitDisplayGroups({
      seed: "pd19-core-trait-alpha",
      theme: "fractal",
      provenanceSide: "buy",
      generation: 7n,
      amount: 123_456_789n,
      tokenAmount: 2_000_000n,
      styleParams: "",
    });

    expect(groups.launchGuidedCoreTraits).toEqual([]);
    expect(groups.systemCoreTraits).toHaveLength(4);
    expect(groups.systemCoreTraits.map((trait) => trait.category)).toEqual([
      "palette",
      "mood",
      "form",
      "background",
    ]);
    expect(groups.generatedTraits).toHaveLength(9);
  });
});
