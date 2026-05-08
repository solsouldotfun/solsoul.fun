import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  decodeReceiptAccount,
  parseEventLog,
  parseGenerationEventPayload,
} from "./events.js";

describe("parseEventLog", () => {
  it("parses graduation events", () => {
    expect(
      parseEventLog(
        "Program log: [event:graduation] curve=Curve1111111111111111111111111111111111 sol_raised=85000000000",
      ),
    ).toEqual({
      type: "graduation",
      payload: {
        curve: "Curve1111111111111111111111111111111111",
        sol_raised: "85000000000",
      },
    });
  });

  it("parses claim events", () => {
    expect(
      parseEventLog(
        "[event:claim] soul=Soul111111111111111111111111111111111111 nft_mint=Nft1111111111111111111111111111111111111 claimer=Claim111111111111111111111111111111111",
      ),
    ).toEqual({
      type: "claim",
      payload: {
        soul: "Soul111111111111111111111111111111111111",
        nft_mint: "Nft1111111111111111111111111111111111111",
        claimer: "Claim111111111111111111111111111111111",
      },
    });
  });

  it("parses pause and unpause events as a single pause event type", () => {
    expect(
      parseEventLog(
        "[event:pause] paused=false admin=Admin11111111111111111111111111111111111",
      ),
    ).toEqual({
      type: "pause",
      payload: {
        paused: false,
        admin: "Admin11111111111111111111111111111111111",
      },
    });
  });

  it("parses generation provenance without transaction context fields", () => {
    const parsed = parseEventLog(
      "[event:generation] generation=2 side=sell amount=123 trader=Trader111111111111111111111111111111111 token_account=Token1111111111111111111111111111111111 mint=Mint111111111111111111111111111111111111 soul=Soul111111111111111111111111111111111111 seed_hash=0102030405060708",
    );

    expect(parsed).toEqual({
      type: "generation",
      payload: {
        generation: "2",
        side: "sell",
        amount: "123",
        trader: "Trader111111111111111111111111111111111",
        token_account: "Token1111111111111111111111111111111111",
        mint: "Mint111111111111111111111111111111111111",
        soul: "Soul111111111111111111111111111111111111",
        seed_hash: "0102030405060708",
      },
    });
    expect(parsed?.payload).not.toHaveProperty("signature");
    expect(parsed?.payload).not.toHaveProperty("slot");
    expect(parsed?.payload).not.toHaveProperty("blockTime");
    expect(parsed && parseGenerationEventPayload(parsed)).toEqual({
      generation: 2,
      side: "sell",
      amount: "123",
      trader: "Trader111111111111111111111111111111111",
      tokenAccount: "Token1111111111111111111111111111111111",
      mint: "Mint111111111111111111111111111111111111",
      soul: "Soul111111111111111111111111111111111111",
      seedHash: "0102030405060708",
    });
  });

  it("rejects generation payloads that try to carry transaction context", () => {
    const parsed = parseEventLog(
      "[event:generation] generation=2 side=buy amount=123 trader=Trader111111111111111111111111111111111 token_account=Token1111111111111111111111111111111111 mint=Mint111111111111111111111111111111111111 soul=Soul111111111111111111111111111111111111 seed_hash=0102030405060708 signature=must-not-be-on-chain",
    );

    expect(parsed && parseGenerationEventPayload(parsed)).toBeNull();
  });

  it("ignores non-event logs", () => {
    expect(parseEventLog("Program log: [curve] legacy account read")).toBeNull();
  });

  it("rejects lines longer than MAX_EVENT_LINE_LEN (4096)", () => {
    const longLine = "[event:graduation] " + "a=b ".repeat(2000);
    expect(longLine.length).toBeGreaterThan(4096);
    expect(parseEventLog(longLine)).toBeNull();
  });

  it("rejects lines with more than MAX_EVENT_FIELDS (64) fields", () => {
    const fields = Array.from({ length: 65 }, (_, i) => `k${i}=v${i}`).join(" ");
    const line = "[event:graduation] " + fields;
    expect(line.length).toBeLessThanOrEqual(4096);
    expect(parseEventLog(line)).toBeNull();
  });

  it("parses valid line at exactly MAX_EVENT_FIELDS (64) fields", () => {
    const fields = Array.from({ length: 64 }, (_, i) => `k${i}=v${i}`).join(" ");
    const line = "[event:graduation] " + fields;
    expect(line.length).toBeLessThanOrEqual(4096);
    const result = parseEventLog(line);
    expect(result).not.toBeNull();
    expect(result?.type).toBe("graduation");
  });

  it("decodes receipt binding account lifecycle states from account data", () => {
    const soul = PublicKey.unique().toBase58();
    const claimant = PublicKey.unique().toBase58();
    const tokenMint = PublicKey.unique().toBase58();
    const nftMint = PublicKey.unique().toBase58();
    const receipt = decodeReceiptAccount(
      receiptData({
        soul,
        claimant,
        tokenMint,
        nftMint,
        lifecycleState: "forfeited",
      }),
    );

    expect(receipt).toMatchObject({
      soul,
      claimant,
      tokenMint,
      nftMint,
      sequence: "2",
      generationCount: "3",
      boundQuantity: "1000000",
      boundBoundary: "3",
      lifecycleState: "forfeited",
    });
  });
});

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
  const data = new Uint8Array(161);
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
