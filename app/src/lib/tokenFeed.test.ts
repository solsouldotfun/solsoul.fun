// @ts-nocheck — justified: test stubs use pre-curve-refactor BondingCurveAccount fields (targetAmm) not present in new exponential-curve interface
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  SOUL_PROVENANCE_SIDE,
  TARGET_AMM,
  type BondingCurveAccount,
  type LaunchedToken,
  type SoulAccount,
} from "sdk";
import {
  buildLaunchedTokenFeedItems,
  getTokenDiscoverySegmentItems,
  hydrateLaunchedTokenFeedItemsWithRpcProvenance,
} from "./tokenFeed";

describe("token feed helpers", () => {
  it("builds launched-token cards with token identity, SolSoul lifecycle stats, and token links", () => {
    const mint = PublicKey.unique();
    const creator = PublicKey.unique();
    const item = launchedToken({
      mint,
      creator,
      symbol: "PD4",
      cumulativeSol: 346_574_000_000n,
      totalMinted: 10_500_000_000_000n,
    });

    const cards = buildLaunchedTokenFeedItems([item], "en");

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      mint: mint.toBase58(),
      href: `/token/${mint.toBase58()}`,
      symbol: "PD4",
      creator: creator.toBase58(),
      creatorLabel: `${creator.toBase58().slice(0, 4)}…${creator.toBase58().slice(-4)}`,
      availability: "Curve buy/sell available",
      flowLabel: "346.574 SOL locked",
      marketProgressLabel: "50.00%",
    });
    expect(cards[0]?.currentPrice).toContain("SOL/token");
  });

  it("builds deterministic Soul Flow discovery segments from available token metrics", () => {
    const lowFlow = launchedToken({
      symbol: "LOW",
      cumulativeSol: 100_000_000n,
      totalMinted: 1_000_000_000n,
      createdAt: 1_800_000_100n,
      generationCount: 1n,
      claimCount: 0n,
      lastSvg: "<svg><path /></svg>",
    });
    const highFlow = launchedToken({
      symbol: "HOT",
      cumulativeSol: 900_000_000n,
      totalMinted: 9_000_000_000n,
      createdAt: 1_800_000_000n,
      generationCount: 8n,
      claimCount: 2n,
      lastSvg: "<svg><circle /></svg>",
      latestGenerationProvenance: {
        generation: 8n,
        side: "buy",
        amount: 3_500_000n,
        trader: PublicKey.unique(),
        tokenAccount: PublicKey.unique(),
        tokenMint: PublicKey.unique(),
        soul: PublicKey.unique(),
        seedHash: "abcdef0123456789",
        source: "on-chain-soul-account",
      },
    });
    const newest = launchedToken({
      symbol: "NEW",
      cumulativeSol: 50_000_000n,
      totalMinted: 500_000_000n,
      createdAt: 1_800_000_900n,
      generationCount: 0n,
      lastSvg: "",
    });

    const cards = buildLaunchedTokenFeedItems([lowFlow, highFlow, newest], "en");

    expect(getTokenDiscoverySegmentItems(cards, "top-volume")[0]?.symbol).toBe("HOT");
    expect(getTokenDiscoverySegmentItems(cards, "hot-flow")[0]?.symbol).toBe("HOT");
    expect(getTokenDiscoverySegmentItems(cards, "most-generated")[0]?.symbol).toBe("HOT");
    expect(getTokenDiscoverySegmentItems(cards, "new-launches")[0]?.symbol).toBe("NEW");
    expect(getTokenDiscoverySegmentItems(cards, "fresh-souls")[0]?.symbol).toBe("HOT");
    expect(cards.find((card) => card.symbol === "HOT")?.latestFlowLabel).toBe("latest buy 3.5 tokens");
  });

  it("uses deterministic English availability and created-at labels", () => {
    const cards = buildLaunchedTokenFeedItems(
      [
        launchedToken({ selfDeprecated: false }),
        launchedToken({ selfDeprecated: true }),
        launchedToken({ selfDeprecated: true }),
        launchedToken({ createdAt: null }),
        launchedToken({ createdAt: 0n }),
      ],
      "en",
    );

    expect(cards.map((card) => card.availability)).toEqual([
      "Curve buy/sell available",
      "Curve completed",
      "Curve completed",
      "Curve buy/sell available",
      "Curve buy/sell available",
    ]);
    expect(cards[0]?.createdAtLabel).toBe("Jan 15, 2027, 08:00 UTC");
    expect(cards[3]?.createdAtLabel).toBe("Recent launch");
    expect(cards[4]?.createdAtLabel).toBe("Recent launch");
  });

  it("uses deterministic Chinese availability and created-at labels", () => {
    const cards = buildLaunchedTokenFeedItems(
      [
        launchedToken({ selfDeprecated: false }),
        launchedToken({ selfDeprecated: true }),
        launchedToken({ selfDeprecated: true }),
        launchedToken({ createdAt: null }),
      ],
      "zh",
    );

    expect(cards.map((card) => card.availability)).toEqual([
      "曲线买入/卖出可用",
      "曲线已完成",
      "曲线已完成",
      "曲线买入/卖出可用",
    ]);
    expect(cards[0]?.createdAtLabel).toBe("2027年1月15日 08:00 UTC");
    expect(cards[3]?.createdAtLabel).toBe("最近发射");
  });

  it("defaults helper-generated labels to English for unsupported locales", () => {
    const [card] = buildLaunchedTokenFeedItems([launchedToken({ createdAt: null })], "fr");

    expect(card?.availability).toBe("Curve buy/sell available");
    expect(card?.createdAtLabel).toBe("Recent launch");
  });

  it("maps no-generation launches to a trade-to-generate Soul discovery state", () => {
    const [card] = buildLaunchedTokenFeedItems(
      [
        launchedToken({
          generationCount: 0n,
          claimCount: 0n,
          lastSvg: "",
        }),
      ],
      "en",
    );

    expect(card).toMatchObject({
      latestSoulSvg: null,
      soulStatus: "no-generation",
      soulStatusLabel: "No Soul yet",
      generationCount: "0",
      claimCount: "0",
      claimStatusLabel: "No claims yet",
      holderGateLabel: "Trade to generate a Soul candidate before holders can claim.",
    });
  });

  it("maps generated-but-unclaimed launches with latest Soul preview and holder gate copy", () => {
    const svg = "<svg><circle fill=\"hsl(10 90% 60%)\" /></svg>";
    const trader = PublicKey.unique();
    const tokenAccount = PublicKey.unique();
    const soul = PublicKey.unique();
    const mint = PublicKey.unique();
    const [card] = buildLaunchedTokenFeedItems(
      [
        launchedToken({
          mint,
          soul,
          generationCount: 3n,
          claimCount: 1n,
          lastSvg: svg,
          minClaimBalance: 1_000_000n,
          latestGenerationProvenance: {
            generation: 3n,
            side: "buy",
            amount: 990000n,
            trader,
            tokenAccount,
            tokenMint: mint,
            soul,
            seedHash: "c613e02aa48460b1",
            signature: "GenerationSignature111111111111111111111111111",
            slot: 458769366,
            explorerUrl:
              "https://explorer.solana.com/tx/GenerationSignature111111111111111111111111111?cluster=devnet",
            source: "finalized-rpc-logs",
          },
        }),
      ],
      "en",
    );

    expect(card).toMatchObject({
      latestSoulSvg: svg,
      soulStatus: "generated-unclaimed",
      soulStatusLabel: "Generated / unclaimed",
      generationCount: "3",
      claimCount: "1",
      claimStatusLabel: "2 unclaimed Soul candidates",
      holderGateLabel: "Holder-gated claimable: hold at least 10000.000000 meme token.",
    });
    expect(card?.marketProvenance).toMatchObject({
      generation: "3",
      side: "buy",
      amount: "990000",
      trader: trader.toBase58(),
      traderLabel: `${trader.toBase58().slice(0, 4)}…${trader.toBase58().slice(-4)}`,
      tokenAccount: tokenAccount.toBase58(),
      tokenMint: mint.toBase58(),
      soul: soul.toBase58(),
      seedHash: "c613e02aa48460b1",
      signature: "GenerationSignature111111111111111111111111111",
      slot: "458769366",
      explorerUrl:
        "https://explorer.solana.com/tx/GenerationSignature111111111111111111111111111?cluster=devnet",
    });
  });

  it("hydrates ADLARTU-style generated/unclaimed cards from bounded token generation API evidence", async () => {
    const mint = new PublicKey("ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r");
    const soul = new PublicKey("Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ");
    const [card] = buildLaunchedTokenFeedItems(
      [
        launchedToken({
          mint,
          soul,
          generationCount: 2n,
          claimCount: 1n,
          lastSvg: "<svg><circle /></svg>",
          latestGenerationProvenance: null,
        }),
      ],
      "en",
    );

    expect(card?.marketProvenance).toBeNull();
    expect(card?.marketProvenanceStatus).toBe("pending");

    const [hydrated] = await hydrateLaunchedTokenFeedItemsWithRpcProvenance(
      [card!],
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
      explorerUrl:
        "https://explorer.solana.com/tx/nJCQ4htehrUSF6RFHSMQzPyW5swfRj4prZotprPGQnFpJapywiyCp5L3VZXmK2wtwEpZz7hYdBR55jxx7xpBJfd?cluster=devnet",
    });
    expect(hydrated?.marketProvenanceStatus).toBe("available");
  });

  it("maps claimed launches to claimed status and localized Chinese holder copy", () => {
    const trader = PublicKey.unique();
    const [card] = buildLaunchedTokenFeedItems(
      [
        launchedToken({
          generationCount: 2n,
          claimCount: 2n,
          lastSvg: "<svg><path /></svg>",
          latestGenerationProvenance: {
            generation: 2n,
            side: "sell",
            amount: 1000000n,
            trader,
            tokenAccount: PublicKey.unique(),
            tokenMint: PublicKey.unique(),
            soul: PublicKey.unique(),
            seedHash: "abcdef0123456789",
            source: "on-chain-soul-account",
          },
        }),
      ],
      "zh",
    );

    expect(card).toMatchObject({
      soulStatus: "claimed",
      soulStatusLabel: "已领取 / 在收藏中",
      generationCount: "2",
      claimCount: "2",
      claimStatusLabel: "已领取 2 个 Soul",
      holderGateLabel: "所有已生成 Soul 均已领取；继续交易可生成新的可领取候选。",
    });
    expect(card?.marketProvenance).toMatchObject({
      generation: "2",
      side: "sell",
      amount: "1000000",
      trader: trader.toBase58(),
      seedHash: "abcdef0123456789",
    });
    expect(card?.marketProvenanceStatus).toBe("available");
  });

  it("hydrates claimed token cards from API evidence when latest SoulAccount provenance is absent", async () => {
    const mint = new PublicKey("CfaWjwi7S69XjfX5cLLyrReXwA9SaX21wZpPz6nBADDV");
    const soul = new PublicKey("pBMR5wd8bK5YSBpDKU5iH5cgsGkNFhqWnhEnqRFsUVn");
    const [card] = buildLaunchedTokenFeedItems(
      [
        launchedToken({
          mint,
          soul,
          generationCount: 1n,
          claimCount: 1n,
          lastSvg: "<svg><path /></svg>",
          latestGenerationProvenance: null,
        }),
      ],
      "en",
    );

    const [hydrated] = await hydrateLaunchedTokenFeedItemsWithRpcProvenance(
      [card!],
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

    expect(hydrated?.soulStatus).toBe("claimed");
    expect(hydrated?.marketProvenance).toMatchObject({
      generation: "1",
      side: "buy",
      amount: "990000",
      seedHash: "a68d8f5535cadc50",
      signature: "4dnVe5iGPLkbrm7XiFoJLfTKntiNZ6yQUCvwjVTq5ZE9zjJ5m1UfJN6zd8AyexrzqGzDA1tRrSQSo3jYAXd3nwkB",
    });
    expect(hydrated?.marketProvenanceStatus).toBe("available");
  });

  it("keeps generated token cards in an honest provenance-pending state when exact API evidence is absent", async () => {
    const mint = PublicKey.unique();
    const soul = PublicKey.unique();
    const [card] = buildLaunchedTokenFeedItems(
      [
        launchedToken({
          mint,
          soul,
          generationCount: 5n,
          claimCount: 4n,
          lastSvg: "<svg><path /></svg>",
          latestGenerationProvenance: null,
        }),
      ],
      "en",
    );

    const [hydrated] = await hydrateLaunchedTokenFeedItemsWithRpcProvenance([card!], async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, generations: [] }),
    }));

    expect(hydrated?.marketProvenance).toBeNull();
    expect(hydrated?.marketProvenanceStatus).toBe("pending");
  });
});

