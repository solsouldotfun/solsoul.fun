import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import * as sdk from "./index.js";

describe("receipt eligibility", () => {
  it("keeps boundary settlement selection deterministic across multi-boundary moves", () => {
    const owner = PublicKey.unique();
    const mint = PublicKey.unique();
    const soul = PublicKey.unique();
    const candidates = [
      receiptCandidate({ owner, mint, soul, sequence: 1n, boundary: sdk.MIN_CLAIM_BALANCE }),
      receiptCandidate({ owner, mint, soul, sequence: 3n, boundary: 3n * sdk.MIN_CLAIM_BALANCE }),
      receiptCandidate({ owner, mint, soul, sequence: 2n, boundary: 2n * sdk.MIN_CLAIM_BALANCE }),
    ];

    const selected = sdk.selectSettlementReceipts({
      owner,
      mint,
      currentBalance: 35_000_000_000n,
      movementAmount: 21_000_000_000n,
      activeReceiptCount: 3n,
      candidates: [...candidates].reverse(),
    });

    expect(selected).toMatchObject({
      preWholeUnits: 3n,
      postWholeUnits: 1n,
      crossedDown: 2n,
      requiredCount: 2n,
    });
    expect(selected.selectedReceipts.map((receipt) => receipt.receipt.boundBoundary)).toEqual([
      3n * sdk.MIN_CLAIM_BALANCE,
      2n * sdk.MIN_CLAIM_BALANCE,
    ]);
  });

  it("rejects missing, wrong, and repeated receipt eligibility attempts", () => {
    const owner = PublicKey.unique();
    const mint = PublicKey.unique();
    const soul = PublicKey.unique();
    const params = {
      owner,
      mint,
      currentBalance: 25_000_000_000n,
      movementAmount: 15_000_000_000n,
      activeReceiptCount: 2n,
    };

    expect(() =>
      sdk.selectSettlementReceipts({
        ...params,
        candidates: [receiptCandidate({ owner, mint, soul, sequence: 1n, boundary: sdk.MIN_CLAIM_BALANCE })],
      }),
    ).toThrow("missing active receipt for boundary 20000000000");
    expect(() =>
      sdk.selectSettlementReceipts({
        ...params,
        candidates: [
          receiptCandidate({
            owner,
            mint,
            soul,
            sequence: 2n,
            boundary: 2n * sdk.MIN_CLAIM_BALANCE,
            receiptAccount: PublicKey.unique(),
          }),
          receiptCandidate({ owner, mint, soul, sequence: 1n, boundary: sdk.MIN_CLAIM_BALANCE }),
        ],
      }),
    ).toThrow("is not the canonical PDA");
    expect(() =>
      sdk.selectSettlementReceipts({
        ...params,
        candidates: [
          receiptCandidate({
            owner,
            mint,
            soul,
            sequence: 2n,
            boundary: 2n * sdk.MIN_CLAIM_BALANCE,
            lifecycleState: "burned",
          }),
          receiptCandidate({ owner, mint, soul, sequence: 1n, boundary: sdk.MIN_CLAIM_BALANCE }),
        ],
      }),
    ).toThrow("missing active receipt for boundary 20000000000");
    expect(() =>
      sdk.selectSettlementReceipts({
        ...params,
        candidates: [
          receiptCandidate({
            owner,
            mint: PublicKey.unique(),
            soul,
            sequence: 2n,
            boundary: 2n * sdk.MIN_CLAIM_BALANCE,
          }),
          receiptCandidate({ owner, mint, soul, sequence: 1n, boundary: sdk.MIN_CLAIM_BALANCE }),
        ],
      }),
    ).toThrow("missing active receipt for boundary 20000000000");
  });
});

function receiptCandidate({
  owner,
  mint,
  soul,
  sequence,
  boundary,
  receiptAccount = sdk.deriveReceiptPda(soul, sequence),
  lifecycleState = "active",
}: {
  owner: PublicKey;
  mint: PublicKey;
  soul: PublicKey;
  sequence: bigint;
  boundary: bigint;
  receiptAccount?: PublicKey;
  lifecycleState?: sdk.ReceiptLifecycleState;
}): sdk.SettlementReceiptCandidate {
  const data = new Uint8Array(sdk.RECEIPT_ACCOUNT_SIZE);
  data.set(soul.toBytes(), sdk.RECEIPT_SOUL_OFFSET);
  data.set(owner.toBytes(), sdk.RECEIPT_CLAIMANT_OFFSET);
  data.set(mint.toBytes(), sdk.RECEIPT_TOKEN_MINT_OFFSET);
  data.set(PublicKey.unique().toBytes(), sdk.RECEIPT_NFT_MINT_OFFSET);
  writeU64ForTest(data, sequence, sdk.RECEIPT_SEQUENCE_OFFSET);
  writeU64ForTest(data, sequence + 1n, sdk.RECEIPT_GENERATION_COUNT_OFFSET);
  writeU64ForTest(data, sdk.MIN_CLAIM_BALANCE, sdk.RECEIPT_BOUND_QUANTITY_OFFSET);
  writeU64ForTest(data, boundary, sdk.RECEIPT_BOUND_BOUNDARY_OFFSET);
  data[sdk.RECEIPT_LIFECYCLE_STATE_OFFSET] =
    lifecycleState === "active"
      ? sdk.RECEIPT_LIFECYCLE_STATE.Active
      : lifecycleState === "burned"
        ? sdk.RECEIPT_LIFECYCLE_STATE.Burned
        : sdk.RECEIPT_LIFECYCLE_STATE.Forfeited;
  return {
    receiptAccount,
    receipt: sdk.decodeReceiptAccount(data),
  };
}

function writeU64ForTest(data: Uint8Array, value: bigint, offset: number): void {
  for (let i = 0; i < 8; i += 1) {
    data[offset + i] = Number((value >> (BigInt(i) * 8n)) & 0xffn);
  }
}
