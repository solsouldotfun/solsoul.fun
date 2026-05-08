"use client";

import { formatTokenAmount } from "@/lib/tokenFormatting";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

export const BUY_PRESET_SOL_AMOUNTS = ["0.05", "0.1", "0.5", "1"] as const;
export const SELL_PRESET_PERCENTAGES = [25, 50, 75, 100] as const;

export type TradePreset = {
  key: string;
  label: string;
  value: string;
  helper?: string;
  disabled?: boolean;
};

export function deriveSellPresetAmount(
  balanceBaseUnits: bigint | null | undefined,
  percentage: number,
): string | null {
  if (balanceBaseUnits === undefined || balanceBaseUnits === null || balanceBaseUnits <= 0n) {
    return null;
  }
  if (!SELL_PRESET_PERCENTAGES.includes(percentage as (typeof SELL_PRESET_PERCENTAGES)[number])) {
    return null;
  }

  const amount = (balanceBaseUnits * BigInt(percentage)) / 100n;
  if (amount <= 0n) {
    return null;
  }
  return formatTokenAmount(amount);
}

export function TokenTradePresetChips({
  label,
  presets,
  unavailableLabel,
  onSelect,
}: {
  label: string;
  presets: TradePreset[];
  unavailableLabel?: string | null;
  onSelect: (value: string) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            aria-label={preset.helper ? `${preset.label} — ${preset.helper}` : preset.label}
            className={joinClasses(
              uiPrimitives.buttonSecondary,
              "rounded-full px-3 py-2 text-xs",
              preset.disabled ? "cursor-not-allowed opacity-45" : "",
            )}
            disabled={preset.disabled}
            key={preset.key}
            onClick={() => onSelect(preset.value)}
            type="button"
          >
            {preset.label}
          </button>
        ))}
      </div>
      {unavailableLabel ? (
        <p className="text-xs leading-5 text-white/45" role="status">
          {unavailableLabel}
        </p>
      ) : null}
    </fieldset>
  );
}
