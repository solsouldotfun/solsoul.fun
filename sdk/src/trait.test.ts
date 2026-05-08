import { describe, expect, it } from "vitest";
import * as sdk from "./index.js";

describe("default Soul trait engine", () => {
  const fixture = (seed: string) =>
    sdk.deriveDefaultSoulTraits({
      seed,
      theme: "neonpuff",
      provenanceSide: sdk.SOUL_PROVENANCE_SIDE.Buy,
      generation: 7n,
      amount: 123_456_789n,
      tokenAmount: 2_000_000n,
    });

  it("keeps weighted trait catalogs bounded and locale-independent", () => {
    expect(sdk.DEFAULT_SOUL_TRAIT_CATEGORIES).toHaveLength(9);
    for (const category of sdk.DEFAULT_SOUL_TRAIT_CATEGORIES) {
      expect(category.options.length).toBeGreaterThanOrEqual(7);
      expect(category.options.reduce((sum, option) => sum + option.weight, 0)).toBe(10_000);
      for (const option of category.options) {
        expect(option.id).toMatch(/^[a-z0-9_]+$/);
        expect(option.weight).toBeGreaterThan(0);
      }
    }
  });

  it("matches the Rust fixture snapshot for the same seed/theme/provenance", () => {
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

  it("varies weighted IDs when the seed changes", () => {
    const first = fixture("pd16-fixture-alpha");
    const second = fixture("pd16-fixture-beta");

    expect(second).not.toEqual(first);
    expect(second).toMatchObject({
      characterArchetype: "vapor_fox",
      gasAuraCloud: "rainbow_aura",
      outfit: "space_jacket",
      relic: "none",
    });
  });

  it("uses provenance fields in the deterministic seed context", () => {
    const base = fixture("pd16-fixture-alpha");
    const changed = sdk.deriveDefaultSoulTraits({
      seed: "pd16-fixture-alpha",
      theme: "neonpuff",
      provenanceSide: "sell",
      generation: 7n,
      amount: 123_456_789n,
      tokenAmount: 0n,
    });

    expect(changed).not.toEqual(base);
  });

  it("reconstructs identical traits from a persisted 8-byte seed hash", () => {
    // PD16-Followup parity guard. Snapshot is mirrored byte-for-byte by:
    //   - programs/soul-generator/src/svg/traits.rs
    //       (tests::persisted_seed_hash_reconstruction_yields_stable_trait_set)
    //   - app/src/lib/soulTraits.test.ts
    //       (matches Rust/SDK reconstruction for a persisted 8-byte seed hash)
    // Bumping any value here is a parity break — update all three.
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
    const reconstructed = sdk.deriveDefaultSoulTraits({
      seed: persistedSeedHash,
      theme: "neonpuff",
      provenanceSide: sdk.SOUL_PROVENANCE_SIDE.Buy,
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
    // The reconstruction must be a pure function of persisted inputs.
    expect(
      sdk.deriveDefaultSoulTraits({
        seed: persistedSeedHash,
        theme: "neonpuff",
        provenanceSide: sdk.SOUL_PROVENANCE_SIDE.Buy,
        generation: 7n,
        amount: 123_456_789n,
        tokenAmount: 2_000_000n,
      }),
    ).toEqual(reconstructed);
  });

  it("matches the secondary Rust snapshot for byte-array seeds", () => {
    const seed = Uint8Array.from({ length: 32 }, (_, index) => index);

    expect(
      sdk.deriveDefaultSoulTraits({
        seed,
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

  it("validates and encodes limited user-selected core art traits", () => {
    expect(sdk.CORE_ART_TRAIT_CATEGORIES).toHaveLength(4);
    for (const category of sdk.CORE_ART_TRAIT_CATEGORIES) {
      expect(category.options.reduce((sum, option) => sum + option.weight, 0)).toBe(10_000);
    }

    expect(
      sdk.parseCoreArtTraitStyleParams(
        "theme=fractal;trait_palette=aurora;trait_mood=serene;trait_form=wave",
      ),
    ).toEqual({ palette: "aurora", mood: "serene", form: "wave" });
    expect(
      sdk.parseCoreArtTraitStyleParams(
        new TextEncoder().encode("theme=symphony;trait_background=grid"),
      ),
    ).toEqual({ background: "grid" });
    expect(() => sdk.validateCoreArtTraitStyleParams("theme=fractal;legacy=1")).not.toThrow();
    expect(() => sdk.validateCoreArtTraitStyleParams("trait_palette=unknown")).toThrow(
      /Invalid palette/,
    );
    expect(() =>
      sdk.validateCoreArtTraitStyleParams(
        "trait_palette=aurora;trait_mood=serene;trait_form=wave;trait_background=grid",
      ),
    ).toThrow(/at most 3/);

    expect(
      sdk.encodeCoreArtTraitStyleParams(
        { palette: "ember", form: "crystal" },
        "theme=fractal;trait_palette=solana",
      ),
    ).toBe("theme=fractal;trait_palette=ember;trait_form=crystal");
  });

  it("fills unselected core art traits deterministically from seed context", () => {
    const first = sdk.deriveBlendedSoulTraits({
      seed: "pd19-core-trait-alpha",
      theme: "fractal",
      provenanceSide: "buy",
      generation: 7n,
      amount: 123_456_789n,
      tokenAmount: 2_000_000n,
      styleParams: "trait_palette=ember;trait_form=crystal",
    });
    const repeat = sdk.deriveBlendedSoulTraits({
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
      const swept = sdk.deriveBlendedSoulTraits({
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

  it("validates core art trait style params during template upload encoding", () => {
    expect(() =>
      sdk.encodeTemplateUploadBytes({
        template: "",
        styleParams: "theme=fractal;trait_palette=aurora",
      }),
    ).not.toThrow();
    expect(() =>
      sdk.encodeTemplateUploadBytes({
        template: "",
        styleParams: "theme=fractal;trait_palette=bad",
      }),
    ).toThrow(/Invalid palette/);
  });
});
