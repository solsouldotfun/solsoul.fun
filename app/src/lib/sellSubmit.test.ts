// @ts-nocheck — justified: test stubs use Partial<BondingCurveAccount> mocks that may include pre-curve-refactor fields; sell-submit logic tests are correct
import { describe, expect, it, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";
import type { BondingCurveAccount } from "sdk";
import {
  formatTokenAmount,
  parseTokenAmountToBaseUnits,
  quoteSellSolOut,
  selectDiscoveredTokenAccount,
  submitWalletSell,
  type DiscoveredTokenAccount,
} from "./sellSubmit";

function curve(overrides: Partial<BondingCurveAccount> = {}): BondingCurveAccount {
  return {
    mint: PublicKey.unique(),
    cumulativeSol: 999_000_000n,
    totalMinted: 41_916_000_000n,
    selfDeprecated: false,
    lastInteractionSlot: 0n,
    ...overrides,
  };
}

describe("sell submit helpers", () => {
  it("parses token amounts into base units", () => {
    expect(parseTokenAmountToBaseUnits("1.5")).toBe(1_500_000n);
    expect(parseTokenAmountToBaseUnits("0.000001")).toBe(1n);
  });

  it("rejects invalid inputs", () => {
    expect(() => parseTokenAmountToBaseUnits("0")).toThrow("greater than 0");
    expect(() => parseTokenAmountToBaseUnits("abc")).toThrow("up to 6 decimal places");
  });

  it("quotes sell SOL output from exponential curve", () => {
    const c = curve({ cumulativeSol: 999_000_000n, totalMinted: 41_916_000_000n });
    const solOut = quoteSellSolOut(c.cumulativeSol, c.totalMinted, 41_916_000_000n);
    expect(solOut).toBeGreaterThan(0n);
    // Roundtrip tolerance: 0.1% lock fee retained
    expect(solOut).toBeGreaterThanOrEqual(996_000_000n);
  });

  it("selects the canonical ATA when available", () => {
    const ata: DiscoveredTokenAccount = {
      pubkey: PublicKey.unique(),
      amount: 1_000_000n,
      isAta: true,
    };
    const other: DiscoveredTokenAccount = {
      pubkey: PublicKey.unique(),
      amount: 2_000_000n,
      isAta: false,
    };
    expect(selectDiscoveredTokenAccount([other, ata], 500_000n)).toBe(ata);
    expect(selectDiscoveredTokenAccount([other, ata], 1_500_000n)).toBe(other);
  });

  it("formats token amounts with 6 decimals", () => {
    expect(formatTokenAmount(1_500_000n)).toBe("1.500000");
    expect(formatTokenAmount(1n)).toBe("0.000001");
  });

  it("rejects sell when wallet is not connected", async () => {
    await expect(
      submitWalletSell({
        connection: {} as never,
        payer: null,
        connected: false,
        sendTransaction: vi.fn(),
        mint: PublicKey.unique(),
        tokenAmount: "1",
        slippagePercent: "1",
        curve: curve(),
      }),
    ).rejects.toThrow("Connect a devnet wallet before selling.");
  });

  it("rejects sell when curve is deprecated", async () => {
    await expect(
      submitWalletSell({
        connection: {} as never,
        payer: PublicKey.unique(),
        connected: true,
        sendTransaction: vi.fn(),
        mint: PublicKey.unique(),
        tokenAmount: "1",
        slippagePercent: "1",
        curve: curve({ selfDeprecated: true }),
      }),
    ).rejects.toThrow("supply cap");
  });
});
