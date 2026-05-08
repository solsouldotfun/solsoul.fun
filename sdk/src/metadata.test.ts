import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "./index.js";

describe("claim metadata mirror", () => {
  it("includes SolSoul platform, associated token, theme, generation, and provenance without tx fabrication", () => {
    const soul = soulFixture({
      styleParams: "theme=hexagram;trait_palette=ember;trait_mood=mystic;trait_form=crystal",
      provenanceSide: sdk.SOUL_PROVENANCE_SIDE.Sell,
      provenanceGeneration: 8n,
    });

    const metadata = sdk.buildSoulNftMetadata(soul);
    const jsonText = Buffer.from(
      metadata.uri.replace("data:application/json;base64,", ""),
      "base64",
    ).toString("utf8");
    const json = JSON.parse(jsonText) as {
      platform: string;
      creator: string;
      launcher: string;
      associatedTokenMint: string;
      associatedTokenSymbol: string;
      artEngine: string;
      artTheme: string;
      generation: string;
      attributes: Array<{ trait_type: string; value: string }>;
    };

    expect(json.platform).toBe("SolSoul");
    expect(json.creator).toBe(soul.authority.toBase58());
    expect(json.launcher).toBe(soul.authority.toBase58());
    expect(json.associatedTokenMint).toBe(soul.mint.toBase58());
    expect(json.associatedTokenSymbol).toBe("META");
    expect(json.artEngine).toBe("SolSoul On-Chain Art Engine");
    expect(json.artTheme).toBe("Legacy / unknown art theme");
    expect(json.generation).toBe("8");
    expect(json.attributes).toContainEqual({
      trait_type: "Art theme",
      value: "Legacy / unknown art theme",
    });
    expect(json.attributes).toContainEqual({ trait_type: "Trade side", value: "sell" });
    expect(json.attributes).toContainEqual({ trait_type: "Palette", value: "ember" });
    expect(json.attributes).toContainEqual({ trait_type: "Mood", value: "mystic" });
    expect(json.attributes).toContainEqual({ trait_type: "Form", value: "crystal" });
    expect(json.attributes).toContainEqual({
      trait_type: "Background Style",
      value: expect.stringMatching(/^(midnight|nebula|grid|eclipse)$/),
    });
    // Legacy unsupported themes remain readable for deployed accounts, but the
    // metadata labels them explicitly instead of presenting them as active
    // built-in renderers.
    expect(json.attributes).toEqual(
      expect.arrayContaining([
        { trait_type: "Character", value: expect.any(String) },
        { trait_type: "Goggles/Eyes", value: expect.any(String) },
        { trait_type: "Expression", value: expect.any(String) },
        { trait_type: "Gas/Aura", value: expect.any(String) },
        { trait_type: "Background", value: expect.any(String) },
        { trait_type: "Outfit", value: expect.any(String) },
        { trait_type: "Relic", value: expect.any(String) },
        { trait_type: "Animation", value: expect.any(String) },
        { trait_type: "Gas Level", value: expect.any(String) },
        { trait_type: "Rarity tier", value: expect.stringMatching(/^(common|uncommon|rare|epic|legendary|mythic)$/) },
        { trait_type: "Soul Score", value: expect.stringMatching(/^\d+$/) },
      ]),
    );
    const decoded = sdk.decodeSoulNftMetadataUri(metadata.uri);
    expect(decoded?.generatedTraits).toHaveLength(9);
    expect(decoded?.rarity).toEqual(
      expect.objectContaining({
        tier: expect.stringMatching(/^(common|uncommon|rare|epic|legendary|mythic)$/),
        score: expect.any(Number),
      }),
    );
    expect(jsonText).not.toContain("signature");
    expect(jsonText).not.toContain("slot");
    expect(jsonText).not.toContain("blockTime");
  });

  it("uses JSON.stringify semantics for quote and backslash ASCII symbols", () => {
    const symbol = 'Q"\\X';
    const soul = soulFixture({
      memeSymbol: symbol,
      memeSymbolBytes: new TextEncoder().encode(symbol),
      memeSymbolLen: symbol.length,
      styleParams: "theme=signal",
    });

    const metadata = sdk.buildSoulNftMetadata(soul);
    const jsonText = Buffer.from(
      metadata.uri.replace("data:application/json;base64,", ""),
      "base64",
    ).toString("utf8");
    const json = JSON.parse(jsonText) as {
      name: string;
      symbol: string;
      associatedTokenSymbol: string;
      artTheme: string;
      attributes: Array<{ trait_type: string; value: string }>;
    };

    expect(json.name).toBe(`${symbol} Soul #1`);
    expect(json.symbol).toBe(symbol);
    expect(json.associatedTokenSymbol).toBe(symbol);
    expect(json.artTheme).toBe("Legacy / unknown art theme");
    expect(json.attributes).toContainEqual({
      trait_type: "Associated token symbol",
      value: symbol,
    });
    expect(jsonText).toBe(JSON.stringify(json));
  });

  it("labels unsupported SoulPuff theme metadata as legacy while preserving provenance", () => {
    const soul = soulFixture({
      styleParams: "theme=soulpuff",
      provenanceSide: sdk.SOUL_PROVENANCE_SIDE.Buy,
      provenanceGeneration: 3n,
      provenanceAmount: 990_000n,
    });

    const metadata = sdk.buildSoulNftMetadata(soul);
    const json = JSON.parse(
      Buffer.from(metadata.uri.replace("data:application/json;base64,", ""), "base64").toString(
        "utf8",
      ),
    ) as {
      artTheme: string;
      generation: string;
      attributes: Array<{ trait_type: string; value: string }>;
    };

    expect(metadata.artTheme).toBe("Legacy / unknown art theme");
    expect(json.artTheme).toBe("Legacy / unknown art theme");
    expect(json.generation).toBe("3");
    expect(json.attributes).toContainEqual({
      trait_type: "Art theme",
      value: "Legacy / unknown art theme",
    });
    expect(json.attributes).toContainEqual({ trait_type: "Generation", value: "3" });
    expect(json.attributes).toContainEqual({ trait_type: "Trade side", value: "buy" });
    expect(json.attributes).toContainEqual({ trait_type: "Trade amount", value: "990000" });
    // PD16.F3 characterization: SoulPuff metadata exposes the same generated
    // trait attributes as NeonPuff — stable locale-independent IDs plus rarity.
    expect(json.attributes).toEqual(
      expect.arrayContaining([
        { trait_type: "Character", value: expect.any(String) },
        { trait_type: "Goggles/Eyes", value: expect.any(String) },
        { trait_type: "Expression", value: expect.any(String) },
        { trait_type: "Gas/Aura", value: expect.any(String) },
        { trait_type: "Background", value: expect.any(String) },
        { trait_type: "Outfit", value: expect.any(String) },
        { trait_type: "Relic", value: expect.any(String) },
        { trait_type: "Animation", value: expect.any(String) },
        { trait_type: "Gas Level", value: expect.any(String) },
        { trait_type: "Rarity tier", value: expect.stringMatching(/^(common|uncommon|rare|epic|legendary|mythic)$/) },
        { trait_type: "Soul Score", value: expect.stringMatching(/^\d+$/) },
      ]),
    );
    const decoded = sdk.decodeSoulNftMetadataUri(metadata.uri);
    expect(decoded?.generatedTraits).toHaveLength(9);
    expect(decoded?.rarity).toEqual(
      expect.objectContaining({
        tier: expect.stringMatching(/^(common|uncommon|rare|epic|legendary|mythic)$/),
        score: expect.any(Number),
      }),
    );
  });

  it("derives stable locale-independent trait IDs for all built-in themes from the same provenance seed", () => {
    const themes = [
      { styleParams: "theme=fractal", artTheme: "Fractal Structure" },
      { styleParams: "theme=field", artTheme: "Vector Field" },
      { styleParams: "theme=lattice", artTheme: "Crystal Lattice" },
      { styleParams: "theme=chaos", artTheme: "Strange Attractor" },
      { styleParams: "theme=harmonic", artTheme: "Harmonic Wave" },
      { styleParams: "theme=pixelfractal", artTheme: "Pixel Fractal" },
      { styleParams: "theme=pixelart", artTheme: "Pixel Art" },
      { styleParams: "theme=symphony", artTheme: "Symphony" },
      { styleParams: "theme=neonpuff", artTheme: "Legacy / unknown art theme" },
    ];
    const seedHash = Uint8Array.from([0xc6, 0x13, 0xe0, 0x2a, 0xa4, 0x84, 0x60, 0xb1]);

    for (const { styleParams, artTheme } of themes) {
      const soul = soulFixture({
        styleParams,
        provenanceSide: sdk.SOUL_PROVENANCE_SIDE.Buy,
        provenanceGeneration: 7n,
        provenanceAmount: 123_456_789n,
        provenanceTokenAmount: 2_000_000n,
        provenanceSeedHash: seedHash,
        provenanceSeedHashHex: "c613e02aa48460b1",
      });

      const metadata = sdk.buildSoulNftMetadata(soul);
      const decoded = sdk.decodeSoulNftMetadataUri(metadata.uri);

      expect(decoded?.generatedTraits).toHaveLength(9);
      expect(decoded?.rarity).toEqual(
        expect.objectContaining({
          tier: expect.stringMatching(/^(common|uncommon|rare|epic|legendary|mythic)$/),
          score: expect.any(Number),
        }),
      );
      // Every trait ID must be ASCII lowercase + underscore — no locale text.
      for (const trait of decoded?.generatedTraits ?? []) {
        expect(trait.value).toMatch(/^[a-z0-9_]+$/);
      }
      // The artTheme is a human-readable string in the SDK decoder.
      // The underlying trait IDs remain stable and locale-independent.
      expect(decoded?.artTheme ?? "").toContain(artTheme.split(" ")[0]);
    }
  });

  it("labels unsupported NeonPuff theme metadata as legacy while preserving provenance", () => {
    const soul = soulFixture({
      styleParams: "theme=neonpuff",
      provenanceSide: sdk.SOUL_PROVENANCE_SIDE.Buy,
      provenanceGeneration: 2n,
      provenanceAmount: 1_000_000n,
    });

    const metadata = sdk.buildSoulNftMetadata(soul);
    const json = JSON.parse(
      Buffer.from(metadata.uri.replace("data:application/json;base64,", ""), "base64").toString(
        "utf8",
      ),
    ) as {
      artTheme: string;
      generation: string;
      attributes: Array<{ trait_type: string; value: string }>;
    };

    expect(metadata.artTheme).toBe("Legacy / unknown art theme");
    expect(json.artTheme).toBe("Legacy / unknown art theme");
    expect(json.generation).toBe("2");
    expect(json.attributes).toContainEqual({
      trait_type: "Art theme",
      value: "Legacy / unknown art theme",
    });
    expect(json.attributes).toContainEqual({ trait_type: "Generation", value: "2" });
    expect(json.attributes).toContainEqual({ trait_type: "Trade side", value: "buy" });
    expect(json.attributes).toContainEqual({ trait_type: "Trade amount", value: "1000000" });
    expect(json.attributes).toContainEqual({ trait_type: "Trade token output", value: "0" });
    expect(json.attributes).toEqual(
      expect.arrayContaining([
        { trait_type: "Character", value: expect.any(String) },
        { trait_type: "Goggles/Eyes", value: expect.any(String) },
        { trait_type: "Expression", value: expect.any(String) },
        { trait_type: "Gas/Aura", value: expect.any(String) },
        { trait_type: "Background", value: expect.any(String) },
        { trait_type: "Outfit", value: expect.any(String) },
        { trait_type: "Relic", value: expect.any(String) },
        { trait_type: "Animation", value: expect.any(String) },
        { trait_type: "Gas Level", value: expect.any(String) },
        { trait_type: "Rarity tier", value: expect.stringMatching(/^(common|uncommon|rare|epic|legendary|mythic)$/) },
        { trait_type: "Soul Score", value: expect.stringMatching(/^\d+$/) },
      ]),
    );
    const decoded = sdk.decodeSoulNftMetadataUri(metadata.uri);
    expect(decoded?.generatedTraits).toHaveLength(9);
    expect(decoded?.generatedTraits.map((trait) => trait.traitType)).toEqual([
      "Character",
      "Goggles/Eyes",
      "Expression",
      "Gas/Aura",
      "Background",
      "Outfit",
      "Relic",
      "Animation",
      "Gas Level",
    ]);
    expect(decoded?.rarity).toEqual(
      expect.objectContaining({
        tier: expect.stringMatching(/^(common|uncommon|rare|epic|legendary|mythic)$/),
        score: expect.any(Number),
      }),
    );
  });
});

