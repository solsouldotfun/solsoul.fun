import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  buildClaimedSoulNftGalleryItems,
  buildSoulNftGalleryItems,
  decodeSoulNftMetadataUri,
  hydrateSoulNftGalleryItemsWithRpcProvenance,
  sanitizeInlineSvg,
  type DecodedSoulNftMetadata,
  type ParsedTokenAccountLike,
  type SoulNftAssociation,
} from "./soulGallery";

function metadataUri(payload: unknown): string {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
}

function imageUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function parsedTokenAccount(
  mint: string,
  tokenAccount: PublicKey,
  amount = "1",
  decimals = 0,
): ParsedTokenAccountLike {
  return {
    pubkey: tokenAccount,
    account: {
      data: {
        parsed: {
          info: {
            mint,
            tokenAmount: { amount, decimals },
          },
        },
      },
    },
  };
}

describe("decodeSoulNftMetadataUri", () => {
  it("decodes Soul NFT JSON data URIs with embedded SVG image data URIs", () => {
    const svg = "<svg><circle cx=\"4\" cy=\"4\" r=\"4\" /></svg>";
    const tokenMint = PublicKey.unique().toBase58();
    const soul = PublicKey.unique().toBase58();
    const trader = PublicKey.unique().toBase58();

    expect(
      decodeSoulNftMetadataUri(
        metadataUri({
          name: "SOUL Soul #1",
          symbol: "SOUL",
          image: imageUri(svg),
          artTheme: "Hexagram Oracle",
          attributes: [
            { trait_type: "Generation", value: "1" },
            { trait_type: "Trade side", value: "buy" },
            { trait_type: "Trade amount", value: "990000" },
            { trait_type: "Trader wallet", value: trader },
            { trait_type: "Seed hash", value: "c613e02aa48460b1" },
            { trait_type: "Token mint", value: tokenMint },
            { trait_type: "Soul PDA", value: soul },
          ],
        }),
      ),
    ).toEqual({
      name: "SOUL Soul #1",
      symbol: "SOUL",
      imageSvg: svg,
      sequence: 1,
      artTheme: {
        label: "Hexagram Oracle",
        source: "metadata",
      },
      generatedTraits: [],
      metadataRarity: null,
      marketProvenance: {
        generation: "1",
        side: "buy",
        amount: "990000",
        trader,
        traderLabel: `${trader.slice(0, 4)}…${trader.slice(-4)}`,
        seedHash: "c613e02aa48460b1",
        tokenMint,
        soul,
      },
    });
  });

  it("accepts meme-symbol Soul NFT metadata and extracts the sequence", () => {
    const svg = "<svg><path /></svg>";

    expect(
      decodeSoulNftMetadataUri(
        metadataUri({
          name: "DOGE Soul #17",
          symbol: "DOGE",
          image: imageUri(svg),
        }),
      ),
    ).toEqual({
      name: "DOGE Soul #17",
      symbol: "DOGE",
      imageSvg: svg,
      sequence: 17,
      marketProvenance: null,
      generatedTraits: [],
      metadataRarity: null,
      artTheme: {
        label: "Legacy / unknown art theme",
        source: "legacy",
      },
    });
  });

  it("infers NeonPuff, SoulPuff, and legacy built-in labels from SVG/attribute fallbacks", () => {
    expect(
      decodeSoulNftMetadataUri(
        metadataUri({
          name: "NEON Soul #2",
          symbol: "NEON",
          image: imageUri(
            '<svg data-soul="pd14-neonpuff"><g id="neonpuff-unicorn-profile" /></svg>',
          ),
        }),
      )?.artTheme,
    ).toEqual({
      label: "NeonPuff Soul",
      source: "legacy",
    });

    expect(
      decodeSoulNftMetadataUri(
        metadataUri({
          name: "PUFF Soul #2",
          symbol: "PUFF",
          image: imageUri('<svg data-soul="pd12-soulpuff"><circle /></svg>'),
        }),
      )?.artTheme,
    ).toEqual({
      label: "SoulPuff",
      source: "legacy",
    });

    expect(
      decodeSoulNftMetadataUri(
        metadataUri({
          name: "CUSTOM Soul #3",
          symbol: "CUSTOM",
          image: imageUri("<svg><path /></svg>"),
          attributes: [{ trait_type: "Art engine/theme", value: "Custom Template" }],
        }),
      )?.artTheme,
    ).toEqual({
      label: "Custom Template",
      source: "metadata",
    });
  });

  it("preserves PD16 stable generated trait IDs and metadata rarity from Soul NFT attributes", () => {
    const svg = '<svg data-soul="pd14-neonpuff"><circle /></svg>';

    expect(
      decodeSoulNftMetadataUri(
        metadataUri({
          name: "NEON Soul #2",
          symbol: "NEON",
          image: imageUri(svg),
          artTheme: "NeonPuff Soul",
          attributes: [
            { trait_type: "Generation", value: "2" },
            { trait_type: "Character", value: "neonpuff_unicorn" },
            { trait_type: "Goggles/Eyes", value: "rainbow_goggles" },
            { trait_type: "Expression", value: "diamond_grin" },
            { trait_type: "Gas/Aura", value: "green_gas_puff" },
            { trait_type: "Background", value: "midnight_gradient" },
            { trait_type: "Outfit", value: "raydium_racer" },
            { trait_type: "Relic", value: "solana_coin" },
            { trait_type: "Animation", value: "lens_shine" },
            { trait_type: "Gas Level", value: "level_4" },
            { trait_type: "Rarity tier", value: "rare" },
            { trait_type: "Soul Score", value: "777" },
          ],
        }),
      ),
    ).toMatchObject({
      generatedTraits: [
        { category: "character_archetype", traitType: "Character", value: "neonpuff_unicorn" },
        { category: "goggles_eyes", traitType: "Goggles/Eyes", value: "rainbow_goggles" },
        { category: "expression", traitType: "Expression", value: "diamond_grin" },
        { category: "gas_aura_cloud", traitType: "Gas/Aura", value: "green_gas_puff" },
        { category: "background", traitType: "Background", value: "midnight_gradient" },
        { category: "outfit", traitType: "Outfit", value: "raydium_racer" },
        { category: "relic", traitType: "Relic", value: "solana_coin" },
        { category: "animation_behavior", traitType: "Animation", value: "lens_shine" },
        { category: "gas_level", traitType: "Gas Level", value: "level_4" },
      ],
      metadataRarity: { tier: "rare", score: 777 },
    });
  });

  it("rejects non-Soul metadata and non-SVG image payloads", () => {
    expect(
      decodeSoulNftMetadataUri(
        metadataUri({
          name: "Other NFT",
          symbol: "NOPE",
          image: imageUri("<svg />"),
        }),
      ),
    ).toBeNull();

    expect(
      decodeSoulNftMetadataUri(
        metadataUri({
          name: "SOUL Soul #1",
          symbol: "SOUL",
          image: "https://example.invalid/image.png",
        }),
      ),
    ).toBeNull();
  });
});

