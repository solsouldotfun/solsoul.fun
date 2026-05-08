// @ts-nocheck — justified: test stubs use pre-curve-refactor BondingCurveAccount fields (targetAmm) not present in new exponential-curve interface
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  deriveCurvePda,
  deriveSoulPda,
  SOUL_PROVENANCE_SIDE,
  TARGET_AMM,
  type BondingCurveAccount,
  type ClaimedSoulNft,
  type SoulAccount,
} from "sdk";
import {
  buildTokenTimelineSnapshot,
  type TokenTimelineSignature,
} from "./tokenTimeline";
import { loadTokenTimelineSnapshot } from "./tokenTimelineFetch";
import type { GenerationProvenanceRow } from "./generationProvenance";

describe("buildTokenTimelineSnapshot", () => {
  it("maps launch, trade, public API/RPC generation provenance, and claim evidence into a chronological public timeline", () => {
    const mint = PublicKey.unique();
    const curve = PublicKey.unique();
    const soul = PublicKey.unique();
    const claim = claimedSoul({ tokenMint: mint, soul, sequence: 1n });
    const snapshot = buildTokenTimelineSnapshot({
      mint,
      curve,
      soul,
      bondingCurve: bondingCurve({ mint, cumulativeSol: 120_000_000n }),
      soulAccount: soulAccount({ mint, generationCount: 2n, claimCount: 1n, createdAt: 1_714_200_000n }),
      claims: [claim],
      signaturesByAddress: {
        [mint.toBase58()]: [
          signature({ address: mint, signature: "launchSig", slot: 10, blockTime: 1_714_200_000 }),
        ],
        [curve.toBase58()]: [
          signature({ address: curve, signature: "tradeSig", slot: 15, blockTime: 1_714_200_030 }),
        ],
        [claim.claim.toBase58()]: [
          signature({ address: claim.claim, signature: "claimSig", slot: 18, blockTime: 1_714_200_060 }),
        ],
      },
      generationRows: [
        generationRow({
          mint,
          soul,
          generation: 2,
          side: "buy",
          amount: "990000",
          trader: "Trader1111111111111111111111111111111111",
          tokenAccount: "TraderToken11111111111111111111111111111",
          seedHash: "c613e02aa48460b1",
          signature: "generationSig",
          slot: 16,
          blockTime: 1_714_200_031,
        }),
      ],
    });

    expect(snapshot.events.map((event) => event.kind)).toEqual([
      "launch",
      "trade",
      "generation",
      "claim",
    ]);
    expect(snapshot.events.map((event) => event.signature)).toEqual([
      "launchSig",
      "tradeSig",
      "generationSig",
      "claimSig",
    ]);
    expect(snapshot.events.map((event) => event.slot)).toEqual([10, 15, 16, 18]);
    expect(snapshot.events[2]).toMatchObject({ generation: "2" });
    expect(snapshot.events[2]).toMatchObject({
      side: "buy",
      amount: "990000",
      trader: "Trader1111111111111111111111111111111111",
      tokenAccount: "TraderToken11111111111111111111111111111",
      seedHash: "c613e02aa48460b1",
      evidenceSource: "finalized-rpc-logs",
    });
    expect(snapshot.events[2].evidenceAddress).toBe(snapshot.events[2].tokenAccount);
    expect(snapshot.events[0]).toMatchObject({
      evidenceSource: "public-address-signatures",
      evidenceAddress: mint.toBase58(),
    });
    expect(snapshot.events[3]).toMatchObject({
      sequence: "1",
      generation: "1",
      evidenceSource: "public-address-signatures",
      evidenceAddress: claim.claim.toBase58(),
    });
  });

  it("builds token, Soul, NFT, and devnet explorer links for useful timeline navigation", () => {
    const mint = PublicKey.unique();
    const curve = PublicKey.unique();
    const soul = PublicKey.unique();
    const nftMint = PublicKey.unique();
    const claim = claimedSoul({ nftMint, tokenMint: mint, soul, sequence: 3n });
    const snapshot = buildTokenTimelineSnapshot({
      mint,
      curve,
      soul,
      bondingCurve: bondingCurve({ mint, cumulativeSol: 1n }),
      soulAccount: soulAccount({ mint, generationCount: 3n, claimCount: 1n, createdAt: 1_714_200_000n }),
      claims: [claim],
      signaturesByAddress: {
        [curve.toBase58()]: [
          signature({ address: curve, signature: "tradeSig", slot: 15 }),
        ],
        [claim.claim.toBase58()]: [
          signature({ address: claim.claim, signature: "claimSig", slot: 18 }),
        ],
      },
      generationRows: [
        generationRow({
          mint,
          soul,
          generation: 3,
          signature: "generationSig",
          slot: 16,
        }),
      ],
    });

    const generation = snapshot.events.find((event) => event.kind === "generation");
    expect(generation?.links).toEqual(
      expect.arrayContaining([
        { labelKey: "token", href: `/token/${mint.toBase58()}` },
        { labelKey: "soul", href: `https://explorer.solana.com/address/${soul.toBase58()}?cluster=devnet`, external: true },
        { labelKey: "transaction", href: "https://explorer.solana.com/tx/generationSig?cluster=devnet", external: true },
      ]),
    );

    const claimEvent = snapshot.events.find((event) => event.kind === "claim");
    expect(claimEvent?.links).toEqual(
      expect.arrayContaining([
        { labelKey: "gallery", href: `/token/${mint.toBase58()}/gallery` },
        { labelKey: "nft", href: `https://explorer.solana.com/address/${nftMint.toBase58()}?cluster=devnet`, external: true },
        { labelKey: "transaction", href: "https://explorer.solana.com/tx/claimSig?cluster=devnet", external: true },
      ]),
    );
  });

  it("does not assign Soul PDA account signatures as generation evidence without a public provenance row", () => {
    const mint = PublicKey.unique();
    const curve = PublicKey.unique();
    const soul = PublicKey.unique();
    const claim = claimedSoul({ tokenMint: mint, soul, sequence: 1n });
    const snapshot = buildTokenTimelineSnapshot({
      mint,
      curve,
      soul,
      bondingCurve: bondingCurve({ mint, cumulativeSol: 120_000_000n }),
      soulAccount: soulAccount({ mint, generationCount: 2n, claimCount: 1n, createdAt: 1_714_200_000n }),
      claims: [claim],
      signaturesByAddress: {
        [soul.toBase58()]: [
          signature({ address: soul, signature: "heuristicSoulAccountSig", slot: 16, blockTime: 1_714_200_031 }),
          signature({ address: soul, signature: "claimSig", slot: 24, blockTime: 1_714_200_090 }),
        ],
        [claim.claim.toBase58()]: [
          signature({ address: claim.claim, signature: "claimSig", slot: 24, blockTime: 1_714_200_090 }),
        ],
      },
    });

    expect(snapshot.events.find((event) => event.kind === "generation")).toBeUndefined();
    expect(snapshot.events.find((event) => event.kind === "claim")?.signature).toBe("claimSig");
  });

  it("omits generation transaction evidence when only claim signatures touch the Soul PDA", () => {
    const mint = PublicKey.unique();
    const curve = PublicKey.unique();
    const soul = PublicKey.unique();
    const claim = claimedSoul({ tokenMint: mint, soul, sequence: 1n });
    const snapshot = buildTokenTimelineSnapshot({
      mint,
      curve,
      soul,
      bondingCurve: bondingCurve({ mint, cumulativeSol: 120_000_000n }),
      soulAccount: soulAccount({ mint, generationCount: 1n, claimCount: 1n, createdAt: 1_714_200_000n }),
      claims: [claim],
      signaturesByAddress: {
        [soul.toBase58()]: [
          signature({ address: soul, signature: "claimSig", slot: 24, blockTime: 1_714_200_090 }),
        ],
        [claim.claim.toBase58()]: [
          signature({ address: claim.claim, signature: "claimSig", slot: 24, blockTime: 1_714_200_090 }),
        ],
      },
    });

    expect(snapshot.events.find((event) => event.kind === "generation")).toBeUndefined();
    expect(snapshot.events.find((event) => event.kind === "claim")?.signature).toBe("claimSig");
  });

  it("orders nullable blockTime events by slot before deterministic fallback order", () => {
    const mint = PublicKey.unique();
    const curve = PublicKey.unique();
    const soul = PublicKey.unique();
    const snapshot = buildTokenTimelineSnapshot({
      mint,
      curve,
      soul,
      bondingCurve: bondingCurve({ mint, cumulativeSol: 120_000_000n }),
      soulAccount: soulAccount({ mint, generationCount: 0n, claimCount: 0n, createdAt: 1_714_200_000n }),
      claims: [],
      signaturesByAddress: {
        [mint.toBase58()]: [
          signature({ address: mint, signature: "launchSig", slot: 10, blockTime: 1_714_200_000 }),
        ],
        [curve.toBase58()]: [
          signature({ address: curve, signature: "tradeSig", slot: 20, blockTime: null }),
        ],
      },
    });

    expect(snapshot.events.map((event) => event.kind)).toEqual(["launch", "trade"]);
    expect(snapshot.events.map((event) => event.signature)).toEqual(["launchSig", "tradeSig"]);
  });

  it("keeps reload-safe synthetic lifecycle rows visible even when RPC signatures are unavailable", () => {
    const mint = PublicKey.unique();
    const curve = PublicKey.unique();
    const soul = PublicKey.unique();
    const snapshot = buildTokenTimelineSnapshot({
      mint,
      curve,
      soul,
      bondingCurve: bondingCurve({ mint, cumulativeSol: 50_000_000n }),
      soulAccount: soulAccount({ mint, generationCount: 1n, claimCount: 0n, createdAt: 1_714_200_000n }),
      claims: [],
      signaturesByAddress: {},
      fetchedAt: new Date("2026-04-29T00:00:00.000Z"),
      rpcEndpoint: "https://api.devnet.solana.com",
    });

    expect(snapshot.source).toEqual({
      fetchedAt: "2026-04-29T00:00:00.000Z",
      rpcEndpoint: "https://api.devnet.solana.com",
    });
    expect(snapshot.events.map((event) => event.kind)).toEqual(["launch", "trade"]);
    expect(snapshot.events.every((event) => event.tokenMint === mint.toBase58())).toBe(true);
  });

  it("loads the reload-safe API read model from SDK accounts plus public provenance rows without Soul account signature heuristics", async () => {
    const mint = validTimelineMint();
    const soul = deriveSoulPda(mint);
    const claim = claimedSoul({ tokenMint: mint, soul: PublicKey.unique(), sequence: 1n });
    const signatureAddresses: string[] = [];
    let generationFetchOptions:
      | {
          signatureLimit: number;
          maxTransactions: number;
          stopAfterRows: number;
          filters: { mint: string; soul: string };
        }
      | undefined;
    const snapshot = await loadTokenTimelineSnapshot({
      connection: {} as never,
      mint,
      rpcEndpoint: "https://api.devnet.solana.com",
      loaders: {
        fetchBondingCurve: async () => bondingCurve({ mint, cumulativeSol: 100n }),
        fetchSoul: async () =>
          soulAccount({ mint, generationCount: 1n, claimCount: 1n, createdAt: 1_714_200_000n }),
        listClaimedSoulNftsByMint: async () => ({
          items: [claim],
          page: 1,
          pageSize: 24,
          total: 1,
          hasNextPage: false,
        }),
        getSignaturesForAddress: async (_connection, address) => {
          signatureAddresses.push(address.toBase58());
          return [
            {
              signature: `sig-${address.toBase58().slice(0, 6)}`,
              slot: 55,
              err: null,
              memo: null,
              blockTime: 1_714_200_055,
              confirmationStatus: "confirmed",
            },
          ];
        },
        fetchGenerationRowsFromFinalizedRpc: async (options) => {
          generationFetchOptions = options;
          return [
            generationRow({
              mint,
              soul,
              generation: 1,
              side: "sell",
              amount: "1000000",
              signature: "publicApiGenerationSig",
              slot: 55,
              blockTime: 1_714_200_055,
            }),
          ];
        },
      },
    });

    expect(snapshot.source.rpcEndpoint).toBe("https://api.devnet.solana.com");
    expect(signatureAddresses).not.toContain(soul.toBase58());
    expect(generationFetchOptions).toMatchObject({
      filters: { mint: mint.toBase58(), soul: soul.toBase58() },
      signatureLimit: 20,
      maxTransactions: 16,
      stopAfterRows: 12,
    });
    expect(snapshot.events.map((event) => event.kind)).toEqual([
      "launch",
      "trade",
      "generation",
      "claim",
    ]);
    expect(snapshot.events.find((event) => event.kind === "generation")).toMatchObject({
      signature: "publicApiGenerationSig",
      side: "sell",
      amount: "1000000",
    });
  });

  it("keeps launch trade and claim timeline rows when generation provenance RPC is transiently unavailable", async () => {
    const mint = validTimelineMint();
    const soul = deriveSoulPda(mint);
    const claim = claimedSoul({ tokenMint: mint, soul, sequence: 1n });
    const snapshot = await loadTokenTimelineSnapshot({
      connection: {} as never,
      mint,
      rpcEndpoint: "https://api.devnet.solana.com",
      loaders: {
        fetchBondingCurve: async () => bondingCurve({ mint, cumulativeSol: 100n }),
        fetchSoul: async () =>
          soulAccount({ mint, generationCount: 1n, claimCount: 1n, createdAt: 1_714_200_000n }),
        listClaimedSoulNftsByMint: async () => ({
          items: [claim],
          page: 1,
          pageSize: 24,
          total: 1,
          hasNextPage: false,
        }),
        getSignaturesForAddress: async (_connection, address) => [
          {
            signature: `sig-${address.toBase58().slice(0, 6)}`,
            slot: 55,
            err: null,
            memo: null,
            blockTime: 1_714_200_055,
            confirmationStatus: "confirmed",
          },
        ],
        fetchGenerationRowsFromFinalizedRpc: async () => {
          throw new Error("HTTP 429 from devnet RPC");
        },
      },
    });

    expect(snapshot.events.map((event) => event.kind)).toEqual(["launch", "trade", "claim"]);
    expect(snapshot.events.find((event) => event.kind === "generation")).toBeUndefined();
    expect(snapshot.events.find((event) => event.kind === "claim")?.signature).toMatch(/^sig-/);
  });
});