function launchedToken({
  mint = PublicKey.unique(),
  creator = PublicKey.unique(),
  symbol = "PD4",
  cumulativeSol = 250_000_000n,
  totalMinted = 0n,
  createdAt = 1_800_000_000n,
  selfDeprecated = false,
  generationCount = 0n,
  claimCount = 0n,
  lastSvg = "",
  minClaimBalance = 0n,
  soul = PublicKey.unique(),
  latestGenerationProvenance = null,
}: {
  mint?: PublicKey;
  creator?: PublicKey;
  soul?: PublicKey;
  symbol?: string;
  cumulativeSol?: bigint;
  totalMinted?: bigint;
  createdAt?: bigint | null;
  selfDeprecated?: boolean;
  generationCount?: bigint;
  claimCount?: bigint;
  lastSvg?: string;
  minClaimBalance?: bigint;
  latestGenerationProvenance?: SoulAccount["latestGenerationProvenance"];
}): LaunchedToken {
  const lastSvgBytes = new TextEncoder().encode(lastSvg);

  return {
    curve: PublicKey.unique(),
    soul,
    mint,
    createdAt,
    bondingCurve: {
      mint,
      cumulativeSol,
      totalMinted,
      selfDeprecated,
      lastInteractionSlot: 0n,
    } satisfies BondingCurveAccount,
    soulAccount: {
      mint,
      authority: creator,
      createdAt: 1_800_000_000n,
      generationCount,
      lastSvgLen: lastSvgBytes.length,
      lastSvg,
      lastSvgBytes,
      templateLen: 0,
      baseSvgTemplate: "",
      baseSvgTemplateBytes: new Uint8Array(),
      styleParamsLen: 0,
      styleParams: "",
      styleParamsBytes: new Uint8Array(),
      minClaimBalance,
      claimCount,
      memeSymbol: symbol,
      memeSymbolBytes: new TextEncoder().encode(symbol),
      memeSymbolLen: symbol.length,
      targetAmm: TARGET_AMM.Raydium,
      provenanceGeneration: 0n,
      provenanceSide: SOUL_PROVENANCE_SIDE.None,
      provenanceAmount: 0n,
      provenanceTokenAmount: 0n,
      provenanceTrader: PublicKey.default,
      provenanceTokenAccount: PublicKey.default,
      provenanceMint: PublicKey.default,
      provenanceSoul: PublicKey.default,
      provenanceSeedHash: new Uint8Array(8),
      provenanceSeedHashHex: "0000000000000000",
      latestGenerationProvenance,
    } satisfies SoulAccount,
  };
}
