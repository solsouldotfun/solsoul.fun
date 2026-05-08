import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "./index.js";

describe("receipt-backed claimed Soul lookup", () => {
  it("lists active receipts by claimer and keeps inactive receipts out of active views", async () => {
    const { soul } = sdk.findMintWithNoBumpPdas();
    const claimer = PublicKey.unique();
    const tokenMint = PublicKey.unique();
    const activeReceipt = receiptAccountData({
      soul,
      claimant: claimer,
      tokenMint,
      nftMint: PublicKey.unique(),
      sequence: 0n,
      lifecycleState: "active",
    });
    const burnedReceipt = receiptAccountData({
      soul,
      claimant: claimer,
      tokenMint,
      nftMint: PublicKey.unique(),
      sequence: 2n,
      lifecycleState: "burned",
    });
    const accounts = [activeReceipt, burnedReceipt].map((data) => ({
      pubkey: PublicKey.unique(),
      account: {
        data: Buffer.from(data),
      },
    }));
    const connection = {
      getProgramAccounts: vi.fn(async (_programId: PublicKey, config: unknown) => {
        expect(config).toMatchObject({
          filters: [
            { dataSize: sdk.RECEIPT_ACCOUNT_SIZE },
            { memcmp: { offset: sdk.RECEIPT_CLAIMANT_OFFSET, bytes: claimer.toBase58() } },
          ],
        });
        return accounts;
      }),
      getAccountInfo: vi.fn(async () => null),
    } as unknown as Parameters<typeof sdk.listClaimedSoulNftsByClaimer>[0];

    const page = await sdk.listClaimedSoulNftsByClaimer(connection, claimer, {
      fetchMetadata: true,
      pageSize: 10,
    });

    expect(page.total).toBe(1);
    expect(page.items.map((item) => item.sequence)).toEqual([0n]);
    expect(page.items.every((item) => item.claimer.equals(claimer))).toBe(true);
    expect(page.items.every((item) => item.tokenMint?.equals(tokenMint))).toBe(true);
    expect(page.items.every((item) => item.metadata === null)).toBe(true);
    expect(page.items[0]?.receiptLifecycleState).toBe("active");
    expect(page.items[0]?.receipt?.lifecycleState).toBe("active");
  });

  it("can include burned and forfeited receipts for auditable history", async () => {
    const { soul } = sdk.findMintWithNoBumpPdas();
    const claimer = PublicKey.unique();
    const tokenMint = PublicKey.unique();
    const accounts = (["active", "burned", "forfeited"] as const).map((lifecycleState, index) => ({
      pubkey: PublicKey.unique(),
      account: {
        data: Buffer.from(receiptAccountData({
          soul,
          claimant: claimer,
          tokenMint,
          nftMint: PublicKey.unique(),
          sequence: BigInt(index),
          lifecycleState,
        })),
      },
    }));
    const connection = {
      getProgramAccounts: vi.fn(async () => accounts),
      getAccountInfo: vi.fn(async () => null),
    } as unknown as Parameters<typeof sdk.listClaimedSoulNftsByClaimer>[0];

    const page = await sdk.listClaimedSoulNftsByClaimer(connection, claimer, {
      fetchMetadata: false,
      receiptLifecycle: "all",
      pageSize: 10,
    });

    expect(page.total).toBe(3);
    expect(page.items.map((item) => item.receiptLifecycleState)).toEqual([
      "forfeited",
      "burned",
      "active",
    ]);
    expect(page.items.filter((item) => item.receiptLifecycleState === "active")).toHaveLength(1);
  });

  it("mirrors the claimed SoulAccount theme when token metadata is unavailable", async () => {
    const { soul } = sdk.findMintWithNoBumpPdas();
    const claimer = PublicKey.unique();
    const tokenMint = PublicKey.unique();
    const receipt = {
      pubkey: PublicKey.unique(),
      account: {
        data: Buffer.from(receiptAccountData({
          soul,
          claimant: claimer,
          tokenMint,
          nftMint: PublicKey.unique(),
          sequence: 0n,
          lifecycleState: "active",
        })),
      },
    };
    const connection = {
      getProgramAccounts: vi.fn(async () => [receipt]),
      getAccountInfo: vi.fn(async (address: PublicKey) =>
        address.equals(soul)
          ? {
              data: Buffer.from(soulAccountData({
                mint: tokenMint,
                styleParams: "theme=soulpuff",
                generationCount: 1n,
              })),
            }
          : null,
      ),
    } as unknown as Parameters<typeof sdk.listClaimedSoulNftsByClaimer>[0];

    const page = await sdk.listClaimedSoulNftsByClaimer(connection, claimer, {
      fetchMetadata: true,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.tokenMint?.toBase58()).toBe(tokenMint.toBase58());
    expect(page.items[0]?.receiptAccount?.toBase58()).toBe(receipt.pubkey.toBase58());
    expect(page.items[0]?.metadata).toBeNull();
    expect(page.items[0]?.soulAccount?.artTheme).toEqual({
      id: "legacy",
      label: "Legacy / unknown art theme",
      renderer: "built-in",
    });
  });
});

function receiptAccountData({
  soul,
  claimant,
  tokenMint,
  nftMint,
  sequence,
  lifecycleState,
}: {
  soul: PublicKey;
  claimant: PublicKey;
  tokenMint: PublicKey;
  nftMint: PublicKey;
  sequence: bigint;
  lifecycleState: sdk.ReceiptLifecycleState;
}): Uint8Array {
  const data = new Uint8Array(sdk.RECEIPT_ACCOUNT_SIZE);
  data.set(soul.toBytes(), sdk.RECEIPT_SOUL_OFFSET);
  data.set(claimant.toBytes(), sdk.RECEIPT_CLAIMANT_OFFSET);
  data.set(tokenMint.toBytes(), sdk.RECEIPT_TOKEN_MINT_OFFSET);
  data.set(nftMint.toBytes(), sdk.RECEIPT_NFT_MINT_OFFSET);
  writeU64ForTest(data, sequence, sdk.RECEIPT_SEQUENCE_OFFSET);
  writeU64ForTest(data, sequence + 1n, sdk.RECEIPT_GENERATION_COUNT_OFFSET);
  writeU64ForTest(data, sdk.MIN_CLAIM_BALANCE, sdk.RECEIPT_BOUND_QUANTITY_OFFSET);
  writeU64ForTest(data, sequence + 1n, sdk.RECEIPT_BOUND_BOUNDARY_OFFSET);
  data[sdk.RECEIPT_LIFECYCLE_STATE_OFFSET] =
    lifecycleState === "active"
      ? sdk.RECEIPT_LIFECYCLE_STATE.Active
      : lifecycleState === "burned"
        ? sdk.RECEIPT_LIFECYCLE_STATE.Burned
        : sdk.RECEIPT_LIFECYCLE_STATE.Forfeited;
  return data;
}

function claimData({
  soul,
  claimer,
  nftMint,
  sequence,
}: {
  soul: PublicKey;
  claimer: PublicKey;
  nftMint: PublicKey;
  sequence: bigint;
}): Uint8Array {
  const data = new Uint8Array(sdk.CLAIM_ACCOUNT_SIZE);
  data.set(soul.toBytes(), sdk.CLAIM_SOUL_OFFSET);
  data.set(claimer.toBytes(), sdk.CLAIM_CLAIMER_OFFSET);
  data.set(nftMint.toBytes(), sdk.CLAIM_NFT_MINT_OFFSET);
  writeU64ForTest(data, sequence, sdk.CLAIM_SEQUENCE_OFFSET);
  writeU64ForTest(data, sequence + 1n, sdk.CLAIM_GENERATION_COUNT_OFFSET);
  return data;
}

function soulAccountData({
  mint,
  styleParams,
  generationCount,
}: {
  mint: PublicKey;
  styleParams: string;
  generationCount: bigint;
}): Uint8Array {
  const data = new Uint8Array(sdk.SOUL_ACCOUNT_SIZE);
  const authority = PublicKey.unique();
  const svg = '<svg data-soul="pd12-soulpuff"><circle /></svg>';
  const symbol = "PUFF";
  data.set(mint.toBytes(), 0);
  data.set(authority.toBytes(), 32);
  writeI64ForTest(data, 1n, 64);
  writeU64ForTest(data, generationCount, 72);
  writeU16ForTest(data, svg.length, 80);
  data.set(new TextEncoder().encode(svg), sdk.LAST_SVG_OFFSET);
  writeU16ForTest(data, styleParams.length, sdk.STYLE_PARAMS_LEN_OFFSET);
  data.set(new TextEncoder().encode(styleParams), sdk.STYLE_PARAMS_OFFSET);
  writeU64ForTest(data, sdk.MIN_CLAIM_BALANCE, sdk.MIN_CLAIM_BALANCE_OFFSET);
  writeU64ForTest(data, 0n, sdk.CLAIM_COUNT_OFFSET);
  data.set(new TextEncoder().encode(symbol), sdk.MEME_SYMBOL_OFFSET);
  data[sdk.MEME_SYMBOL_LEN_OFFSET] = symbol.length;
  data[sdk.SOUL_TARGET_AMM_OFFSET] = sdk.TARGET_AMM.Raydium;
  writeU64ForTest(data, generationCount, sdk.SOUL_PROVENANCE_GENERATION_OFFSET);
  data[sdk.SOUL_PROVENANCE_SIDE_OFFSET] = sdk.SOUL_PROVENANCE_SIDE.Buy;
  writeU64ForTest(data, 990_000n, sdk.SOUL_PROVENANCE_AMOUNT_OFFSET);
  data.set(PublicKey.unique().toBytes(), sdk.SOUL_PROVENANCE_TRADER_OFFSET);
  data.set(PublicKey.unique().toBytes(), sdk.SOUL_PROVENANCE_TOKEN_ACCOUNT_OFFSET);
  data.set(mint.toBytes(), sdk.SOUL_PROVENANCE_MINT_OFFSET);
  data.set(PublicKey.unique().toBytes(), sdk.SOUL_PROVENANCE_SOUL_OFFSET);
  data.set([1, 2, 3, 4, 5, 6, 7, 8], sdk.SOUL_PROVENANCE_SEED_HASH_OFFSET);
  return data;
}

function writeU16ForTest(data: Uint8Array, value: number, offset: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
}

function writeI64ForTest(data: Uint8Array, value: bigint, offset: number): void {
  writeU64ForTest(data, value, offset);
}

function writeU64ForTest(data: Uint8Array, value: bigint, offset: number): void {
  for (let i = 0; i < 8; i += 1) {
    data[offset + i] = Number((value >> (BigInt(i) * 8n)) & 0xffn);
  }
}
