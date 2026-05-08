// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  PUBLIC_STATS_CACHE_KEY,
  readPublicStatsSnapshot,
  writePublicStatsSnapshot,
  type CachedPublicStatsSnapshot,
} from "./publicStatsCache";

const snapshot: CachedPublicStatsSnapshot = {
  ok: true,
  metrics: [
    { id: "launchedTokens", value: "2" },
    { id: "generatedSoulCandidates", value: "5" },
    { id: "claimedSouls", value: "1" },
    { id: "activeCurves", value: "2" },
  ],
  dustTotals: {
    whole_units_in_pool: "12",
    fractional_remainder: "345678",
    active_receipts: "1",
    burned_receipts: "1",
    forfeited_receipts: "0",
    inactive_receipts: "1",
    whole_units_outside_liquidity: "3",
    outside_liquidity_audited_tokens: "1",
    source_coverage: {
      bonding_curve_reserve_tokens: "1",
      raydium_cp_swap_vault_tokens: "0",
      unavailable_tokens: "0",
      source_verified_tokens: "1",
      source_unverified_tokens: "0",
      warning_tokens: "0",
    },
  },
  themeDistribution: [
    {
      id: "monochrome",
      label: "Monochrome Soul",
      renderer: "built-in",
      tokenCount: "2",
      generatedSoulCandidates: "5",
      claimedSouls: "1",
    },
  ],
  perTokenSoulTotals: [
    {
      tokenMint: "token-mint-for-cache-test",
      tokenLabel: "SOUL",
      soul: "soul-pda-for-cache-test",
      theme: {
        id: "monochrome",
        label: "Monochrome Soul",
        renderer: "built-in",
      },
      generatedSoulCandidates: "5",
      claimedSouls: "1",
      active: true,
      active_liquidity_base_units: "120000345678",
      whole_units_in_pool: "12",
      fractional_remainder: "345678",
      fractional_fill_ratio: "0.000034",
      liquidity_dust_ratio: "0.000002880641701879",
      active_receipts: "1",
      burned_receipts: "1",
      forfeited_receipts: "0",
      inactive_receipts: "1",
      whole_units_outside_liquidity: "3",
      dustSource: {
        token_unit: "10000000000",
        liquidity: "bonding_curve_reserve",
        source_verified: true,
        active_liquidity_account: "curve-pda-for-cache-test",
        active_liquidity_base_units: "120000345678",
        receipts: "receipt_binding_state",
        outside_liquidity: "token_account_scan",
        liquidity_vault: "vault-pda-for-cache-test",
        outside_liquidity_accounts: "2",
        outside_liquidity_excluded_accounts: "1",
        burned_receipts_includes: ["burned", "forfeited"],
      },
      launchedAt: "1",
      primaryLink: {
        label: "SOUL",
        href: "/token/token-mint-for-cache-test",
      },
      galleryLink: {
        label: "token-gallery",
        href: "/token/token-mint-for-cache-test/gallery",
      },
    },
  ],
  recentActivity: [
    {
      id: "launch:token-mint-for-cache-test",
      kind: "launch",
      tokenMint: "token-mint-for-cache-test",
      tokenLabel: "SOUL",
      sortKey: 1,
      primaryLink: {
        label: "SOUL",
        href: "/token/token-mint-for-cache-test",
      },
    },
    {
      id: "claim:claim-account-for-cache-test",
      kind: "claim",
      tokenMint: "token-mint-for-cache-test",
      tokenLabel: "SOUL",
      soul: "soul-pda-for-cache-test",
      generation: "2",
      sequence: "2",
      sortKey: 2,
      primaryLink: {
        label: "SOUL",
        href: "/token/token-mint-for-cache-test/gallery",
      },
      secondaryLink: {
        label: "NFT explorer",
        href: "https://explorer.solana.com/address/nft-mint-for-cache-test?cluster=devnet",
        external: true,
      },
      extraLinks: [
        {
          label: "Soul PDA",
          href: "https://explorer.solana.com/address/soul-pda-for-cache-test?cluster=devnet",
          external: true,
        },
      ],
    },
  ],
  source: {
    fetchedAt: "2026-04-29T00:00:00.000Z",
    rpcEndpoint: "https://api.devnet.solana.com",
    commitment: "confirmed",
    slot: 459177356,
    deployment: {
      bondingCurveProgramId: "CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un",
      soulGeneratorProgramId: "34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ",
      deploymentId: "dpl_cache_test",
      gitRef: "abc123",
    },
  },
};

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");

