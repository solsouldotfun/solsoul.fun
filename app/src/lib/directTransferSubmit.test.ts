// @ts-nocheck — justified: test mocks use wallet-adapter and transaction types; direct-transfer logic tests are correct
import { describe, expect, it, vi } from "vitest";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  SETTLE_RECEIPTS_DISCRIMINATOR,
  MIN_CLAIM_BALANCE,
  decodeReceiptAccount,
  deriveReceiptPda,
  RECEIPT_ACCOUNT_SIZE,
  RECEIPT_BOUND_BOUNDARY_OFFSET,
  RECEIPT_CLAIMANT_OFFSET,
  RECEIPT_LIFECYCLE_STATE,
  RECEIPT_LIFECYCLE_STATE_OFFSET,
  RECEIPT_NFT_MINT_OFFSET,
  RECEIPT_SEQUENCE_OFFSET,
  RECEIPT_SOUL_OFFSET,
  RECEIPT_TOKEN_MINT_OFFSET,
  type SettlementReceiptCandidate,
} from "sdk";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import {
  classifyDirectTransferError,
  directTransferErrorMessage,
  submitWalletDirectTransfer,
  type DirectTransferWarningCode,
} from "./directTransferSubmit";
import { formatPreSignPublicKeyLabel } from "./preSignReview";

function parsedTokenAccount(pubkey: PublicKey, mint: PublicKey, amount: bigint) {
  return {
    pubkey,
    account: {
      data: {
        parsed: {
          info: {
            mint: mint.toBase58(),
            tokenAmount: { amount: amount.toString(), decimals: 6 },
          },
        },
      },
    },
  };
}

function writeU64(data: Uint8Array, value: bigint, offset: number) {
  new DataView(data.buffer).setBigUint64(offset, value, true);
}

function receiptCandidate({
  owner,
  mint,
  soul,
  sequence,
  boundary,
}: {
  owner: PublicKey;
  mint: PublicKey;
  soul: PublicKey;
  sequence: bigint;
  boundary: bigint;
}): SettlementReceiptCandidate {
  const data = new Uint8Array(RECEIPT_ACCOUNT_SIZE);
  data.set(soul.toBytes(), RECEIPT_SOUL_OFFSET);
  data.set(owner.toBytes(), RECEIPT_CLAIMANT_OFFSET);
  data.set(mint.toBytes(), RECEIPT_TOKEN_MINT_OFFSET);
  data.set(PublicKey.unique().toBytes(), RECEIPT_NFT_MINT_OFFSET);
  writeU64(data, sequence, RECEIPT_SEQUENCE_OFFSET);
  writeU64(data, boundary, RECEIPT_BOUND_BOUNDARY_OFFSET);
  data[RECEIPT_LIFECYCLE_STATE_OFFSET] = RECEIPT_LIFECYCLE_STATE.Active;
  return {
    receiptAccount: deriveReceiptPda(soul, sequence),
    receipt: decodeReceiptAccount(data),
  };
}

