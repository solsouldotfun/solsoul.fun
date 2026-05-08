import {
  PublicKey,
  type Connection,
  type Transaction,
} from "@solana/web3.js";
import type { SendTransactionOptions } from "@solana/wallet-adapter-base";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  settleReceiptsIx,
  transferCheckedWithHook,
  type ReceiptSettlementState,
  type SettlementReceiptCandidate,
} from "sdk";
import {
  discoverSellTokenAccount,
  formatTokenAmount,
  parseTokenAmountToBaseUnits,
} from "./sellSubmit";
import {
  assertBoundarySettlementExpectation,
  resolveBoundarySettlement,
  type BoundarySettlementExpectation,
  type BoundarySettlementPreview,
} from "./settlementSubmit";
import {
  formatPreSignPublicKeyLabel,
  withPreSignTransactionReview,
  type PreSignReceiptIntent,
  type PreSignReviewHandler,
} from "./preSignReview";

export type WalletSendTransaction = (
  transaction: Transaction,
  connection: Connection,
  options?: SendTransactionOptions,
) => Promise<string>;

export type DirectTransferWarningCode =
  | "directTransferBoundaryRejected"
  | "directTransferHookMetasMissing"
  | "directTransferRegistryMissing"
  | "directTransferUnsupportedHook"
  | "directTransferPreflightFailed";

export type SubmitWalletDirectTransferParams = {
  connection: Connection;
  payer: PublicKey | null;
  connected: boolean;
  sendTransaction: WalletSendTransaction;
  mint: PublicKey;
  recipientOwner: string;
  tokenAmount: string;
  transferWithHook?: typeof transferCheckedWithHook;
  settlementMode?: ReceiptSettlementState;
  settlementCandidates?: SettlementReceiptCandidate[];
  activeReceiptCount?: bigint;
  expectedSettlement?: BoundarySettlementExpectation;
  onPreSignReview?: PreSignReviewHandler;
};

export type SubmitWalletDirectTransferResult = {
  signature: string;
  amount: bigint;
  sourceTokenAccount: PublicKey;
  destinationTokenAccount: PublicKey;
  recipientOwner: PublicKey;
  settlement: BoundarySettlementPreview;
};

const TOKEN_DECIMALS = 6;

export async function submitWalletDirectTransfer(
  params: SubmitWalletDirectTransferParams,
): Promise<SubmitWalletDirectTransferResult> {
  if (!params.connected || !params.payer) {
    throw new Error("Connect a devnet wallet before transferring.");
  }

  const recipientOwner = parseRecipientOwner(params.recipientOwner);
  const amount = parseTokenAmountToBaseUnits(params.tokenAmount);
  const sourceTokenAccount = await discoverSellTokenAccount(
    params.connection,
    params.payer,
    params.mint,
    amount,
  );
  const destinationTokenAccount = getAssociatedTokenAddressSync(
    params.mint,
    recipientOwner,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const createDestinationAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    params.payer,
    destinationTokenAccount,
    recipientOwner,
    params.mint,
    TOKEN_2022_PROGRAM_ID,
  );
  const settlement = await resolveBoundarySettlement({
    connection: params.connection,
    owner: params.payer,
    mint: params.mint,
    tokenAccountBalance: sourceTokenAccount.amount,
    movementAmount: amount,
    state: params.settlementMode,
    candidates: params.settlementCandidates,
    activeReceiptCount: params.activeReceiptCount,
  });
  assertBoundarySettlementExpectation({
    expected: params.expectedSettlement,
    actual: settlement,
    actualSourceTokenAccount: sourceTokenAccount.pubkey,
    actualSourceTokenBalance: sourceTokenAccount.amount,
  });
  if (settlement.required && recipientOwner.equals(params.payer)) {
    throw new Error(
      "Boundary settlement transfers must send to a different wallet owner. Self-owned token-account moves do not reduce receipt-backed capacity.",
    );
  }
  const settlementIx = settlement.required
    ? settleReceiptsIx({
        authority: params.payer,
        tokenAccount: sourceTokenAccount.pubkey,
        tokenMint: params.mint,
        receipts: settlement.selectedReceipts.map((receipt) => receipt.receiptAccount),
        state: settlement.state,
        movementAmount: amount,
      })
    : null;
  const receiptIntent = buildSettlementReceiptIntent({
    settlement,
    movementAmount: amount,
    sourceTokenAccount: sourceTokenAccount.pubkey,
    sourceTokenBalance: sourceTokenAccount.amount,
  });
  const transfer = params.transferWithHook ?? transferCheckedWithHook;
  const signature = await transfer({
    connection: params.connection,
    payer: params.payer,
    mint: params.mint,
    source: sourceTokenAccount.pubkey,
    destination: destinationTokenAccount,
    authority: params.payer,
    amount,
    decimals: TOKEN_DECIMALS,
    sendTransaction: withPreSignTransactionReview(
      params.sendTransaction,
      params.onPreSignReview,
      receiptIntent,
    ),
    commitment: "finalized",
    preInstructions: settlementIx
      ? [settlementIx, createDestinationAtaIx]
      : [createDestinationAtaIx],
  });

  return {
    signature,
    amount,
    sourceTokenAccount: sourceTokenAccount.pubkey,
    destinationTokenAccount,
    recipientOwner,
    settlement,
  };
}