describe("buildClaimedSoulNftGalleryItems", () => {
  it("builds partial claim-first Profile cards when NFT metadata or token mint enrichment is unavailable", () => {
    const claim = PublicKey.unique();
    const soul = PublicKey.unique();
    const claimer = PublicKey.unique();
    const nftMint = PublicKey.unique();

    const items = buildClaimedSoulNftGalleryItems([
      {
        claim,
        soul,
        claimer,
        nftMint,
        tokenMint: null,
        sequence: 4n,
        generationCount: 8n,
        metadataAuthority: PublicKey.unique(),
        metadata: null,
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      claim: claim.toBase58(),
      claimer: claimer.toBase58(),
      nftMint: nftMint.toBase58(),
      tokenMint: null,
      tokenMintLabel: "Token enrichment pending",
      name: "Soul claim #4",
      symbol: "SOUL",
      sequence: 4,
      marketProvenance: null,
      marketProvenanceStatus: "pending",
    });
    expect(items[0]?.sanitizedSvg).toContain("Claim metadata pending");
    expect(items[0]?.soulRarity).toMatchObject({
      generation: "8",
      traits: expect.arrayContaining([
        { kind: "generationBand", value: "early" },
        { kind: "tradeSignal", value: "unknown" },
        { kind: "seedSource", value: "metadataFallback" },
        { kind: "claimRank", value: "earlyClaim" },
      ]),
    });
  });

  it("maps receipt lifecycle fields so active views and history can label bound versus inactive Souls", () => {
    const claim = PublicKey.unique();
    const soul = PublicKey.unique();
    const claimer = PublicKey.unique();
    const nftMint = PublicKey.unique();
    const tokenMint = PublicKey.unique();
    const receiptAccount = PublicKey.unique();

    const [item] = buildClaimedSoulNftGalleryItems([
      {
        claim,
        soul,
        claimer,
        nftMint,
        tokenMint,
        sequence: 7n,
        generationCount: 7n,
        metadataAuthority: PublicKey.unique(),
        metadata: null,
        receiptAccount,
        receiptLifecycleState: "forfeited",
        receipt: {
          soul,
          claimant: claimer,
          tokenMint,
          nftMint,
          sequence: 7n,
          generationCount: 7n,
          boundQuantity: 1_000_000n,
          boundBoundary: 7n,
          lifecycleState: "forfeited",
        },
      },
    ]);

    expect(item).toMatchObject({
      receiptAccount: receiptAccount.toBase58(),
      receiptLifecycleState: "forfeited",
      receiptLifecycleLabel: "Forfeited receipt",
      receiptLifecycleActive: false,
      receiptBoundQuantity: "1000000",
      receiptBoundBoundary: "7",
    });
  });

  it("builds SoulPuff claim cards from SDK SoulAccount mirror when NFT metadata is unavailable", () => {
    const claim = PublicKey.unique();
    const soul = PublicKey.unique();
    const claimer = PublicKey.unique();
    const nftMint = PublicKey.unique();
    const tokenMint = PublicKey.unique();
    const trader = PublicKey.unique();

    const [item] = buildClaimedSoulNftGalleryItems([
      {
        claim,
        soul,
        claimer,
        nftMint,
        tokenMint,
        sequence: 0n,
        generationCount: 1n,
        metadataAuthority: PublicKey.unique(),
        metadata: null,
        soulAccount: {
          mint: tokenMint,
          authority: PublicKey.unique(),
          createdAt: 1n,
          generationCount: 1n,
          lastSvgLen: 50,
          lastSvg: '<svg data-soul="pd12-soulpuff"><circle /></svg>',
          lastSvgBytes: new TextEncoder().encode(
            '<svg data-soul="pd12-soulpuff"><circle /></svg>',
          ),
          templateLen: 0,
          baseSvgTemplate: "",
          baseSvgTemplateBytes: new Uint8Array(),
          styleParamsLen: "theme=soulpuff".length,
          styleParams: "theme=soulpuff",
          styleParamsBytes: new TextEncoder().encode("theme=soulpuff"),
          minClaimBalance: 1_000_000n,
          claimCount: 0n,
          memeSymbol: "PUFF",
          memeSymbolBytes: new TextEncoder().encode("PUFF"),
          memeSymbolLen: 4,
          targetAmm: 0,
          provenanceGeneration: 1n,
          provenanceSide: 1,
          provenanceAmount: 990_000n,
          provenanceTokenAmount: 990_000n,
          provenanceTrader: trader,
          provenanceTokenAccount: PublicKey.unique(),
          provenanceMint: tokenMint,
          provenanceSoul: soul,
          provenanceSeedHash: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
          provenanceSeedHashHex: "0102030405060708",
          artTheme: { id: "soulpuff", label: "SoulPuff", renderer: "built-in" },
          latestGenerationProvenance: {
            generation: 1n,
            side: "buy",
            amount: 990_000n,
            trader,
            tokenAccount: PublicKey.unique(),
            tokenMint,
            soul,
            seedHash: "0102030405060708",
            source: "on-chain-soul-account",
          },
        },
      } as any,
    ]);

    expect(item).toMatchObject({
      tokenMint: tokenMint.toBase58(),
      name: "Soul claim #0",
      artTheme: { label: "SoulPuff", source: "metadata" },
      marketProvenanceStatus: "available",
      marketProvenance: {
        generation: "1",
        side: "buy",
        amount: "990000",
        trader: trader.toBase58(),
        seedHash: "0102030405060708",
      },
      soulRarity: {
        generation: "1",
        traits: expect.arrayContaining([
          { kind: "artTheme", value: "soulpuff" },
          { kind: "seedSource", value: "onChainSeedHash" },
        ]),
      },
    });
    expect(item?.generatedTraits).toHaveLength(9);
    expect(item?.generatedTraits).toEqual(
      expect.arrayContaining([
        { category: "character_archetype", traitType: "Character", value: expect.any(String) },
        { category: "gas_level", traitType: "Gas Level", value: expect.any(String) },
      ]),
    );
    expect(item?.sanitizedSvg).toContain('data-soul="pd12-soulpuff"');
  });

  it("builds NeonPuff claim cards from SDK SoulAccount mirror and SVG fallback markers", () => {
    const claim = PublicKey.unique();
    const soul = PublicKey.unique();
    const claimer = PublicKey.unique();
    const nftMint = PublicKey.unique();
    const tokenMint = PublicKey.unique();
    const trader = PublicKey.unique();
    const svg =
      '<svg data-soul="pd14-neonpuff" data-style="premium-neon-vector"><g id="neonpuff-unicorn-profile" /></svg>';

    const [item] = buildClaimedSoulNftGalleryItems([
      {
        claim,
        soul,
        claimer,
        nftMint,
        tokenMint,
        sequence: 1n,
        generationCount: 2n,
        metadataAuthority: PublicKey.unique(),
        metadata: null,
        soulAccount: {
          mint: tokenMint,
          authority: PublicKey.unique(),
          createdAt: 1n,
          generationCount: 2n,
          lastSvgLen: svg.length,
          lastSvg: svg,
          lastSvgBytes: new TextEncoder().encode(svg),
          templateLen: 0,
          baseSvgTemplate: "",
          baseSvgTemplateBytes: new Uint8Array(),
          styleParamsLen: "theme=neonpuff".length,
          styleParams: "theme=neonpuff",
          styleParamsBytes: new TextEncoder().encode("theme=neonpuff"),
          minClaimBalance: 1_000_000n,
          claimCount: 1n,
          memeSymbol: "NEON",
          memeSymbolBytes: new TextEncoder().encode("NEON"),
          memeSymbolLen: 4,
          targetAmm: 0,
          provenanceGeneration: 2n,
          provenanceSide: 1,
          provenanceAmount: 1_000_000n,
          provenanceTokenAmount: 1_000_000n,
          provenanceTrader: trader,
          provenanceTokenAccount: PublicKey.unique(),
          provenanceMint: tokenMint,
          provenanceSoul: soul,
          provenanceSeedHash: Uint8Array.from([240, 225, 210, 195, 180, 165, 150, 135]),
          provenanceSeedHashHex: "f0e1d2c3b4a59687",
          artTheme: { id: "neonpuff", label: "NeonPuff Soul", renderer: "built-in" },
          latestGenerationProvenance: {
            generation: 2n,
            side: "buy",
            amount: 1_000_000n,
            trader,
            tokenAccount: PublicKey.unique(),
            tokenMint,
            soul,
            seedHash: "f0e1d2c3b4a59687",
            source: "on-chain-soul-account",
          },
        },
      } as any,
    ]);

    expect(item).toMatchObject({
      tokenMint: tokenMint.toBase58(),
      name: "Soul claim #1",
      artTheme: { label: "NeonPuff Soul", source: "metadata" },
      marketProvenanceStatus: "available",
      marketProvenance: {
        generation: "2",
        side: "buy",
        amount: "1000000",
        trader: trader.toBase58(),
        seedHash: "f0e1d2c3b4a59687",
      },
      soulRarity: {
        generation: "2",
        traits: expect.arrayContaining([
          { kind: "artTheme", value: "neonpuff" },
          { kind: "seedSource", value: "onChainSeedHash" },
        ]),
      },
    });
    expect(item?.generatedTraits).toHaveLength(9);
    expect(item?.generatedTraits).toEqual(
      expect.arrayContaining([
        { category: "character_archetype", traitType: "Character", value: expect.any(String) },
        { category: "animation_behavior", traitType: "Animation", value: expect.any(String) },
      ]),
    );
    expect(item?.sanitizedSvg).toContain('data-soul="pd14-neonpuff"');
    expect(item?.sanitizedSvg).toContain('id="neonpuff-unicorn-profile"');
  });

  it("maps SDK per-token claims to sanitized tiles with sequence and truncated claimer", () => {
    const claim = PublicKey.unique();
    const soul = PublicKey.unique();
    const claimer = PublicKey.unique();
    const nftMint = PublicKey.unique();
    const tokenMint = PublicKey.unique();
    const metadataAuthority = PublicKey.unique();
    const trader = PublicKey.unique();

    const items = buildClaimedSoulNftGalleryItems([
      {
        claim,
        soul,
        claimer,
        nftMint,
        tokenMint,
        sequence: 9n,
        generationCount: 10n,
        metadataAuthority,
        metadata: {
          name: "BONK Soul #9",
          symbol: "BONK",
          uri: metadataUri({
            name: "BONK Soul #9",
            symbol: "BONK",
            image: imageUri('<svg onclick="bad()"><circle /></svg>'),
            attributes: [
              { trait_type: "Generation", value: "9" },
              { trait_type: "Trade side", value: "sell" },
              { trait_type: "Trade amount", value: "1000000" },
              { trait_type: "Trader wallet", value: trader.toBase58() },
              { trait_type: "Trader token account", value: PublicKey.unique().toBase58() },
              { trait_type: "Seed hash", value: "abcdef0123456789" },
              { trait_type: "Token mint", value: tokenMint.toBase58() },
              { trait_type: "Soul PDA", value: soul.toBase58() },
            ],
          }),
        },
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      claim: claim.toBase58(),
      claimer: claimer.toBase58(),
      claimerLabel: `${claimer.toBase58().slice(0, 4)}…${claimer.toBase58().slice(-4)}`,
      nftMint: nftMint.toBase58(),
      tokenMint: tokenMint.toBase58(),
      tokenMintLabel: `${tokenMint.toBase58().slice(0, 4)}…${tokenMint.toBase58().slice(-4)}`,
      sequence: 9,
      name: "BONK Soul #9",
      symbol: "BONK",
    });
    expect(items[0]?.marketProvenance).toMatchObject({
      generation: "9",
      side: "sell",
      amount: "1000000",
      trader: trader.toBase58(),
      seedHash: "abcdef0123456789",
      tokenMint: tokenMint.toBase58(),
      soul: soul.toBase58(),
    });
    expect(items[0]?.soulRarity).toMatchObject({
      generation: "9",
      traits: expect.arrayContaining([
        { kind: "generationBand", value: "early" },
        { kind: "tradeSignal", value: "sell" },
        { kind: "seedSource", value: "onChainSeedHash" },
        { kind: "claimRank", value: "earlyClaim" },
      ]),
    });
    expect(items[0]?.soulRarity.score).toBeGreaterThanOrEqual(100);
    expect(items[0]?.soulRarity.score).toBeLessThanOrEqual(1000);
    expect(items[0]?.marketProvenanceStatus).toBe("available");
    expect(items[0]?.sanitizedSvg).toContain("<circle");
    expect(items[0]?.sanitizedSvg).not.toContain("onclick");
  });

  it("hydrates PD6 legacy claimed cards from claim generation context when metadata lacks provenance", async () => {
    const claim = PublicKey.unique();
    const soul = new PublicKey("Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ");
    const claimer = PublicKey.unique();
    const nftMint = new PublicKey("2FYg17ZnC9hhoKM4uuECVLHe4CwJTqkcFyuBuzacQ4Jh");
    const tokenMint = new PublicKey("ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r");
    const metadataAuthority = PublicKey.unique();

    const [item] = buildClaimedSoulNftGalleryItems([
      {
        claim,
        soul,
        claimer,
        nftMint,
        tokenMint,
        sequence: 0n,
        generationCount: 2n,
        metadataAuthority,
        metadata: {
          name: "PD6 Soul #0",
          symbol: "PD6",
          uri: metadataUri({
            name: "PD6 Soul #0",
            symbol: "PD6",
            image: imageUri("<svg><circle /></svg>"),
          }),
        },
      },
    ]);

    expect(item?.marketProvenance).toBeNull();
    expect(item?.marketProvenanceStatus).toBe("pending");

    const [hydrated] = await hydrateSoulNftGalleryItemsWithRpcProvenance(
      [item!],
      async (input) => {
        expect(String(input)).toContain(
          "/api/token/ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r/generations/2?limit=20",
        );
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            generations: [
              {
                id: "generation:ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r:Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ:2",
                tokenMint: "ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r",
                soul: "Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ",
                generation: 2,
                side: "buy",
                amount: "990000",
                trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
                tokenAccount: "HkJHnQtJAu7YWoRszaM7Wi8drs4mmPfb9DNPhBnxFCRX",
                seedHash: "c613e02aa48460b1",
                signature: "nJCQ4htehrUSF6RFHSMQzPyW5swfRj4prZotprPGQnFpJapywiyCp5L3VZXmK2wtwEpZz7hYdBR55jxx7xpBJfd",
                slot: 458769366,
                blockTime: 1777419851,
                source: "finalized-rpc-logs",
              },
            ],
          }),
        };
      },
    );

    expect(hydrated?.marketProvenance).toMatchObject({
      generation: "2",
      side: "buy",
      amount: "990000",
      trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
      seedHash: "c613e02aa48460b1",
      signature: "nJCQ4htehrUSF6RFHSMQzPyW5swfRj4prZotprPGQnFpJapywiyCp5L3VZXmK2wtwEpZz7hYdBR55jxx7xpBJfd",
    });
    expect(hydrated?.marketProvenanceStatus).toBe("available");
  });

  it("keeps claimed cards honest when no finalized provenance row exists", async () => {
    const tokenMint = PublicKey.unique();
    const [item] = buildClaimedSoulNftGalleryItems([
      {
        claim: PublicKey.unique(),
        soul: PublicKey.unique(),
        claimer: PublicKey.unique(),
        nftMint: PublicKey.unique(),
        tokenMint,
        sequence: 0n,
        generationCount: 1n,
        metadataAuthority: PublicKey.unique(),
        metadata: {
          name: "PD6 Soul #0",
          symbol: "PD6",
          uri: metadataUri({
            name: "PD6 Soul #0",
            symbol: "PD6",
            image: imageUri("<svg><circle /></svg>"),
          }),
        },
      },
    ]);

    const [hydrated] = await hydrateSoulNftGalleryItemsWithRpcProvenance([item!], async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, generations: [] }),
    }));

    expect(hydrated?.marketProvenance).toBeNull();
    expect(hydrated?.marketProvenanceStatus).toBe("pending");
  });

  it("prehydrates localized claimed Souls cards with bounded priority before low-priority pending lookups", async () => {
    const adlartuClaim = PublicKey.unique();
    const adlartuSoul = new PublicKey("Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ");
    const adlartuTokenMint = new PublicKey("ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r");
    const claims = [
      ...Array.from({ length: 5 }, (_, index) => {
        const tokenMint = PublicKey.unique();
        return {
          claim: PublicKey.unique(),
          soul: PublicKey.unique(),
          claimer: PublicKey.unique(),
          nftMint: PublicKey.unique(),
          tokenMint,
          sequence: BigInt(index),
          generationCount: 1n,
          metadataAuthority: PublicKey.unique(),
          metadata: {
            name: `LOW${index} Soul #${index}`,
            symbol: `LOW${index}`,
            uri: metadataUri({
              name: `LOW${index} Soul #${index}`,
              symbol: `LOW${index}`,
              image: imageUri("<svg><circle /></svg>"),
            }),
          },
        };
      }),
      {
        claim: adlartuClaim,
        soul: adlartuSoul,
        claimer: PublicKey.unique(),
        nftMint: new PublicKey("2FYg17ZnC9hhoKM4uuECVLHe4CwJTqkcFyuBuzacQ4Jh"),
        tokenMint: adlartuTokenMint,
        sequence: 0n,
        generationCount: 2n,
        metadataAuthority: PublicKey.unique(),
        metadata: {
          name: "PD6 Soul #0",
          symbol: "PD6",
          uri: metadataUri({
            name: "PD6 Soul #0",
            symbol: "PD6",
            image: imageUri("<svg><circle /></svg>"),
          }),
        },
      },
    ];
    const items = buildClaimedSoulNftGalleryItems(claims);
    let inFlight = 0;
    let maxInFlight = 0;
    const exactGenerationRequests: string[] = [];

    const hydrated = await hydrateSoulNftGalleryItemsWithRpcProvenance(items, async (input) => {
      const url = String(input);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (url.includes("/generations/")) {
        exactGenerationRequests.push(url);
      }
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;

      if (url === "/api/stats") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, recentActivity: [] }),
        };
      }

      if (
        url.includes(
          "/api/token/ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r/generations/2?limit=20",
        )
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            generations: [
              {
                id: "generation:ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r:Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ:2",
                tokenMint: "ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r",
                soul: "Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ",
                generation: 2,
                side: "buy",
                amount: "990000",
                trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
                tokenAccount: "********************************************",
                seedHash: "c613e02aa48460b1",
                signature: "nJCQ4htehrUSF6RFHSMQzPyW5swfRj4prZotprPGQnFpJapywiyCp5L3VZXmK2wtwEpZz7hYdBR55jxx7xpBJfd",
                slot: 458769366,
                blockTime: 1777419851,
                source: "finalized-rpc-logs",
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, generations: [] }),
      };
    });

    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(exactGenerationRequests[0]).toContain(
      "/api/token/ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r/generations/2?limit=20",
    );
    expect(hydrated.find((item) => item.claim === adlartuClaim.toBase58())).toMatchObject({
      marketProvenanceStatus: "available",
      marketProvenance: {
        generation: "2",
        side: "buy",
        amount: "990000",
        trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
        seedHash: "c613e02aa48460b1",
        signature: "nJCQ4htehrUSF6RFHSMQzPyW5swfRj4prZotprPGQnFpJapywiyCp5L3VZXmK2wtwEpZz7hYdBR55jxx7xpBJfd",
      },
    });
  });

  it("hydrates ADLARTU PD6 legacy claimed cards from same token/Soul generation inventory when the stored generation is stale", async () => {
    const claim = PublicKey.unique();
    const soul = new PublicKey("Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ");
    const tokenMint = new PublicKey("ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r");
    const [item] = buildClaimedSoulNftGalleryItems([
      {
        claim,
        soul,
        claimer: PublicKey.unique(),
        nftMint: new PublicKey("2FYg17ZnC9hhoKM4uuECVLHe4CwJTqkcFyuBuzacQ4Jh"),
        tokenMint,
        sequence: 0n,
        generationCount: 1n,
        metadataAuthority: PublicKey.unique(),
        metadata: {
          name: "PD6 Soul #1",
          symbol: "PD6",
          uri: metadataUri({
            name: "PD6 Soul #1",
            symbol: "PD6",
            image: imageUri("<svg><circle /></svg>"),
          }),
        },
      },
    ]);
    const requestUrls: string[] = [];

    const [hydrated] = await hydrateSoulNftGalleryItemsWithRpcProvenance(
      [item!],
      async (input) => {
        const url = String(input);
        requestUrls.push(url);

        if (url === "/api/stats") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, recentActivity: [] }),
          };
        }
        if (url.endsWith("/generations/1?limit=20")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, generations: [] }),
          };
        }
        if (
          url ===
          "/api/token/ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r/timeline"
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              events: [
                {
                  id: "generation:ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r:Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ:2",
                  kind: "generation",
                  tokenMint: "ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r",
                  soul: "Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ",
                  generation: 2,
                  side: "buy",
                  amount: "990000",
                  trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
                  tokenAccount: "********************************************",
                  seedHash: "c613e02aa48460b1",
                  signature: "nJCQ4htehrUSF6RFHSMQzPyW5swfRj4prZotprPGQnFpJapywiyCp5L3VZXmK2wtwEpZz7hYdBR55jxx7xpBJfd",
                  slot: 458769366,
                  blockTime: 1777419851,
                  source: "finalized-rpc-logs",
                },
              ],
            }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, generations: [] }),
        };
      },
    );

    expect(requestUrls).toContain(
      "/api/token/ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r/timeline",
    );
    expect(hydrated?.marketProvenance).toMatchObject({
      generation: "2",
      side: "buy",
      amount: "990000",
      trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
      seedHash: "c613e02aa48460b1",
      signature: "nJCQ4htehrUSF6RFHSMQzPyW5swfRj4prZotprPGQnFpJapywiyCp5L3VZXmK2wtwEpZz7hYdBR55jxx7xpBJfd",
    });
    expect(hydrated?.marketProvenanceStatus).toBe("available");
  });
});

