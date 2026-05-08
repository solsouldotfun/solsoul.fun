import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { EventStore } from "./db.js";
import { RECEIPT_ACCOUNT_SIZE } from "./events.js";
import {
  DEFAULT_BONDING_CURVE_PROGRAM_ID,
  DEFAULT_SOUL_GENERATOR_PROGRAM_ID,
  generationApiResponse,
  indexReceiptAccountChange,
  indexReceiptAccounts,
  receiptApiResponse,
  receiptLifecycleCountsApiResponse,
  indexLogNotification,
  programIdStartupLines,
  resolveProgramIdConfig,
  subscribeReceiptAccountChanges,
} from "./main.js";
import type { GenerationQuery, GenerationRow, ReceiptQuery, ReceiptRow } from "./db.js";

describe("resolveProgramIdConfig", () => {
  it("uses current devnet program IDs as fallback when env vars are absent", () => {
    expect(resolveProgramIdConfig({})).toEqual({
      bondingCurve: DEFAULT_BONDING_CURVE_PROGRAM_ID,
      soulGenerator: DEFAULT_SOUL_GENERATOR_PROGRAM_ID,
      programIds: [
        DEFAULT_BONDING_CURVE_PROGRAM_ID,
        DEFAULT_SOUL_GENERATOR_PROGRAM_ID,
      ],
    });
  });

  it("uses BONDING_CURVE_PROGRAM_ID and SOUL_GENERATOR_PROGRAM_ID when provided", () => {
    const bondingCurve = "11111111111111111111111111111111";
    const soulGenerator = "SysvarC1ock11111111111111111111111111111111";

    expect(
      resolveProgramIdConfig({
        BONDING_CURVE_PROGRAM_ID: bondingCurve,
        SOUL_GENERATOR_PROGRAM_ID: soulGenerator,
      }),
    ).toEqual({
      bondingCurve,
      soulGenerator,
      programIds: [bondingCurve, soulGenerator],
    });
  });

  it("rejects invalid env program IDs before subscription", () => {
    expect(() =>
      resolveProgramIdConfig({
        BONDING_CURVE_PROGRAM_ID: "not-a-solana-pubkey",
      }),
    ).toThrow("Invalid Solana pubkey for BONDING_CURVE_PROGRAM_ID");

    expect(() =>
      resolveProgramIdConfig({
        SOUL_GENERATOR_PROGRAM_ID: "also-not-a-solana-pubkey",
      }),
    ).toThrow("Invalid Solana pubkey for SOUL_GENERATOR_PROGRAM_ID");
  });

  it("formats sanitized startup lines with only public program IDs", () => {
    const config = resolveProgramIdConfig({
      BONDING_CURVE_PROGRAM_ID: "11111111111111111111111111111111",
      SOUL_GENERATOR_PROGRAM_ID: "SysvarC1ock11111111111111111111111111111111",
      RAILWAY_TOKEN: "must-not-appear",
    });

    expect(programIdStartupLines(config)).toEqual([
      "[indexer] config BONDING_CURVE_PROGRAM_ID=11111111111111111111111111111111",
      "[indexer] config SOUL_GENERATOR_PROGRAM_ID=SysvarC1ock11111111111111111111111111111111",
    ]);
    expect(programIdStartupLines(config).join("\n")).not.toContain("must-not-appear");
  });
});

describe("receiptApiResponse", () => {
  const rows: ReceiptRow[] = [
    {
      receipt: "Receipt11111111111111111111111111111111",
      soul: "Soul111111111111111111111111111111111111",
      claimant: "Claim111111111111111111111111111111111",
      tokenMint: "Mint111111111111111111111111111111111111",
      nftMint: "Nft1111111111111111111111111111111111111",
      sequence: "1",
      generationCount: "1",
      boundQuantity: "1000000",
      boundBoundary: "1",
      lifecycleState: "burned",
      slot: 99,
      indexedAt: 1_800_000_099,
    },
  ];

  it("exposes receipt lifecycle rows keyed by token and state", () => {
    const queries: ReceiptQuery[] = [];
    const store = {
      listReceipts: (query: ReceiptQuery) => {
        queries.push(query);
        return rows;
      },
    };

    expect(
      receiptApiResponse(
        {
          method: "GET",
          url: "/tokens/Mint111111111111111111111111111111111111/receipts?state=burned",
          headers: {},
        },
        store as never,
      ),
    ).toEqual({
      status: 200,
      body: {
        ok: true,
        receipts: rows,
      },
    });
    expect(queries).toEqual([
      {
        tokenMint: "Mint111111111111111111111111111111111111",
        lifecycleState: "burned",
        activeOnly: false,
      },
    ]);
  });
});

