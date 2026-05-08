import { PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  TARGET_AMM,
  SOUL_PROVENANCE_SIDE,
  deriveCurvePda,
  deriveSoulPda,
  type BondingCurveAccount,
  type SoulAccount,
} from "sdk";
import { loadTokenTimelineSnapshot } from "./tokenTimelineFetch";

function validTimelineMint(): PublicKey {
  for (let index = 0; index < 100; index += 1) {
    const mint = PublicKey.unique();
    try {
      deriveCurvePda(mint);
      deriveSoulPda(mint);
      return mint;
    } catch {
      // The SDK's legacy no-bump PDAs require seeds to fall off-curve.
    }
  }
  throw new Error("Unable to find a mint with valid no-bump timeline PDAs");
}

// Minimal valid BondingCurveAccount stub (exponential curve shape)
function stubBondingCurve(mint: PublicKey): BondingCurveAccount {
  return {
    mint,
    cumulativeSol: 0n,
    totalMinted: 0n,
    selfDeprecated: false,
    lastInteractionSlot: 0n,
  };
}

// Minimal valid SoulAccount stub
function stubSoulAccount(mint: PublicKey): SoulAccount {
  return {
    mint,
    authority: PublicKey.default,
    createdAt: 0n,
    generationCount: 0n,
    lastSvg: "",
    lastSvgBytes: new Uint8Array(),
    lastSvgLen: 0,
    baseSvgTemplate: "",
    baseSvgTemplateBytes: new Uint8Array(),
    templateLen: 0,
    styleParams: "",
    styleParamsBytes: new Uint8Array(),
    styleParamsLen: 0,
    minClaimBalance: 0n,
    claimCount: 0n,
    memeSymbol: "TST",
    memeSymbolBytes: new TextEncoder().encode("TST"),
    memeSymbolLen: 3,
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

// Shared base loaders that succeed
function makeBaseLoaders(mint: PublicKey) {
  return {
    fetchBondingCurve: vi.fn().mockResolvedValue(stubBondingCurve(mint)),
    fetchSoul: vi.fn().mockResolvedValue(stubSoulAccount(mint)),
    listClaimedSoulNftsByMint: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 24 }),
    getSignaturesForAddress: vi.fn().mockResolvedValue([]),
    fetchGenerationRowsFromFinalizedRpc: vi.fn().mockResolvedValue([]),
  };
}

describe("loadTokenTimelineSnapshot — partial signaling", () => {
  let mint: PublicKey;
  const connection = {} as never;
  const rpcEndpoint = "http://test-rpc";

  beforeEach(() => {
    vi.restoreAllMocks();
    mint = validTimelineMint();
  });

  it("successful path: snapshot has no partial flag and no warnings", async () => {
    const loaders = makeBaseLoaders(mint);

    const snapshot = await loadTokenTimelineSnapshot({
      connection,
      mint,
      rpcEndpoint,
      loaders,
    });

    expect(snapshot.partial).toBeUndefined();
    expect(snapshot.warnings).toBeUndefined();
  });

  it("generation-row fetch failure: emits console.warn and surfaces partial:true + warning entry", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loaders = {
      ...makeBaseLoaders(mint),
      fetchGenerationRowsFromFinalizedRpc: vi
        .fn()
        .mockRejectedValue(new Error("RPC unavailable")),
    };

    const snapshot = await loadTokenTimelineSnapshot({
      connection,
      mint,
      rpcEndpoint,
      loaders,
    });

    // Must not throw — graceful degradation
    expect(snapshot.tokenMint).toBeTruthy();

    // Must emit a console.warn
    expect(warnSpy).toHaveBeenCalled();
    const warnArgs = warnSpy.mock.calls[0];
    expect(warnArgs.join(" ")).toMatch(/generation/i);

    // Must expose partial:true
    expect(snapshot.partial).toBe(true);

    // Must include at least one warning with source and reason
    expect(Array.isArray(snapshot.warnings)).toBe(true);
    const warnings = snapshot.warnings!;
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].source).toBeTruthy();
    expect(warnings[0].reason).toBeTruthy();
    expect(warnings[0].reason).toMatch(/RPC unavailable/i);
  });

  it("per-address signature fetch failure: emits console.warn and surfaces partial:true + warning entry", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failingAddress = mint.toBase58();
    const loaders = {
      ...makeBaseLoaders(mint),
      getSignaturesForAddress: vi
        .fn()
        .mockRejectedValue(new Error("getSignatures timeout")),
    };

    const snapshot = await loadTokenTimelineSnapshot({
      connection,
      mint,
      rpcEndpoint,
      loaders,
    });

    // Must not throw — graceful degradation
    expect(snapshot.tokenMint).toBeTruthy();

    // Must emit a console.warn
    expect(warnSpy).toHaveBeenCalled();
    const allWarnArgs = warnSpy.mock.calls.map((c) => c.join(" "));
    expect(allWarnArgs.some((msg) => /getSignatures timeout/i.test(msg))).toBe(true);

    // Must expose partial:true
    expect(snapshot.partial).toBe(true);

    // Must include warning entries for the failing address
    expect(Array.isArray(snapshot.warnings)).toBe(true);
    const warnings = snapshot.warnings!;
    expect(warnings.length).toBeGreaterThan(0);
    warnings.forEach((w) => {
      expect(w.source).toBeTruthy();
      expect(w.reason).toBeTruthy();
    });
    expect(warnings.some((w) => /getSignatures timeout/i.test(w.reason))).toBe(true);
  });

  it("multiple failures: partial:true and all failures represented in warnings", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const loaders = {
      ...makeBaseLoaders(mint),
      fetchGenerationRowsFromFinalizedRpc: vi
        .fn()
        .mockRejectedValue(new Error("gen-rows-error")),
      getSignaturesForAddress: vi
        .fn()
        .mockRejectedValue(new Error("sig-fetch-error")),
    };

    const snapshot = await loadTokenTimelineSnapshot({
      connection,
      mint,
      rpcEndpoint,
      loaders,
    });

    expect(snapshot.partial).toBe(true);
    expect(snapshot.warnings!.length).toBeGreaterThanOrEqual(2);

    const reasons = snapshot.warnings!.map((w) => w.reason);
    expect(reasons.some((r) => /gen-rows-error/i.test(r))).toBe(true);
    expect(reasons.some((r) => /sig-fetch-error/i.test(r))).toBe(true);
  });
});
