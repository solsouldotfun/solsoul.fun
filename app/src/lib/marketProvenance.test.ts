import { describe, expect, it, vi } from "vitest";
import {
  hydrateMarketProvenanceWithRpc,
  marketProvenanceEvidenceState,
  marketProvenanceFromGenerationRow,
  marketProvenanceFromMetadataAttributes,
} from "./marketProvenance";

describe("market provenance helpers", () => {
  it("builds complete card provenance from finalized generation API rows", () => {
    expect(
      marketProvenanceFromGenerationRow({
        id: "generation:ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r:Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ:2",
        tokenMint: "ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r",
        soul: "Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ",
        generation: 2,
        side: "buy",
        amount: "990000",
        trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
        tokenAccount: "HkJHnQtJAu7YWoRszaM7Wi8drs4mmPfb9DNPhBnxFCRX",
        seedHash: "c613e02aa48460b1",
        signature: "nJCQ4htehrUSF6RFHSMQzPyW5swfRj4prZotprPGQnFpJapywiyCp5L3VZXmK2wtwEpZz7hYdBR55jxx7xpBJfd",
        slot: 458769366,
        blockTime: 1777419851,
        source: "finalized-rpc-logs",
      }),
    ).toMatchObject({
      generation: "2",
      side: "buy",
      amount: "990000",
      trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
      traderLabel: "8uAP…cd1i",
      tokenMint: "ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r",
      soul: "Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ",
      seedHash: "c613e02aa48460b1",
      signature: "nJCQ4htehrUSF6RFHSMQzPyW5swfRj4prZotprPGQnFpJapywiyCp5L3VZXmK2wtwEpZz7hYdBR55jxx7xpBJfd",
      slot: "458769366",
      explorerUrl:
        "https://explorer.solana.com/tx/nJCQ4htehrUSF6RFHSMQzPyW5swfRj4prZotprPGQnFpJapywiyCp5L3VZXmK2wtwEpZz7hYdBR55jxx7xpBJfd?cluster=devnet",
    });
  });

  it("creates missing card provenance from bounded token generation API evidence", async () => {
    const hydrated = await hydrateMarketProvenanceWithRpc(
      null,
      async (input) => {
        if (String(input) === "/api/stats") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, recentActivity: [] }),
          };
        }
        expect(String(input)).toContain(
          "/api/token/ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r/generations/2?limit=20",
        );
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            generations: [
              {
                id: "generation:ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r:Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ:2",
                tokenMint: "ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r",
                soul: "Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ",
                generation: 2,
                side: "buy",
                amount: "990000",
                trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
                tokenAccount: "HkJHnQtJAu7YWoRszaM7Wi8drs4mmPfb9DNPhBnxFCRX",
                seedHash: "c613e02aa48460b1",
                signature: "nJCQ4htehrUSF6RFHSMQzPyW5swfRj4prZotprPGQnFpJapywiyCp5L3VZXmK2wtwEpZz7hYdBR55jxx7xpBJfd",
                slot: 458769366,
                blockTime: 1777419851,
                source: "finalized-rpc-logs",
              },
            ],
          }),
        };
      },
      {
        tokenMint: "ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r",
        soul: "Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ",
        generation: 2,
      },
    );

    expect(hydrated).toMatchObject({
      generation: "2",
      side: "buy",
      amount: "990000",
      trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
      seedHash: "c613e02aa48460b1",
      signature: "nJCQ4htehrUSF6RFHSMQzPyW5swfRj4prZotprPGQnFpJapywiyCp5L3VZXmK2wtwEpZz7hYdBR55jxx7xpBJfd",
    });
  });

  it("hydrates card provenance with finalized RPC signature context when available", async () => {
    const hydrated = await hydrateMarketProvenanceWithRpc(
      {
        generation: "2",
        side: "buy",
        amount: "990000",
        trader: "Trader111111111111111111111111111111111111",
        traderLabel: "Trad…1111",
        tokenMint: "Mint11111111111111111111111111111111111111",
        soul: "Soul11111111111111111111111111111111111111",
        seedHash: "c613e02aa48460b1",
      },
      async (input) => {
        if (String(input) === "/api/stats") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, recentActivity: [] }),
          };
        }
        expect(String(input)).toContain("/api/token/Mint11111111111111111111111111111111111111/generations/2");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            generations: [
              {
                id: "Mint:2",
                tokenMint: "Mint11111111111111111111111111111111111111",
                soul: "Soul11111111111111111111111111111111111111",
                generation: 2,
                side: "buy",
                amount: "990000",
                trader: "Trader111111111111111111111111111111111111",
                tokenAccount: "TokenAccount111111111111111111111111111111",
                seedHash: "c613e02aa48460b1",
                signature: "GenerationSignature111111111111111111111111111",
                slot: 458769366,
                blockTime: 1777419851,
                source: "finalized-rpc-logs",
              },
            ],
          }),
        };
      },
    );

    expect(hydrated).toMatchObject({
      signature: "GenerationSignature111111111111111111111111111",
      slot: "458769366",
      explorerUrl:
        "https://explorer.solana.com/tx/GenerationSignature111111111111111111111111111?cluster=devnet",
    });
  });

  it("hydrates recent claimed card signatures from the public stats provenance feed before scanning exact routes", async () => {
    const calls: string[] = [];
    const hydrated = await hydrateMarketProvenanceWithRpc(
      {
        generation: "1",
        side: "buy",
        amount: "990000",
        trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
        traderLabel: "8uAP…cd1i",
        tokenMint: "CfaWjwi7S69XjfX5cLLyrReXwA9SaX21wZpPz6nBADDV",
        soul: "pBMR5wd8bK5YSBpDKU5iH5cgsGkNFhqWnhEnqRFsUVn",
        seedHash: "a68d8f5535cadc50",
      },
      async (input) => {
        calls.push(String(input));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            recentActivity: [
              {
                id: "generation:CfaWjwi7S69XjfX5cLLyrReXwA9SaX21wZpPz6nBADDV:pBMR5wd8bK5YSBpDKU5iH5cgsGkNFhqWnhEnqRFsUVn:1",
                kind: "tradeGeneration",
                generation: "1",
                side: "buy",
                amount: "990000",
                trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
                tokenAccount: "DgygxKkTjpC5ouHrZD6AWJrrC7xnuz4Mzz4EBRnWVttc",
                seedHash: "a68d8f5535cadc50",
                signature:
                  "4dnVe5iGPLkbrm7XiFoJLfTKntiNZ6yQUCvwjVTq5ZE9zjJ5m1UfJN6zd8AyexrzqGzDA1tRrSQSo3jYAXd3nwkB",
                slot: 458798744,
                soul: "pBMR5wd8bK5YSBpDKU5iH5cgsGkNFhqWnhEnqRFsUVn",
              },
            ],
          }),
        };
      },
    );

    expect(calls).toEqual(["/api/stats"]);
    expect(hydrated).toMatchObject({
      signature: "4dnVe5iGPLkbrm7XiFoJLfTKntiNZ6yQUCvwjVTq5ZE9zjJ5m1UfJN6zd8AyexrzqGzDA1tRrSQSo3jYAXd3nwkB",
      slot: "458798744",
      explorerUrl:
        "https://explorer.solana.com/tx/4dnVe5iGPLkbrm7XiFoJLfTKntiNZ6yQUCvwjVTq5ZE9zjJ5m1UfJN6zd8AyexrzqGzDA1tRrSQSo3jYAXd3nwkB?cluster=devnet",
    });
  });

  it("prefers exact token/Soul/generation API evidence over stale card seed data", async () => {
    const hydrated = await hydrateMarketProvenanceWithRpc(
      {
        generation: "4",
        side: "buy",
        amount: "990000",
        trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
        traderLabel: "8uAP…cd1i",
        tokenMint: "ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r",
        soul: "Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ",
        seedHash: "stale-seed",
      },
      async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          generations: [
            {
              id: "generation:ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r:Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ:4",
              tokenMint: "ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r",
              soul: "Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ",
              generation: 4,
              side: "buy",
              amount: "990000",
              trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
              tokenAccount: "HkJHnQtJAu7YWoRszaM7Wi8drs4mmPfb9DNPhBnxFCRX",
              seedHash: "e47af45737a99965",
              signature: "4VGNtgsLbC6DxsaBkkknAjG9n4iwxhhAwA6CnuLsqapFrqAbwZdqYzMn8CpcWvyp35HY6JX96c9Cfae1hc8cV49T",
              slot: 458798210,
              blockTime: 1777430780,
              source: "finalized-rpc-logs",
            },
          ],
        }),
      }),
    );

    expect(hydrated).toMatchObject({
      generation: "4",
      seedHash: "e47af45737a99965",
      signature: "4VGNtgsLbC6DxsaBkkknAjG9n4iwxhhAwA6CnuLsqapFrqAbwZdqYzMn8CpcWvyp35HY6JX96c9Cfae1hc8cV49T",
    });
  });

  it("keeps metadata provenance without fabricated tx context when RPC evidence is absent", async () => {
    const parsed = marketProvenanceFromMetadataAttributes([
      { trait_type: "Generation", value: "4" },
      { trait_type: "Trade side", value: "sell" },
      { trait_type: "Trade amount", value: "1000000" },
      { trait_type: "Trader wallet", value: "Trader111111111111111111111111111111111111" },
      { trait_type: "Seed hash", value: "abcdef0123456789" },
      { trait_type: "Token mint", value: "Mint11111111111111111111111111111111111111" },
      { trait_type: "Soul PDA", value: "Soul11111111111111111111111111111111111111" },
    ]);

    const hydrated = await hydrateMarketProvenanceWithRpc(parsed, async () => ({
      ok: false,
      status: 429,
      json: async () => ({ ok: false }),
    }));

    expect(hydrated).toMatchObject({
      generation: "4",
      side: "sell",
      amount: "1000000",
    });
    expect(hydrated?.signature).toBeUndefined();
    expect(hydrated?.explorerUrl).toBeUndefined();
  });

  it("retries transient public provenance 429s before falling back to pending evidence", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const pending = hydrateMarketProvenanceWithRpc(
      null,
      async (input) => {
        calls.push(String(input));
        if (String(input) === "/api/stats") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, recentActivity: [] }),
          };
        }
        if (calls.filter((url) => url.includes("/generations/2")).length === 1) {
          return {
            ok: false,
            status: 429,
            json: async () => ({ ok: false }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            generations: [
              {
                id: "generation:TokenMint111111111111111111111111111111111:Soul11111111111111111111111111111111111111:2",
                tokenMint: "TokenMint111111111111111111111111111111111",
                soul: "Soul11111111111111111111111111111111111111",
                generation: 2,
                side: "buy",
                amount: "990000",
                trader: "Trader111111111111111111111111111111111111",
                tokenAccount: "TokenAcct111111111111111111111111111111111",
                seedHash: "c613e02aa48460b1",
                signature: "FinalizedGenerationSignature111111111111111111",
                slot: 458769366,
                blockTime: 1_777_419_851,
                source: "finalized-rpc-logs",
              },
            ],
          }),
        };
      },
      {
        tokenMint: "TokenMint111111111111111111111111111111111",
        soul: "Soul11111111111111111111111111111111111111",
        generation: 2,
      },
    );

    await vi.advanceTimersByTimeAsync(300);
    const hydrated = await pending;

    expect(calls.filter((url) => url.includes("/generations/2"))).toHaveLength(2);
    expect(hydrated).toMatchObject({
      generation: "2",
      seedHash: "c613e02aa48460b1",
      signature: "FinalizedGenerationSignature111111111111111111",
    });
    vi.useRealTimers();
  });

  it("coalesces concurrent transient provenance lookups so gallery cards do not spam failing resources", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: string) => {
      calls.push(input);
      if (input === "/api/stats") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, recentActivity: [] }),
        };
      }
      return {
        ok: false,
        status: 502,
        json: async () => ({ ok: false, error: "Invalid seeds" }),
      };
    });
    const lookup = {
      tokenMint: "TokenMint111111111111111111111111111111111",
      soul: "Soul11111111111111111111111111111111111111",
      generation: 7,
    };

    try {
      const pending = Promise.all([
        hydrateMarketProvenanceWithRpc(null, fetchImpl, lookup),
        hydrateMarketProvenanceWithRpc(null, fetchImpl, lookup),
      ]);
      await vi.runAllTimersAsync();
      const firstResults = await pending;
      const afterConcurrentCalls = calls.filter((url) => url.includes("/generations/7")).length;

      const cachedResult = await hydrateMarketProvenanceWithRpc(null, fetchImpl, lookup);

      expect(firstResults).toEqual([null, null]);
      expect(cachedResult).toBeNull();
      expect(afterConcurrentCalls).toBe(3);
      expect(calls.filter((url) => url.includes("/generations/7"))).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("classifies missing card provenance as an honest pending state when lookup evidence exists", () => {
    expect(
      marketProvenanceEvidenceState(null, {
        tokenMint: "Mint11111111111111111111111111111111111111",
        soul: "Soul11111111111111111111111111111111111111",
        generation: "3",
      }),
    ).toBe("pending");

    expect(
      marketProvenanceEvidenceState(
        {
          generation: "3",
          side: "buy",
          amount: "990000",
          trader: "Trader111111111111111111111111111111111111",
          traderLabel: "Trad…1111",
          seedHash: "abcdef0123456789",
        },
        undefined,
      ),
    ).toBe("available");

    expect(marketProvenanceEvidenceState(null, undefined)).toBe("not-applicable");
  });
});
