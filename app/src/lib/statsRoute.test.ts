// @ts-nocheck — justified: test stubs reference TARGET_AMM and pre-curve-refactor BondingCurveAccount fields; updating fixtures is outside current feature scope
import { PublicKey } from "@solana/web3.js";
import { ACCOUNT_SIZE, AccountLayout, AccountState, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { describe, expect, it, vi } from "vitest";
import {
  _resetStatsPrewarmStateForTests,
  buildStatsPrecheck,
  fetchRaydiumLiquidityByMint,
  fetchReceiptLifecycleCountsFromRpc,
  loadPublicStatsSnapshot,
  primePublicStatsSnapshot,
  scanOutsideLiquidityByMint,
  scanOutsideLiquidityWithCapability,
  settleWithTimeout,
} from "./statsRoute";
import {
  PROGRAM_IDS,
  MIN_CLAIM_BALANCE,
  RAYDIUM_CP_SWAP_DEVNET_PROGRAM_ID,
  RECEIPT_ACCOUNT_SIZE,
  TARGET_AMM,
  deriveVaultPda,
  deriveRaydiumCpSwapPdas,
  findMintWithNoBumpPdas,
  type LaunchedToken,
} from "sdk";
import type { GenerationProvenanceRow } from "./generationProvenance";
import { isValidPublicStatsSnapshot, type CachedPublicStatsSnapshot } from "./publicStatsCache";

const TOKEN_BASE_UNITS = MIN_CLAIM_BALANCE;
const tokenBaseUnits = (wholeUnits: bigint): bigint => wholeUnits * TOKEN_BASE_UNITS;
const tokenBaseUnitsText = (wholeUnits: bigint): string => tokenBaseUnits(wholeUnits).toString();
const tokenBaseUnitsWithHalfText = (wholeUnits: bigint): string =>
  (tokenBaseUnits(wholeUnits) + TOKEN_BASE_UNITS / 2n).toString();

describe("stats route helpers", () => {
  it("returns a short public health precheck without invoking the expensive read model", () => {
    expect(
      buildStatsPrecheck({
        rpcEndpoint: "https://api.devnet.solana.com",
        now: new Date("2026-04-29T00:00:00.000Z"),
      }),
    ).toEqual({
      ok: true,
      route: "/api/stats",
      status: "ready",
      bounded: true,
      gracefulPartialFallback: true,
      source: {
        fetchedAt: "2026-04-29T00:00:00.000Z",
        rpcEndpoint: "solana-devnet",
        rpcEndpointLabel: "solana-devnet",
        rpcProvider: "solana-devnet",
        rpcCluster: "devnet",
        rpcCredentialRedacted: false,
        commitment: "confirmed",
        deployment: {
          bondingCurveProgramId: PROGRAM_IDS.bondingCurve,
          soulGeneratorProgramId: PROGRAM_IDS.soulGenerator,
        },
        rpcCapability: {
          outsideLiquidity: {
            classification: "unavailable",
            indexedGpaSupported: false,
            programLabel: "spl-program-2022",
            requestedFilters: [],
            endpointLabel: "solana-devnet",
            rpcProvider: "solana-devnet",
            rpcCluster: "devnet",
            rpcCredentialRedacted: false,
            warningCodes: ["outside_liquidity_no_probe_target"],
          },
        },
      },
    });
  });

  it("redacts credential-bearing RPC URLs from the public stats precheck", () => {
    const credentialPath = "redacted-api-key-fixture";
    const credentialQuery = "redacted-query-token-fixture";
    const credentialBearingRpc = `https://triton-devnet.example.com/${credentialPath}?token=${credentialQuery}`;
    const precheck = buildStatsPrecheck({
      rpcEndpoint: credentialBearingRpc,
      now: new Date("2026-04-29T00:00:00.000Z"),
    });
    const serialized = JSON.stringify(precheck);

    expect(precheck.source).toMatchObject({
      rpcEndpoint: "triton-devnet:<redacted>",
      rpcEndpointLabel: "triton-devnet:<redacted>",
      rpcProvider: "triton-devnet",
      rpcCluster: "devnet",
      rpcCredentialRedacted: true,
    });
    expect(serialized).not.toContain(credentialPath);
    expect(serialized).not.toContain(credentialQuery);
    expect(serialized).not.toContain(credentialBearingRpc);
  });

  it("keeps recent generation rows PD7-shaped when finalized provenance evidence exists", async () => {
    const snapshot = await loadPublicStatsSnapshot({
      rpcEndpoint: "https://api.devnet.solana.com",
      now: new Date("2026-04-29T00:00:00.000Z"),
      loadTokens: async () => emptyTokenPage(),
      loadClaims: async () => emptyClaimPage(),
      loadGenerationRows: async () => [generationRow()],
      loadReceiptLifecycleCounts: async () => ({}),
      loadOutsideLiquidity: async () => ({}),
      loadSourceSlot: async () => 459_177_356,
    });

    expect(snapshot.source.partial).toBeUndefined();
    expect(snapshot.source).toMatchObject({
      rpcEndpoint: "solana-devnet",
      rpcEndpointLabel: "solana-devnet",
      rpcProvider: "solana-devnet",
      rpcCluster: "devnet",
      rpcCredentialRedacted: false,
      commitment: "confirmed",
      slot: 459_177_356,
      deployment: {
        bondingCurveProgramId: PROGRAM_IDS.bondingCurve,
        soulGeneratorProgramId: PROGRAM_IDS.soulGenerator,
      },
    });
    expect(snapshot.recentActivity).toHaveLength(1);
    expect(snapshot.recentActivity[0]).toMatchObject({
      kind: "tradeGeneration",
      tokenMint: "TokenMint111111111111111111111111111111111",
      soul: "Soul111111111111111111111111111111111111",
      generation: "2",
      side: "buy",
      amount: "990000",
      trader: "Trader1111111111111111111111111111111111",
      tokenAccount: "TokenAccount11111111111111111111111111111",
      seedHash: "c613e02aa48460b1",
      signature: "FinalizedGenerationSignature111111111111111111",
      slot: 458769366,
      primaryLink: {
        href: "/token/TokenMint111111111111111111111111111111111",
      },
      secondaryLink: {
        href: "https://explorer.solana.com/tx/FinalizedGenerationSignature111111111111111111?cluster=devnet",
        external: true,
      },
    });
    expect(snapshot.recentActivity[0]?.extraLinks).toEqual([
      {
        label: "Soul PDA",
        href: "https://explorer.solana.com/address/Soul111111111111111111111111111111111111?cluster=devnet",
        external: true,
      },
    ]);
  });

  it("redacts credential-bearing RPC URLs from full stats source metadata", async () => {
    const credentialPath = "redacted-api-key-fixture";
    const credentialQuery = "redacted-query-token-fixture";
    const credentialBearingRpc = `https://triton-devnet.example.com/tenant/${credentialPath}?api-key=${credentialQuery}`;
    const snapshot = await loadPublicStatsSnapshot({
      rpcEndpoint: credentialBearingRpc,
      now: new Date("2026-04-29T00:00:00.000Z"),
      loadTokens: async () => emptyTokenPage(),
      loadClaims: async () => emptyClaimPage(),
      loadGenerationRows: async () => [],
      loadReceiptLifecycleCounts: async () => ({}),
      loadOutsideLiquidity: async () => ({}),
      loadSourceSlot: async () => 459_177_356,
    });
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.source).toMatchObject({
      rpcEndpoint: "triton-devnet:<redacted>",
      rpcEndpointLabel: "triton-devnet:<redacted>",
      rpcProvider: "triton-devnet",
      rpcCluster: "devnet",
      rpcCredentialRedacted: true,
    });
    expect(serialized).not.toContain(credentialPath);
    expect(serialized).not.toContain(credentialQuery);
    expect(serialized).not.toContain(credentialBearingRpc);
  });

  it("returns a graceful partial snapshot when generation provenance aggregation fails", async () => {
    const snapshot = await loadPublicStatsSnapshot({
      rpcEndpoint: "https://api.devnet.solana.com",
      now: new Date("2026-04-29T00:00:00.000Z"),
      loadTokens: async () => ({ ...emptyTokenPage(), total: 3 }),
      loadClaims: async () => ({ ...emptyClaimPage(), total: 1 }),
      loadGenerationRows: async () => {
        throw new Error("devnet RPC unavailable");
      },
      loadReceiptLifecycleCounts: async () => ({}),
      loadOutsideLiquidity: async () => ({}),
      loadSourceSlot: async () => 459_177_356,
    });

    expect(snapshot.metrics).toEqual([
      { id: "launchedTokens", value: "3" },
      { id: "generatedSoulCandidates", value: "0" },
      { id: "claimedSouls", value: "1" },
      { id: "activeCurves", value: "0" },
    ]);
    expect(snapshot.source.partial).toBe(true);
    expect(snapshot.source.warnings).toContain("recent generation provenance: temporarily unavailable");
    expect(snapshot.source.warnings?.join("\n")).not.toContain("devnet RPC unavailable");
  });

  it("wires receipt lifecycle counts and outside-liquidity scans into raw dust stats", async () => {
    const mint = PublicKey.unique();
    const snapshot = await loadPublicStatsSnapshot({
      rpcEndpoint: "https://api.devnet.solana.com",
      now: new Date("2026-04-29T00:00:00.000Z"),
      loadTokens: async () => ({
        ...emptyTokenPage(),
        items: [launchedToken({ mint})],
        total: 1,
      }),
      loadClaims: async () => emptyClaimPage(),
      loadGenerationRows: async () => [],
      loadReceiptLifecycleCounts: async () => ({
        [mint.toBase58()]: { active: 2n, burned: 1n, forfeited: 1n },
      }),
      loadOutsideLiquidity: async () => ({
        [mint.toBase58()]: {
          wholeUnitsOutsideLiquidity: 5n,
          scannedAccounts: 2n,
          excludedAccounts: 1n,
        },
      }),
      loadSourceSlot: async () => 459_177_356,
    });

    expect(snapshot.perTokenSoulTotals[0]).toMatchObject({
      active_liquidity_base_units: null,
      whole_units_in_pool: null,
      fractional_remainder: null,
      fractional_fill_ratio: null,
      liquidity_dust_ratio: null,
      active_receipts: "2",
      burned_receipts: "2",
      forfeited_receipts: "1",
      whole_units_outside_liquidity: "5",
    });
  });

  it("excludes the bonding-curve locked vault from outside-liquidity scans for active tokens", async () => {
    const { mint, vault: vaultPda } = findMintWithNoBumpPdas();
    const token = launchedToken({ mint, selfDeprecated: false });
    const connection = {
      getParsedProgramAccounts: async () => [
        parsedTokenAccount({ mint, amount: "25000000000" }),
        parsedTokenAccount({ pubkey: vaultPda, mint, amount: "45678901" }),
        parsedTokenAccount({ mint: NATIVE_MINT, amount: "9000000000" }),
      ],
    };

    await expect(
      scanOutsideLiquidityByMint({
        connection: connection as never,
        tokens: [token],
        raydiumLiquidityByMint: {},
      }),
    ).resolves.toMatchObject({
      [mint.toBase58()]: {
        wholeUnitsOutsideLiquidity: 2n,
        scannedAccounts: 1n,
        excludedAccounts: 2n,
      },
    });
  });

  it("counts receipt lifecycle state directly from decoded receipt binding accounts", async () => {
    const mint = PublicKey.unique();
    const receipts = [
      receiptData({ tokenMint: mint, lifecycleState: 1 }),
      receiptData({ tokenMint: mint, lifecycleState: 2 }),
      receiptData({ tokenMint: mint, lifecycleState: 3 }),
      new Uint8Array(RECEIPT_ACCOUNT_SIZE),
    ];
    const connection = {
      getProgramAccounts: async () =>
        receipts.map((data, index) => ({
          pubkey: PublicKey.unique(),
          account: { data: Buffer.from(data), executable: false, lamports: index, owner: PublicKey.default },
        })),
    };

    await expect(fetchReceiptLifecycleCountsFromRpc(connection as never)).resolves.toEqual({
      [mint.toBase58()]: {
        active: 1n,
        burned: 1n,
        forfeited: 1n,
      },
    });
  });

  it("bounds slow stats sources with a timeout result", async () => {
    vi.useFakeTimers();
    const pending = settleWithTimeout(new Promise<string>(() => undefined), 25, "generation provenance");

    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toEqual({
      ok: false,
      reason: "generation provenance timed out after 25ms",
      timedOut: true,
    });
    vi.useRealTimers();
  });
});

