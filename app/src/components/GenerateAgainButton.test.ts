// @ts-nocheck — justified: test references GenerateAgainButton graduation-mode props (graduated/direct-generation) that are preserved in the component
// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGenerateAgainDisabledReason, syntheticSwapAmount } from "./GenerateAgainButton";
import { GenerateAgainButton } from "./GenerateAgainButton";
import { generateSoul } from "sdk";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  connection: {
    rpcEndpoint: "https://api.devnet.solana.com",
  },
  publicKey: undefined as unknown as PublicKey,
  sendTransaction: vi.fn(async () => "GenerateWalletSig1111111111111111111111111111"),
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useConnection: () => ({ connection: mocks.connection }),
  useWallet: () => ({
    connected: true,
    publicKey: mocks.publicKey,
    sendTransaction: mocks.sendTransaction,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const messages: Record<string, string> = {
      button: "Generate another Soul",
      generating: "Opening wallet…",
      errorFallback: "Generation failed",
      "errors.walletRejected": "Generation was not signed. Approve the wallet request when you are ready.",
      "errors.validation": "Generation cannot be submitted yet.",
      "errors.settlement": "Generation evidence changed before signing.",
      "errors.rpcUnavailable": "Generation could not reach devnet reliably. Nothing changed; retry after the network recovers.",
      "errors.submissionFailed": "Generation did not complete. Nothing changed; retry or inspect technical details if it repeats.",
      "disabled.paused": "Protocol paused",
      "disabled.notGraduated": "Graduation required",
      "disabled.connectWallet": "Connect wallet",
      success: `Generated with wallet signature ${values?.signature ?? ""}`,
      ariaLabel: "Pre-sign decoded transaction review",
      title: "Pre-sign decoded transaction review",
      summary: `Cluster: ${values?.cluster ?? ""}; blockhash: ${values?.blockhash ?? ""}; fee payer: ${values?.feePayer ?? ""}`,
      pending: "pending",
      programIds: `Program IDs: ${values?.programIds ?? ""}`,
      instructionTitle: `#${values?.index ?? ""} Program ${values?.programId ?? ""}`,
      accounts: `Accounts: ${values?.accounts ?? ""}`,
      receiptIntentTitle: "Receipt settlement intent",
      receiptIntentBody: `${values?.state ?? ""} ${values?.amount ?? ""} base units from ${values?.source ?? ""}.`,
      unknownSource: "unknown source",
      unknown: "unknown",
      receiptCapacity: `Active receipts: ${values?.activeReceiptCount ?? ""}; post-move whole-token capacity: ${values?.postWholeUnits ?? ""}.`,
      selectedReceipts: `Selected receipts: ${values?.receipts ?? ""}`,
      none: "none",
      "flags.signer": "signer",
      "flags.nonSigner": "non-signer",
      "flags.writable": "writable",
      "flags.readonly": "readonly",
    };
    return messages[key] ?? key;
  },
}));

vi.mock("./PauseBanner", () => ({
  usePauseStatus: () => ({ isPaused: false }),
}));

vi.mock("sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sdk")>();
  return {
    ...actual,
    generateSoul: vi.fn(async (params: {
      connection: unknown;
      payer: PublicKey;
      sendTransaction: (
        transaction: Transaction,
        connection: unknown,
      ) => Promise<string>;
    }) => {
      const transaction = new Transaction({
        feePayer: params.payer,
        recentBlockhash: "11111111111111111111111111111111",
      }).add(
        new TransactionInstruction({
          programId: SystemProgram.programId,
          keys: [{ pubkey: params.payer, isSigner: true, isWritable: true }],
          data: Buffer.alloc(0),
        }),
      );
      return params.sendTransaction(transaction, params.connection);
    }),
  };
});

const generateSoulMock = vi.mocked(generateSoul);

describe("getGenerateAgainDisabledReason", () => {
  it("requires graduation before enabling direct generation", () => {
    expect(
      getGenerateAgainDisabledReason({ connected: true, hasPublicKey: true, selfDeprecated: false }),
    ).toBe("notGraduated");
  });

  it("requires a connected wallet once graduated", () => {
    expect(
      getGenerateAgainDisabledReason({ connected: false, hasPublicKey: false, selfDeprecated: true }),
    ).toBe("connectWallet");
  });

  it("allows direct generation when graduated and wallet is connected", () => {
    expect(
      getGenerateAgainDisabledReason({ connected: true, hasPublicKey: true, selfDeprecated: true }),
    ).toBeNull();
  });
});

describe("syntheticSwapAmount", () => {
  it("mixes the generation and timestamp into a deterministic positive amount", () => {
    expect(syntheticSwapAmount(5n, 1_700_000_000_000)).toBe((1_700_000_000_000n << 16n) ^ 5n);
  });
});

describe("GenerateAgainButton wallet path", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mocks.publicKey = PublicKey.unique();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.sendTransaction.mockClear();
    generateSoulMock.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("keeps post-graduation generation wallet-signed with decoded devnet safety copy and no retired smoke fallback", async () => {
    const mint = PublicKey.unique();
    const onSuccess = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(GenerateAgainButton, {
          mint,
          selfDeprecated: true,
    nextGeneration: 9n,
          onSuccess,
        }),
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });

    expect(generateSoulMock).toHaveBeenCalledWith(expect.objectContaining({
      connection: mocks.connection,
      mint,
      payer: mocks.publicKey,
      sendTransaction: expect.any(Function),
      isBuy: true,
      commitment: "confirmed",
    }));
    expect(mocks.sendTransaction).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/devnet-smoke",
      expect.objectContaining({ method: "POST" }),
    );
    expect(container.textContent).toContain("Generated with wallet signature");
    expect(container.textContent).toContain("GenerateWalletSig1111111111111111111111111111");
    expect(onSuccess).toHaveBeenCalledWith("GenerateWalletSig1111111111111111111111111111");

    const review = container.querySelector<HTMLElement>(
      '[data-testid="generate-again-pre-sign-transaction-review"]',
    );
    expect(review).not.toBeNull();
    expect(review?.textContent).toContain("Pre-sign decoded transaction review");
    expect(review?.textContent).toContain("Cluster: devnet");
    expect(review?.textContent).toContain("Program IDs:");
    expect(review?.textContent).not.toContain("mainnet");
  });

  it("classifies generation failures without rendering raw RPC or program details", async () => {
    const rawFailure =
      "HTTP 429 from devnet RPC: Transaction simulation failed: custom program error: 0x1";
    generateSoulMock.mockRejectedValueOnce(new Error(rawFailure));

    await act(async () => {
      root.render(
        React.createElement(GenerateAgainButton, {
          mint: PublicKey.unique(),
          selfDeprecated: true,
          nextGeneration: 10n,
        }),
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Generation could not reach devnet reliably",
    );
    expect(container.textContent).not.toContain(rawFailure);
    expect(container.textContent).not.toContain("custom program error");
    expect(container.textContent).not.toContain("HTTP 429");
  });
});
