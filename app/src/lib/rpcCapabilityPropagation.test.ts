// @ts-nocheck — justified: test stubs use pre-curve-refactor BondingCurveAccount fields (targetAmm) not present in new exponential-curve interface
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  MIN_CLAIM_BALANCE,
  TARGET_AMM,
  type BondingCurveAccount,
  type LaunchedToken,
  type SoulAccount,
} from "sdk";
import { summarizeRpcCapability } from "./rpcCapability";
import { buildPublicStatsSnapshot } from "./stats";
import { isValidPublicStatsSnapshot } from "./publicStatsCache";

/**
 * PD18.F4 propagation contract tests.
 *
 * Fulfills VAL-RPC-010: classification produced by the RPC capability layer
 * must reach the stats snapshot (API surface) and the cached snapshot (UI
 * surface) unchanged. No layer is allowed to upgrade
 * `bounded_top_accounts_audit` to `indexed_rpc_verified` or to suppress
 * warning codes.
 */

describe("RPC capability classification propagation", () => {
  it("propagates bounded_top_accounts_audit from capability layer through API snapshot to UI cache", () => {
    const mint = PublicKey.unique();
    const triton = "https://triton-devnet.example.com/abc/key?api-key=secret";

    // Capability layer (script/RPC layer): the provider rejects Token-2022
    // indexed GPA but supports token methods, yielding a bounded audit.
    const capability = summarizeRpcCapability({
      endpoint: triton,
      audits: {
        [mint.toBase58()]: {
          classification: "bounded_top_accounts_audit",
          indexedGpaSupported: false,
          wholeUnitsOutsideLiquidity: 2n,
          observedOutsideLiquidityBaseUnits: 2n * MIN_CLAIM_BALANCE,
          accountLimit: 20,
          warningCodes: [
            "token2022_indexed_gpa_unavailable",
            "token2022_secondary_index_excluded",
            "token_methods_bounded_sample",
            "outside_liquidity_sample_limited",
          ],
        },
      },
      probeMint: mint,
    });

    expect(capability.classification).toBe("bounded_top_accounts_audit");
    expect(capability.indexedGpaSupported).toBe(false);
    expect(capability.endpointLabel).toBe("triton-devnet:<redacted>");
    expect(capability.endpointLabel).not.toContain("secret");
    expect(capability.warningCodes).toEqual(
      expect.arrayContaining([
        "token2022_indexed_gpa_unavailable",
        "token2022_secondary_index_excluded",
        "token_methods_bounded_sample",
        "outside_liquidity_sample_limited",
      ]),
    );

    // API surface: the stats snapshot must carry the SAME classification
    // and warning codes through to source.rpcCapability.outsideLiquidity
    // and to per-token dustSource fields, with no upgrade.
    const snapshot = buildPublicStatsSnapshot({
      tokens: [launchedToken({ mint})],
      claims: [],
      rpcEndpoint: triton,
      outsideLiquidityByMint: {
        [mint.toBase58()]: {
          classification: "bounded_top_accounts_audit",
          indexedGpaSupported: false,
          wholeUnitsOutsideLiquidity: 2n,
          observedOutsideLiquidityBaseUnits: 2n * MIN_CLAIM_BALANCE,
          accountLimit: 20,
          warningCodes: [
            "token2022_indexed_gpa_unavailable",
            "token2022_secondary_index_excluded",
            "token_methods_bounded_sample",
            "outside_liquidity_sample_limited",
          ],
        },
      },
      rpcCapability: capability,
    });

    expect(snapshot.source.rpcCapability?.outsideLiquidity.classification).toBe(
      capability.classification,
    );
    expect(snapshot.source.rpcCapability?.outsideLiquidity.indexedGpaSupported).toBe(
      capability.indexedGpaSupported,
    );
    expect(snapshot.source.rpcCapability?.outsideLiquidity.warningCodes).toEqual(
      capability.warningCodes,
    );
    expect(snapshot.perTokenSoulTotals[0]?.dustSource.outside_liquidity_completeness).toBe(
      "bounded_top_accounts_audit",
    );
    expect(snapshot.perTokenSoulTotals[0]?.dustSource.token2022_indexed_gpa_supported).toBe(false);
    expect(
      snapshot.perTokenSoulTotals[0]?.dustSource.outside_liquidity_warning_codes,
    ).toEqual(
      expect.arrayContaining([
        "token2022_indexed_gpa_unavailable",
        "token2022_secondary_index_excluded",
        "token_methods_bounded_sample",
        "outside_liquidity_sample_limited",
      ]),
    );

    // UI surface: the cached snapshot must validate against the
    // publicStatsCache contract. The cache validator enforces that the
    // capability classification matches the per-token rows (no API → UI
    // drift), so a successful validation proves end-to-end propagation.
    const cached = { ...snapshot, ok: true as const };
    expect(isValidPublicStatsSnapshot(cached)).toBe(true);
  });

  it("rejects a snapshot whose capability claims indexed_rpc_verified while a row reports bounded_top_accounts_audit", () => {
    const mint = PublicKey.unique();
    const snapshot = buildPublicStatsSnapshot({
      tokens: [launchedToken({ mint})],
      claims: [],
      rpcEndpoint: "https://api.devnet.solana.com",
      outsideLiquidityByMint: {
        [mint.toBase58()]: {
          classification: "bounded_top_accounts_audit",
          indexedGpaSupported: false,
          wholeUnitsOutsideLiquidity: 1n,
          warningCodes: [
            "token2022_indexed_gpa_unavailable",
            "token_methods_bounded_sample",
          ],
        },
      },
    });

    // Tamper with the snapshot to simulate a layer-upgrade attempt: the
    // API/UI cache validator MUST refuse to accept a complete-coverage
    // capability when the per-token row is bounded.
    const upgraded = {
      ...snapshot,
      ok: true as const,
      source: {
        ...snapshot.source,
        rpcCapability: {
          outsideLiquidity: {
            classification: "indexed_rpc_verified" as const,
            indexedGpaSupported: true,
            programLabel: "spl-program-2022",
            requestedFilters: [{ memcmp: { offset: 0, bytes: mint.toBase58() } }],
            endpointLabel: "solana-devnet",
            rpcProvider: "solana-devnet",
            rpcCluster: "devnet" as const,
            rpcCredentialRedacted: false,
            warningCodes: [],
          },
        },
      },
    };

    expect(isValidPublicStatsSnapshot(upgraded)).toBe(false);
  });

  it("propagates rpc_failover_used warning from capability layer to API and UI cache", () => {
    const mint = PublicKey.unique();
    const capability = summarizeRpcCapability({
      endpoint: "https://api.devnet.solana.com",
      audits: {
        [mint.toBase58()]: {
          classification: "bounded_top_accounts_audit",
          indexedGpaSupported: false,
          wholeUnitsOutsideLiquidity: 1n,
          warningCodes: [
            "token2022_indexed_gpa_unavailable",
            "token_methods_bounded_sample",
          ],
        },
      },
      probeMint: mint,
      failoverEvents: [
        {
          primaryEndpointLabel: "solana-devnet",
          fallbackEndpointLabel: "triton-devnet:<redacted>",
          usedEndpointLabel: "triton-devnet:<redacted>",
          reason: "primary 5xx",
          status: 503,
        },
      ],
    });

    expect(capability.warningCodes).toEqual(expect.arrayContaining(["rpc_failover_used"]));
    expect(capability.failover?.fallbackEndpointLabel).toBe("triton-devnet:<redacted>");

    const snapshot = buildPublicStatsSnapshot({
      tokens: [launchedToken({ mint})],
      claims: [],
      rpcEndpoint: "https://api.devnet.solana.com",
      outsideLiquidityByMint: {
        [mint.toBase58()]: {
          classification: "bounded_top_accounts_audit",
          indexedGpaSupported: false,
          wholeUnitsOutsideLiquidity: 1n,
          warningCodes: [
            "token2022_indexed_gpa_unavailable",
            "token_methods_bounded_sample",
            "rpc_failover_used",
          ],
        },
      },
      rpcCapability: capability,
    });

    expect(snapshot.source.rpcCapability?.outsideLiquidity.warningCodes).toEqual(
      expect.arrayContaining(["rpc_failover_used"]),
    );
    expect(snapshot.source.rpcCapability?.outsideLiquidity.classification).toBe(
      "bounded_top_accounts_audit",
    );
    expect(snapshot.source.rpcCapability?.outsideLiquidity.indexedGpaSupported).toBe(false);

    const cached = { ...snapshot, ok: true as const };
    expect(isValidPublicStatsSnapshot(cached)).toBe(true);
  });
});

