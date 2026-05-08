import { describe, expect, it } from "vitest";
import {
  CURVE_K_BASE_UNITS,
  MAX_MT_SOUL_CLAIMS,
  MAX_BUY_SOL_LAMPORTS,
  MT_CLAIM_QUANTUM_BASE_UNITS,
  MT_SOUL_CAP_BASE_UNITS,
  estimateBuySolForTokenTarget,
  estimateSpotPriceSolPerToken,
  quoteBuyTokenOut,
  sampleCurveSpotPrices,
} from "./curveMath";

describe("curve math chart sampling", () => {
  it("samples finite increasing spot prices for the exponential curve", () => {
    const samples = sampleCurveSpotPrices(12);

    expect(samples).toHaveLength(12);
    expect(samples[0]?.totalMinted).toBe(0n);
    expect(samples.at(-1)?.totalMinted).toBeLessThan(CURVE_K_BASE_UNITS);
    expect(samples.every((sample) => Number.isFinite(sample.priceSolPerToken))).toBe(true);
    expect(samples.at(-1)?.priceSolPerToken ?? 0).toBeGreaterThan(
      samples[0]?.priceSolPerToken ?? 0,
    );
  });

  it("keeps MT marker math distinct from fungible supply math", () => {
    expect(MT_CLAIM_QUANTUM_BASE_UNITS).toBe(10_000_000_000n);
    expect(MAX_MT_SOUL_CLAIMS).toBe(2_100n);
    expect(MT_SOUL_CAP_BASE_UNITS).toBe(CURVE_K_BASE_UNITS);
  });

  it("rejects invalid spot-price inputs instead of producing misleading chart values", () => {
    expect(estimateSpotPriceSolPerToken(-1n)).toBeNull();
    expect(estimateSpotPriceSolPerToken(CURVE_K_BASE_UNITS)).toBeNull();
    expect(estimateSpotPriceSolPerToken(CURVE_K_BASE_UNITS - 1n)).toBeGreaterThan(0);
  });

  it("estimates the quick-buy SOL needed for one 10,000-token MT gate", () => {
    const estimate = estimateBuySolForTokenTarget({
      cumulativeSol: 0n,
      totalMinted: 0n,
      targetTokenOut: MT_CLAIM_QUANTUM_BASE_UNITS,
    });

    expect(estimate.grossSolInLamports).toBeGreaterThan(0n);
    expect(estimate.grossSolInLamports).toBeLessThan(MAX_BUY_SOL_LAMPORTS);
    expect(estimate.lockFeeLamports).toBeGreaterThan(0n);
    expect(estimate.estimatedTokenOut).toBeGreaterThanOrEqual(MT_CLAIM_QUANTUM_BASE_UNITS);
    expect(
      quoteBuyTokenOut(0n, 0n, estimate.grossSolInLamports),
    ).toBeGreaterThanOrEqual(MT_CLAIM_QUANTUM_BASE_UNITS);
  });

  it("subtracts existing confirmed wallet balance from the MT gate target", () => {
    const remainingToGate = MT_CLAIM_QUANTUM_BASE_UNITS / 4n;
    const fullGateEstimate = estimateBuySolForTokenTarget({
      cumulativeSol: 0n,
      totalMinted: 0n,
      targetTokenOut: MT_CLAIM_QUANTUM_BASE_UNITS,
    });
    const partialGateEstimate = estimateBuySolForTokenTarget({
      cumulativeSol: 0n,
      totalMinted: 0n,
      targetTokenOut: remainingToGate,
    });

    expect(partialGateEstimate.targetTokenOut).toBe(remainingToGate);
    expect(partialGateEstimate.grossSolInLamports).toBeLessThan(
      fullGateEstimate.grossSolInLamports,
    );
    expect(partialGateEstimate.estimatedTokenOut).toBeGreaterThanOrEqual(remainingToGate);
  });

  it("fails safely when quote or curve data cannot support a target estimate", () => {
    expect(() =>
      estimateBuySolForTokenTarget({
        cumulativeSol: 0n,
        totalMinted: 0n,
        targetTokenOut: 0n,
      }),
    ).toThrow(/token target/i);
    expect(() =>
      estimateBuySolForTokenTarget({
        cumulativeSol: 0n,
        totalMinted: CURVE_K_BASE_UNITS - 1n,
        targetTokenOut: 2n,
      }),
    ).toThrow(/supply/i);
  });
});
