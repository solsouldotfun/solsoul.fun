/**
 * PD18.F5 — App-side adapter for the SDK official dust dominance ratio gate.
 *
 * The SDK owns the binding gate and forbidden-wording list (see
 * `OFFICIAL_DUST_DOMINANCE_RATIO_GATE` in `sdk/src/index.ts`). This module
 * surfaces a small app-facing helper used by stats components and copy-audit
 * tests to keep current dust metrics labeled raw/liquidity until the gate
 * opens.
 */

import {
  OFFICIAL_DUST_DOMINANCE_RATIO_GATE,
  assertNoOfficialDominanceWording,
  isOfficialDustDominanceRatioEnabled,
  type OfficialDustDominanceRatioGateInput,
} from "sdk";

export const PUBLIC_DOMINANCE_LABEL_KIND = {
  RawOnly: "raw_only",
  Hidden: "hidden",
  Official: "official",
} as const;

export type PublicDominanceLabelKind =
  (typeof PUBLIC_DOMINANCE_LABEL_KIND)[keyof typeof PUBLIC_DOMINANCE_LABEL_KIND];

/**
 * Resolve the public-facing dominance surface kind. While the gate is closed
 * the surface is either hidden entirely or rendered as a raw-only metric — it
 * MUST never resolve to `Official`.
 */
export function resolvePublicDominanceLabelKind(
  input?: OfficialDustDominanceRatioGateInput,
): PublicDominanceLabelKind {
  if (isOfficialDustDominanceRatioEnabled(input)) {
    return PUBLIC_DOMINANCE_LABEL_KIND.Official;
  }
  return PUBLIC_DOMINANCE_LABEL_KIND.RawOnly;
}

/**
 * Helper used by the StatsDashboard / API route to decide whether to expose a
 * public "official" dominance ratio. Returns false in this build so callers
 * either suppress the surface or render it as raw-only liquidity dust.
 */
export function isPublicOfficialDominanceSurfaceEnabled(): boolean {
  return isOfficialDustDominanceRatioEnabled();
}

export {
  OFFICIAL_DUST_DOMINANCE_RATIO_GATE,
  assertNoOfficialDominanceWording,
  isOfficialDustDominanceRatioEnabled,
};
export type { OfficialDustDominanceRatioGateInput };