function buildSettlementReceiptIntent(params: {
  settlement: BoundarySettlementPreview;
  movementAmount: bigint;
  sourceTokenAccount: PublicKey;
  sourceTokenBalance: bigint;
}): PreSignReceiptIntent | undefined {
  if (!params.settlement.required) {
    return undefined;
  }

  return {
    state: params.settlement.state,
    movementAmountBaseUnits: params.movementAmount.toString(),
    sourceTokenAccount: formatPreSignPublicKeyLabel(
      params.sourceTokenAccount,
      "source-token",
    ),
    sourceTokenBalanceBaseUnits: params.sourceTokenBalance.toString(),
    activeReceiptCount: params.settlement.activeReceiptCount.toString(),
    postWholeUnits: params.settlement.postWholeUnits.toString(),
    selectedReceipts: params.settlement.selectedReceipts.map((receipt, index) =>
      formatPreSignPublicKeyLabel(receipt.receiptAccount, `receipt-${index + 1}`) ?? "receipt:unknown",
    ),
  };
}

export function classifyDirectTransferError(error: unknown): DirectTransferWarningCode {
  const message = errorMessage(error);
  const customCodes = extractCustomErrorCodes(message);
  if (customCodes.has(7004)) {
    return "directTransferBoundaryRejected";
  }
  if (customCodes.has(7000) || customCodes.has(7001)) {
    return "directTransferHookMetasMissing";
  }
  if (customCodes.has(7002) || customCodes.has(7003)) {
    return "directTransferRegistryMissing";
  }
  if (customCodes.has(7006) || customCodes.has(7007)) {
    return "directTransferUnsupportedHook";
  }
  if (/BoundaryBreakRejected|boundary-breaking|receipt-boundary|active_receipts/i.test(message)) {
    return "directTransferBoundaryRejected";
  }
  if (/validation account is missing|malformed extra-account|extra-account metas/i.test(message)) {
    return "directTransferHookMetasMissing";
  }
  if (/receipt registry|InvalidReceiptBinding|MissingBindingAccount/i.test(message)) {
    return "directTransferRegistryMissing";
  }
  if (/unsupported hook|does not match expected|without (?:a )?hook|does not have a Transfer Hook|legacy spl|not a Token-2022/i.test(message)) {
    return "directTransferUnsupportedHook";
  }
  return "directTransferPreflightFailed";
}

export function directTransferErrorMessage(
  code: DirectTransferWarningCode,
  messages: Record<DirectTransferWarningCode, string>,
): string {
  return messages[code];
}

function parseRecipientOwner(value: string): PublicKey {
  try {
    return new PublicKey(value.trim());
  } catch {
    throw new Error("Enter a valid recipient wallet address.");
  }
}

export function formatDirectTransferAmount(baseUnits: bigint): string {
  return formatTokenAmount(baseUnits);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
  } catch {
    return String(error);
  }
}

function extractCustomErrorCodes(message: string): Set<number> {
  const codes = new Set<number>();
  for (const match of message.matchAll(/custom program error:\s*0x([0-9a-f]+)/gi)) {
    codes.add(Number.parseInt(match[1]!, 16));
  }
  for (const match of message.matchAll(/"?Custom"?\s*[:=]\s*(\d+)/gi)) {
    codes.add(Number.parseInt(match[1]!, 10));
  }
  for (const match of message.matchAll(/\(custom\s+(\d+)\)/gi)) {
    codes.add(Number.parseInt(match[1]!, 10));
  }
  return codes;
}