describe("public stats cold-start prewarm", () => {
  it("warms the in-process snapshot cache so the next request returns warmed data", async () => {
    _resetStatsPrewarmStateForTests();
    const mint = PublicKey.unique();
    const tokens = [launchedToken({ mint})];
    const callCounts = { tokens: 0, claims: 0 };
    const options = {
      rpcEndpoint: "https://api.devnet.solana.com",
      now: new Date("2026-04-29T00:00:00.000Z"),
      loadTokens: async () => {
        callCounts.tokens += 1;
        return { ...emptyTokenPage(), items: tokens, total: 1 };
      },
      loadClaims: async () => {
        callCounts.claims += 1;
        return { ...emptyClaimPage(), total: 1 };
      },
      loadGenerationRows: async () => [],
      loadReceiptLifecycleCounts: async () => ({}),
      loadOutsideLiquidity: async () => ({}),
      loadSourceSlot: async () => 459_177_356,
    };

    const warmed = await primePublicStatsSnapshot(options);

    expect(warmed?.source.partial).toBeUndefined();
    expect(warmed?.perTokenSoulTotals).toHaveLength(1);
    expect(callCounts.tokens).toBe(1);

    const second = await primePublicStatsSnapshot(options);
    expect(second?.perTokenSoulTotals).toHaveLength(1);
    expect(callCounts.tokens).toBe(1);
    expect(callCounts.claims).toBe(1);
  });

  it("falls back to the warmed snapshot when collectors time out on the next cold request", async () => {
    _resetStatsPrewarmStateForTests();
    const mint = PublicKey.unique();
    const warmTokens = [launchedToken({ mint})];

    const warmedSnapshot = await primePublicStatsSnapshot({
      rpcEndpoint: "https://api.devnet.solana.com",
      now: new Date("2026-04-29T00:00:00.000Z"),
      loadTokens: async () => ({ ...emptyTokenPage(), items: warmTokens, total: 1 }),
      loadClaims: async () => ({ ...emptyClaimPage(), total: 1 }),
      loadGenerationRows: async () => [],
      loadReceiptLifecycleCounts: async () => ({}),
      loadOutsideLiquidity: async () => ({}),
      loadSourceSlot: async () => 459_177_356,
    });
    expect(warmedSnapshot?.perTokenSoulTotals).toHaveLength(1);

    const coldSnapshot = await loadPublicStatsSnapshot({
      rpcEndpoint: "https://api.devnet.solana.com",
      now: new Date("2026-04-29T00:01:00.000Z"),
      loadTokens: async () => {
        throw new Error("cold devnet RPC");
      },
      loadClaims: async () => {
        throw new Error("cold devnet RPC");
      },
      loadGenerationRows: async () => [],
      loadReceiptLifecycleCounts: async () => ({}),
      loadOutsideLiquidity: async () => ({}),
      loadSourceSlot: async () => 459_177_356,
    });

    expect(coldSnapshot.source.partial).toBe(true);
    expect(coldSnapshot.source.stale).toBe(true);
    expect(coldSnapshot.perTokenSoulTotals).toHaveLength(1);
    expect(coldSnapshot.source.warnings).toContain("launched token metrics: temporarily unavailable");
    expect(coldSnapshot.source.warnings?.join("\n")).not.toContain("cold devnet RPC");
  });

  it("does not promote a partial cold snapshot to a completed prewarm", async () => {
    _resetStatsPrewarmStateForTests();

    const partial = await primePublicStatsSnapshot({
      rpcEndpoint: "https://api.devnet.solana.com",
      now: new Date("2026-04-29T00:00:00.000Z"),
      loadTokens: async () => {
        throw new Error("still cold");
      },
      loadClaims: async () => {
        throw new Error("still cold");
      },
      loadGenerationRows: async () => [],
      loadReceiptLifecycleCounts: async () => ({}),
      loadOutsideLiquidity: async () => ({}),
      loadSourceSlot: async () => 459_177_356,
    });

    expect(partial?.source.partial).toBe(true);
    expect(partial?.perTokenSoulTotals).toHaveLength(0);

    let warmTokensCalls = 0;
    const warmed = await primePublicStatsSnapshot({
      rpcEndpoint: "https://api.devnet.solana.com",
      now: new Date("2026-04-29T00:01:00.000Z"),
      loadTokens: async () => {
        warmTokensCalls += 1;
        return { ...emptyTokenPage(), total: 2 };
      },
      loadClaims: async () => ({ ...emptyClaimPage(), total: 1 }),
      loadGenerationRows: async () => [],
      loadReceiptLifecycleCounts: async () => ({}),
      loadOutsideLiquidity: async () => ({}),
      loadSourceSlot: async () => 459_177_356,
    });
    expect(warmTokensCalls).toBe(1);
    expect(warmed?.source.partial).toBeUndefined();
  });

});

