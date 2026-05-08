/**
 * PD15.A1 / PD15.A2 characterization tests — SDK legacy Raydium target_amm guard.
 *
 * These tests pin down the SDK-level invariant that the fixed legacy Raydium
 * target_amm byte is the only accepted write-path metadata. AMM selection and
 * migration are historical/deferred; PumpSwap and Meteora remain decode-only.
 */
import { describe, expect, it } from "vitest";
import {
  ACTIVE_TARGET_AMM,
  ACTIVE_TARGET_AMM_LABEL,
  TARGET_AMM,
} from "./index.js";

describe("PD15 — SDK legacy target_amm constant is pinned to Raydium metadata", () => {
  it("ACTIVE_TARGET_AMM equals TARGET_AMM.Raydium (0)", () => {
    expect(ACTIVE_TARGET_AMM).toBe(TARGET_AMM.Raydium);
    expect(ACTIVE_TARGET_AMM).toBe(0);
  });

  it("ACTIVE_TARGET_AMM_LABEL is 'raydium'", () => {
    expect(ACTIVE_TARGET_AMM_LABEL).toBe("raydium");
  });

  it("TARGET_AMM enum has exactly three members: Raydium=0, Pump=1, Meteora=2", () => {
    expect(TARGET_AMM.Raydium).toBe(0);
    expect(TARGET_AMM.Pump).toBe(1);
    expect(TARGET_AMM.Meteora).toBe(2);
    expect(Object.keys(TARGET_AMM).sort()).toEqual(["Meteora", "Pump", "Raydium"]);
  });
});
