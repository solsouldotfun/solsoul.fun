import { describe, expect, it, vi } from "vitest";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TARGET_AMM } from "sdk";
import {
  buildDevnetLaunchPayload,
  submitInitializeSoulPreview,
  submitWalletLaunch,
  submitWalletTemplateUpload,
} from "../lib/launchSubmit";

describe("LaunchForm submit payload helpers", () => {
  it("pins the devnet launch POST payload to Raydium", () => {
    expect(
      buildDevnetLaunchPayload({
        name: "  Raydium Soul  ",
        symbol: "MET",
        templateSvg: "<svg></svg>",
        targetAmm: TARGET_AMM.Raydium,
      }),
    ).toEqual({
      action: "launch",
      name: "Raydium Soul",
      symbol: "MET",
      templateSvg: "<svg></svg>",
      target_amm: TARGET_AMM.Raydium,
    });
  });

  it("rejects non-Raydium values before building a devnet launch POST payload", () => {
    expect(() =>
      buildDevnetLaunchPayload({
        name: "  Pump Soul  ",
        symbol: "PMP",
        templateSvg: "<svg></svg>",
        targetAmm: TARGET_AMM.Pump,
      }),
    ).toThrow("Only the fixed legacy Raydium target_amm is accepted");
  });

  it("sends the fixed Raydium targetAmm to the mocked SDK initializeSoul call", () => {
    const initializeSoul = vi.fn(
      () =>
        new TransactionInstruction({
          programId: SystemProgram.programId,
          keys: [],
          data: Buffer.alloc(0),
        }),
    );
    const mint = PublicKey.unique();
    const authority = PublicKey.unique();

    submitInitializeSoulPreview({
      initializeSoul,
      mint,
      authority,
      createdAt: 1_714_200_000n,
      symbol: "RAY",
      targetAmm: TARGET_AMM.Raydium,
    });

    expect(initializeSoul).toHaveBeenCalledWith({
      mint,
      authority,
      createdAt: 1_714_200_000n,
      symbol: "RAY",
      targetAmm: TARGET_AMM.Raydium,
    });
  });

  it("rejects non-Raydium initialize previews before calling the SDK", () => {
    const initializeSoul = vi.fn(
      () =>
        new TransactionInstruction({
          programId: SystemProgram.programId,
          keys: [],
          data: Buffer.alloc(0),
        }),
    );

    expect(() =>
      submitInitializeSoulPreview({
        initializeSoul,
        mint: PublicKey.unique(),
        authority: PublicKey.unique(),
        createdAt: 1_714_200_000n,
        symbol: "MET",
        targetAmm: TARGET_AMM.Meteora,
      }),
    ).toThrow("Only the fixed legacy Raydium target_amm is accepted");

    expect(initializeSoul).not.toHaveBeenCalled();
  });

  it("submits public launch through the wallet-signed launch path", async () => {
    const launchTokenWithWallet = vi.fn(async () => ({
      signature: "WalletLaunchSig1111111111111111111111111111",
      mint: PublicKey.unique(),
      curve: PublicKey.unique(),
      vault: PublicKey.unique(),
      soul: PublicKey.unique(),
      targetAmm: TARGET_AMM.Raydium,
      symbol: "REAL",
    }));
    const connection = {};
    const payer = PublicKey.unique();
    const sendTransaction = vi.fn();

    const result = await submitWalletLaunch({
      connection: connection as never,
      payer,
      sendTransaction,
      symbol: "REAL",
      targetAmm: TARGET_AMM.Raydium,
      launchTokenWithWallet,
    });

    expect(launchTokenWithWallet).toHaveBeenCalledWith({
      connection,
      payer,
      sendTransaction,
      symbol: "REAL",
      targetAmm: TARGET_AMM.Raydium,
      commitment: "finalized",
    });
    expect(result.signature).toBe("WalletLaunchSig1111111111111111111111111111");
  });

  it("rejects non-Raydium wallet launches before calling the SDK", async () => {
    const launchTokenWithWallet = vi.fn(async () => ({
      signature: "WalletLaunchSig1111111111111111111111111111",
      mint: PublicKey.unique(),
      curve: PublicKey.unique(),
      vault: PublicKey.unique(),
      soul: PublicKey.unique(),
      targetAmm: TARGET_AMM.Pump,
      symbol: "PUMP",
    }));

    await expect(
      submitWalletLaunch({
        connection: {} as never,
        payer: PublicKey.unique(),
        sendTransaction: vi.fn(),
        symbol: "PUMP",
        targetAmm: TARGET_AMM.Pump,
        launchTokenWithWallet,
      }),
    ).rejects.toThrow("Only the fixed legacy Raydium target_amm is accepted");

    expect(launchTokenWithWallet).not.toHaveBeenCalled();
  });

  it("submits template upload as a second wallet-signed transaction", async () => {
    const uploadTemplateWithWallet = vi.fn(async () => "TemplateSig1111111111111111111111111111111111");
    const connection = {};
    const payer = PublicKey.unique();
    const mint = PublicKey.unique();
    const sendTransaction = vi.fn();
    const template = '<svg data-kind="pd9"><rect fill="{{HUE}}" /></svg>';

    const signature = await submitWalletTemplateUpload({
      connection: connection as never,
      payer,
      mint,
      template,
      sendTransaction,
      uploadTemplateWithWallet,
    });

    expect(uploadTemplateWithWallet).toHaveBeenCalledWith({
      connection,
      payer,
      mint,
      template,
      styleParams: "mode=hsl;evolution=3",
      sendTransaction,
      commitment: "finalized",
      programIds: undefined,
    });
    expect(signature).toBe("TemplateSig1111111111111111111111111111111111");
  });

  it("rejects unsafe template uploads before wallet signing", async () => {
    const uploadTemplateWithWallet = vi.fn(async () => "TemplateSig1111111111111111111111111111111111");

    await expect(
      submitWalletTemplateUpload({
        connection: {} as never,
        payer: PublicKey.unique(),
        mint: PublicKey.unique(),
        template: '<svg><script>alert("xss")</script></svg>',
        sendTransaction: vi.fn(),
        uploadTemplateWithWallet,
      }),
    ).rejects.toThrow("Template SVG failed safety validation");

    expect(uploadTemplateWithWallet).not.toHaveBeenCalled();
  });
});