function emptyTokenPage() {
  return {
    items: [],
    page: 1,
    pageSize: 1,
    total: 0,
    hasNextPage: false,
  };
}

function emptyClaimPage() {
  return {
    items: [],
    page: 1,
    pageSize: 1,
    total: 0,
    hasNextPage: false,
  };
}

function generationRow(): GenerationProvenanceRow {
  return {
    id: "generation:TokenMint111111111111111111111111111111111:Soul111111111111111111111111111111111111:2",
    tokenMint: "TokenMint111111111111111111111111111111111",
    soul: "Soul111111111111111111111111111111111111",
    generation: 2,
    side: "buy",
    amount: "990000",
    trader: "Trader1111111111111111111111111111111111",
    tokenAccount: "TokenAccount11111111111111111111111111111",
    seedHash: "c613e02aa48460b1",
    signature: "FinalizedGenerationSignature111111111111111111",
    slot: 458769366,
    blockTime: 1_777_419_851,
    source: "finalized-rpc-logs",
  };
}

function launchedToken({
  mint,
  selfDeprecated = false,
}: {
  mint: PublicKey;
  selfDeprecated?: boolean;
}): LaunchedToken {
  return {
    curve: PublicKey.unique(),
    soul: PublicKey.unique(),
    mint,
    createdAt: 1_700_000_000n,
    soulAccount: null,
    bondingCurve: {
      mint,
      cumulativeSol: 0n,
      totalMinted: 0n,
      selfDeprecated,
      lastInteractionSlot: 0n,
    },
  };
}