describe("receiptLifecycleCountsApiResponse", () => {
  it("exposes hard-binding receipt lifecycle counts separately by state", () => {
    const store = {
      listReceiptLifecycleCounts: () => [
        {
          tokenMint: "Mint111111111111111111111111111111111111",
          active: "2",
          burned: "1",
          forfeited: "3",
          inactive: "4",
          burnedAggregate: "4",
        },
      ],
    };

    expect(
      receiptLifecycleCountsApiResponse(
        {
          method: "GET",
          url: "/receipt-lifecycle-counts",
          headers: {},
        },
        store as never,
      ),
    ).toEqual({
      status: 200,
      body: {
        ok: true,
        source: {
          receipts: "receipt_binding_state",
          burnedReceiptsIncludes: ["burned", "forfeited"],
        },
        receiptCounts: [
          {
            tokenMint: "Mint111111111111111111111111111111111111",
            active: "2",
            burned: "1",
            forfeited: "3",
            inactive: "4",
            burnedAggregate: "4",
          },
        ],
      },
    });
  });
});

describe("indexLogNotification", () => {
  it("attaches finalized signature, slot, and blockTime from RPC/indexer context", async () => {
    const inserted: unknown[] = [];
    const store = {
      insert: (event: unknown) => {
        inserted.push(event);
        return { eventInserted: true, generationInserted: true };
      },
    };

    await expect(
      indexLogNotification({
        notification: {
          err: null,
          signature: "5FinalizedSig",
          logs: [
            "[event:generation] generation=3 side=buy amount=99 trader=Trader111111111111111111111111111111111 token_account=Token1111111111111111111111111111111111 mint=Mint111111111111111111111111111111111111 soul=Soul111111111111111111111111111111111111 seed_hash=0011223344556677",
          ],
        },
        slot: 456,
        store: store as never,
        loadBlockTime: async () => 1_800_000_456,
        indexedAt: 1_800_000_999,
      }),
    ).resolves.toBe(1);

    expect(inserted).toEqual([
      {
        type: "generation",
        payload: {
          generation: "3",
          side: "buy",
          amount: "99",
          trader: "Trader111111111111111111111111111111111",
          token_account: "Token1111111111111111111111111111111111",
          mint: "Mint111111111111111111111111111111111111",
          soul: "Soul111111111111111111111111111111111111",
          seed_hash: "0011223344556677",
        },
        slot: 456,
        txSig: "5FinalizedSig",
        blockTime: 1_800_000_456,
        indexedAt: 1_800_000_999,
      },
    ]);
  });
});