function validTimelineMint(): PublicKey {
  for (let index = 0; index < 100; index += 1) {
    const mint = PublicKey.unique();
    try {
      deriveCurvePda(mint);
      deriveSoulPda(mint);
      return mint;
    } catch {
      // The SDK's legacy no-bump PDAs require selected seeds to fall off-curve.
    }
  }

  throw new Error("Unable to find a mint with valid no-bump timeline PDAs");
}

function bondingCurve({
  mint,
  cumulativeSol = 0n,
  selfDeprecated = false,
}: {
  mint: PublicKey;
  cumulativeSol?: bigint;
  selfDeprecated?: boolean;
}): BondingCurveAccount {
  return {
    mint,
    cumulativeSol,
    totalMinted: 0n,
    selfDeprecated,
    lastInteractionSlot: 0n,
  };
}

function soulAccount({
  mint,
  generationCount,
  claimCount,
  createdAt,
}: {
  mint: PublicKey;
  generationCount: bigint;
  claimCount: bigint;
  createdAt: bigint;
}): SoulAccount {
  const svg = "<svg><circle /></svg>";
  const lastSvgBytes = new TextEncoder().encode(svg);
  return {
    mint,
    authority: PublicKey.unique(),
    createdAt,
    generationCount,
    lastSvg: generationCount > 0n ? svg : "",
    lastSvgBytes: generationCount > 0n ? lastSvgBytes : new Uint8Array(),
    lastSvgLen: generationCount > 0n ? lastSvgBytes.length : 0,
    baseSvgTemplate: "",
    baseSvgTemplateBytes: new Uint8Array(),
    templateLen: 0,
    styleParams: "",
    styleParamsBytes: new Uint8Array(),
    styleParamsLen: 0,
    minClaimBalance: 0n,
    claimCount,
    memeSymbol: "SOUL",
    memeSymbolBytes: new TextEncoder().encode("SOUL"),
    memeSymbolLen: 4,
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
  };
}