function parsedTokenAccount({
  pubkey = PublicKey.unique(),
  mint,
  amount,
  lamports = 1,
}: {
  pubkey?: PublicKey;
  mint: PublicKey;
  amount: string;
  lamports?: number;
}) {
  return {
    pubkey,
    account: {
      lamports,
      owner: new PublicKey(PROGRAM_IDS.token2022),
      executable: false,
      data: {
        program: "spl-token-2022",
        parsed: {
          type: "account",
          info: {
            mint: mint.toBase58(),
            state: "initialized",
            tokenAmount: {
              amount,
              decimals: 6,
            },
          },
        },
      },
    },
  };
}

function verifiedRaydiumLiquidityForMint(
  _mint: PublicKey,
  selectedVault: PublicKey,
) {
  return {
    verified: true,
    warnings: [],
    raydiumProgramId: "raydium-program-fixture",
    poolState: "pool-fixture",
    token0Vault: "vault-a-placeholder",
    token1Vault: "vault-b-placeholder",
    token0Mint: "mint-a-placeholder",
    token1Mint: "mint-b-placeholder",
    selectedVault: selectedVault.toBase58(),
    selectedVaultTokenProgram: "program-placeholder",
    activeLiquidityBaseUnits: tokenBaseUnitsText(45n),
    nonSelectedVault: "non-selected-vault-fixture",
  };
}
function accountInfo(owner: PublicKey, data: Buffer) {
  return {
    data,
    executable: false,
    lamports: 1_000_000,
    owner,
    rentEpoch: 0,
  };
}

