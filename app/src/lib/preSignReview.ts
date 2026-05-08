import { type Connection, type PublicKey, type Transaction } from "@solana/web3.js";
import type { SendTransactionOptions } from "@solana/wallet-adapter-base";

export type PreSignReceiptIntent = {
  state: string;
  movementAmountBaseUnits: string;
  sourceTokenAccount?: string;
  sourceTokenBalanceBaseUnits?: string;
  activeReceiptCount?: string;
  postWholeUnits?: string;
  selectedReceipts: string[];
};

export type PreSignInstructionAccountReview = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

export type PreSignInstructionReview = {
  index: number;
  programId: string;
  accounts: PreSignInstructionAccountReview[];
};

export type PreSignTransactionReview = {
  cluster: "devnet";
  feePayer: string | null;
  recentBlockhash: string | null;
  instructions: PreSignInstructionReview[];
  receiptIntent?: PreSignReceiptIntent;
};

export type PreSignReviewHandler = (
  review: PreSignTransactionReview,
  transaction: Transaction,
) => void | Promise<void>;

export type WalletSendTransaction = (
  transaction: Transaction,
  connection: Connection,
  options?: SendTransactionOptions,
) => Promise<string>;

export function buildPreSignTransactionReview(
  transaction: Transaction,
  receiptIntent?: PreSignReceiptIntent,
): PreSignTransactionReview {
  return {
    cluster: "devnet",
    feePayer: formatPreSignPublicKeyLabel(transaction.feePayer, "fee-payer") ?? null,
    recentBlockhash: transaction.recentBlockhash ?? null,
    instructions: transaction.instructions.map((instruction, index) => ({
      index,
      programId: instruction.programId.toBase58(),
      accounts: instruction.keys.map((key) => ({
        pubkey: formatPreSignPublicKeyLabel(key.pubkey, "account") ?? "account:unknown",
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      })),
    })),
    ...(receiptIntent ? { receiptIntent } : {}),
  };
}

export function withPreSignTransactionReview(
  sendTransaction: WalletSendTransaction,
  onPreSignReview?: PreSignReviewHandler,
  receiptIntent?: PreSignReceiptIntent,
): WalletSendTransaction {
  if (!onPreSignReview) {
    return sendTransaction;
  }

  return async (transaction, connection, options) => {
    await onPreSignReview(
      buildPreSignTransactionReview(transaction, receiptIntent),
      transaction,
    );
    return sendTransaction(transaction, connection, options);
  };
}

export function formatPreSignPublicKeyLabel(
  value: PublicKey | null | undefined,
  label: string,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const encoded = String(value);
  return `${label}:${encoded.slice(0, 4)}…${encoded.slice(-4)}`;
}