afterEach(() => {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
  }
});

describe("public stats cache helpers", () => {
  it("uses the M3 source-aware dust cache key version", () => {
    expect(PUBLIC_STATS_CACHE_KEY).toBe("solsoul.publicStatsSnapshot.v6");
  });

  it("reads a valid cached public stats snapshot", () => {
    const storage = new MemoryStorage();
    storage.setItem(PUBLIC_STATS_CACHE_KEY, JSON.stringify(snapshot));

    expect(readPublicStatsSnapshot(storage)).toEqual(
      expect.objectContaining({
        ok: true,
        metrics: expect.arrayContaining([{ id: "launchedTokens", value: "2" }]),
        source: expect.objectContaining({
          fetchedAt: "2026-04-29T00:00:00.000Z",
          rpcEndpoint: "https://api.devnet.solana.com",
          commitment: "confirmed",
        }),
        dustTotals: expect.objectContaining({ whole_units_in_pool: "12" }),
      }),
    );
  });

  it("rejects pre-dust stats cache entries that lack raw dust metrics", () => {
    const storage = new MemoryStorage();
    const preDust = {
      ...snapshot,
      dustTotals: undefined,
      perTokenSoulTotals: snapshot.perTokenSoulTotals.map(
        ({
          whole_units_in_pool: _wholeUnits,
          fractional_remainder: _remainder,
          fractional_fill_ratio: _ratio,
          active_liquidity_base_units: _activeLiquidity,
          liquidity_dust_ratio: _liquidityDustRatio,
          active_receipts: _activeReceipts,
          burned_receipts: _burnedReceipts,
          forfeited_receipts: _forfeitedReceipts,
          inactive_receipts: _inactiveReceipts,
          whole_units_outside_liquidity: _outsideLiquidity,
          dustSource: _dustSource,
          ...row
        }) => row,
      ),
    };
    storage.setItem(PUBLIC_STATS_CACHE_KEY, JSON.stringify(preDust));

    expect(readPublicStatsSnapshot(storage)).toBeUndefined();
  });

  it("rejects cache entries that upgrade bounded per-token liquidity to indexed aggregate capability", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ...snapshot,
        dustTotals: {
          ...snapshot.dustTotals,
          source_coverage: {
            ...snapshot.dustTotals.source_coverage,
            warning_tokens: "1",
            warnings: [
              "token2022_indexed_gpa_unavailable",
              "token_methods_bounded_sample",
            ],
          },
        },
        perTokenSoulTotals: [
          {
            ...snapshot.perTokenSoulTotals[0],
            dustSource: {
              ...snapshot.perTokenSoulTotals[0].dustSource,
              outside_liquidity: "top_accounts_bounded_audit",
              outside_liquidity_completeness: "bounded_top_accounts_audit",
              token2022_indexed_gpa_supported: false,
              outside_liquidity_warning_codes: [
                "token2022_indexed_gpa_unavailable",
                "token_methods_bounded_sample",
              ],
              warnings: [
                "token2022_indexed_gpa_unavailable",
                "token_methods_bounded_sample",
              ],
            },
          },
        ],
        source: {
          ...snapshot.source,
          rpcEndpoint: "solana-devnet",
          rpcCapability: {
            outsideLiquidity: {
              classification: "indexed_rpc_verified",
              indexedGpaSupported: true,
              programLabel: "spl-program-2022",
              requestedFilters: [{ memcmp: { offset: 0, bytes: "token-mint-for-cache-test" } }],
              endpointLabel: "solana-devnet",
              rpcProvider: "solana-devnet",
              rpcCluster: "devnet",
              rpcCredentialRedacted: false,
              warningCodes: [],
            },
          },
        },
      }),
    );

    expect(readPublicStatsSnapshot(storage)).toBeUndefined();
  });

  it("rejects malformed dust strings and ratios inconsistent with the raw remainder", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ...snapshot,
        perTokenSoulTotals: [
          {
            ...snapshot.perTokenSoulTotals[0],
            fractional_remainder: "10000000000",
            fractional_fill_ratio: "0.000000",
          },
        ],
      }),
    );
    expect(readPublicStatsSnapshot(storage)).toBeUndefined();

    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ...snapshot,
        perTokenSoulTotals: [
          {
            ...snapshot.perTokenSoulTotals[0],
            fractional_remainder: "42",
            fractional_fill_ratio: "0.000043",
          },
        ],
      }),
    );
    expect(readPublicStatsSnapshot(storage)).toBeUndefined();
  });

  it("accepts verified Raydium vault dust snapshots and rejects malformed liquidity dust ratios", () => {
    const storage = new MemoryStorage();
    const raydiumSnapshot: CachedPublicStatsSnapshot = {
      ...snapshot,
      dustTotals: {
        ...snapshot.dustTotals,
        source_coverage: {
          bonding_curve_reserve_tokens: "0",
          raydium_cp_swap_vault_tokens: "1",
          unavailable_tokens: "0",
          source_verified_tokens: "1",
          source_unverified_tokens: "0",
          warning_tokens: "0",
        },
      },
      perTokenSoulTotals: [
        {
          ...snapshot.perTokenSoulTotals[0],
          active: false,
          active_liquidity_base_units: "450000678901",
          whole_units_in_pool: "45",
          fractional_remainder: "678901",
          fractional_fill_ratio: "0.000067",
          liquidity_dust_ratio: "0.000001508666612810",
          dustSource: {
            ...snapshot.perTokenSoulTotals[0].dustSource,
            liquidity: "raydium_cp_swap_vault",
            source_verified: true,
            active_liquidity_account: "raydium-token-vault-for-cache-test",
            active_liquidity_base_units: "450000678901",
            raydium_program_id: "raydium-program-for-cache-test",
            raydium_pool_state: "raydium-pool-for-cache-test",
            raydium_token0_vault: "raydium-token-vault-for-cache-test",
            raydium_token1_vault: "raydium-wsol-vault-for-cache-test",
            raydium_token0_mint: "token-mint-for-cache-test",
            raydium_token1_mint: "So11111111111111111111111111111111111111112",
            token_program: "TokenzQdBNbLqP5VEhdkAS6EPFfk3MNWk43TgYtL",
            fetched_slot: "459177356",
            commitment: "confirmed",
          },
        },
      ],
    };
    storage.setItem(PUBLIC_STATS_CACHE_KEY, JSON.stringify(raydiumSnapshot));
    expect(readPublicStatsSnapshot(storage)?.perTokenSoulTotals[0]).toMatchObject({
      liquidity_dust_ratio: "0.000001508666612810",
      dustSource: expect.objectContaining({ liquidity: "raydium_cp_swap_vault" }),
    });

    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ...raydiumSnapshot,
        perTokenSoulTotals: [
          {
            ...raydiumSnapshot.perTokenSoulTotals[0],
            liquidity_dust_ratio: "0.014862",
          },
        ],
      }),
    );
    expect(readPublicStatsSnapshot(storage)).toBeUndefined();
  });

  it("rejects Raydium cache rows whose ratio or selected source metadata mismatches raw components", () => {
    const storage = new MemoryStorage();
    const raydiumSnapshot: CachedPublicStatsSnapshot = {
      ...snapshot,
      dustTotals: {
        ...snapshot.dustTotals,
        source_coverage: {
          bonding_curve_reserve_tokens: "0",
          raydium_cp_swap_vault_tokens: "1",
          unavailable_tokens: "0",
          source_verified_tokens: "1",
          source_unverified_tokens: "0",
          warning_tokens: "0",
        },
      },
      perTokenSoulTotals: [
        {
          ...snapshot.perTokenSoulTotals[0],
          tokenMint: "launched-token-mint-for-cache-test",
          primaryLink: {
            label: "SOUL",
            href: "/token/launched-token-mint-for-cache-test",
          },
          galleryLink: {
            label: "token-gallery",
            href: "/token/launched-token-mint-for-cache-test/gallery",
          },
          active: false,
          active_liquidity_base_units: "450000678901",
          whole_units_in_pool: "45",
          fractional_remainder: "678901",
          fractional_fill_ratio: "0.000067",
          liquidity_dust_ratio: "0.000001508666612810",
          dustSource: {
            ...snapshot.perTokenSoulTotals[0].dustSource,
            liquidity: "raydium_cp_swap_vault",
            source_verified: true,
            active_liquidity_account: "raydium-launched-token-vault",
            active_liquidity_base_units: "450000678901",
            raydium_program_id: "raydium-program-for-cache-test",
            raydium_pool_state: "raydium-pool-for-cache-test",
            raydium_token0_vault: "raydium-launched-token-vault",
            raydium_token1_vault: "raydium-wsol-vault-for-cache-test",
            raydium_token0_mint: "launched-token-mint-for-cache-test",
            raydium_token1_mint: "So11111111111111111111111111111111111111112",
            raydium_non_selected_vault: "raydium-wsol-vault-for-cache-test",
            token_program: "TokenzQdBNbLqP5VEhdkAS6EPZn4KrrWca2sHnYc6",
            fetched_slot: "459177356",
            commitment: "confirmed",
          },
        },
      ],
    };

    storage.setItem(PUBLIC_STATS_CACHE_KEY, JSON.stringify(raydiumSnapshot));
    expect(readPublicStatsSnapshot(storage)?.perTokenSoulTotals[0]).toMatchObject({
      active_liquidity_base_units: "450000678901",
      liquidity_dust_ratio: "0.000001508666612810",
      dustSource: expect.objectContaining({
        active_liquidity_account: "raydium-launched-token-vault",
        raydium_token0_mint: "launched-token-mint-for-cache-test",
      }),
    });

    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ...raydiumSnapshot,
        perTokenSoulTotals: [
          {
            ...raydiumSnapshot.perTokenSoulTotals[0],
            liquidity_dust_ratio: "0.000001508666612811",
          },
        ],
      }),
    );
    expect(readPublicStatsSnapshot(storage)).toBeUndefined();

    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ...raydiumSnapshot,
        perTokenSoulTotals: [
          {
            ...raydiumSnapshot.perTokenSoulTotals[0],
            dustSource: {
              ...raydiumSnapshot.perTokenSoulTotals[0].dustSource,
              active_liquidity_account: "raydium-wsol-vault-for-cache-test",
            },
          },
        ],
      }),
    );
    expect(readPublicStatsSnapshot(storage)).toBeUndefined();

    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ...raydiumSnapshot,
        perTokenSoulTotals: [
          {
            ...raydiumSnapshot.perTokenSoulTotals[0],
            dustSource: {
              ...raydiumSnapshot.perTokenSoulTotals[0].dustSource,
              raydium_token0_mint: "wrong-launched-token-mint",
            },
          },
        ],
      }),
    );
    expect(readPublicStatsSnapshot(storage)).toBeUndefined();
  });

  it("requires stable warning metadata for unavailable Raydium post-migration cache rows", () => {
    const storage = new MemoryStorage();
    const makeUnavailableRaydiumSnapshot = (warnings?: string[]): CachedPublicStatsSnapshot => {
      const {
        active_liquidity_account: _activeLiquidityAccount,
        active_liquidity_base_units: _activeLiquidityBaseUnits,
        liquidity_vault: _liquidityVault,
        ...baseDustSource
      } = snapshot.perTokenSoulTotals[0].dustSource;

      return {
        ...snapshot,
        dustTotals: {
          ...snapshot.dustTotals,
          source_coverage: {
            bonding_curve_reserve_tokens: "0",
            raydium_cp_swap_vault_tokens: "0",
            unavailable_tokens: "1",
            source_verified_tokens: "0",
            source_unverified_tokens: "1",
            warning_tokens: warnings && warnings.length > 0 ? "1" : "0",
            ...(warnings && warnings.length > 0 ? { warnings } : {}),
          },
        },
        perTokenSoulTotals: [
          {
            ...snapshot.perTokenSoulTotals[0],
            tokenMint: "post-migration-raydium-token",
            active: false,
            active_liquidity_base_units: null,
            whole_units_in_pool: null,
            fractional_remainder: null,
            fractional_fill_ratio: null,
            liquidity_dust_ratio: null,
            dustSource: {
              ...baseDustSource,
              liquidity: "unavailable",
              source_verified: false,
              raydium_program_id: "raydium-program-for-cache-test",
              raydium_pool_state: "raydium-pool-for-cache-test",
              raydium_token0_vault: "raydium-token-vault-for-cache-test",
              raydium_token1_vault: "raydium-wsol-vault-for-cache-test",
              raydium_token0_mint: "post-migration-raydium-token",
              raydium_token1_mint: "*******************************************",
              token_program: "****************************************",
              fetched_slot: "459177356",
              commitment: "confirmed",
              ...(warnings && warnings.length > 0 ? { warnings } : {}),
            },
            primaryLink: {
              label: "SOUL",
              href: "/token/post-migration-raydium-token",
            },
            galleryLink: {
              label: "token-gallery",
              href: "/token/post-migration-raydium-token/gallery",
            },
          },
        ],
      };
    };

    storage.setItem(PUBLIC_STATS_CACHE_KEY, JSON.stringify(makeUnavailableRaydiumSnapshot()));
    expect(readPublicStatsSnapshot(storage)).toBeUndefined();

    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify(makeUnavailableRaydiumSnapshot(["Raydium vault unavailable"])),
    );
    expect(readPublicStatsSnapshot(storage)).toBeUndefined();

    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify(
        makeUnavailableRaydiumSnapshot([
          "outside_liquidity_venue_unavailable",
          "raydium_vault_unverified",
        ]),
      ),
    );
    expect(readPublicStatsSnapshot(storage)?.perTokenSoulTotals[0].dustSource).toMatchObject({
      liquidity: "unavailable",
      source_verified: false,
      warnings: expect.arrayContaining([
        "outside_liquidity_venue_unavailable",
        "raydium_vault_unverified",
      ]),
    });
  });

  it("rejects stale public stats snapshots instead of persisting stale cache truth", () => {
    const storage = new MemoryStorage();
    const staleSnapshot: CachedPublicStatsSnapshot = {
      ...snapshot,
      source: {
        ...snapshot.source,
        partial: true,
        stale: true,
        warnings: ["launched token metrics: timed out"],
      },
    };
    storage.setItem(PUBLIC_STATS_CACHE_KEY, JSON.stringify(staleSnapshot));

    expect(readPublicStatsSnapshot(storage)).toBeUndefined();
    expect(writePublicStatsSnapshot(staleSnapshot, storage)).toBe(false);
  });

  it("rejects malformed aggregate dust totals and source warning metadata", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ...snapshot,
        dustTotals: {
          ...snapshot.dustTotals,
          active_receipts: "1.5",
        },
      }),
    );
    expect(readPublicStatsSnapshot(storage)).toBeUndefined();

    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ...snapshot,
        source: {
          ...snapshot.source,
          partial: "yes",
          warnings: [""],
        },
      }),
    );
    expect(readPublicStatsSnapshot(storage)).toBeUndefined();
  });

  it("accepts SoulPuff themed stats snapshots from the public PD13 devnet API", () => {
    const storage = new MemoryStorage();
    const soulpuffSnapshot: CachedPublicStatsSnapshot = {
      ...snapshot,
      themeDistribution: [
        {
          id: "soulpuff",
          label: "SoulPuff",
          renderer: "built-in",
          tokenCount: "2",
          generatedSoulCandidates: "4",
          claimedSouls: "1",
        },
      ],
      perTokenSoulTotals: [
        {
          ...snapshot.perTokenSoulTotals[0],
          theme: {
            id: "soulpuff",
            label: "SoulPuff",
            renderer: "built-in",
          },
        },
      ],
      recentActivity: snapshot.recentActivity.map((activity) => ({
        ...activity,
        theme: {
          id: "soulpuff" as const,
          label: "SoulPuff",
          renderer: "built-in" as const,
        },
      })),
    };
    storage.setItem(PUBLIC_STATS_CACHE_KEY, JSON.stringify(soulpuffSnapshot));

    expect(readPublicStatsSnapshot(storage)?.themeDistribution[0]).toMatchObject({
      id: "soulpuff",
      label: "SoulPuff",
      generatedSoulCandidates: "4",
    });
    expect(writePublicStatsSnapshot(soulpuffSnapshot, storage)).toBe(true);
  });

  it("accepts NeonPuff themed stats snapshots from the public PD14 devnet API", () => {
    const storage = new MemoryStorage();
    const neonpuffSnapshot: CachedPublicStatsSnapshot = {
      ...snapshot,
      themeDistribution: [
        {
          id: "neonpuff",
          label: "NeonPuff Soul",
          renderer: "built-in",
          tokenCount: "3",
          generatedSoulCandidates: "7",
          claimedSouls: "2",
        },
      ],
      perTokenSoulTotals: [
        {
          ...snapshot.perTokenSoulTotals[0],
          theme: {
            id: "neonpuff",
            label: "NeonPuff Soul",
            renderer: "built-in",
          },
        },
      ],
      recentActivity: snapshot.recentActivity.map((activity) => ({
        ...activity,
        theme: {
          id: "neonpuff" as const,
          label: "NeonPuff Soul",
          renderer: "built-in" as const,
        },
      })),
    };
    storage.setItem(PUBLIC_STATS_CACHE_KEY, JSON.stringify(neonpuffSnapshot));

    expect(readPublicStatsSnapshot(storage)?.themeDistribution[0]).toMatchObject({
      id: "neonpuff",
      label: "NeonPuff Soul",
      generatedSoulCandidates: "7",
    });
    expect(writePublicStatsSnapshot(neonpuffSnapshot, storage)).toBe(true);
  });

  it("ignores pre-PD7 heuristic stats cache entries stored under the old key", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "solsoul.publicStatsSnapshot.v1",
      JSON.stringify({
        ok: true,
        metrics: snapshot.metrics,
        dustTotals: snapshot.dustTotals,
        themeDistribution: snapshot.themeDistribution,
        perTokenSoulTotals: snapshot.perTokenSoulTotals,
        recentActivity: [
          {
            id: "generation:heuristic:1",
            kind: "tradeGeneration",
            tokenMint: "token-mint-for-cache-test",
            tokenLabel: "OLD",
            generation: "1",
            sortKey: 1,
            primaryLink: {
              label: "OLD",
              href: "/token/token-mint-for-cache-test",
            },
          },
        ],
        source: {
          fetchedAt: "2026-04-28T00:00:00.000Z",
          rpcEndpoint: "pre-PD7 heuristic cache",
        },
      }),
    );

    expect(readPublicStatsSnapshot(storage)).toBeUndefined();
  });

  it("rejects cached tradeGeneration rows that lack finalized PD7 provenance evidence", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ok: true,
        metrics: snapshot.metrics,
        dustTotals: snapshot.dustTotals,
        themeDistribution: snapshot.themeDistribution,
        perTokenSoulTotals: snapshot.perTokenSoulTotals,
        recentActivity: [
          {
            id: "generation:heuristic:1",
            kind: "tradeGeneration",
            tokenMint: "token-mint-for-cache-test",
            tokenLabel: "OLD",
            generation: "1",
            sortKey: 1,
            primaryLink: {
              label: "OLD",
              href: "/token/token-mint-for-cache-test",
            },
          },
        ],
        source: {
          fetchedAt: "2026-04-28T00:00:00.000Z",
          rpcEndpoint: "pre-PD7 heuristic cache",
        },
      }),
    );

    expect(readPublicStatsSnapshot(storage)).toBeUndefined();
  });

  it("rejects pre-PD10 stats cache entries that lack collection dashboard fields", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ok: true,
        metrics: snapshot.metrics,
        recentActivity: snapshot.recentActivity,
        source: snapshot.source,
      }),
    );

    expect(readPublicStatsSnapshot(storage)).toBeUndefined();
  });

  it("rejects claim activity rows that cannot identify or link the claimed Soul PDA", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ...snapshot,
        recentActivity: [
          {
            id: "claim:claim-account-for-cache-test",
            kind: "claim",
            tokenMint: "token-mint-for-cache-test",
            tokenLabel: "SOUL",
            generation: "2",
            sequence: "2",
            sortKey: 2,
            primaryLink: {
              label: "SOUL",
              href: "/token/token-mint-for-cache-test/gallery",
            },
            secondaryLink: {
              label: "NFT explorer",
              href: "https://explorer.solana.com/address/nft-mint-for-cache-test?cluster=devnet",
              external: true,
            },
          },
        ],
      }),
    );

    expect(readPublicStatsSnapshot(storage)).toBeUndefined();
  });

  it("does not persist transient empty partial snapshots as final collection dashboard truth", () => {
    const storage = new MemoryStorage();
    const transientEmptySnapshot: CachedPublicStatsSnapshot = {
      ok: true,
      metrics: [
        { id: "launchedTokens", value: "0" },
        { id: "generatedSoulCandidates", value: "0" },
        { id: "claimedSouls", value: "0" },
        { id: "activeCurves", value: "0" },
      ],
      themeDistribution: [],
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
      perTokenSoulTotals: [],
      recentActivity: [],
      source: {
        fetchedAt: "2026-04-29T00:00:00.000Z",
        rpcEndpoint: "https://api.devnet.solana.com",
        commitment: "confirmed",
        deployment: snapshot.source.deployment,
        partial: true,
        warnings: ["launched token metrics: devnet RPC 429"],
      },
    };

    expect(writePublicStatsSnapshot(transientEmptySnapshot, storage)).toBe(false);
    expect(storage.getItem(PUBLIC_STATS_CACHE_KEY)).toBeNull();
  });

  it("accepts cached tradeGeneration rows with finalized PD7 provenance evidence", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ok: true,
        metrics: snapshot.metrics,
        dustTotals: snapshot.dustTotals,
        themeDistribution: snapshot.themeDistribution,
        perTokenSoulTotals: snapshot.perTokenSoulTotals,
        recentActivity: [
          {
            id: "generation:token-mint-for-cache-test:soul-pda-for-cache-test:2",
            kind: "tradeGeneration",
            tokenMint: "token-mint-for-cache-test",
            tokenLabel: "PD7",
            generation: "2",
            side: "buy",
            amount: "990000",
            trader: "Trader1111111111111111111111111111111111",
            tokenAccount: "TraderToken11111111111111111111111111111",
            seedHash: "c613e02aa48460b1",
            signature: "FinalizedGenerationSignature111111111111111111",
            slot: 458769366,
            soul: "soul-pda-for-cache-test",
            sortKey: 458769366,
            primaryLink: {
              label: "PD7",
              href: "/token/token-mint-for-cache-test",
            },
            secondaryLink: {
              label: "Explorer tx",
              href: "https://explorer.solana.com/tx/FinalizedGenerationSignature111111111111111111?cluster=devnet",
              external: true,
            },
            extraLinks: [
              {
                label: "Soul PDA",
                href: "https://explorer.solana.com/address/soul-pda-for-cache-test?cluster=devnet",
                external: true,
              },
            ],
          },
        ],
        source: snapshot.source,
      }),
    );

    expect(readPublicStatsSnapshot(storage)?.recentActivity[0]).toMatchObject({
      kind: "tradeGeneration",
      side: "buy",
      amount: "990000",
      signature: "FinalizedGenerationSignature111111111111111111",
      slot: 458769366,
      soul: "soul-pda-for-cache-test",
    });
  });

  it("accepts intentional signature-less tradeGeneration fallback rows that link to the token timeline", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ok: true,
        metrics: snapshot.metrics,
        dustTotals: snapshot.dustTotals,
        themeDistribution: snapshot.themeDistribution,
        perTokenSoulTotals: snapshot.perTokenSoulTotals,
        recentActivity: [
          {
            id: "generation:token-mint-for-cache-test:soul-pda-for-cache-test:3:timeline-fallback",
            kind: "tradeGeneration",
            tokenMint: "token-mint-for-cache-test",
            tokenLabel: "PD9",
            generation: "3",
            side: "sell",
            amount: "1250000",
            trader: "Owner1111111111111111111111111111111111",
            seedHash: "abc123ef45678900",
            soul: "soul-pda-for-cache-test",
            sortKey: 458769367.3,
            primaryLink: {
              label: "PD9",
              href: "/token/token-mint-for-cache-test",
            },
            secondaryLink: {
              label: "Token timeline",
              href: "/token/token-mint-for-cache-test#token-timeline",
            },
            extraLinks: [
              {
                label: "Soul PDA",
                href: "https://explorer.solana.com/address/soul-pda-for-cache-test?cluster=devnet",
                external: true,
              },
            ],
          },
        ],
        source: snapshot.source,
      }),
    );

    expect(readPublicStatsSnapshot(storage)?.recentActivity[0]).toMatchObject({
      kind: "tradeGeneration",
      side: "sell",
      amount: "1250000",
      seedHash: "abc123ef45678900",
      secondaryLink: {
        href: "/token/token-mint-for-cache-test#token-timeline",
      },
    });
    expect(readPublicStatsSnapshot(storage)?.recentActivity[0]).not.toHaveProperty("signature");
  });

  it("accepts PD9 API fallback rows that serialize unavailable signature and slot as null", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ok: true,
        metrics: snapshot.metrics,
        dustTotals: snapshot.dustTotals,
        themeDistribution: snapshot.themeDistribution,
        perTokenSoulTotals: snapshot.perTokenSoulTotals,
        recentActivity: [
          {
            id: "generation:token-mint-for-cache-test:****************************************:6:timeline-fallback",
            kind: "tradeGeneration",
            tokenMint: "token-mint-for-cache-test",
            tokenLabel: "PD9",
            generation: "6",
            side: "buy",
            amount: "990000",
            trader: "Trader1111111111111111111111111111111111",
            tokenAccount: null,
            seedHash: "c613e02aa48460b1",
            signature: null,
            slot: null,
            soul: "soul-pda-for-cache-test",
            sortKey: 458769369.3,
            primaryLink: {
              label: "PD9",
              href: "/token/token-mint-for-cache-test",
            },
            secondaryLink: {
              label: "Token timeline",
              href: "/token/token-mint-for-cache-test#token-timeline",
            },
          },
        ],
        source: {
          ...snapshot.source,
          partial: true,
          warnings: ["recent generation provenance: devnet RPC 429"],
        },
      }),
    );

    expect(readPublicStatsSnapshot(storage)?.recentActivity[0]).toMatchObject({
      kind: "tradeGeneration",
      generation: "6",
      seedHash: "c613e02aa48460b1",
      secondaryLink: {
        href: "/token/token-mint-for-cache-test#token-timeline",
      },
    });
  });

  it("rejects signature-less tradeGeneration fallback rows without required provenance or timeline links", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ok: true,
        metrics: snapshot.metrics,
        themeDistribution: snapshot.themeDistribution,
        perTokenSoulTotals: snapshot.perTokenSoulTotals,
        recentActivity: [
          {
            id: "generation:token-mint-for-cache-test:soul-pda-for-cache-test:4:timeline-fallback",
            kind: "tradeGeneration",
            tokenMint: "token-mint-for-cache-test",
            tokenLabel: "PD9",
            generation: "4",
            side: "buy",
            amount: "1250000",
            trader: "Owner1111111111111111111111111111111111",
            soul: "soul-pda-for-cache-test",
            sortKey: 458769368.3,
            primaryLink: {
              label: "PD9",
              href: "/token/token-mint-for-cache-test",
            },
            secondaryLink: {
              label: "Token timeline",
              href: "/token/token-mint-for-cache-test",
            },
          },
        ],
        source: {
          fetchedAt: "2026-04-29T00:00:00.000Z",
          rpcEndpoint: "https://api.devnet.solana.com",
        },
      }),
    );

    expect(readPublicStatsSnapshot(storage)).toBeUndefined();
  });

  it("rejects finalized tradeGeneration rows when explorer transaction evidence is missing", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PUBLIC_STATS_CACHE_KEY,
      JSON.stringify({
        ok: true,
        metrics: snapshot.metrics,
        themeDistribution: snapshot.themeDistribution,
        perTokenSoulTotals: snapshot.perTokenSoulTotals,
        recentActivity: [
          {
            id: "generation:token-mint-for-cache-test:soul-pda-for-cache-test:5",
            kind: "tradeGeneration",
            tokenMint: "token-mint-for-cache-test",
            tokenLabel: "PD9",
            generation: "5",
            side: "buy",
            amount: "990000",
            trader: "Trader1111111111111111111111111111111111",
            tokenAccount: "TokenAccount1111111111111111111111111111",
            seedHash: "c613e02aa48460b1",
            signature: "FinalizedGenerationSignature111111111111111111",
            slot: 458769366,
            soul: "soul-pda-for-cache-test",
            sortKey: 458769366,
            primaryLink: {
              label: "PD9",
              href: "/token/token-mint-for-cache-test",
            },
            secondaryLink: {
              label: "Token timeline",
              href: "/token/token-mint-for-cache-test#token-timeline",
            },
          },
        ],
        source: {
          fetchedAt: "2026-04-29T00:00:00.000Z",
          rpcEndpoint: "https://api.devnet.solana.com",
        },
      }),
    );

    expect(readPublicStatsSnapshot(storage)).toBeUndefined();
  });

  it("treats unavailable browser storage as an optional cache miss", () => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("private mode storage access is blocked");
      },
      configurable: true,
    });

    expect(readPublicStatsSnapshot()).toBeUndefined();
    expect(writePublicStatsSnapshot(snapshot)).toBe(false);
  });

  it("degrades silently when storage read and write operations throw", () => {
    const throwingStorage = {
      getItem() {
        throw new Error("storage read failed");
      },
      setItem() {
        throw new Error("quota exceeded");
      },
    } as unknown as Storage;

    expect(readPublicStatsSnapshot(throwingStorage)).toBeUndefined();
    expect(writePublicStatsSnapshot(snapshot, throwingStorage)).toBe(false);
  });
});

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