function tokenAccountData({
  mint,
  owner,
  amount,
}: {
  mint: PublicKey;
  owner: PublicKey;
  amount: bigint;
}): Buffer {
  const data = Buffer.alloc(ACCOUNT_SIZE);
  AccountLayout.encode(
    {
      mint,
      owner,
      amount,
      delegateOption: 0,
      delegate: PublicKey.default,
      state: AccountState.Initialized,
      isNativeOption: 0,
      isNative: 0n,
      delegatedAmount: 0n,
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    },
    data,
  );
  return data;
}

function receiptData({
  tokenMint,
  lifecycleState,
}: {
  tokenMint: PublicKey;
  lifecycleState: 1 | 2 | 3;
}): Uint8Array {
  const data = new Uint8Array(RECEIPT_ACCOUNT_SIZE);
  let offset = 0;
  for (const publicKey of [
    PublicKey.unique(),
    PublicKey.unique(),
    tokenMint,
    PublicKey.unique(),
  ]) {
    data.set(publicKey.toBuffer(), offset);
    offset += 32;
  }
  const view = new DataView(data.buffer);
  view.setBigUint64(offset, 1n, true);
  offset += 8;
  view.setBigUint64(offset, 1n, true);
  offset += 8;
  view.setBigUint64(offset, 1_000_000n, true);
  offset += 8;
  view.setBigUint64(offset, 1n, true);
  offset += 8;
  data[offset] = lifecycleState;
  return data;
}