describe("sanitizeInlineSvg", () => {
  it("preserves safe inline SVG elements while stripping active content", () => {
    const sanitized = sanitizeInlineSvg(
      '<svg onload="alert(1)"><script>alert(1)</script><circle fill="hsl(12,80%,60%)" /><a href="javascript:alert(1)">x</a></svg>',
    );

    expect(sanitized).toContain("<svg");
    expect(sanitized).toContain("<circle");
    expect(sanitized).toContain('fill="hsl(12,80%,60%)"');
    expect(sanitized).not.toContain("script");
    expect(sanitized).not.toContain("onload");
    expect(sanitized).not.toContain("javascript:");
  });

  it("preserves PD9 inline primitives while stripping external SVG references", () => {
    const sanitized = sanitizeInlineSvg(
      [
        '<svg viewBox="0 0 256 256" data-soul="pd9-monochrome">',
        '<style>@import url("https://example.invalid/font.css"); rect{fill:url(https://example.invalid/a.svg)}</style>',
        '<rect width="256" height="256" fill="#f7f7f2" />',
        '<path d="M64 200 C86 142 108 90 128 72 C148 90 170 142 192 200 Z" fill="#050505" />',
        '<circle cx="128" cy="110" r="32" stroke="#050505" stroke-width="6" fill="#f7f7f2" />',
        '<g transform="rotate(4 128 128)" opacity="0.72"><line x1="32" y1="42" x2="224" y2="42" stroke="#050505" /></g>',
        '<image href="https://example.invalid/pixel.png" />',
        '<use xlink:href="http://example.invalid/sprite.svg#soul" />',
        '<a href="https://example.invalid/out"><text>external</text></a>',
        '<rect fill="url(https://example.invalid/gradient.svg#x)" />',
        "</svg>",
      ].join(""),
    );

    expect(sanitized).toContain('data-soul="pd9-monochrome"');
    expect(sanitized).toContain("<rect");
    expect(sanitized).toContain("<path");
    expect(sanitized).toContain("<circle");
    expect(sanitized).toContain("<line");
    expect(sanitized).toContain('transform="rotate(4 128 128)"');
    expect(sanitized).not.toContain("<style");
    expect(sanitized).not.toContain("<image");
    expect(sanitized).not.toContain("https://");
    expect(sanitized).not.toContain("http://");
    expect(sanitized).not.toContain("xlink:href");
    expect(sanitized).not.toContain("href=");
    expect(sanitized).not.toContain("url(");
  });
});

