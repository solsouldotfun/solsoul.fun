import { PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import {
  GenerationProvenancePartialError,
  fetchGenerationRowsFromFinalizedRpc,
  parseGenerationLog,
  type GenerationProvenanceRow,
} from "./generationProvenance";

describe("parseGenerationLog", () => {
  it("parses on-chain generation provenance without transaction context fields", () => {
    const parsed = parseGenerationLog(
      "Program log: [event:generation] generation=7 side=sell amount=321 trader=Trader111111111111111111111111111111111 token_account=TokenAcct111111111111111111111111111111 mint=Mint111111111111111111111111111111111111 soul=Soul111111111111111111111111111111111111 seed_hash=ABCDEF0123456789",
    );

    expect(parsed).toMatchObject({
      generation: 7,
      side: "sell",
      amount: "321",
      trader: "Trader111111111111111111111111111111111",
      tokenAccount: "TokenAcct111111111111111111111111111111",
      tokenMint: "Mint111111111111111111111111111111111111",
      soul: "Soul111111111111111111111111111111111111",
      seedHash: "abcdef0123456789",
    });
  });

  it("rejects generation logs that try to smuggle signature, slot, or blockTime", () => {
    expect(
      parseGenerationLog(
        "Program log: [event:generation] generation=1 side=buy amount=1 trader=T token_account=A mint=M soul=S seed_hash=1234 signature=fake",
      ),
    ).toBeNull();
    expect(
      parseGenerationLog(
        "Program log: [event:generation] generation=1 side=buy amount=1 trader=T token_account=A mint=M soul=S seed_hash=1234 slot=99",
      ),
    ).toBeNull();
    expect(
      parseGenerationLog(
        "Program log: [event:generation] generation=1 side=buy amount=1 trader=T token_account=A mint=M soul=S seed_hash=1234 blockTime=99",
      ),
    ).toBeNull();
  });

  it("rejects lines longer than MAX_EVENT_LINE_LEN (4096)", () => {
    const longLine = "Program log: [event:generation] " + "k=v ".repeat(1500);
    expect(longLine.length).toBeGreaterThan(4096);
    expect(parseGenerationLog(longLine)).toBeNull();
  });

  it("rejects lines with more than MAX_EVENT_FIELDS (64) fields", () => {
    const fields = Array.from({ length: 65 }, (_, i) => `k${i}=v${i}`).join(" ");
    const line = "Program log: [event:generation] " + fields;
    expect(line.length).toBeLessThanOrEqual(4096);
    expect(parseGenerationLog(line)).toBeNull();
  });

  it("parses a valid generation line at boundary (64 fields, ≤4096 chars)", () => {
    const line =
      "Program log: [event:generation] generation=1 side=buy amount=1 trader=Trader111111111111111111111111111111111 token_account=*************************************** mint=Mint111111111111111111111111111111111111 soul=Soul111111111111111111111111111111111111 seed_hash=ABCDEF0123456789";
    expect(line.length).toBeLessThanOrEqual(4096);
    const result = parseGenerationLog(line);
    expect(result).not.toBeNull();
    expect(result?.generation).toBe(1);
  });
});

describe("fetchGenerationRowsFromFinalizedRpc", () => {
  it("reconstructs one canonical row per token/Soul/generation with finalized RPC context", async () => {
    const bondingProgram = PublicKey.unique();
    const soulProgram = PublicKey.unique();
    const mint = PublicKey.unique().toBase58();
    const soul = PublicKey.unique().toBase58();
    const unrelatedMint = PublicKey.unique().toBase58();
    const calls: string[] = [];
    const rows = await fetchGenerationRowsFromFinalizedRpc({
      connection: {} as never,
      programIds: [bondingProgram, soulProgram],
      loaders: {
        getSignaturesForAddress: async (_connection, address, limit, commitment) => {
          calls.push(`${address.toBase58()}:${limit}:${commitment}`);
          if (address.equals(bondingProgram)) {
            return [
              signature("sig-generation", 42),
              signature("sig-unrelated", 43),
            ];
          }
          return [signature("sig-generation", 42)];
        },
        getTransaction: async (_connection, sig) => {
          if (sig === "sig-generation") {
            return tx(42, 1_800_000_000, [
              generationLog({
                generation: 3,
                side: "buy",
                amount: "99000000",
                trader: "TraderWallet11111111111111111111111111111",
                tokenAccount: "TraderToken111111111111111111111111111111",
                mint,
                soul,
                seedHash: "aabbccdd00112233",
              }),
            ]);
          }
          return tx(43, 1_800_000_001, [
            generationLog({
              generation: 1,
              side: "sell",
              amount: "5",
              trader: "OtherTrader111111111111111111111111111111",
              tokenAccount: "OtherToken1111111111111111111111111111111",
              mint: unrelatedMint,
              soul: PublicKey.unique().toBase58(),
              seedHash: "0011223344556677",
            }),
            "Program log: unrelated account activity",
          ]);
        },
      },
    });

    expect(calls).toEqual([
      `${bondingProgram.toBase58()}:100:finalized`,
      `${soulProgram.toBase58()}:100:finalized`,
    ]);
    expect(rows).toHaveLength(2);
    expect(rowKey(rows[0])).toBe(`${mint}:${soul}:3`);
    expect(rows[0]).toMatchObject({
      id: `generation:${mint}:${soul}:3`,
      tokenMint: mint,
      soul,
      generation: 3,
      side: "buy",
      amount: "99000000",
      trader: "TraderWallet11111111111111111111111111111",
      tokenAccount: "TraderToken111111111111111111111111111111",
      seedHash: "aabbccdd00112233",
      signature: "sig-generation",
      slot: 42,
      blockTime: 1_800_000_000,
      source: "finalized-rpc-logs",
    });
    expect(rows.filter((row) => row.signature === "sig-generation")).toHaveLength(1);
  });

  it("filters canonical rows by token, Soul, and generation without account-signature heuristics", async () => {
    const program = PublicKey.unique();
    const mint = PublicKey.unique().toBase58();
    const soul = PublicKey.unique().toBase58();
    const heuristicAccount = new PublicKey(mint);
    const rows = await fetchGenerationRowsFromFinalizedRpc({
      connection: {} as never,
      programIds: [program],
      filters: { mint, soul, generation: 9 },
      loaders: {
        getSignaturesForAddress: async (_connection, address, _limit, commitment) => {
          expect(address.toBase58()).toBe(program.toBase58());
          expect(address.toBase58()).not.toBe(heuristicAccount.toBase58());
          expect(commitment).toBe("finalized");
          return [signature("sig-match", 100), signature("sig-other", 101)];
        },
        getTransaction: async (_connection, sig) =>
          sig === "sig-match"
            ? tx(100, null, [
                generationLog({
                  generation: 9,
                  side: "sell",
                  amount: "123",
                  trader: "Seller1111111111111111111111111111111111",
                  tokenAccount: "SellerToken11111111111111111111111111111",
                  mint,
                  soul,
                  seedHash: "0102030405060708",
                }),
              ])
            : tx(101, null, [
                generationLog({
                  generation: 10,
                  side: "buy",
                  amount: "456",
                  trader: "Buyer11111111111111111111111111111111111",
                  tokenAccount: "BuyerToken11111111111111111111111111111",
                  mint,
                  soul,
                  seedHash: "0807060504030201",
                }),
              ]),
      },
    });

    expect(rows.map(rowKey)).toEqual([`${mint}:${soul}:9`]);
    expect(rows[0]?.signature).toBe("sig-match");
    expect(rows[0]?.blockTime).toBeNull();
  });

  it("paginates exact token/generation lookups with deterministic before cursors until the row is found", async () => {
    const program = PublicKey.unique();
    const mint = "ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r";
    const soul = PublicKey.unique().toBase58();
    const signatureCalls: Array<{ limit: number; before?: string }> = [];
    const rows = await fetchGenerationRowsFromFinalizedRpc({
      connection: {} as never,
      programIds: [program],
      filters: { mint, generation: 2 },
      signatureLimit: 2,
      exactLookupSignatureScanCap: 6,
      loaders: {
        getSignaturesForAddress: async (_connection, _address, limit, commitment, before) => {
          expect(commitment).toBe("finalized");
          signatureCalls.push({ limit, before });
          if (!before) {
            return [signature("first-page-newer-1", 300), signature("first-page-newer-2", 299)];
          }
          if (before === "first-page-newer-2") {
            return [signature("adlartu-generation-2", 250), signature("older-unrelated", 249)];
          }
          return [];
        },
        getTransaction: async (_connection, sig) =>
          sig === "adlartu-generation-2"
            ? tx(250, 1_777_419_851, [
                generationLog({
                  generation: 2,
                  side: "buy",
                  amount: "990000",
                  trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
                  tokenAccount: "TraderToken111111111111111111111111111111",
                  mint,
                  soul,
                  seedHash: "c613e02aa48460b1",
                }),
              ])
            : tx(300, null, [
                generationLog({
                  generation: 99,
                  side: "sell",
                  amount: "1",
                  trader: "OtherTrader111111111111111111111111111111",
                  tokenAccount: "OtherToken1111111111111111111111111111111",
                  mint,
                  soul,
                  seedHash: "0011223344556677",
                }),
              ]),
      },
    });

    expect(signatureCalls).toEqual([
      { limit: 2, before: undefined },
      { limit: 2, before: "first-page-newer-2" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tokenMint: mint,
      soul,
      generation: 2,
      side: "buy",
      amount: "990000",
      seedHash: "c613e02aa48460b1",
      signature: "adlartu-generation-2",
      slot: 250,
      blockTime: 1_777_419_851,
      source: "finalized-rpc-logs",
    });
  });

  it("checks finalized exact lookup signature hints before paginating public program logs", async () => {
    const mint = "ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r";
    const soul = "Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ";
    const rows = await fetchGenerationRowsFromFinalizedRpc({
      connection: {} as never,
      filters: { mint, generation: 2 },
      loaders: {
        getSignaturesForAddress: async () => {
          throw new Error("hinted exact lookup should not paginate program signatures first");
        },
        getTransaction: async (_connection, sig) => {
          expect(sig).toBe("nJCQ4htehrUSF6RFHSMQzPyW5swfRj4prZotprPGQnFpJapywiyCp5L3VZXmK2wtwEpZz7hYdBR55jxx7xpBJfd");
          return tx(458769366, 1_777_419_851, [
            generationLog({
              generation: 2,
              side: "buy",
              amount: "990000",
              trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
              tokenAccount: "*****************************************",
              mint,
              soul,
              seedHash: "c613e02aa48460b1",
            }),
          ]);
        },
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tokenMint: mint,
      soul,
      generation: 2,
      signature: "nJCQ4htehrUSF6RFHSMQzPyW5swfRj4prZotprPGQnFpJapywiyCp5L3VZXmK2wtwEpZz7hYdBR55jxx7xpBJfd",
      slot: 458769366,
      source: "finalized-rpc-logs",
    });
  });

  it("keeps broad token generation list routes bounded to one program-signature page", async () => {
    const program = PublicKey.unique();
    const mint = PublicKey.unique().toBase58();
    const calls: Array<{ limit: number; before?: string }> = [];
    const rows = await fetchGenerationRowsFromFinalizedRpc({
      connection: {} as never,
      programIds: [program],
      filters: { mint },
      signatureLimit: 2,
      loaders: {
        getSignaturesForAddress: async (_connection, _address, limit, _commitment, before) => {
          calls.push({ limit, before });
          return [signature("newer-list-row", 12), signature("older-list-row", 11)];
        },
        getTransaction: async (_connection, sig) =>
          tx(sig === "newer-list-row" ? 12 : 11, null, [
            generationLog({
              generation: sig === "newer-list-row" ? 4 : 3,
              side: "buy",
              amount: "100",
              trader: "TraderWallet11111111111111111111111111111",
              tokenAccount: "TraderToken111111111111111111111111111111",
              mint,
              soul: PublicKey.unique().toBase58(),
              seedHash: "aabbccdd00112233",
            }),
          ]),
      },
    });

    expect(calls).toEqual([{ limit: 2, before: undefined }]);
    expect(rows.map((row) => row.signature)).toEqual(["older-list-row", "newer-list-row"]);
  });

  it("stops broad stats aggregation after the configured transaction budget", async () => {
    const program = PublicKey.unique();
    const mint = PublicKey.unique().toBase58();
    const fetchedTransactions: string[] = [];
    const rows = await fetchGenerationRowsFromFinalizedRpc({
      connection: {} as never,
      programIds: [program],
      signatureLimit: 5,
      maxTransactions: 2,
      loaders: {
        getSignaturesForAddress: async () => [
          signature("newest-row", 15),
          signature("middle-row", 14),
          signature("oldest-row", 13),
        ],
        getTransaction: async (_connection, sig) => {
          fetchedTransactions.push(sig);
          return tx(sig === "newest-row" ? 15 : sig === "middle-row" ? 14 : 13, null, [
            generationLog({
              generation: sig === "newest-row" ? 5 : sig === "middle-row" ? 4 : 3,
              side: "buy",
              amount: "100",
              trader: "TraderWallet11111111111111111111111111111",
              tokenAccount: "*****************************************",
              mint,
              soul: PublicKey.unique().toBase58(),
              seedHash: "aabbccdd00112233",
            }),
          ]);
        },
      },
    });

    expect(fetchedTransactions).toEqual(["newest-row", "middle-row"]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.signature)).toEqual(["middle-row", "newest-row"]);
  });

  it("retries transient devnet RPC HTTP 400 errors during exact generation lookups", async () => {
    vi.useFakeTimers();
    const program = PublicKey.unique();
    const mint = PublicKey.unique().toBase58();
    const soul = PublicKey.unique().toBase58();
    let signatureCalls = 0;
    const pendingRows = fetchGenerationRowsFromFinalizedRpc({
      connection: {} as never,
      programIds: [program],
      filters: { mint, generation: 2 },
      signatureLimit: 2,
      loaders: {
        getSignaturesForAddress: async () => {
          signatureCalls += 1;
          if (signatureCalls === 1) {
            throw new Error("failed to get signatures: HTTP 400 from devnet RPC");
          }
          return [signature("generation-after-retry", 250)];
        },
        getTransaction: async () =>
          tx(250, 1_777_419_851, [
            generationLog({
              generation: 2,
              side: "buy",
              amount: "990000",
              trader: "Trader1111111111111111111111111111111111",
              tokenAccount: "****************************************",
              mint,
              soul,
              seedHash: "c613e02aa48460b1",
            }),
          ]),
      },
    });

    await vi.advanceTimersByTimeAsync(300);
    const rows = await pendingRows;

    expect(signatureCalls).toBe(2);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tokenMint: mint,
      generation: 2,
      signature: "generation-after-retry",
    });
    vi.useRealTimers();
  });

  it("skips transient transaction fetch failures without aborting the bounded scan", async () => {
    vi.useFakeTimers();
    const program = PublicKey.unique();
    const mint = PublicKey.unique().toBase58();
    const soul = PublicKey.unique().toBase58();
    const pendingRows = fetchGenerationRowsFromFinalizedRpc({
      connection: {} as never,
      programIds: [program],
      signatureLimit: 2,
      loaders: {
        getSignaturesForAddress: async () => [
          signature("transient-transaction", 251),
          signature("generation-ok", 250),
        ],
        getTransaction: async (_connection, sig) => {
          if (sig === "transient-transaction") {
            throw new Error("429 too many requests while fetching transaction");
          }
          return tx(250, 1_777_419_851, [
            generationLog({
              generation: 2,
              side: "buy",
              amount: "990000",
              trader: "Trader1111111111111111111111111111111111",
              tokenAccount: "****************************************",
              mint,
              soul,
              seedHash: "c613e02aa48460b1",
            }),
          ]);
        },
      },
    });

    await vi.advanceTimersByTimeAsync(8_000);
    const rows = await pendingRows;

    expect(rows.map((row) => row.signature)).toEqual(["generation-ok"]);
    vi.useRealTimers();
  });

  it("surfaces exact generation lookups as partial when transaction fetch retries exhaust before any matching row is found", async () => {
    vi.useFakeTimers();
    const program = PublicKey.unique();
    const mint = PublicKey.unique().toBase58();
    let transactionAttempts = 0;
    const pendingRows = fetchGenerationRowsFromFinalizedRpc({
      connection: {} as never,
      programIds: [program],
      filters: { mint, generation: 2 },
      signatureLimit: 2,
      loaders: {
        getSignaturesForAddress: async () => [signature("transient-generation-candidate", 250)],
        getTransaction: async () => {
          transactionAttempts += 1;
          throw new Error("429 too many requests while fetching transaction");
        },
      },
    });

    const rejection = pendingRows.catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    const error = await rejection;
    expect(error).toBeInstanceOf(GenerationProvenancePartialError);
    expect(error).toMatchObject({
      message: expect.stringContaining("Exact generation lookup is partial"),
    });
    expect(transactionAttempts).toBe(5);
    vi.useRealTimers();
  });
});

function rowKey(row: GenerationProvenanceRow | undefined): string {
  if (!row) {
    return "";
  }
  return `${row.tokenMint}:${row.soul}:${row.generation}`;
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

function tx(slot: number, blockTime: number | null, logs: string[]) {
  return {
    slot,
    blockTime,
    meta: {
      err: null,
      logMessages: logs,
    },
  };
}

function generationLog({
  generation,
  side,
  amount,
  trader,
  tokenAccount,
  mint,
  soul,
  seedHash,
}: {
  generation: number;
  side: "buy" | "sell";
  amount: string;
  trader: string;
  tokenAccount: string;
  mint: string;
  soul: string;
  seedHash: string;
}): string {
  return `Program log: [event:generation] generation=${generation} side=${side} amount=${amount} trader=${trader} token_account=${tokenAccount} mint=${mint} soul=${soul} seed_hash=${seedHash}`;
}
