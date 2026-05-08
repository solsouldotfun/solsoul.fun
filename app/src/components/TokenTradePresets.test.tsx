import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BUY_PRESET_SOL_AMOUNTS,
  SELL_PRESET_PERCENTAGES,
  TokenTradePresetChips,
  deriveSellPresetAmount,
} from "./TokenTradePresets";

describe("TokenTradePresets", () => {
  it("publishes Uniswap-like buy preset SOL amounts", () => {
    expect(BUY_PRESET_SOL_AMOUNTS).toEqual(["0.05", "0.1", "0.5", "1"]);
  });

  it("derives sell preset amounts from confirmed wallet token balance", () => {
    const balance = 10_000_000_000n;

    expect(SELL_PRESET_PERCENTAGES).toEqual([25, 50, 75, 100]);
    expect(deriveSellPresetAmount(balance, 25)).toBe("2500.000000");
    expect(deriveSellPresetAmount(balance, 50)).toBe("5000.000000");
    expect(deriveSellPresetAmount(balance, 75)).toBe("7500.000000");
    expect(deriveSellPresetAmount(balance, 100)).toBe("10000.000000");
  });

  it("fails sell presets safely when balance data is unavailable or invalid", () => {
    expect(deriveSellPresetAmount(null, 25)).toBeNull();
    expect(deriveSellPresetAmount(undefined, 25)).toBeNull();
    expect(deriveSellPresetAmount(0n, 25)).toBeNull();
    expect(deriveSellPresetAmount(10_000_000_000n, 10)).toBeNull();
  });

  it("renders disabled fallback copy without selecting unavailable presets", () => {
    const markup = renderToStaticMarkup(
      <TokenTradePresetChips
        label="Quick sell"
        unavailableLabel="Connect wallet and wait for balance before quick sell presets."
        presets={[
          { key: "25", label: "25%", value: "", disabled: true },
          { key: "max", label: "Max", value: "", disabled: true },
        ]}
        onSelect={() => undefined}
      />,
    );

    expect(markup).toContain("Quick sell");
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
    expect(markup).toContain("Connect wallet and wait for balance before quick sell presets.");
  });
});