describe("direct transfer submit helpers", () => {
  it("builds a hook-aware wallet transfer with destination ATA creation", async () => {
    const mint = PublicKey.unique();
    const payer = Keypair.generate().publicKey;
    const recipient = Keypair.generate().publicKey;
    const sourceTokenAccount = PublicKey.unique();
    const sendTransaction = vi.fn();
    const transferWithHook = vi.fn(async () => "TransferSig111111111111111111111111111111111");
    const connection = {
      getParsedTokenAccountsByOwner: vi.fn(async () => ({
        value: [parsedTokenAccount(sourceTokenAccount, mint, 2_000_000n)],
      })),
    };

    const result = await submitWalletDirectTransfer({
      connection: connection as never,
      payer,
      connected: true,
      sendTransaction,
      mint,
      recipientOwner: recipient.toBase58(),
      tokenAmount: "1",
      transferWithHook: transferWithHook as never,
      activeReceiptCount: 0n,
      settlementCandidates: [],
    });

    expect(result.signature).toBe("TransferSig111111111111111111111111111111111");
    expect(result.amount).toBe(1_000_000n);
    expect(result.sourceTokenAccount.equals(sourceTokenAccount)).toBe(true);
    expect(result.recipientOwner.equals(recipient)).toBe(true);
    expect(connection.getParsedTokenAccountsByOwner).toHaveBeenCalledWith(
      payer,
      { programId: TOKEN_2022_PROGRAM_ID },
      "confirmed",
    );
    expect(transferWithHook).toHaveBeenCalledWith(
      expect.objectContaining({
        connection,
        payer,
        mint,
        source: sourceTokenAccount,
        destination: result.destinationTokenAccount,
        authority: payer,
        amount: 1_000_000n,
        decimals: 6,
        sendTransaction,
        commitment: "finalized",
        preInstructions: expect.any(Array),
      }),
    );
  });

  it("prepends settlement before hook transfer when crossing a receipt boundary", async () => {
    const mint = PublicKey.unique();
    const payer = Keypair.generate().publicKey;
    const recipient = Keypair.generate().publicKey;
    const soul = PublicKey.unique();
    const sourceTokenAccount = PublicKey.unique();
    const selectedReceipt = receiptCandidate({
      owner: payer,
      mint,
      soul,
      sequence: 2n,
      boundary: 2n * MIN_CLAIM_BALANCE,
    });
    const transferWithHook = vi.fn(async () => "TransferSigSettlement11111111111111111111111");
    const connection = {
      getParsedTokenAccountsByOwner: vi.fn(async () => ({
        value: [parsedTokenAccount(sourceTokenAccount, mint, 25_000_000_000n)],
      })),
    };

    const result = await submitWalletDirectTransfer({
      connection: connection as never,
      payer,
      connected: true,
      sendTransaction: vi.fn(),
      mint,
      recipientOwner: recipient.toBase58(),
      tokenAmount: "10000.000001",
      transferWithHook: transferWithHook as never,
      settlementMode: "burned",
      activeReceiptCount: 2n,
      settlementCandidates: [
        selectedReceipt,
        receiptCandidate({ owner: payer, mint, soul, sequence: 1n, boundary: MIN_CLAIM_BALANCE }),
      ],
    });

    expect(result.settlement).toMatchObject({ required: true, state: "burned" });
    const call = (transferWithHook as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .at(0)?.[0] as {
      preInstructions: { data: Uint8Array }[];
    };
    expect(call.preInstructions).toHaveLength(2);
    expect(Array.from(call.preInstructions[0]!.data.slice(0, 2))).toEqual([
      SETTLE_RECEIPTS_DISCRIMINATOR,
      RECEIPT_LIFECYCLE_STATE.Burned,
    ]);
  });

  it("blocks self-owned boundary settlement transfers before invoking wallet signing", async () => {
    const mint = PublicKey.unique();
    const payer = Keypair.generate().publicKey;
    const soul = PublicKey.unique();
    const sourceTokenAccount = PublicKey.unique();
    const selectedReceipt = receiptCandidate({
      owner: payer,
      mint,
      soul,
      sequence: 1n,
      boundary: MIN_CLAIM_BALANCE,
    });
    const transferWithHook = vi.fn(async () => "TransferSigShouldNotBeCalled111111111111111");
    const connection = {
      getParsedTokenAccountsByOwner: vi.fn(async () => ({
        value: [parsedTokenAccount(sourceTokenAccount, mint, MIN_CLAIM_BALANCE)],
      })),
    };

    await expect(
      submitWalletDirectTransfer({
        connection: connection as never,
        payer,
        connected: true,
        sendTransaction: vi.fn(),
        mint,
        recipientOwner: payer.toBase58(),
        tokenAmount: "0.000001",
        transferWithHook: transferWithHook as never,
        settlementMode: "burned",
        activeReceiptCount: 1n,
        settlementCandidates: [selectedReceipt],
      }),
    ).rejects.toThrow("Self-owned token-account moves do not reduce receipt-backed capacity");
    expect(transferWithHook).not.toHaveBeenCalled();
  });

  it("blocks signing when source-account settlement requirements differ from the displayed preview", async () => {
    const mint = PublicKey.unique();
    const payer = Keypair.generate().publicKey;
    const recipient = Keypair.generate().publicKey;
    const soul = PublicKey.unique();
    const sourceTokenAccount = PublicKey.unique();
    const selectedReceipt = receiptCandidate({
      owner: payer,
      mint,
      soul,
      sequence: 2n,
      boundary: 2n * MIN_CLAIM_BALANCE,
    });
    const transferWithHook = vi.fn(async () => "TransferSigShouldNotBeCalled111111111111111");
    const connection = {
      getParsedTokenAccountsByOwner: vi.fn(async () => ({
        value: [parsedTokenAccount(sourceTokenAccount, mint, 25_000_000_000n)],
      })),
    };

    await expect(
      submitWalletDirectTransfer({
        connection: connection as never,
        payer,
        connected: true,
        sendTransaction: vi.fn(),
        mint,
        recipientOwner: recipient.toBase58(),
        tokenAmount: "10000.000001",
        transferWithHook: transferWithHook as never,
        settlementMode: "burned",
        activeReceiptCount: 2n,
        settlementCandidates: [
          selectedReceipt,
          receiptCandidate({ owner: payer, mint, soul, sequence: 1n, boundary: MIN_CLAIM_BALANCE }),
        ],
        expectedSettlement: {
          sourceTokenAccount,
          sourceTokenBalance: 3_500_000n,
          preview: {
            required: false,
            activeReceiptCount: 2n,
            postWholeUnits: 2n,
            selectedReceipts: [],
            state: "burned",
          },
        },
      }),
    ).rejects.toThrow("Settlement preview changed");
    expect(transferWithHook).not.toHaveBeenCalled();
  });

  it("captures a decoded devnet pre-sign review with receipt intent before Phantom signing", async () => {
    const mint = PublicKey.unique();
    const payer = Keypair.generate().publicKey;
    const recipient = Keypair.generate().publicKey;
    const soul = PublicKey.unique();
    const sourceTokenAccount = PublicKey.unique();
    const selectedReceipt = receiptCandidate({
      owner: payer,
      mint,
      soul,
      sequence: 2n,
      boundary: 2n * MIN_CLAIM_BALANCE,
    });
    const sendTransaction = vi.fn(async () => "TransferSigReviewed111111111111111111111111111");
    const onPreSignReview = vi.fn();
    const transferWithHook = vi.fn(async (params) => {
      const tx = new Transaction({
        feePayer: payer,
        recentBlockhash: "11111111111111111111111111111111",
      }).add(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: recipient,
          lamports: 1,
        }),
      );
      return params.sendTransaction(tx, params.connection);
    });
    const connection = {
      getParsedTokenAccountsByOwner: vi.fn(async () => ({
        value: [parsedTokenAccount(sourceTokenAccount, mint, 25_000_000_000n)],
      })),
    };

    await submitWalletDirectTransfer({
      connection: connection as never,
      payer,
      connected: true,
      sendTransaction,
      mint,
      recipientOwner: recipient.toBase58(),
      tokenAmount: "10000.000001",
      transferWithHook: transferWithHook as never,
      settlementMode: "burned",
      activeReceiptCount: 2n,
      settlementCandidates: [
        selectedReceipt,
        receiptCandidate({ owner: payer, mint, soul, sequence: 1n, boundary: MIN_CLAIM_BALANCE }),
      ],
      onPreSignReview,
    });

    expect(onPreSignReview).toHaveBeenCalledOnce();
    expect(onPreSignReview.mock.calls[0]?.[0]).toMatchObject({
      cluster: "devnet",
      feePayer: formatPreSignPublicKeyLabel(payer, "fee-payer"),
      recentBlockhash: "11111111111111111111111111111111",
      receiptIntent: {
        state: "burned",
        movementAmountBaseUnits: "10000000001",
        sourceTokenBalanceBaseUnits: "25000000000",
        activeReceiptCount: "2",
        postWholeUnits: "1",
        selectedReceipts: [
          formatPreSignPublicKeyLabel(selectedReceipt.receiptAccount, "receipt-1"),
        ],
      },
      instructions: [
        {
          index: 0,
          programId: SystemProgram.programId.toBase58(),
          accounts: expect.arrayContaining([
            expect.objectContaining({
              pubkey: formatPreSignPublicKeyLabel(payer, "account"),
              isSigner: true,
              isWritable: true,
            }),
          ]),
        },
      ],
    });
    expect(sendTransaction).toHaveBeenCalledOnce();
  });

  it("propagates user-cancelled Phantom prompts without retrying another signer", async () => {
    const mint = PublicKey.unique();
    const payer = Keypair.generate().publicKey;
    const recipient = Keypair.generate().publicKey;
    const sourceTokenAccount = PublicKey.unique();
    const sendTransaction = vi.fn(async () => {
      throw new Error("User rejected the request.");
    });
    const transferWithHook = vi.fn(async (params) => {
      const tx = new Transaction({
        feePayer: payer,
        recentBlockhash: "11111111111111111111111111111111",
      }).add(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: recipient,
          lamports: 1,
        }),
      );
      return params.sendTransaction(tx, params.connection);
    });
    const connection = {
      getParsedTokenAccountsByOwner: vi.fn(async () => ({
        value: [parsedTokenAccount(sourceTokenAccount, mint, 2_000_000n)],
      })),
    };

    await expect(
      submitWalletDirectTransfer({
        connection: connection as never,
        payer,
        connected: true,
        sendTransaction,
        mint,
        recipientOwner: recipient.toBase58(),
        tokenAmount: "1",
        transferWithHook: transferWithHook as never,
        activeReceiptCount: 0n,
        settlementCandidates: [],
      }),
    ).rejects.toThrow("User rejected the request.");

    expect(sendTransaction).toHaveBeenCalledOnce();
    expect(transferWithHook).toHaveBeenCalledOnce();
  });

  it("rejects disconnected, invalid recipient, and insufficient balance before signing", async () => {
    const mint = PublicKey.unique();
    const payer = PublicKey.unique();
    const sendTransaction = vi.fn();
    const transferWithHook = vi.fn();
    const connection = {
      getParsedTokenAccountsByOwner: vi.fn(async () => ({ value: [] })),
    };

    await expect(
      submitWalletDirectTransfer({
        connection: connection as never,
        payer: null,
        connected: false,
        sendTransaction,
        mint,
        recipientOwner: PublicKey.unique().toBase58(),
        tokenAmount: "1",
        transferWithHook: transferWithHook as never,
      }),
    ).rejects.toThrow("Connect a devnet wallet before transferring.");

    await expect(
      submitWalletDirectTransfer({
        connection: connection as never,
        payer,
        connected: true,
        sendTransaction,
        mint,
        recipientOwner: "not-a-public-key",
        tokenAmount: "1",
        transferWithHook: transferWithHook as never,
      }),
    ).rejects.toThrow("valid recipient wallet");

    await expect(
      submitWalletDirectTransfer({
        connection: connection as never,
        payer,
        connected: true,
        sendTransaction,
        mint,
        recipientOwner: PublicKey.unique().toBase58(),
        tokenAmount: "1",
        transferWithHook: transferWithHook as never,
      }),
    ).rejects.toThrow("Insufficient token balance");
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(transferWithHook).not.toHaveBeenCalled();
  });

  it("classifies hook policy and account-resolution failures for localized UX", () => {
    expect(classifyDirectTransferError(new Error("BoundaryBreakRejected"))).toBe(
      "directTransferBoundaryRejected",
    );
    expect(
      classifyDirectTransferError(
        new Error(
          'Hook-aware transfer preflight failed: {"InstructionError":[0,{"Custom":7004}]}\nSimulation logs:\nProgram log: SolSoul Transfer Hook: rejecting boundary-breaking transfer active_receipts=1 post_whole=0',
        ),
      ),
    ).toBe("directTransferBoundaryRejected");
    expect(
      classifyDirectTransferError(
        new Error("Hook-aware transfer preflight failed: custom program error: 0x1b5c"),
      ),
    ).toBe("directTransferBoundaryRejected");
    expect(
      classifyDirectTransferError(new Error("Transfer Hook validation account is missing")),
    ).toBe("directTransferHookMetasMissing");
    expect(
      classifyDirectTransferError(new Error("missing source-owner receipt registry meta")),
    ).toBe("directTransferRegistryMissing");
    expect(
      classifyDirectTransferError(
        new Error(
          'Hook-aware transfer preflight failed: {"InstructionError":[0,{"Custom":7003}]}',
        ),
      ),
    ).toBe("directTransferRegistryMissing");
    expect(
      classifyDirectTransferError(
        new Error("Hook-aware transfer preflight failed: custom program error: 0x1b5b"),
      ),
    ).toBe("directTransferRegistryMissing");
    expect(
      classifyDirectTransferError(
        new Error("Hook-aware transfer preflight failed: custom program error: 0x1b58"),
      ),
    ).toBe("directTransferHookMetasMissing");
    expect(
      classifyDirectTransferError(
        new Error("Transfer Hook error context: InvalidValidationAccount (custom 7001)"),
      ),
    ).toBe("directTransferHookMetasMissing");
    expect(
      classifyDirectTransferError(
        new Error("Transfer Hook error context: InvalidTransferHookConfig (custom 7006)"),
      ),
    ).toBe("directTransferUnsupportedHook");
    expect(
      classifyDirectTransferError(new Error("Token-2022 mint does not have a Transfer Hook extension")),
    ).toBe("directTransferUnsupportedHook");

    expect(
      directTransferErrorMessage("directTransferBoundaryRejected", {
        directTransferBoundaryRejected: "Boundary blocked",
        directTransferHookMetasMissing: "Metas missing",
        directTransferRegistryMissing: "Registry missing",
        directTransferUnsupportedHook: "Unsupported hook",
        directTransferPreflightFailed: "Preflight failed",
      }),
    ).toBe("Boundary blocked");
    expect(
      directTransferErrorMessage("directTransferBoundaryRejected", {
        directTransferBoundaryRejected:
          "Transfer rejected by receipt-boundary policy. Keep enough whole tokens for active receipts.",
        directTransferHookMetasMissing: "Metas missing",
        directTransferRegistryMissing: "Registry missing",
        directTransferUnsupportedHook: "Unsupported hook",
        directTransferPreflightFailed: "Preflight failed",
      }),
    ).not.toBe("Preflight failed");
    expect(
      directTransferErrorMessage("directTransferRegistryMissing", {
        directTransferBoundaryRejected: "Boundary blocked",
        directTransferHookMetasMissing: "Metas missing",
        directTransferRegistryMissing:
          "Source-owner receipt registry is missing or unreadable. Claim/receipt state must be available before direct transfer.",
        directTransferUnsupportedHook: "Unsupported hook",
        directTransferPreflightFailed: "Preflight failed",
      }),
    ).not.toBe("Preflight failed");
  });

  it("maps realistic preflight custom errors to localized EN/ZH warnings instead of generic fallback", () => {
    const cases: Array<{
      error: Error;
      code: DirectTransferWarningCode;
      englishFragment: string;
      chineseFragment: string;
    }> = [
      {
        error: new Error(
          'Hook-aware transfer preflight failed: {"InstructionError":[0,{"Custom":7004}]}\nTransfer Hook error context: BoundaryBreakRejected (custom 7004)\nSimulation logs:\nProgram log: SolSoul Transfer Hook: rejecting boundary-breaking transfer active_receipts=1 post_whole=0',
        ),
        code: "directTransferBoundaryRejected",
        englishFragment: "receipt-boundary policy",
        chineseFragment: "收据边界策略",
      },
      {
        error: new Error(
          'Hook-aware transfer preflight failed: {"InstructionError":[0,{"Custom":7003}]}\nTransfer Hook error context: InvalidReceiptBinding (custom 7003)\nSimulation logs:\nProgram log: custom program error: 0x1b5b',
        ),
        code: "directTransferRegistryMissing",
        englishFragment: "Claim and receipt state is unavailable",
        chineseFragment: "领取与收据状态暂不可用",
      },
    ];

    for (const testCase of cases) {
      const code = classifyDirectTransferError(testCase.error);
      expect(code).toBe(testCase.code);
      const englishMessage = directTransferErrorMessage(code, directTransferMessages(en));
      const chineseMessage = directTransferErrorMessage(code, directTransferMessages(zh));

      expect(englishMessage).toContain(testCase.englishFragment);
      expect(chineseMessage).toContain(testCase.chineseFragment);
      expect(englishMessage).not.toBe(
        en.token.directTransfer.warnings.directTransferPreflightFailed,
      );
      expect(chineseMessage).not.toBe(
        zh.token.directTransfer.warnings.directTransferPreflightFailed,
      );
      expect(englishMessage).not.toMatch(/custom program error|Simulation logs|RPC/i);
      expect(chineseMessage).not.toMatch(/custom program error|Simulation logs|RPC/i);
    }
  });
});

function directTransferMessages(
  bundle: typeof en,
): Record<DirectTransferWarningCode, string> {
  return bundle.token.directTransfer.warnings;
}
