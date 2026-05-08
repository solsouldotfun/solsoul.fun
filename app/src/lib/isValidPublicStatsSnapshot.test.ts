import { describe, expect, it } from "vitest";
import { buildStatsPrecheck } from "./statsRoute";
import { isValidPublicStatsSnapshot, type CachedPublicStatsSnapshot } from "./publicStatsCache";

describe("isValidPublicStatsSnapshot error-fallback coverage", () => {
  it("accepts an error-fallback payload with zero source_coverage when perTokenSoulTotals is empty", () => {
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

  it("rejects an error-fallback payload when source_coverage is absent from dustTotals", () => {
    const precheck = buildStatsPrecheck({
      rpcEndpoint: "https://api.devnet.solana.com",
      now: new Date("2026-04-29T00:00:00.000Z"),
    });
    const missingCoverage = {
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
        // source_coverage intentionally absent — exercises the pre-fix failure path
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

    expect(isValidPublicStatsSnapshot(missingCoverage)).toBe(false);
  });
});
