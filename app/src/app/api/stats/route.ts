import { NextResponse } from "next/server";
import {
  buildStatsPrecheck,
  loadPublicStatsSnapshot,
  primePublicStatsSnapshot,
} from "@/lib/statsRoute";
import { publicApiErrorMessage, publicApiWarning } from "@/lib/publicApiErrors";

export const dynamic = "force-dynamic";

const SUCCESS_CACHE_CONTROL = "public, max-age=15, stale-while-revalidate=45";
const FALLBACK_CACHE_CONTROL = "public, max-age=5, stale-while-revalidate=15";

// Kick off a fire-and-forget cold-start prewarm at module load so the very
// first /api/stats request after a server boot benefits from a warmed
// `lastUsableStatsSnapshot`. The helper is idempotent, a no-op once a
// successful collection has populated the in-process cache, and swallows
// its own errors so an outer `.catch` is unnecessary.
void primePublicStatsSnapshot();

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("health") === "1" || url.searchParams.get("precheck") === "1") {
    return NextResponse.json(buildStatsPrecheck(), {
      headers: {
        "cache-control": SUCCESS_CACHE_CONTROL,
      },
    });
  }

  try {
    // Re-trigger prewarm on first request as a safety net for serverless cold
    // boots where module-load prewarm may have been racing this request. The
    // helper swallows its own errors, so no outer `.catch` is required here.
    void primePublicStatsSnapshot();
    const snapshot = await loadPublicStatsSnapshot();

    return NextResponse.json(
      {
        ok: true,
        ...snapshot,
      },
      {
        headers: {
          "cache-control": SUCCESS_CACHE_CONTROL,
        },
      },
    );
  } catch (error: unknown) {
    const precheck = buildStatsPrecheck();
    const timedOut = error instanceof Error && /timed out/i.test(error.message);
    return NextResponse.json(
      {
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
          warnings: [publicApiWarning("public stats", timedOut)],
        },
        error: publicApiErrorMessage("Unable to load public stats."),
      },
      {
        status: 200,
        headers: {
          "cache-control": FALLBACK_CACHE_CONTROL,
        },
      },
    );
  }
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      "cache-control": SUCCESS_CACHE_CONTROL,
    },
  });
}
