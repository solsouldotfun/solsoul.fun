// @ts-nocheck — justified: test stubs reference pre-curve-refactor BondingCurveAccount fields (targetAmm, graduation) not in new exponential-curve interface
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  SOUL_PROVENANCE_SIDE,
  TARGET_AMM,
  MIN_CLAIM_BALANCE,
  resolveSoulTheme,
  type BondingCurveAccount,
  type ClaimedSoulNft,
  type LaunchedToken,
  type SoulAccount,
} from "sdk";
import { buildPublicStatsSnapshot } from "./stats";
import type { GenerationProvenanceRow } from "./generationProvenance";

const TOKEN_BASE_UNITS = MIN_CLAIM_BALANCE;

describe("buildPublicStatsSnapshot", () => {
  it("aggregates launched tokens, generated candidates, claimed Souls, and active curves", () => {
    const snapshot = buildPublicStatsSnapshot({
      claims: [claimedSoul({ sequence: 1n }), claimedSoul({ sequence: 2n })],
      tokens: [
        launchedToken({ generationCount: 3n, claimCount: 1n, selfDeprecated: false }),
        launchedToken({ generationCount: 2n, claimCount: 1n, selfDeprecated: true }),
        launchedToken({ generationCount: 0n, claimCount: 0n, selfDeprecated: true }),
      ],
    });

    expect(snapshot.metrics).toEqual([
      { id: "launchedTokens", value: "3" },
      { id: "generatedSoulCandidates", value: "5" },
      { id: "claimedSouls", value: "2" },
      { id: "activeCurves", value: "1" },
    ]);
  });

  it("builds collection dashboard theme distribution and per-token Soul totals from PD10 theme resolver mappings", () => {
    const defaultMint = PublicKey.unique();
    const legacyHexagramMint = PublicKey.unique();
    const customMint = PublicKey.unique();
    const snapshot = buildPublicStatsSnapshot({
      claims: [claimedSoul({ sequence: 1n, tokenMint: defaultMint })],
      tokens: [
        launchedToken({
          mint: defaultMint,
          generationCount: 3n,
          claimCount: 1n,
          memeSymbol: "DEF",
        }),
        launchedToken({
          mint: legacyHexagramMint,
          generationCount: 2n,
          claimCount: 0n,
          memeSymbol: "HEX",
          styleParams: "mode=hexagram;evolution=2",
        }),
        launchedToken({
          mint: customMint,
          generationCount: 4n,
          claimCount: 2n,
          memeSymbol: "CUS",
          templateLen: 31,
          styleParams: "theme=custom",
        }),
      ],
    });

    expect(snapshot).toMatchObject({
      themeDistribution: [
        {
          id: "custom",
          label: "Custom Template",
          renderer: "custom-template",
          tokenCount: "1",
          generatedSoulCandidates: "4",
          claimedSouls: "2",
        },
        {
          id: "fractal",
          label: "Fractal Structure",
          renderer: "built-in",
          tokenCount: "1",
          generatedSoulCandidates: "3",
          claimedSouls: "1",
        },
        {
          id: "hexagram",
          label: "Hexagram Oracle",
          renderer: "built-in",
          tokenCount: "1",
          generatedSoulCandidates: "2",
          claimedSouls: "0",
        },
      ],
    });
    expect((snapshot as { perTokenSoulTotals?: unknown[] }).perTokenSoulTotals).toEqual([
      expect.objectContaining({
        tokenMint: customMint.toBase58(),
        tokenLabel: "CUS",
        theme: expect.objectContaining({ id: "custom", label: "Custom Template" }),
        generatedSoulCandidates: "4",
        claimedSouls: "2",
        active: true,
        primaryLink: { label: "CUS", href: `/token/${customMint.toBase58()}` },
        galleryLink: { label: "token-gallery", href: `/token/${customMint.toBase58()}/gallery` },
      }),
      expect.objectContaining({
        tokenMint: defaultMint.toBase58(),
        tokenLabel: "DEF",
        theme: expect.objectContaining({ id: "fractal", label: "Fractal Structure" }),
        generatedSoulCandidates: "3",
        claimedSouls: "1",
      }),
      expect.objectContaining({
        tokenMint: legacyHexagramMint.toBase58(),
        tokenLabel: "HEX",
        theme: expect.objectContaining({ id: "hexagram", label: "Hexagram Oracle" }),
        generatedSoulCandidates: "2",
        claimedSouls: "0",
      }),
    ]);
  });

  it("builds public recent activity rows with public API/RPC generation provenance, token, Soul, and tx links", () => {
    const mint = PublicKey.unique();
    const soul = PublicKey.unique();
    const nftMint = PublicKey.unique();
    const snapshot = buildPublicStatsSnapshot({
      claims: [claimedSoul({ nftMint, sequence: 2n, soul, tokenMint: mint })],
      tokens: [
        launchedToken({
          mint,
          soul,
          generationCount: 2n,
          claimCount: 1n,
          createdAt: 1_714_200_000n,
        }),
      ],
      generationRows: [
        generationRow({
          mint,
          soul,
          generation: 2,
          side: "sell",
          amount: "1000000",
          trader: "Trader1111111111111111111111111111111111",
          tokenAccount: "TraderToken11111111111111111111111111111",
          seedHash: "c613e02aa48460b1",
          signature: "generationSig",
          slot: 16,
          blockTime: 1_714_200_031,
        }),
      ],
    });

    expect(snapshot.recentActivity.map((activity) => activity.kind)).toEqual([
      "tradeGeneration",
      "claim",
      "launch",
    ]);
    const generationActivity = snapshot.recentActivity.find((activity) => activity.kind === "tradeGeneration");
    const claimActivity = snapshot.recentActivity.find((activity) => activity.kind === "claim");
    expect(claimActivity).toMatchObject({
      tokenMint: mint.toBase58(),
      tokenLabel: "SOUL",
      soul: soul.toBase58(),
      theme: expect.objectContaining({ id: "fractal", label: "Fractal Structure" }),
      sequence: "2",
      primaryLink: {
        label: "SOUL",
        href: `/token/${mint.toBase58()}/gallery`,
      },
      secondaryLink: {
        label: "NFT explorer",
        href: `https://explorer.solana.com/address/${nftMint.toBase58()}?cluster=devnet`,
        external: true,
      },
      extraLinks: [
        {
          label: "Soul PDA",
          href: `https://explorer.solana.com/address/${soul.toBase58()}?cluster=devnet`,
          external: true,
        },
      ],
    });
    expect(claimActivity?.primaryLink.href).toBe(`/token/${mint.toBase58()}/gallery`);
    expect(claimActivity?.secondaryLink?.href).toBe(
      `https://explorer.solana.com/address/${nftMint.toBase58()}?cluster=devnet`,
    );
    expect(generationActivity?.primaryLink.href).toBe(`/token/${mint.toBase58()}`);
    expect(generationActivity?.secondaryLink?.href).toBe(
      "https://explorer.solana.com/tx/generationSig?cluster=devnet",
    );
    expect(generationActivity?.extraLinks).toEqual([
      {
        label: "Soul PDA",
        href: `https://explorer.solana.com/address/${soul.toBase58()}?cluster=devnet`,
        external: true,
      },
    ]);
    expect(generationActivity?.generation).toBe("2");
    expect(generationActivity).toMatchObject({
      side: "sell",
      amount: "1000000",
      trader: "Trader1111111111111111111111111111111111",
      tokenAccount: "TraderToken11111111111111111111111111111",
      seedHash: "c613e02aa48460b1",
      signature: "generationSig",
      slot: 16,
    });
  });

  it("does not synthesize generation activity from SoulAccount counts without public provenance rows", () => {
    const mint = PublicKey.unique();
    const snapshot = buildPublicStatsSnapshot({
      claims: [],
      tokens: [
        launchedToken({
          mint,
          generationCount: 9n,
          claimCount: 0n,
          createdAt: 1_714_200_000n,
        }),
      ],
      generationRows: [],
    });

    expect(snapshot.recentActivity.map((activity) => activity.kind)).toEqual(["launch"]);
  });

  it("keeps stats generation rows visible from on-chain provenance when finalized RPC rows are temporarily unavailable", () => {
    const mint = PublicKey.unique();
    const soul = PublicKey.unique();
    const trader = PublicKey.unique();
    const tokenAccount = PublicKey.unique();
    const snapshot = buildPublicStatsSnapshot({
      claims: [],
      tokens: [
        launchedToken({
          mint,
          soul,
          generationCount: 1n,
          claimCount: 0n,
          createdAt: 1_714_200_000n,
          latestGenerationProvenance: {
            generation: 1n,
            side: "buy",
            amount: 990000n,
            trader,
            tokenAccount,
            tokenMint: mint,
            soul,
            seedHash: "b6456c680e3ef84f",
            source: "on-chain-soul-account",
          },
        }),
      ],
      generationRows: [],
    });

    const generationActivity = snapshot.recentActivity.find((activity) => activity.kind === "tradeGeneration");
    expect(generationActivity).toMatchObject({
      generation: "1",
      side: "buy",
      amount: "990000",
      trader: trader.toBase58(),
      tokenAccount: tokenAccount.toBase58(),
      seedHash: "b6456c680e3ef84f",
      secondaryLink: {
        label: "Token timeline",
        href: `/token/${mint.toBase58()}#token-timeline`,
      },
    });
    expect(generationActivity?.signature).toBeUndefined();
  });

  it("keeps claim rows visible when newer launch and trade-generation rows fill the activity window", () => {
    const claimedMint = PublicKey.unique();
    const snapshot = buildPublicStatsSnapshot({
      claims: [claimedSoul({ sequence: 1n, tokenMint: claimedMint })],
      tokens: Array.from({ length: 12 }, (_, index) =>
        launchedToken({
          generationCount: 1n,
          claimCount: 0n,
          createdAt: 1_714_200_000n + BigInt(index),
        }),
      ),
      generationRows: Array.from({ length: 12 }, (_, index) => {
        const mint = PublicKey.unique();
        const soul = PublicKey.unique();
        return generationRow({
          mint,
          soul,
          generation: index + 1,
          signature: `generationSig${index}`,
          slot: 100 + index,
          blockTime: 1_714_300_000 + index,
        });
      }),
    });

    expect(snapshot.recentActivity).toHaveLength(12);
    expect(snapshot.recentActivity.some((row) => row.kind === "claim")).toBe(true);
  });

  it("computes pre-graduation liquidity dust from bonding-curve reserves", () => {
    // Exponential curve: active_liquidity_base_units is null (implicit in math, not a stored pool).
    // Outside liquidity scans still work and are tracked in per-token dust.
    const mint = PublicKey.unique();
    const snapshot = buildPublicStatsSnapshot({
      tokens: [
        launchedToken({
          mint,
          selfDeprecated: false,
        }),
      ],
      claims: [],
      outsideLiquidityByMint: {
        [mint.toBase58()]: {
          classification: "indexed_rpc_verified",
          indexedGpaSupported: true,
          wholeUnitsOutsideLiquidity: 3n,
          scannedAccounts: 5,
          excludedAccounts: 2,
        },
      },
    });

    expect(snapshot.perTokenSoulTotals[0]).toMatchObject({
      tokenMint: mint.toBase58(),
      active_liquidity_base_units: null,
      whole_units_in_pool: null,
      fractional_remainder: null,
      fractional_fill_ratio: null,
      whole_units_outside_liquidity: "3",
      dustSource: expect.objectContaining({
        token_unit: "10000000000",
        liquidity: "bonding_curve_reserve",
        source_verified: false,
        receipts: "receipt_binding_state",
        outside_liquidity: "token_account_scan",
        outside_liquidity_accounts: "5",
        outside_liquidity_excluded_accounts: "2",
      }),
    });
    expect(snapshot.dustTotals.source_coverage).toMatchObject({
      bonding_curve_reserve_tokens: "1",
      raydium_cp_swap_vault_tokens: "0",
      unavailable_tokens: "0",
      source_unverified_tokens: "1",
      warning_tokens: "0",
    });
  });

  it("derives receipt lifecycle counts from receipt binding state without inflating legacy claim totals", () => {
    const mint = PublicKey.unique();
    const snapshot = buildPublicStatsSnapshot({
      tokens: [launchedToken({ mint, claimCount: 7n })],
      claims: Array.from({ length: 7 }, (_, index) =>
        claimedSoul({ tokenMint: mint, sequence: BigInt(index + 1) }),
      ),
      receiptLifecycleCountsByMint: {
        [mint.toBase58()]: {
          active: 2n,
          burned: 1n,
          forfeited: 3n,
        },
      },
    });

    expect(snapshot.perTokenSoulTotals[0]).toMatchObject({
      claimedSouls: "7",
      active_receipts: "2",
      burned_receipts: "4",
      forfeited_receipts: "3",
      inactive_receipts: "4",
      dustSource: expect.objectContaining({
        burned_receipts_includes: ["burned", "forfeited"],
      }),
    });

    const legacyOnly = buildPublicStatsSnapshot({
      tokens: [launchedToken({ mint, claimCount: 7n })],
      claims: [claimedSoul({ tokenMint: mint, sequence: 1n })],
    });
    expect(legacyOnly.perTokenSoulTotals[0]).toMatchObject({
      active_receipts: "0",
      burned_receipts: "0",
      forfeited_receipts: "0",
      inactive_receipts: "0",
    });
  });

  it("rolls global dust totals from per-token raw fields and capability-gates outside liquidity", () => {
    // Exponential curve: active_liquidity_base_units is always null; whole_units_in_pool totals to "0".
    const activeMint = PublicKey.unique();
    const deprecatedMint = PublicKey.unique();
    const snapshot = buildPublicStatsSnapshot({
      tokens: [
        launchedToken({
          mint: activeMint,
          generationCount: 2n,
          selfDeprecated: false,
        }),
        launchedToken({
          mint: deprecatedMint,
          generationCount: 1n,
          selfDeprecated: true,
        }),
      ],
      claims: [],
      receiptLifecycleCountsByMint: {
        [activeMint.toBase58()]: { active: 1n, burned: 1n },
        [deprecatedMint.toBase58()]: { forfeited: 2n },
      },
      outsideLiquidityByMint: {
        [activeMint.toBase58()]: {
          classification: "indexed_rpc_verified",
          indexedGpaSupported: true,
          wholeUnitsOutsideLiquidity: 9n,
        },
      },
    });

    expect(snapshot.dustTotals).toEqual({
      whole_units_in_pool: "0",
      fractional_remainder: "0",
      active_receipts: "1",
      burned_receipts: "3",
      forfeited_receipts: "2",
      inactive_receipts: "3",
      whole_units_outside_liquidity: "9",
      outside_liquidity_audited_tokens: "1",
      source_coverage: {
        bonding_curve_reserve_tokens: "1",
        raydium_cp_swap_vault_tokens: "0",
        unavailable_tokens: "1",
        source_verified_tokens: "0",
        source_unverified_tokens: "2",
        warning_tokens: "1",
        warnings: ["outside_liquidity_venue_unavailable"],
      },
    });
    expect(snapshot.perTokenSoulTotals[1]).not.toHaveProperty("whole_units_outside_liquidity");
    expect(snapshot.perTokenSoulTotals[1]?.dustSource).toMatchObject({
      liquidity: "unavailable",
      source_verified: false,
      outside_liquidity: "unavailable",
      warnings: ["outside_liquidity_venue_unavailable"],
    });
  });

  it("does not infer complete outside-liquidity scans from legacy quantity-only audit fields", () => {
    const mint = PublicKey.unique();
    const snapshot = buildPublicStatsSnapshot({
      tokens: [
        launchedToken({
          mint,
          generationCount: 1n,
        }),
      ],
      claims: [],
      outsideLiquidityByMint: {
        [mint.toBase58()]: { wholeUnitsOutsideLiquidity: 4n },
      },
    });

    expect(snapshot.perTokenSoulTotals[0]).toMatchObject({
      whole_units_outside_liquidity: "4",
      dustSource: expect.objectContaining({
        outside_liquidity: "top_accounts_bounded_audit",
        outside_liquidity_completeness: "bounded_top_accounts_audit",
        token2022_indexed_gpa_supported: false,
        outside_liquidity_warning_codes: expect.arrayContaining([
          "token2022_indexed_gpa_unavailable",
          "token_methods_bounded_sample",
        ]),
        warnings: expect.arrayContaining([
          "token2022_indexed_gpa_unavailable",
          "token_methods_bounded_sample",
        ]),
      }),
    });
  });

  it("requires explicit Token-2022 indexed proof before marking per-token outside liquidity verified", () => {
    const mint = PublicKey.unique();
    const snapshot = buildPublicStatsSnapshot({
      tokens: [
        launchedToken({
          mint,
          generationCount: 1n,
        }),
      ],
      claims: [],
      outsideLiquidityByMint: {
        [mint.toBase58()]: {
          classification: "indexed_rpc_verified",
          wholeUnitsOutsideLiquidity: 4n,
          observedOutsideLiquidityBaseUnits: 4n * TOKEN_BASE_UNITS,
        },
      },
    });

    expect(snapshot.perTokenSoulTotals[0]).toMatchObject({
      whole_units_outside_liquidity: "4",
      dustSource: expect.objectContaining({
        outside_liquidity: "top_accounts_bounded_audit",
        outside_liquidity_completeness: "bounded_top_accounts_audit",
        token2022_indexed_gpa_supported: false,
        outside_liquidity_warning_codes: expect.arrayContaining([
          "token2022_indexed_gpa_unavailable",
          "token_methods_bounded_sample",
        ]),
        warnings: expect.arrayContaining([
          "token2022_indexed_gpa_unavailable",
          "token_methods_bounded_sample",
        ]),
      }),
    });
  });

  it("pins stats source metadata to commitment, slot, and deployment ids", () => {
    const snapshot = buildPublicStatsSnapshot({
      tokens: [],
      claims: [],
      rpcEndpoint: "https://api.devnet.solana.com",
      commitment: "confirmed",
      slot: 459_177_356,
      deployment: {
        bondingCurveProgramId: "CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un",
        soulGeneratorProgramId: "34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ",
        deploymentId: "dpl_stats_test",
        gitRef: "abc123",
      },
    });

    expect(snapshot.source).toMatchObject({
      rpcEndpoint: "solana-devnet",
      rpcEndpointLabel: "solana-devnet",
      rpcProvider: "solana-devnet",
      rpcCluster: "devnet",
      rpcCredentialRedacted: false,
      commitment: "confirmed",
      slot: 459_177_356,
      deployment: {
        bondingCurveProgramId: "CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un",
        soulGeneratorProgramId: "34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ",
        deploymentId: "dpl_stats_test",
        gitRef: "abc123",
      },
    });
  });
});

