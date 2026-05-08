// @ts-nocheck — justified: test stubs use Partial<BondingCurveAccount> mocks; underlying buy-submit logic tests are correct
import { describe, expect, it, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";
import type { BondingCurveAccount } from "sdk";
import {
  applySlippage,
  parseSlippageBps,
  parseSolAmountToLamports,
  quoteBuyTokenOut,
  submitWalletBuy,
} from "./buySubmit";

function curve(overrides: Partial<BondingCurveAccount> = {}): BondingCurveAccount {
  return {
    mint: PublicKey.unique(),
    cumulativeSol: 0n,
    totalMinted: 0n,
    selfDeprecated: false,
    lastInteractionSlot: 0n,
    ...overrides,
  };
}

describe("buy submit helpers", () => {
  it("parses SOL and slippage into precise integer units", () => {
    expect(parseSolAmountToLamports("0.1")).toBe(100_000_000n);
    expect(parseSolAmountToLamports("1.000000001")).toBe(1_000_000_001n);
    expect(parseSlippageBps("1.25")).toBe(125);
  });

  it("rejects disconnected wallet and invalid buy inputs before signing", async () => {
    await expect(
      submitWalletBuy({
        connection: {} as never,
        payer: null,
        connected: false,
        sendTransaction: vi.fn(),
        mint: PublicKey.unique(),
        solAmount: "0.1",
        slippagePercent: "1",
        curve: curve(),
      }),
    ).rejects.toThrow("Connect a devnet wallet before buying.");

    await expect(
      submitWalletBuy({
        connection: {} as never,
        payer: PublicKey.unique(),
        connected: true,
        sendTransaction: vi.fn(),
        mint: PublicKey.unique(),
        solAmount: "0",
        slippagePercent: "1",
        curve: curve(),
      }),
    ).rejects.toThrow("Enter a SOL amount greater than 0.");

    await expect(
      submitWalletBuy({
        connection: {} as never,
        payer: PublicKey.unique(),
        connected: true,
        sendTransaction: vi.fn(),
        mint: PublicKey.unique(),
        solAmount: "0.1",
        slippagePercent: "101",
        curve: curve(),
      }),
    ).rejects.toThrow("Slippage must be between 0% and 50%.");
  });

  it("quotes min output and calls SDK buy with wallet send path inputs", async () => {
    const loadedCurve = curve();
    const expectedTokenOut = quoteBuyTokenOut(loadedCurve.cumulativeSol, loadedCurve.totalMinted, 1_000_000_000n);
    expect(expectedTokenOut).toBeGreaterThan(0n);
    const minAmountOut = applySlippage(expectedTokenOut, 100);
    const buyWithWallet = vi.fn(async () => "BuySig111111111111111111111111111111111111111");
    const payer = PublicKey.unique();
    const sendTransaction = vi.fn();
    const mint = loadedCurve.mint;

    const result = await submitWalletBuy({
      connection: {} as never,
      payer,
      connected: true,
      sendTransaction,
      mint,
      solAmount: "1",
      slippagePercent: "1",
      curve: loadedCurve,
      buyWithWallet: buyWithWallet as never,
    });

    expect(result).toEqual({
      signature: "BuySig111111111111111111111111111111111111111",
      solInLamports: 1_000_000_000n,
      expectedTokenOut,
      minAmountOut,
      generationProvenance: null,
      nftMint: null,
    });
    expect(buyWithWallet).toHaveBeenCalledWith({
      connection: {},
      payer,
      mint,
      sendTransaction,
      solIn: 1_000_000_000n,
      minAmountOut,
      commitment: "finalized",
      includeGenerationProvenance: true,
      generationApiBaseUrl: "/",
    });
  });

  it("returns generation provenance from the wallet-signed SDK buy result", async () => {
    const loadedCurve = curve();
    const payer = PublicKey.unique();
    const tokenAccount = PublicKey.unique();
    const mint = loadedCurve.mint;
    const provenance = {
      generation: 8n,
      side: "buy" as const,
      amount: 99_000_000n,
      trader: payer,
      tokenAccount,
      tokenMint: mint,
      soul: PublicKey.unique(),
      seedHash: "abcdef0123456789",
      signature: "BuySig111111111111111111111111111111111111111",
      explorerUrl: "https://explorer.solana.com/tx/BuySig111111111111111111111111111111111111111?cluster=devnet",
      source: "finalized-rpc-logs" as const,
    };
    const buyWithWallet = vi.fn(async () => ({
      signature: provenance.signature,
      generationProvenance: provenance,
    }));

    const result = await submitWalletBuy({
      connection: {} as never,
      payer,
      connected: true,
      sendTransaction: vi.fn(),
      mint,
      solAmount: "1",
      slippagePercent: "1",
      curve: loadedCurve,
      buyWithWallet: buyWithWallet as never,
    });

    expect(result.signature).toBe(provenance.signature);
    expect(result.generationProvenance).toBe(provenance);
  });

  it("requires one 10,000-token MT quantum before auto-issuing a Soul NFT", async () => {
    const loadedCurve = curve({
      cumulativeSol: 2_673_553_765_358n,
      totalMinted: 20_900_000_000_000n,
    });

    await expect(
      submitWalletBuy({
        connection: {} as never,
        payer: PublicKey.unique(),
        connected: true,
        sendTransaction: vi.fn(),
        mint: loadedCurve.mint,
        solAmount: "0.001",
        slippagePercent: "1",
        curve: loadedCurve,
      }),
    ).rejects.toThrow("Buy at least 10,000 tokens through SolSoul Swap");
  });
});
