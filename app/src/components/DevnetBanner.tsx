"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { uiPrimitives } from "./uiPrimitives";

/**
 * Pure presentational banner for devnet/testnet environments.
 * Exported separately so vitest can snapshot it without env mocking.
 */
export function DevnetBannerView({ visible, label }: { visible: boolean; label: string }) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className={uiPrimitives.banner}
      role="status"
      aria-live="polite"
    >
      {label}
    </div>
  );
}

/**
 * Reads NEXT_PUBLIC_ENV at render time.
 * Banner is ALWAYS visible when NEXT_PUBLIC_ENV=devnet — no feature flag gating.
 */
export function DevnetBanner() {
  const t = useTranslations("shared.devnetBanner");
  const isDevnet = process.env.NEXT_PUBLIC_ENV === "devnet";
  return <DevnetBannerView visible={isDevnet} label={t("label")} />;
}
