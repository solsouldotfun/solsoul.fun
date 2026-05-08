import { describe, expect, it } from "vitest";
import { deriveSoulRarity } from "./soulRarity";

describe("deriveSoulRarity", () => {
  it("derives the same rarity, score, generation, and traits for the same Soul signals", () => {
    const input = {
      nftMint: "NftMint111111111111111111111111111111111",
      tokenMint: "TokenMint111111111111111111111111111111",
      soul: "Soul111111111111111111111111111111111111",
      generation: "4",
      sequence: 4,
      artTheme: "Hexagram Oracle",
      seedHash: "abcdef0123456789",
      side: "sell",
      amount: "1000000",
      trader: "Trader1111111111111111111111111111111111",
    };

    const first = deriveSoulRarity(input);
    const second = deriveSoulRarity(input);

    expect(second).toEqual(first);
    expect(first.generation).toBe("4");
    expect(first.score).toBeGreaterThanOrEqual(100);
    expect(first.score).toBeLessThanOrEqual(1000);
    expect(first.traits).toEqual(
      expect.arrayContaining([
        { kind: "generationBand", value: "early" },
        { kind: "tradeSignal", value: "sell" },
        { kind: "seedSource", value: "onChainSeedHash" },
        { kind: "claimRank", value: "earlyClaim" },
      ]),
    );
  });

  it("changes score when stable mint/seed inputs change without using locale text", () => {
    const base = deriveSoulRarity({
      nftMint: "NftMint111111111111111111111111111111111",
      tokenMint: "TokenMint111111111111111111111111111111",
      generation: 2,
      sequence: 2,
      seedHash: "aaaaaaaaaaaaaaaa",
      artTheme: "Monochrome Soul",
    });
    const changed = deriveSoulRarity({
      nftMint: "NftMint222222222222222222222222222222222",
      tokenMint: "TokenMint111111111111111111111111111111",
      generation: 2,
      sequence: 2,
      seedHash: "bbbbbbbbbbbbbbbb",
      artTheme: "Monochrome Soul",
    });

    expect(changed.score).not.toBe(base.score);
    expect(changed.tier).toMatch(/^(common|uncommon|rare|epic|legendary|mythic)$/);
  });

  it("ignores wallet token-account input when canonical claim context exists", () => {
    const claimedInput = {
      claim: "Claim1111111111111111111111111111111111",
      nftMint: "NftMint111111111111111111111111111111111",
      tokenMint: "Token1111111111111111111111111111111111",
      tokenAccount: "WalletTokenAccount11111111111111111111111",
      soul: "Soul111111111111111111111111111111111111",
      generation: 0,
      sequence: 0,
      artTheme: "Monochrome Soul",
      seedHash: "abcdef0123456789",
    };

    expect(
      deriveSoulRarity({
        ...claimedInput,
        tokenAccount: "DifferentWalletTokenAccount1111111111111",
      }),
    ).toEqual(deriveSoulRarity(claimedInput));
  });

  it("uses honest fallback traits when provenance or generation signals are missing", () => {
    expect(
      deriveSoulRarity({
        nftMint: "LegacyNft1111111111111111111111111111111",
        tokenMint: "LegacyToken1111111111111111111111111111",
        artTheme: "Legacy / unknown art theme",
      }),
    ).toMatchObject({
      generation: null,
      traits: [
        { kind: "generationBand", value: "unknown" },
        { kind: "tradeSignal", value: "unknown" },
        { kind: "seedSource", value: "metadataFallback" },
        { kind: "claimRank", value: "unranked" },
        { kind: "artTheme", value: "legacy" },
      ],
    });
  });

  it("derives a stable SoulPuff theme trait without breaking legacy theme fallbacks", () => {
    const soulpuff = deriveSoulRarity({
      nftMint: "SoulPuffNft111111111111111111111111111",
      tokenMint: "***************************************",
      generation: 12,
      sequence: 1,
      artTheme: "SoulPuff",
      seedHash: "0102030405060708",
      side: "buy",
    });
    const legacy = deriveSoulRarity({
      nftMint: "LegacyNft1111111111111111111111111111111",
      tokenMint: "***************************************",
      artTheme: "Legacy / unknown art theme",
    });

    expect(soulpuff.traits).toEqual(
      expect.arrayContaining([
        { kind: "artTheme", value: "soulpuff" },
        { kind: "generationBand", value: "established" },
      ]),
    );
    expect(legacy.traits).toEqual(
      expect.arrayContaining([{ kind: "artTheme", value: "legacy" }]),
    );
  });

  it("derives a stable NeonPuff theme trait while preserving legacy theme fallbacks", () => {
    const neonpuff = deriveSoulRarity({
      nftMint: "NeonPuffNft11111111111111111111111111",
      tokenMint: "***************************************",
      generation: 2,
      sequence: 2,
      artTheme: "NeonPuff Soul",
      seedHash: "f0e1d2c3b4a59687",
      side: "buy",
    });
    const fallback = deriveSoulRarity({
      nftMint: "FallbackNft111111111111111111111111111",
      tokenMint: "***************************************",
      artTheme: "Legacy / unknown art theme",
    });

    expect(neonpuff.traits).toEqual(
      expect.arrayContaining([
        { kind: "artTheme", value: "neonpuff" },
        { kind: "generationBand", value: "early" },
      ]),
    );
    expect(fallback.traits).toEqual(
      expect.arrayContaining([{ kind: "artTheme", value: "legacy" }]),
    );
  });
});
