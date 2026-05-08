import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { EventStore, type IndexedEvent } from "./db.js";

const generationPayload = {
  generation: "7",
  side: "buy",
  amount: "123456",
  trader: "Trader111111111111111111111111111111111",
  token_account: "Token1111111111111111111111111111111111",
  mint: "Mint111111111111111111111111111111111111",
  soul: "Soul111111111111111111111111111111111111",
  seed_hash: "AABBCCDDEEFF0011",
};

describe("EventStore", () => {
  it("creates the documented SQLite schema and persists events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solsoul-indexer-"));
    const dbPath = join(dir, "indexer.sqlite");

    try {
      const store = await EventStore.open(dbPath);
      const events: Array<Pick<IndexedEvent, "type" | "payload">> = [
        {
          type: "graduation" as const,
          payload: { curve: "Curve1111111111111111111111111111111111", sol_raised: "1" },
        },
        {
          type: "claim" as const,
          payload: {
            soul: "Soul111111111111111111111111111111111111",
            nft_mint: "Nft1111111111111111111111111111111111111",
            claimer: "Claim111111111111111111111111111111111",
          },
        },
        {
          type: "pause" as const,
          payload: { paused: true, admin: "Admin11111111111111111111111111111111111" },
        },
      ];
      events.forEach((event, index) => {
        store.insert({
          ...event,
          slot: 42 + index,
          txSig: `5sig${index}`,
          indexedAt: 1_700_000_000 + index,
        });
      });
      expect(store.count()).toBe(3);
      await store.flush();
      store.close();

      const reopened = await EventStore.open(dbPath);
      expect(reopened.count()).toBe(3);
      reopened.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("persists exactly one canonical generation row across replayed finalized events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solsoul-indexer-"));
    const dbPath = join(dir, "indexer.sqlite");

    try {
      const store = await EventStore.open(dbPath);
      const event: IndexedEvent = {
        type: "generation",
        payload: generationPayload,
        slot: 1234,
        txSig: "5finalizedGenerationSig",
        blockTime: 1_800_000_000,
        indexedAt: 1_800_000_010,
      };

      expect(store.insert(event)).toEqual({
        eventInserted: true,
        generationInserted: true,
      });
      expect(store.insert({ ...event, indexedAt: event.indexedAt + 1 })).toEqual({
        eventInserted: false,
        generationInserted: false,
      });

      expect(store.generationCount()).toBe(1);
      expect(
        store.getGeneration({
          mint: generationPayload.mint,
          soul: generationPayload.soul,
          generation: 7,
        }),
      ).toEqual({
        mint: generationPayload.mint,
        soul: generationPayload.soul,
        generation: 7,
        side: "buy",
        amount: "123456",
        trader: generationPayload.trader,
        tokenAccount: generationPayload.token_account,
        seedHash: "aabbccddeeff0011",
        signature: "5finalizedGenerationSig",
        slot: 1234,
        blockTime: 1_800_000_000,
        indexedAt: 1_800_000_010,
      });
      store.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not create public generation rows from non-generation or malformed events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solsoul-indexer-"));
    const dbPath = join(dir, "indexer.sqlite");

    try {
      const store = await EventStore.open(dbPath);
      store.insert({
        type: "claim",
        payload: { soul: generationPayload.soul },
        slot: 1,
        txSig: "claimSig",
        indexedAt: 2,
      });
      store.insert({
        type: "generation",
        payload: { ...generationPayload, signature: "fabricated-on-chain" },
        slot: 2,
        txSig: "badGenerationSig",
        indexedAt: 3,
      });

      expect(store.count()).toBe(2);
      expect(store.generationCount()).toBe(0);
      expect(store.listGenerations({ mint: generationPayload.mint })).toEqual([]);
      store.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("persists receipt lifecycle rows and excludes inactive rows from active receipt views", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solsoul-indexer-"));
    const dbPath = join(dir, "indexer.sqlite");

    try {
      const store = await EventStore.open(dbPath);
      const baseReceipt = {
        receipt: "Receipt11111111111111111111111111111111",
        soul: "Soul111111111111111111111111111111111111",
        claimant: "Claim111111111111111111111111111111111",
        tokenMint: generationPayload.mint,
        nftMint: "Nft1111111111111111111111111111111111111",
        sequence: "1",
        generationCount: "2",
        boundQuantity: "1000000",
        boundBoundary: "2",
        slot: 99,
        indexedAt: 1_800_000_099,
      };

      expect(store.upsertReceipt({ ...baseReceipt, lifecycleState: "active" })).toBe(true);
      expect(store.upsertReceipt({ ...baseReceipt, lifecycleState: "burned", slot: 100 })).toBe(true);
      expect(
        store.upsertReceipt({
          ...baseReceipt,
          receipt: "Receipt22222222222222222222222222222222",
          nftMint: "Nft2222222222222222222222222222222222222",
          sequence: "2",
          lifecycleState: "forfeited",
          slot: 101,
        }),
      ).toBe(true);

      expect(store.receiptCount()).toBe(2);
      expect(store.listReceiptLifecycleCounts()).toEqual([
        {
          tokenMint: generationPayload.mint,
          active: "0",
          burned: "1",
          forfeited: "1",
          inactive: "2",
          burnedAggregate: "2",
        },
      ]);
      expect(store.listReceipts({ tokenMint: generationPayload.mint }).map((row) => row.lifecycleState)).toEqual([
        "burned",
        "forfeited",
      ]);
      expect(store.listReceipts({ tokenMint: generationPayload.mint, activeOnly: true })).toEqual([]);
      await store.flush();
      store.close();

      const reopened = await EventStore.open(dbPath);
      expect(reopened.listReceipts({ lifecycleState: "burned" })[0]).toMatchObject({
        receipt: baseReceipt.receipt,
        lifecycleState: "burned",
        slot: 100,
      });
      reopened.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
