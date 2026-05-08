import { describe, expect, it } from "vitest";
import {
  OFFICIAL_DUST_DOMINANCE_RATIO_GATE,
  assertNoOfficialDominanceWording,
  isOfficialDustDominanceRatioEnabled,
} from "./index.js";

describe("PD18.F5 official dust dominance ratio gate", () => {
  it("defaults to gated/false until protocol coverage is complete", () => {
    expect(OFFICIAL_DUST_DOMINANCE_RATIO_GATE.enabled).toBe(false);
    expect(OFFICIAL_DUST_DOMINANCE_RATIO_GATE.status).toBe("gated");
    expect(OFFICIAL_DUST_DOMINANCE_RATIO_GATE.reason).toBe(
      "pd18_protocol_coverage_incomplete",
    );
    expect(isOfficialDustDominanceRatioEnabled()).toBe(false);
  });

  it("requires all three coverage prerequisites before enabling", () => {
    expect(OFFICIAL_DUST_DOMINANCE_RATIO_GATE.requiredCoverage).toEqual([
      "bonding_curve_sell_hard_binding_validated",
      "direct_transfer_hook_boundary_validated",
      "post_graduation_raydium_receipt_invariants_validated",
    ]);
  });

  it("returns false even when caller claims partial coverage while gate is closed", () => {
    expect(
      isOfficialDustDominanceRatioEnabled({
        bondingCurveSellHardBindingValidated: true,
        directTransferHookBoundaryValidated: true,
        postGraduationRaydiumReceiptInvariantsValidated: false,
      }),
    ).toBe(false);

    expect(
      isOfficialDustDominanceRatioEnabled({
        bondingCurveSellHardBindingValidated: true,
        directTransferHookBoundaryValidated: true,
        postGraduationRaydiumReceiptInvariantsValidated: true,
      }),
    ).toBe(false);
  });

  it("documents raw label that surfaces must use instead of an official ratio", () => {
    expect(OFFICIAL_DUST_DOMINANCE_RATIO_GATE.rawMetricLabel).toBe(
      "liquidity_dust_ratio",
    );
  });

  it("rejects forbidden public wording variants while gate is closed", () => {
    const variants = [
      "Official scarcity ratio: 0.0123",
      "OFFICIAL DUST DOMINANCE RATIO: 0.42",
      "Official Dominance Ratio for this token",
      "Scarcity proof ratio",
      "Official scarcity proof",
      "Single dust dominance ratio is 0.5",
    ];

    for (const text of variants) {
      expect(() => assertNoOfficialDominanceWording(text, "test fixture")).toThrow(
        /\[PD18\.F5\] test fixture contains gated official-dominance wording/,
      );
    }
  });

  it("permits raw/liquidity dust wording and explicit disclaimers", () => {
    expect(() =>
      assertNoOfficialDominanceWording(
        "Liquidity dust ratio is venue-local and not an official scarcity signal.",
        "raw copy",
      ),
    ).not.toThrow();

    expect(() =>
      assertNoOfficialDominanceWording(
        "Raw liquidity dust components are surfaced for analytics only.",
        "raw copy",
      ),
    ).not.toThrow();

  });
});