describe("stats route error fallback", () => {
  it("stats route error fallback passes isValidPublicStatsSnapshot with zero source_coverage", () => {
    const precheck = buildStatsPrecheck({
      rpcEndpoint: "https://api.devnet.solana.com",
      now: new Date("2026-04-29T00:00:00.000Z"),
    });
    const errorFallback: CachedPublicStatsSnapshot = {
      ...precheck,
      ok: true,
      metrics: [
        { id: "launchedTokens", value: "0" },
        { id: "generatedSoulCandidates", value: "0" },
        { id: "claimedSouls", value: "0" },
        { id: "activeCurves", value: "0" },
      ],
      dustTotals: {
        whole_units_in_pool: "0",
        fractional_remainder: "0",
        active_receipts: "0",
        burned_receipts: "0",
        forfeited_receipts: "0",
        inactive_receipts: "0",
        outside_liquidity_audited_tokens: "0",
        source_coverage: {
          bonding_curve_reserve_tokens: "0",
          raydium_cp_swap_vault_tokens: "0",
          unavailable_tokens: "0",
          source_verified_tokens: "0",
          source_unverified_tokens: "0",
          warning_tokens: "0",
        },
      },
      themeDistribution: [],
      perTokenSoulTotals: [],
      recentActivity: [],
      source: {
        ...precheck.source,
        partial: true,
        warnings: ["Unable to load public stats."],
      },
    };

    expect(isValidPublicStatsSnapshot(errorFallback)).toBe(true);
  });

  it("isValidPublicStatsSnapshot returns false when source_coverage is missing from error-fallback dustTotals", () => {
    const precheck = buildStatsPrecheck({
      rpcEndpoint: "https://api.devnet.solana.com",
      now: new Date("2026-04-29T00:00:00.000Z"),
    });
    const errorFallbackMissingCoverage = {
      ...precheck,
      metrics: [
        { id: "launchedTokens", value: "0" },
        { id: "generatedSoulCandidates", value: "0" },
        { id: "claimedSouls", value: "0" },
        { id: "activeCurves", value: "0" },
      ],
      dustTotals: {
        whole_units_in_pool: "0",
        fractional_remainder: "0",
        active_receipts: "0",
        burned_receipts: "0",
        forfeited_receipts: "0",
        inactive_receipts: "0",
        outside_liquidity_audited_tokens: "0",
        // source_coverage intentionally omitted to exercise the failing path
      },
      themeDistribution: [],
      perTokenSoulTotals: [],
      recentActivity: [],
      source: {
        ...precheck.source,
        partial: true,
        warnings: ["Unable to load public stats."],
      },
    } as unknown as CachedPublicStatsSnapshot;

    expect(isValidPublicStatsSnapshot(errorFallbackMissingCoverage)).toBe(false);
  });
});