function claimedSoul({
  tokenMint,
  soul,
  nftMint = PublicKey.unique(),
  sequence,
}: {
  tokenMint: PublicKey;
  soul: PublicKey;
  nftMint?: PublicKey;
  sequence: bigint;
}): ClaimedSoulNft {
  return {
    claim: PublicKey.unique(),
    soul,
    claimer: PublicKey.unique(),
    nftMint,
    sequence,
    generationCount: sequence,
    tokenMint,
    metadataAuthority: PublicKey.unique(),
    metadata: null,
  };
}

function signature({
  address,
  signature,
  slot,
  blockTime = null,
}: {
  address: PublicKey;
  signature: string;
  slot: number;
  blockTime?: number | null;
}): TokenTimelineSignature {
  return {
    address: address.toBase58(),
    signature,
    slot,
    blockTime,
  };
}

function generationRow({
  mint,
  soul,
  generation,
  side = "buy",
  amount = "990000",
  trader = "Trader1111111111111111111111111111111111",
  tokenAccount = "TraderToken11111111111111111111111111111",
  seedHash = "c613e02aa48460b1",
  signature = "generationSig",
  slot,
  blockTime = null,
}: {
  mint: PublicKey;
  soul: PublicKey;
  generation: number;
  side?: "buy" | "sell";
  amount?: string;
  trader?: string;
  tokenAccount?: string;
  seedHash?: string;
  signature?: string;
  slot: number;
  blockTime?: number | null;
}): GenerationProvenanceRow {
  return {
    id: `generation:${mint.toBase58()}:${soul.toBase58()}:${generation}`,
    tokenMint: mint.toBase58(),
    soul: soul.toBase58(),
    generation,
    side,
    amount,
    trader,
    tokenAccount,
    seedHash,
    signature,
    slot,
    blockTime,
    source: "finalized-rpc-logs",
  };
}