function soulFixture(
  overrides: Partial<sdk.SoulAccount> = {},
): sdk.SoulAccount {
  const svg = "<svg><path /></svg>";
  const styleParams =
    typeof overrides.styleParams === "string" ? overrides.styleParams : "";
  return {
    mint: PublicKey.unique(),
    authority: PublicKey.unique(),
    createdAt: 1n,
    generationCount: 8n,
    lastSvgLen: svg.length,
    lastSvg: svg,
    lastSvgBytes: new TextEncoder().encode(svg),
    templateLen: 0,
    baseSvgTemplate: "",
    baseSvgTemplateBytes: new Uint8Array(),
    styleParamsLen: styleParams.length,
    styleParams,
    styleParamsBytes: new TextEncoder().encode(styleParams),
    minClaimBalance: 0n,
    claimCount: 0n,
    memeSymbol: "META",
    memeSymbolBytes: new TextEncoder().encode("META"),
    memeSymbolLen: 4,
    targetAmm: sdk.TARGET_AMM.Raydium,
    provenanceGeneration: 0n,
    provenanceSide: sdk.SOUL_PROVENANCE_SIDE.None,
    provenanceAmount: 1_000_000n,
    provenanceTokenAmount: 0n,
    provenanceTrader: PublicKey.unique(),
    provenanceTokenAccount: PublicKey.default,
    provenanceMint: PublicKey.unique(),
    provenanceSoul: PublicKey.unique(),
    provenanceSeedHash: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
    provenanceSeedHashHex: "0102030405060708",
    ...overrides,
  };
}