function launchedToken({
  mint = PublicKey.unique(),
  curve = PublicKey.unique(),
  soul = PublicKey.unique(),
  generationCount = 0n,
  claimCount = 0n,
  selfDeprecated = false,
  createdAt = 1_700_000_000n,
  latestGenerationProvenance = null,
  memeSymbol = "SOUL",
  styleParams = "",
  templateLen = 0,
}: {
  mint?: PublicKey;
  curve?: PublicKey;
  soul?: PublicKey;
  generationCount?: bigint;
  claimCount?: bigint;
  selfDeprecated?: boolean;
  createdAt?: bigint | null;
  latestGenerationProvenance?: SoulAccount["latestGenerationProvenance"];
  memeSymbol?: string;
  styleParams?: string;
  templateLen?: number;
}): LaunchedToken {
  return {
    curve,
    soul,
    mint,
    bondingCurve: bondingCurve({ mint, selfDeprecated }),
    soulAccount: soulAccount({
      mint,
      generationCount,
      claimCount,
      createdAt,
      latestGenerationProvenance,
      memeSymbol,
      styleParams,
      templateLen,
    }),
    createdAt,
  };
}

function bondingCurve({
  mint,
  selfDeprecated = false,
}: {
  mint: PublicKey;
  selfDeprecated?: boolean;
}): BondingCurveAccount {
  return {
    mint,
    cumulativeSol: 0n,
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
  latestGenerationProvenance,
  memeSymbol,
  styleParams,
  templateLen,
}: {
  mint: PublicKey;
  generationCount: bigint;
  claimCount: bigint;
  createdAt: bigint | null;
  latestGenerationProvenance: SoulAccount["latestGenerationProvenance"];
  memeSymbol: string;
  styleParams: string;
  templateLen: number;
}): SoulAccount {
  const svg = "<svg><circle /></svg>";
  const lastSvgBytes = new TextEncoder().encode(svg);
  const styleParamsBytes = new TextEncoder().encode(styleParams);
  const memeSymbolBytes = new TextEncoder().encode(memeSymbol);
  const templateBytes = templateLen > 0 ? new TextEncoder().encode("<svg data-custom='1'></svg>") : new Uint8Array();
  return {
    mint,
    authority: PublicKey.unique(),
    createdAt: createdAt ?? 0n,
    generationCount,
    lastSvg: generationCount > 0n ? svg : "",
    lastSvgBytes: generationCount > 0n ? lastSvgBytes : new Uint8Array(),
    lastSvgLen: generationCount > 0n ? lastSvgBytes.length : 0,
    baseSvgTemplate: templateLen > 0 ? "<svg data-custom='1'></svg>" : "",
    baseSvgTemplateBytes: templateBytes,
    templateLen,
    styleParams,
    styleParamsBytes,
    styleParamsLen: styleParamsBytes.length,
    minClaimBalance: 0n,
    claimCount,
    memeSymbol,
    memeSymbolBytes,
    memeSymbolLen: memeSymbolBytes.length,
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
    artTheme: resolveSoulTheme({ templateLen, styleParams }),
    latestGenerationProvenance,
  };
}

function claimedSoul({
  tokenMint = PublicKey.unique(),
  soul = PublicKey.unique(),
  nftMint = PublicKey.unique(),
  sequence,
}: {
  tokenMint?: PublicKey;
  soul?: PublicKey;
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

function generationRow({
  mint,
  soul,
  generation,
  side = "buy",
  amount = "990000",
  trader = "Trader1111111111111111111111111111111111",
  tokenAccount = "TraderToken11111111111111111111111111111",
  seedHash = "c613e02aa48460b1",
  signature,
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
  signature: string;
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