describe("buildSoulNftGalleryItems", () => {
  it("keeps only Token-2022 NFT accounts with valid Soul metadata and sanitized SVGs", () => {
    const soulMint = PublicKey.unique().toBase58();
    const fungibleMint = PublicKey.unique().toBase58();
    const nonSoulMint = PublicKey.unique().toBase58();
    const tokenMint = PublicKey.unique().toBase58();
    const validMetadata = {
      name: "SOUL Soul #7",
      symbol: "SOUL",
      imageSvg: '<svg onmouseover="bad()"><rect width="10" height="10"/></svg>',
      sequence: 7,
      artTheme: {
        label: "Signal Field",
        source: "metadata",
      },
      metadataRarity: { tier: "rare", score: 777 },
      marketProvenance: {
        generation: "7",
        side: "buy",
        amount: "42",
        trader: "Trader111111111111111111111111111111111111",
        traderLabel: "Trad…1111",
        seedHash: "feedfacecafebeef",
        tokenMint,
        soul: "Soul11111111111111111111111111111111111111",
      },
    } satisfies DecodedSoulNftMetadata;

    const items = buildSoulNftGalleryItems(
      [
        parsedTokenAccount(soulMint, PublicKey.unique()),
        parsedTokenAccount(fungibleMint, PublicKey.unique(), "1000000", 6),
        parsedTokenAccount(nonSoulMint, PublicKey.unique()),
      ],
      new Map<string, DecodedSoulNftMetadata | null>([
        [soulMint, validMetadata],
        [nonSoulMint, null],
      ]),
      new Map([[soulMint, tokenMint]]),
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      mint: soulMint,
      tokenMint,
      tokenMintLabel: `${tokenMint.slice(0, 4)}…${tokenMint.slice(-4)}`,
      name: "SOUL Soul #7",
      symbol: "SOUL",
      soulRarity: {
        tier: "rare",
        score: 777,
        generation: "7",
        traits: expect.arrayContaining([
          { kind: "generationBand", value: "early" },
          { kind: "tradeSignal", value: "buy" },
          { kind: "seedSource", value: "onChainSeedHash" },
        ]),
      },
      marketProvenance: validMetadata.marketProvenance,
      marketProvenanceStatus: "available",
    });
    expect(items[0]?.sanitizedSvg).toContain("<rect");
    expect(items[0]?.sanitizedSvg).not.toContain("onmouseover");
  });

  it("matches per-token claimed rarity for wallet Profile items before and after hydration", async () => {
    const claim = PublicKey.unique();
    const nftMint = PublicKey.unique();
    const tokenAccount = PublicKey.unique();
    const tokenMint = new PublicKey("CfaWjwi7S69XjfX5cLLyrReXwA9SaX21wZpPz6nBADDV");
    const soul = new PublicKey("pBMR5wd8bK5YSBpDKU5iH5cgsGkNFhqWnhEnqRFsUVn");
    const metadataAuthority = PublicKey.unique();
    const metadataPayload = {
      name: "P74 Soul #0",
      symbol: "P74",
      image: imageUri("<svg><circle /></svg>"),
      artTheme: "Monochrome Soul",
    };
    const walletAssociation = {
      claim: claim.toBase58(),
      tokenMint: tokenMint.toBase58(),
      soul: soul.toBase58(),
      generation: "2",
      sequence: 0n,
    } satisfies SoulNftAssociation;

    const [claimedItem] = buildClaimedSoulNftGalleryItems([
      {
        claim,
        soul,
        claimer: PublicKey.unique(),
        nftMint,
        tokenMint,
        sequence: 0n,
        generationCount: 2n,
        metadataAuthority,
        metadata: {
          name: "P74 Soul #0",
          symbol: "P74",
          uri: metadataUri(metadataPayload),
        },
      },
    ]);
    const [walletItem] = buildSoulNftGalleryItems(
      [parsedTokenAccount(nftMint.toBase58(), tokenAccount)],
      new Map([
        [
          nftMint.toBase58(),
          {
            name: "P74 Soul #0",
            symbol: "P74",
            imageSvg: "<svg><circle /></svg>",
            sequence: 0,
            artTheme: {
              label: "Monochrome Soul",
              source: "metadata",
            },
            marketProvenance: null,
          } satisfies DecodedSoulNftMetadata,
        ],
      ]),
      new Map([[nftMint.toBase58(), walletAssociation]]),
    );

    expect(walletItem).toMatchObject({
      claim: claim.toBase58(),
      sequence: 0,
      tokenAccount: tokenAccount.toBase58(),
    });
    expect(walletItem?.soulRarity.score).toBe(claimedItem?.soulRarity.score);
    expect(walletItem?.soulRarity.tier).toBe(claimedItem?.soulRarity.tier);
    expect(walletItem?.soulRarity.traits.find((trait) => trait.kind === "claimRank")).toEqual(
      claimedItem?.soulRarity.traits.find((trait) => trait.kind === "claimRank"),
    );

    const [hydratedWallet, hydratedClaimed] = await hydrateSoulNftGalleryItemsWithRpcProvenance(
      [walletItem!, claimedItem!],
      async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          generations: [
            {
              id: `generation:${tokenMint.toBase58()}:${soul.toBase58()}:2`,
              tokenMint: tokenMint.toBase58(),
              soul: soul.toBase58(),
              generation: 2,
              side: "buy",
              amount: "990000",
              trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
              tokenAccount: "DifferentHydratedTokenAccount111111111111",
              seedHash: "a68d8f5535cadc50",
              signature: "4dnVe5iGPLkbrm7XiFoJLfTKntiNZ6yQUCvwjVTq5ZE9zjJ5m1UfJN6zd8AyexrzqGzDA1tRrSQSo3jYAXd3nwkB",
              slot: 458798744,
              blockTime: 1777448992,
              source: "finalized-rpc-logs",
            },
          ],
        }),
      }),
    );

    expect(hydratedWallet.soulRarity.score).toBe(hydratedClaimed.soulRarity.score);
    expect(hydratedWallet.soulRarity.tier).toBe(hydratedClaimed.soulRarity.tier);
    expect(hydratedWallet.soulRarity.traits.find((trait) => trait.kind === "claimRank")).toEqual(
      hydratedClaimed.soulRarity.traits.find((trait) => trait.kind === "claimRank"),
    );
  });

  it("uses claim association to hydrate metadata provenance that lacks finalized explorer evidence", async () => {
    const soulMint = PublicKey.unique().toBase58();
    const tokenAccount = PublicKey.unique();
    const tokenMint = new PublicKey("CfaWjwi7S69XjfX5cLLyrReXwA9SaX21wZpPz6nBADDV");
    const soul = new PublicKey("pBMR5wd8bK5YSBpDKU5iH5cgsGkNFhqWnhEnqRFsUVn");
    const metadata = {
      name: "P74 Soul #1",
      symbol: "P74",
      imageSvg: "<svg><circle /></svg>",
      sequence: 1,
      artTheme: {
        label: "Monochrome Soul",
        source: "metadata",
      },
      marketProvenance: {
        generation: "1",
        side: "buy",
        amount: "990000",
        trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
        traderLabel: "8uAP…cd1i",
        seedHash: "a68d8f5535cadc50",
        tokenMint: tokenMint.toBase58(),
        soul: soul.toBase58(),
      },
    } satisfies DecodedSoulNftMetadata;

    const [item] = buildSoulNftGalleryItems(
      [parsedTokenAccount(soulMint, tokenAccount)],
      new Map([[soulMint, metadata]]),
      new Map([
        [
          soulMint,
          {
            tokenMint: tokenMint.toBase58(),
            soul: soul.toBase58(),
            generation: "1",
          },
        ],
      ]),
    );

    expect(item?.marketProvenance).toMatchObject({
      generation: "1",
      seedHash: "a68d8f5535cadc50",
    });
    expect(item?.marketProvenance?.explorerUrl).toBeUndefined();
    expect(item?.marketProvenanceLookup).toEqual({
      tokenMint: tokenMint.toBase58(),
      soul: soul.toBase58(),
      generation: "1",
    });

    const [hydrated] = await hydrateSoulNftGalleryItemsWithRpcProvenance(
      [item!],
      async (input) => {
        expect(String(input)).toContain(
          "/api/token/CfaWjwi7S69XjfX5cLLyrReXwA9SaX21wZpPz6nBADDV/generations/1?limit=20",
        );
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            generations: [
              {
                id: "generation:CfaWjwi7S69XjfX5cLLyrReXwA9SaX21wZpPz6nBADDV:pBMR5wd8bK5YSBpDKU5iH5cgsGkNFhqWnhEnqRFsUVn:1",
                tokenMint: tokenMint.toBase58(),
                soul: soul.toBase58(),
                generation: 1,
                side: "buy",
                amount: "990000",
                trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
                tokenAccount: "TokenAcct111111111111111111111111111111111",
                seedHash: "a68d8f5535cadc50",
                signature: "4dnVe5iGPLkbrm7XiFoJLfTKntiNZ6yQUCvwjVTq5ZE9zjJ5m1UfJN6zd8AyexrzqGzDA1tRrSQSo3jYAXd3nwkB",
                slot: 458798744,
                blockTime: 1777448992,
                source: "finalized-rpc-logs",
              },
            ],
          }),
        };
      },
    );

    expect(hydrated?.marketProvenance).toMatchObject({
      generation: "1",
      side: "buy",
      amount: "990000",
      seedHash: "a68d8f5535cadc50",
      signature: "4dnVe5iGPLkbrm7XiFoJLfTKntiNZ6yQUCvwjVTq5ZE9zjJ5m1UfJN6zd8AyexrzqGzDA1tRrSQSo3jYAXd3nwkB",
      explorerUrl:
        "https://explorer.solana.com/tx/4dnVe5iGPLkbrm7XiFoJLfTKntiNZ6yQUCvwjVTq5ZE9zjJ5m1UfJN6zd8AyexrzqGzDA1tRrSQSo3jYAXd3nwkB?cluster=devnet",
    });
    expect(hydrated?.marketProvenanceStatus).toBe("available");
  });

  it("requires a token association before rendering wallet Soul NFT cards", () => {
    const soulMint = PublicKey.unique().toBase58();
    const tokenAccount = PublicKey.unique();
    const metadata = {
      name: "SOUL Soul #8",
      symbol: "SOUL",
      imageSvg: "<svg><circle /></svg>",
      sequence: 8,
      artTheme: {
        label: "Legacy / unknown art theme",
        source: "legacy",
      },
      marketProvenance: null,
    } satisfies DecodedSoulNftMetadata;

    expect(
      buildSoulNftGalleryItems(
        [parsedTokenAccount(soulMint, tokenAccount)],
        new Map([[soulMint, metadata]]),
      ),
    ).toEqual([]);
  });

  it("hydrates wallet claimed cards when claim association supplies Soul and generation context", async () => {
    const soulMint = PublicKey.unique().toBase58();
    const tokenAccount = PublicKey.unique();
    const tokenMint = new PublicKey("CfaWjwi7S69XjfX5cLLyrReXwA9SaX21wZpPz6nBADDV");
    const soul = new PublicKey("pBMR5wd8bK5YSBpDKU5iH5cgsGkNFhqWnhEnqRFsUVn");
    const metadata = {
      name: "P74 Soul #1",
      symbol: "P74",
      imageSvg: "<svg><circle /></svg>",
      sequence: 1,
      artTheme: {
        label: "Legacy / unknown art theme",
        source: "legacy",
      },
      marketProvenance: null,
    } satisfies DecodedSoulNftMetadata;

    const [item] = buildSoulNftGalleryItems(
      [parsedTokenAccount(soulMint, tokenAccount)],
      new Map([[soulMint, metadata]]),
      new Map([
        [
          soulMint,
          {
            tokenMint: tokenMint.toBase58(),
            soul: soul.toBase58(),
            generation: "1",
          },
        ],
      ]),
    );

    const [hydrated] = await hydrateSoulNftGalleryItemsWithRpcProvenance(
      [item!],
      async (input) => {
        expect(String(input)).toContain(
          "/api/token/CfaWjwi7S69XjfX5cLLyrReXwA9SaX21wZpPz6nBADDV/generations/1?limit=20",
        );
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            generations: [
              {
                id: "generation:CfaWjwi7S69XjfX5cLLyrReXwA9SaX21wZpPz6nBADDV:pBMR5wd8bK5YSBpDKU5iH5cgsGkNFhqWnhEnqRFsUVn:1",
                tokenMint: "CfaWjwi7S69XjfX5cLLyrReXwA9SaX21wZpPz6nBADDV",
                soul: "pBMR5wd8bK5YSBpDKU5iH5cgsGkNFhqWnhEnqRFsUVn",
                generation: 1,
                side: "buy",
                amount: "990000",
                trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
                tokenAccount: "DgygxKkTjpC5ouHrZD6AWJrrC7xnuz4Mzz4EBRnWVttc",
                seedHash: "a68d8f5535cadc50",
                signature: "4dnVe5iGPLkbrm7XiFoJLfTKntiNZ6yQUCvwjVTq5ZE9zjJ5m1UfJN6zd8AyexrzqGzDA1tRrSQSo3jYAXd3nwkB",
                slot: 458798744,
                blockTime: 1777448992,
                source: "finalized-rpc-logs",
              },
            ],
          }),
        };
      },
    );

    expect(hydrated?.marketProvenance).toMatchObject({
      generation: "1",
      side: "buy",
      amount: "990000",
      seedHash: "a68d8f5535cadc50",
      signature: "4dnVe5iGPLkbrm7XiFoJLfTKntiNZ6yQUCvwjVTq5ZE9zjJ5m1UfJN6zd8AyexrzqGzDA1tRrSQSo3jYAXd3nwkB",
    });
    expect(hydrated?.marketProvenanceStatus).toBe("available");
  });

  it("keeps wallet claimed cards visibly provenance-pending when association lacks generation evidence", () => {
    const soulMint = PublicKey.unique().toBase58();
    const tokenMint = PublicKey.unique().toBase58();
    const metadata = {
      name: "OLD Soul #3",
      symbol: "OLD",
      imageSvg: "<svg><path /></svg>",
      sequence: 3,
      artTheme: {
        label: "Legacy / unknown art theme",
        source: "legacy",
      },
      marketProvenance: null,
    } satisfies DecodedSoulNftMetadata;

    const [item] = buildSoulNftGalleryItems(
      [parsedTokenAccount(soulMint, PublicKey.unique())],
      new Map([[soulMint, metadata]]),
      new Map([[soulMint, tokenMint]]),
    );

    expect(item?.marketProvenance).toBeNull();
    expect(item?.marketProvenanceLookup).toBeUndefined();
    expect(item?.marketProvenanceStatus).toBe("pending");
    expect(item?.soulRarity).toMatchObject({
      generation: "3",
      traits: expect.arrayContaining([
        { kind: "generationBand", value: "early" },
        { kind: "tradeSignal", value: "unknown" },
        { kind: "seedSource", value: "metadataFallback" },
      ]),
    });
  });
});