function launchedToken({
  mint,
}: {
  mint: PublicKey;
}): LaunchedToken {
  const curve = PublicKey.unique();
  const soul = PublicKey.unique();
  const bondingCurve: BondingCurveAccount = {
    mint,
    cumulativeSol: 0n,
    totalMinted: 0n,
    selfDeprecated: false,
    lastInteractionSlot: 0n,
  };
  const soulAccount: SoulAccount = {
    mint,
    authority: PublicKey.unique(),
    createdAt: 1_700_000_000n,
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
    memeSymbol: "PROP",
    memeSymbolBytes: new TextEncoder().encode("PROP"),
    memeSymbolLen: 4,
    targetAmm: TARGET_AMM.Raydium,
    provenanceGeneration: 0n,
    provenanceSide: 0,
    provenanceAmount: 0n,
    provenanceTokenAmount: 0n,
    provenanceTrader: PublicKey.default,
    provenanceTokenAccount: PublicKey.default,
    provenanceMint: PublicKey.default,
    provenanceSoul: PublicKey.default,
    provenanceSeedHash: new Uint8Array(8),
    provenanceSeedHashHex: "0000000000000000",
    artTheme: { id: "neonpuff", label: "NeonPuff Soul", renderer: "built-in" },
    latestGenerationProvenance: null,
  };
  return {
    curve,
    soul,
    mint,
    bondingCurve,
    soulAccount,
    createdAt: 1_700_000_000n,
  };
}
