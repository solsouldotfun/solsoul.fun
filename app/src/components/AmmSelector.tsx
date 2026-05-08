"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { TARGET_AMM, type TargetAmm } from "sdk";

export type AmmOptionId = "raydium" | "pump" | "meteora";

export type AmmOption = {
  id: AmmOptionId;
  value: TargetAmm;
  titleKey: `amm.${AmmOptionId}.title`;
  descriptionKey: `amm.${AmmOptionId}.description`;
};

export type AmmOptionLabels = Record<
  AmmOptionId,
  {
    title: string;
    description: string;
  }
>;

export type AmmSelectorProps = {
  value: number;
  onChange: (n: number) => void;
};

export type AmmSelectorViewProps = AmmSelectorProps & {
  groupLabel: string;
  labels: AmmOptionLabels;
};

export const AMM_OPTIONS: AmmOption[] = [
  {
    id: "raydium",
    value: TARGET_AMM.Raydium,
    titleKey: "amm.raydium.title",
    descriptionKey: "amm.raydium.description",
  },
];

export function AmmSelector({ value, onChange }: AmmSelectorProps) {
  const t = useTranslations();

  return (
    <AmmSelectorView
      value={value}
      onChange={onChange}
      groupLabel={t("amm.label")}
      labels={{
        raydium: {
          title: t("amm.raydium.title"),
          description: t("amm.raydium.description"),
        },
        pump: {
          title: t("amm.pump.title"),
          description: t("amm.pump.description"),
        },
        meteora: {
          title: t("amm.meteora.title"),
          description: t("amm.meteora.description"),
        },
      }}
    />
  );
}

export function AmmSelectorView({
  value: _value,
  onChange: _onChange,
  groupLabel: _groupLabel,
  labels: _labels,
}: AmmSelectorViewProps) {
  return null;
}