describe("receipt account live refresh", () => {
  it("keeps the startup snapshot and excludes a burned account-change update from active views", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solsoul-indexer-"));
    const dbPath = join(dir, "indexer.sqlite");

    try {
      const store = await EventStore.open(dbPath);
      const receiptPubkey = PublicKey.unique();
      const fields = receiptFields();
      const connection = {
        getProgramAccounts: async () => [
          {
            pubkey: receiptPubkey,
            account: {
              data: Buffer.from(receiptData({ ...fields, lifecycleState: "active" })),
            },
          },
        ],
      };

      await expect(
        indexReceiptAccounts({
          connection: connection as never,
          store,
          programId: DEFAULT_SOUL_GENERATOR_PROGRAM_ID,
          indexedAt: 1_800_000_001,
        }),
      ).resolves.toBe(1);
      expect(store.listReceipts({ tokenMint: fields.tokenMint, activeOnly: true })).toHaveLength(1);

      expect(
        indexReceiptAccountChange({
          keyedAccountInfo: {
            accountId: receiptPubkey,
            accountInfo: {
              data: Buffer.from(receiptData({ ...fields, lifecycleState: "burned" })),
            },
          } as never,
          slot: 77,
          store,
          indexedAt: 1_800_000_077,
        }),
      ).toBe(1);

      expect(store.listReceipts({ tokenMint: fields.tokenMint, activeOnly: true })).toEqual([]);
      expect(store.listReceipts({ tokenMint: fields.tokenMint })).toMatchObject([
        {
          receipt: receiptPubkey.toBase58(),
          lifecycleState: "burned",
          slot: 77,
          indexedAt: 1_800_000_077,
        },
      ]);
      store.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps the startup snapshot and excludes a forfeited account-change update from active views", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solsoul-indexer-"));
    const dbPath = join(dir, "indexer.sqlite");

    try {
      const store = await EventStore.open(dbPath);
      const receiptPubkey = PublicKey.unique();
      const fields = receiptFields();
      const connection = {
        getProgramAccounts: async () => [
          {
            pubkey: receiptPubkey,
            account: {
              data: Buffer.from(receiptData({ ...fields, lifecycleState: "active" })),
            },
          },
        ],
      };

      await indexReceiptAccounts({
        connection: connection as never,
        store,
        programId: DEFAULT_SOUL_GENERATOR_PROGRAM_ID,
        indexedAt: 1_800_000_001,
      });
      expect(store.listReceipts({ tokenMint: fields.tokenMint, activeOnly: true })).toHaveLength(1);

      expect(
        indexReceiptAccountChange({
          keyedAccountInfo: {
            accountId: receiptPubkey,
            accountInfo: {
              data: Buffer.from(receiptData({ ...fields, lifecycleState: "forfeited" })),
            },
          } as never,
          slot: 88,
          store,
          indexedAt: 1_800_000_088,
        }),
      ).toBe(1);

      expect(store.listReceipts({ tokenMint: fields.tokenMint, activeOnly: true })).toEqual([]);
      expect(store.listReceipts({ tokenMint: fields.tokenMint })).toMatchObject([
        {
          receipt: receiptPubkey.toBase58(),
          lifecycleState: "forfeited",
          slot: 88,
          indexedAt: 1_800_000_088,
        },
      ]);
      store.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("subscribes to finalized receipt account changes with the receipt account size filter and ignores malformed same-size data", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solsoul-indexer-"));
    const dbPath = join(dir, "indexer.sqlite");

    try {
      const store = await EventStore.open(dbPath);
      const receiptPubkey = PublicKey.unique();
      const fields = receiptFields();
      const pendingNotifications = new Set<Promise<number>>();
      let callback:
        | ((keyedAccountInfo: never, context: { slot: number }) => void)
        | undefined;
      let config: unknown;
      const connection = {
        onProgramAccountChange: (
          programId: PublicKey,
          receivedCallback: typeof callback,
          receivedConfig: unknown,
        ) => {
          expect(programId.toBase58()).toBe(DEFAULT_SOUL_GENERATOR_PROGRAM_ID);
          callback = receivedCallback;
          config = receivedConfig;
          return 123;
        },
      };

      expect(
        subscribeReceiptAccountChanges({
          connection,
          store,
          programId: DEFAULT_SOUL_GENERATOR_PROGRAM_ID,
          pendingNotifications,
          indexedAt: () => 1_800_000_099,
        }),
      ).toBe(123);
      expect(config).toEqual({
        commitment: "finalized",
        filters: [{ dataSize: RECEIPT_ACCOUNT_SIZE }],
      });

      callback?.(
        {
          accountId: receiptPubkey,
          accountInfo: {
            data: Buffer.from(receiptData({ ...fields, lifecycleState: "active" })),
          },
        } as never,
        { slot: 99 },
      );
      callback?.(
        {
          accountId: PublicKey.unique(),
          accountInfo: {
            data: Buffer.from(new Uint8Array(RECEIPT_ACCOUNT_SIZE)),
          },
        } as never,
        { slot: 100 },
      );
      await Promise.allSettled(pendingNotifications);

      expect(store.listReceipts({ tokenMint: fields.tokenMint })).toMatchObject([
        {
          receipt: receiptPubkey.toBase58(),
          lifecycleState: "active",
          slot: 99,
          indexedAt: 1_800_000_099,
        },
      ]);
      store.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("generationApiResponse", () => {
  const rows: GenerationRow[] = [
    {
      mint: "Mint111111111111111111111111111111111111",
      soul: "Soul111111111111111111111111111111111111",
      generation: 3,
      side: "buy",
      amount: "99",
      trader: "Trader111111111111111111111111111111111",
      tokenAccount: "Token1111111111111111111111111111111111",
      seedHash: "0011223344556677",
      signature: "5FinalizedSig",
      slot: 456,
      blockTime: 1_800_000_456,
      indexedAt: 1_800_000_999,
    },
  ];

  it("exposes generation rows keyed by token, Soul, and generation number", () => {
    const queries: GenerationQuery[] = [];
    const store = {
      listGenerations: (query: GenerationQuery) => {
        queries.push(query);
        return rows;
      },
    };

    expect(
      generationApiResponse(
        {
          method: "GET",
          url: "/generations?token=Mint111111111111111111111111111111111111&soul=Soul111111111111111111111111111111111111&generation=3",
          headers: {},
        },
        store as never,
      ),
    ).toEqual({
      status: 200,
      body: {
        ok: true,
        generations: rows,
      },
    });
    expect(queries).toEqual([
      {
        mint: "Mint111111111111111111111111111111111111",
        soul: "Soul111111111111111111111111111111111111",
        generation: 3,
      },
    ]);
  });

  it("supports canonical path queries for token and Soul generation APIs", () => {
    const queries: GenerationQuery[] = [];
    const store = {
      listGenerations: (query: GenerationQuery) => {
        queries.push(query);
        return rows;
      },
    };

    expect(
      generationApiResponse(
        {
          method: "GET",
          url: "/tokens/Mint111111111111111111111111111111111111/generations/3",
          headers: {},
        },
        store as never,
      )?.status,
    ).toBe(200);
    expect(
      generationApiResponse(
        {
          method: "GET",
          url: "/souls/Soul111111111111111111111111111111111111/generations/3",
          headers: {},
        },
        store as never,
      )?.status,
    ).toBe(200);

    expect(queries).toEqual([
      { mint: "Mint111111111111111111111111111111111111", generation: 3 },
      { soul: "Soul111111111111111111111111111111111111", generation: 3 },
    ]);
  });
});

function receiptFields(): {
  soul: string;
  claimant: string;
  tokenMint: string;
  nftMint: string;
} {
  return {
    soul: PublicKey.unique().toBase58(),
    claimant: PublicKey.unique().toBase58(),
    tokenMint: PublicKey.unique().toBase58(),
    nftMint: PublicKey.unique().toBase58(),
  };
}

function receiptData({
  soul,
  claimant,
  tokenMint,
  nftMint,
  lifecycleState,
}: {
  soul: string;
  claimant: string;
  tokenMint: string;
  nftMint: string;
  lifecycleState: "active" | "burned" | "forfeited";
}): Uint8Array {
  const data = new Uint8Array(RECEIPT_ACCOUNT_SIZE);
  data.set(new PublicKey(soul).toBytes(), 0);
  data.set(new PublicKey(claimant).toBytes(), 32);
  data.set(new PublicKey(tokenMint).toBytes(), 64);
  data.set(new PublicKey(nftMint).toBytes(), 96);
  writeU64(data, 2n, 128);
  writeU64(data, 3n, 136);
  writeU64(data, 1_000_000n, 144);
  writeU64(data, 3n, 152);
  data[160] = lifecycleState === "active" ? 1 : lifecycleState === "burned" ? 2 : 3;
  return data;
}

function writeU64(data: Uint8Array, value: bigint, offset: number): void {
  for (let i = 0; i < 8; i += 1) {
    data[offset + i] = Number((value >> (BigInt(i) * 8n)) & 0xffn);
  }
}
