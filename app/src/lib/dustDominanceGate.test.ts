import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  OFFICIAL_DUST_DOMINANCE_RATIO_GATE,
  PUBLIC_DOMINANCE_LABEL_KIND,
  assertNoOfficialDominanceWording,
  isOfficialDustDominanceRatioEnabled,
  isPublicOfficialDominanceSurfaceEnabled,
  resolvePublicDominanceLabelKind,
} from "./dustDominanceGate";

function readAppFile(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    "utf8",
  );
}

describe("PD18.F5 dust dominance gate (app surface)", () => {
  it("re-exports the SDK gate with a closed default", () => {
    expect(OFFICIAL_DUST_DOMINANCE_RATIO_GATE.enabled).toBe(false);
    expect(OFFICIAL_DUST_DOMINANCE_RATIO_GATE.status).toBe("gated");
    expect(isOfficialDustDominanceRatioEnabled()).toBe(false);
    expect(isPublicOfficialDominanceSurfaceEnabled()).toBe(false);
  });

  it("resolves the public dominance surface to raw_only while gated", () => {
    expect(resolvePublicDominanceLabelKind()).toBe(
      PUBLIC_DOMINANCE_LABEL_KIND.RawOnly,
    );

    // Even with caller-claimed full coverage the gate stays closed — the
    // master enable flag is the only path to `Official`.
    expect(
      resolvePublicDominanceLabelKind({
        bondingCurveSellHardBindingValidated: true,
        directTransferHookBoundaryValidated: true,
        postGraduationRaydiumReceiptInvariantsValidated: true,
      }),
    ).toBe(PUBLIC_DOMINANCE_LABEL_KIND.RawOnly);
  });

  it("rejects affirmative 'official scarcity / dominance ratio' wording in EN/ZH messages", () => {
    const en = readAppFile("messages/en.json");
    const zh = readAppFile("messages/zh.json");

    expect(() => assertNoOfficialDominanceWording(en, "messages/en.json")).not.toThrow();
    expect(() => assertNoOfficialDominanceWording(zh, "messages/zh.json")).not.toThrow();
  });

  it("rejects affirmative 'official scarcity / dominance ratio' wording in StatsDashboard component", () => {
    const dashboard = readAppFile("src/components/StatsDashboard.tsx");
    expect(() => assertNoOfficialDominanceWording(dashboard, "StatsDashboard.tsx")).not.toThrow();
  });

  it("preserves raw/liquidity dust labels in EN/ZH messages", () => {
    const en = JSON.parse(readAppFile("messages/en.json")) as Record<string, unknown>;
    const zh = JSON.parse(readAppFile("messages/zh.json")) as Record<string, unknown>;

    function get(messages: Record<string, unknown>, dotted: string): string {
      const value = dotted
        .split(".")
        .reduce<unknown>(
          (current, part) =>
            current && typeof current === "object"
              ? (current as Record<string, unknown>)[part]
              : undefined,
          messages,
        );
      expect(typeof value).toBe("string");
      return value as string;
    }

    expect(get(en, "stats.dust.eyebrow").toLowerCase()).toContain("raw");
    expect(get(en, "stats.dust.fields.liquidity_dust_ratio.label").toLowerCase()).toContain(
      "liquidity dust ratio",
    );
    expect(get(en, "stats.dust.fields.liquidity_dust_ratio.help").toLowerCase()).toContain(
      "not an official scarcity signal",
    );

    expect(get(zh, "stats.dust.eyebrow")).toContain("原始");
    expect(get(zh, "stats.dust.fields.liquidity_dust_ratio.help")).toContain(
      "不是官方稀缺性信号",
    );
  });

  it("does not expose an 'official_dust_dominance_ratio' or 'official_scarcity_ratio' field in the public stats schema", () => {
    const stats = readAppFile("src/lib/stats.ts");
    const statsRoute = readAppFile("src/lib/statsRoute.ts");
    const cache = readAppFile("src/lib/publicStatsCache.ts");

    for (const [label, body] of [
      ["stats.ts", stats],
      ["statsRoute.ts", statsRoute],
      ["publicStatsCache.ts", cache],
    ] as const) {
      const lower = body.toLowerCase();
      expect(lower, `${label} must not declare official_scarcity_ratio`).not.toContain(
        "official_scarcity_ratio",
      );
      expect(
        lower,
        `${label} must not declare official_dust_dominance_ratio`,
      ).not.toContain("official_dust_dominance_ratio");
      expect(
        lower,
        `${label} must not declare official_dominance_ratio`,
      ).not.toContain("official_dominance_ratio");
    }
  });

  it("declares the three coverage prerequisites that must be validated before opening the gate", () => {
    expect(OFFICIAL_DUST_DOMINANCE_RATIO_GATE.requiredCoverage).toEqual([
      "bonding_curve_sell_hard_binding_validated",
      "direct_transfer_hook_boundary_validated",
      "post_graduation_raydium_receipt_invariants_validated",
    ]);
    expect(OFFICIAL_DUST_DOMINANCE_RATIO_GATE.validatedCoverage).toEqual([]);
  });

  it("hides any official ratio surface (negative fixture: gate closed)", () => {
    // Negative fixture: when invariants are *claimed* by callers but the gate
    // master flag is closed, the public dominance surface MUST resolve to
    // raw-only and the `enabled` predicate MUST stay false.
    const claimedFullCoverage = {
      bondingCurveSellHardBindingValidated: true,
      directTransferHookBoundaryValidated: true,
      postGraduationRaydiumReceiptInvariantsValidated: true,
    } as const;

    expect(isOfficialDustDominanceRatioEnabled(claimedFullCoverage)).toBe(false);
    expect(resolvePublicDominanceLabelKind(claimedFullCoverage)).toBe(
      PUBLIC_DOMINANCE_LABEL_KIND.RawOnly,
    );
  });
});
