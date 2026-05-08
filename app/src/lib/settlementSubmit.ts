import { type Connection, PublicKey } from "@solana/web3.js";
import {
  computeRequiredReceiptSettlement,
  fetchReceiptRegistryAccount,
  fetchSettlementReceiptCandidates,
  selectSettlementReceipts,
  type ReceiptSettlementState,
  type SelectedReceiptSettlement,
  type SettlementReceiptCandidate,
} from "sdk";

export type BoundarySettlementPreview =
  | {
      required: false;
      activeReceiptCount: bigint;
      postWholeUnits: bigint;
      selectedReceipts: [];
      state: ReceiptSettlementState;
    }
  | {
      required: true;
      activeReceiptCount: bigint;
      postWholeUnits: bigint;
      selectedReceipts: SettlementReceiptCandidate[];
      state: ReceiptSettlementState;
    };

export type BoundarySettlementExpectation = {
  preview: BoundarySettlementPreview;
  sourceTokenAccount: PublicKey;
  sourceTokenBalance: bigint;
};

export class SettlementPreviewMismatchError extends Error {
  constructor(message = "Settlement preview changed before signing.") {
    super(message);
    this.name = "SettlementPreviewMismatchError";
  }
}

export type ResolveBoundarySettlementParams = {
  connection: Connection;
  owner: PublicKey;
  mint: PublicKey;
  tokenAccountBalance: bigint;
  movementAmount: bigint;
  state?: ReceiptSettlementState;
  candidates?: SettlementReceiptCandidate[];
  activeReceiptCount?: bigint;
};

export async function resolveBoundarySettlement(
  params: ResolveBoundarySettlementParams,
): Promise<BoundarySettlementPreview> {
  const state = params.state ?? "burned";
  const [registryAccount, candidates] = await Promise.all([
    params.activeReceiptCount === undefined
      ? fetchReceiptRegistryAccount(params.connection, params.owner, params.mint)
      : Promise.resolve(null),
    params.candidates
      ? Promise.resolve(params.candidates)
      : fetchSettlementReceiptCandidates(params.connection, params.owner, params.mint),
  ]);
  const activeReceiptCount =
    params.activeReceiptCount ??
    registryAccount?.registry.activeReceipts ??
    BigInt(candidates.filter((candidate) => candidate.receipt.lifecycleState === "active").length);
  const required = computeRequiredReceiptSettlement({
    currentBalance: params.tokenAccountBalance,
    movementAmount: params.movementAmount,
    activeReceiptCount,
  });
  if (required.requiredCount === 0n) {
    return {
      required: false,
      activeReceiptCount,
      postWholeUnits: required.postWholeUnits,
      selectedReceipts: [],
      state,
    };
  }

  const selected: SelectedReceiptSettlement = selectSettlementReceipts({
    owner: params.owner,
    mint: params.mint,
    currentBalance: params.tokenAccountBalance,
    movementAmount: params.movementAmount,
    activeReceiptCount,
    candidates,
  });
  return {
    required: true,
    activeReceiptCount,
    postWholeUnits: selected.postWholeUnits,
    selectedReceipts: selected.selectedReceipts,
    state,
  };
}

export function assertBoundarySettlementExpectation(params: {
  expected?: BoundarySettlementExpectation;
  actual: BoundarySettlementPreview;
  actualSourceTokenAccount: PublicKey;
  actualSourceTokenBalance: bigint;
}) {
  if (!params.expected) {
    return;
  }

  const expected = params.expected;
  const sameSource = expected.sourceTokenAccount.equals(params.actualSourceTokenAccount);
  const sameBalance = expected.sourceTokenBalance === params.actualSourceTokenBalance;
  const sameRequired = expected.preview.required === params.actual.required;
  const sameState = expected.preview.state === params.actual.state;
  const sameActiveReceiptCount =
    expected.preview.activeReceiptCount === params.actual.activeReceiptCount;
  const samePostWholeUnits = expected.preview.postWholeUnits === params.actual.postWholeUnits;
  const expectedReceipts = expected.preview.selectedReceipts.map((receipt) =>
    receipt.receiptAccount.toBase58(),
  );
  const actualReceipts = params.actual.selectedReceipts.map((receipt) =>
    receipt.receiptAccount.toBase58(),
  );
  const sameReceipts =
    expectedReceipts.length === actualReceipts.length &&
    expectedReceipts.every((receipt, index) => receipt === actualReceipts[index]);

  if (
    !sameSource ||
    !sameBalance ||
    !sameRequired ||
    !sameState ||
    !sameActiveReceiptCount ||
    !samePostWholeUnits ||
    !sameReceipts
  ) {
    throw new SettlementPreviewMismatchError(
      "Settlement preview changed because the selected source token account or balance changed. Refresh the preview before signing.",
    );
  }
}

export function isSettlementPreviewMismatchError(
  error: unknown,
): error is SettlementPreviewMismatchError {
  return error instanceof SettlementPreviewMismatchError;
}

export function formatSettlementReceiptSet(
  selectedReceipts: readonly SettlementReceiptCandidate[],
): string {
  return selectedReceipts
    .map((candidate) => candidate.receiptAccount.toBase58())
    .join(", ");
}
