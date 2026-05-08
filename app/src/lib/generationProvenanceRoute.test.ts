import { PublicKey } from "@solana/web3.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __generationRouteCacheForTests,
  generationRowsRouteResponse,
} from "./generationProvenanceRoute";
import type { GenerationProvenanceRow } from "./generationProvenance";
import { fetchGenerationRowsFromFinalizedRpc } from "./generationProvenance";

const mint = "ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r";
const soul = "Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ";

describe("generation provenance route resilience", () => {
  beforeEach(() => {
    __generationRouteCacheForTests.clear();
    vi.useRealTimers();
  });

  it("serves the last good exact generation response from memory cache after a transient RPC 400", async () => {
    const request = new Request(`https://solsoul-devnet.test/api/token/${mint}/generations/2?limit=5`);
    const first = await generationRowsRouteResponse(
      request,
      { mint, generation: "2" },
      {
        connection: {} as never,
        rpcEndpoint: "https://api.devnet.solana.com",
        loadGenerationRows: async () => [generationRow()],
      },
    );

    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      ok: true,
      generations: [{ signature: "FinalizedGenerationSignature111111111111111111" }],
    });

    const fallback = await generationRowsRouteResponse(
      request,
      { mint, generation: "2" },
      {
        connection: {} as never,
        rpcEndpoint: "https://api.devnet.solana.com",
        loadGenerationRows: async () => {
          throw new Error("HTTP 400 from devnet RPC");
        },
      },
    );
    const body = await fallback.json();

    expect(fallback.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      generations: [{ signature: "FinalizedGenerationSignature111111111111111111" }],
      source: {
        partial: true,
        fallback: "memory-cache",
      },
    });
    expect(body.generations[0]).toMatchObject({
      tokenMint: mint,
      soul,
      generation: 2,
      source: "finalized-rpc-logs",
    });
  });

  it("does not cache a normal empty exact-generation result when transaction fetch retries exhaust", async () => {
    vi.useFakeTimers();
    const program = PublicKey.unique();
    const transientMint = PublicKey.unique().toBase58();
    let transactionAttempts = 0;
    const request = new Request(
      `https://solsoul-devnet.test/api/token/${transientMint}/generations/4?limit=5`,
    );
    const firstPending = generationRowsRouteResponse(
      request,
      { mint: transientMint, generation: "4" },
      {
        connection: {} as never,
        rpcEndpoint: "https://api.devnet.solana.com",
        loadGenerationRows: ({ connection, filters, signatureLimit }) =>
          fetchGenerationRowsFromFinalizedRpc({
            connection,
            filters,
            signatureLimit,
            programIds: [program],
            loaders: {
              getSignaturesForAddress: async () => [signature("maybe-generation", 123)],
              getTransaction: async () => {
                transactionAttempts += 1;
                throw new Error("429 too many requests while fetching transaction");
              },
            },
          }),
      },
    );

    await vi.runAllTimersAsync();
    const first = await firstPending;
    const firstBody = await first.json();

    expect(transactionAttempts).toBe(5);
    expect(first.status).toBe(200);
    expect(firstBody).toMatchObject({
      ok: true,
      generations: [],
      source: {
        partial: true,
        fallback: "empty-transient",
      },
    });
    expect(firstBody.source.warnings[0]).toBe("generation provenance: temporarily unavailable");
    expect(JSON.stringify(firstBody)).not.toContain("429 too many requests");
    expect(__generationRouteCacheForTests.size()).toBe(0);

    const second = await generationRowsRouteResponse(
      request,
      { mint: transientMint, generation: "4" },
      {
        connection: {} as never,
        rpcEndpoint: "https://api.devnet.solana.com",
        loadGenerationRows: async () => {
          throw new Error("429 too many requests");
        },
      },
    );
    const secondBody = await second.json();

    expect(second.status).toBe(200);
    expect(secondBody).toMatchObject({
      ok: true,
      generations: [],
      source: {
        partial: true,
        fallback: "empty-transient",
      },
    });
    expect(secondBody.source.fallback).not.toBe("memory-cache");
    vi.useRealTimers();
  });

  it("returns an honest empty partial response for transient exact-generation RPC failure without cache", async () => {
    const uncachedMint = "4Z3Xh44EdF63q1ripYFMXiJAs58D6U6udv3qiQNnPAND";
    const response = await generationRowsRouteResponse(
      new Request(`https://solsoul-devnet.test/api/token/${uncachedMint}/generations/9?limit=5`),
      { mint: uncachedMint, generation: "9" },
      {
        connection: {} as never,
        rpcEndpoint: "https://api.devnet.solana.com",
        loadGenerationRows: async () => {
          throw new Error("429 too many requests");
        },
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      generations: [],
      source: {
        partial: true,
        fallback: "empty-transient",
      },
    });
    expect(body).not.toHaveProperty("signature");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("bounds a hanging exact generation lookup with an empty partial fallback", async () => {
    vi.useFakeTimers();
    const uncachedMint = "CfaWjwi7S69XjfX5cLLyrReXwA9SaX21wZpPz6nBADDV";
    const pending = generationRowsRouteResponse(
      new Request(`https://solsoul-devnet.test/api/token/${uncachedMint}/generations/99?limit=5`),
      { mint: uncachedMint, generation: "99" },
      {
        connection: {} as never,
        rpcEndpoint: "https://api.devnet.solana.com",
        timeoutMs: 50,
        loadGenerationRows: async () => new Promise<GenerationProvenanceRow[]>(() => undefined),
      },
    );

    await vi.advanceTimersByTimeAsync(50);
    const response = await pending;
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      generations: [],
      source: {
        partial: true,
        fallback: "empty-transient",
      },
    });
    expect(body.source.warnings[0]).toBe("generation provenance: temporarily unavailable");
    expect(JSON.stringify(body)).not.toContain("generation provenance timed out after");
    expect(response.headers.get("cache-control")).toBe("no-store");
    vi.useRealTimers();
  });

  it("keeps the public route timeout bounded against RPC amplification", () => {
    expect(__generationRouteCacheForTests.timeoutMs).toBeLessThanOrEqual(20_000);
  });

  it("expires exact generation memory-cache entries after the route-cache TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const cachedMint = PublicKey.unique().toBase58();
    const request = new Request(`https://solsoul-devnet.test/api/token/${cachedMint}/generations/2?limit=5`);
    await generationRowsRouteResponse(
      request,
      { mint: cachedMint, generation: "2" },
      {
        connection: {} as never,
        rpcEndpoint: "https://api.devnet.solana.com",
        loadGenerationRows: async () => [generationRow({ tokenMint: cachedMint })],
      },
    );
    expect(__generationRouteCacheForTests.size()).toBe(1);

    vi.setSystemTime(__generationRouteCacheForTests.ttlMs + 1);
    const fallback = await generationRowsRouteResponse(
      request,
      { mint: cachedMint, generation: "2" },
      {
        connection: {} as never,
        rpcEndpoint: "https://api.devnet.solana.com",
        loadGenerationRows: async () => {
          throw new Error("HTTP 400 from devnet RPC");
        },
      },
    );
    const body = await fallback.json();

    expect(body).toMatchObject({
      ok: true,
      generations: [],
      source: {
        partial: true,
        fallback: "empty-transient",
      },
    });
    expect(__generationRouteCacheForTests.size()).toBe(0);
    vi.useRealTimers();
  });

  it("evicts the least-recently-used exact generation row when the route cache exceeds its bound", async () => {
    const cachedMints = Array.from({ length: __generationRouteCacheForTests.maxEntries + 1 }, () =>
      PublicKey.unique().toBase58(),
    );

    for (const [index, cachedMint] of cachedMints.entries()) {
      const response = await generationRowsRouteResponse(
        new Request(`https://solsoul-devnet.test/api/token/${cachedMint}/generations/2?limit=5`),
        { mint: cachedMint, generation: "2" },
        {
          connection: {} as never,
          rpcEndpoint: "https://api.devnet.solana.com",
          loadGenerationRows: async () => [
            generationRow({
              tokenMint: cachedMint,
              signature: `FinalizedGenerationSignature${index.toString().padStart(2, "0")}`,
            }),
          ],
        },
      );
      expect(response.status).toBe(200);
    }

    expect(__generationRouteCacheForTests.size()).toBe(__generationRouteCacheForTests.maxEntries);

    const evicted = await generationRowsRouteResponse(
      new Request(`https://solsoul-devnet.test/api/token/${cachedMints[0]}/generations/2?limit=5`),
      { mint: cachedMints[0], generation: "2" },
      {
        connection: {} as never,
        rpcEndpoint: "https://api.devnet.solana.com",
        loadGenerationRows: async () => {
          throw new Error("HTTP 400 from devnet RPC");
        },
      },
    );
    const evictedBody = await evicted.json();
    expect(evictedBody.source.fallback).toBe("empty-transient");

    const retained = await generationRowsRouteResponse(
      new Request(`https://solsoul-devnet.test/api/token/${cachedMints.at(-1)}/generations/2?limit=5`),
      { mint: cachedMints.at(-1), generation: "2" },
      {
        connection: {} as never,
        rpcEndpoint: "https://api.devnet.solana.com",
        loadGenerationRows: async () => {
          throw new Error("HTTP 400 from devnet RPC");
        },
      },
    );
    const retainedBody = await retained.json();
    expect(retainedBody).toMatchObject({
      generations: [{ tokenMint: cachedMints.at(-1) }],
      source: {
        partial: true,
        fallback: "memory-cache",
      },
    });
  });

  it("continues to reject invalid route input instead of treating it as transient", async () => {
    const response = await generationRowsRouteResponse(
      new Request("https://solsoul-devnet.test/api/token/not-a-pubkey/generations/not-a-number"),
      { mint: "not-a-pubkey", generation: "not-a-number" },
      {
        connection: {} as never,
        loadGenerationRows: async () => [generationRow()],
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "Unable to load generation rows.",
    });
  });
});

function generationRow(overrides: Partial<GenerationProvenanceRow> = {}): GenerationProvenanceRow {
  return {
    id: `generation:${mint}:${soul}:2`,
    tokenMint: mint,
    soul,
    generation: 2,
    side: "buy",
    amount: "990000",
    trader: "Trader1111111111111111111111111111111111",
    tokenAccount: "TokenAcct11111111111111111111111111111111",
    seedHash: "c613e02aa48460b1",
    signature: "FinalizedGenerationSignature111111111111111111",
    slot: 458769366,
    blockTime: 1_777_419_851,
    source: "finalized-rpc-logs",
    ...overrides,
  };
}

function signature(signatureValue: string, slot: number) {
  return {
    signature: signatureValue,
    slot,
    err: null,
    memo: null,
    blockTime: null,
    confirmationStatus: "finalized" as const,
  };
}
