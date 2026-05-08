import { PublicKey } from "@solana/web3.js";

export type EventType = "graduation" | "claim" | "pause" | "generation";

export interface ParsedEvent {
  type: EventType;
  payload: Record<string, string | boolean>;
}

export interface GenerationEventPayload {
  generation: number;
  side: "buy" | "sell";
  amount: string;
  trader: string;
  tokenAccount: string;
  mint: string;
  soul: string;
  seedHash: string;
}

export type ReceiptLifecycleState = "active" | "burned" | "forfeited";

export interface DecodedReceiptAccount {
  soul: string;
  claimant: string;
  tokenMint: string;
  nftMint: string;
  sequence: string;
  generationCount: string;
  boundQuantity: string;
  boundBoundary: string;
  lifecycleState: ReceiptLifecycleState;
}

export const RECEIPT_ACCOUNT_SIZE = 161;
const RECEIPT_SOUL_OFFSET = 0;
const RECEIPT_CLAIMANT_OFFSET = 32;
const RECEIPT_TOKEN_MINT_OFFSET = 64;
const RECEIPT_NFT_MINT_OFFSET = 96;
const RECEIPT_SEQUENCE_OFFSET = 128;
const RECEIPT_GENERATION_COUNT_OFFSET = 136;
const RECEIPT_BOUND_QUANTITY_OFFSET = 144;
const RECEIPT_BOUND_BOUNDARY_OFFSET = 152;
const RECEIPT_LIFECYCLE_STATE_OFFSET = 160;

const EVENT_RE = /\[event:(graduation|claim|pause|generation)\]\s+(.*)$/;
const GENERATION_SEED_HASH_RE = /^[0-9a-fA-F]+$/;
const MAX_EVENT_LINE_LEN = 4096;
const MAX_EVENT_FIELDS = 64;

export function parseEventLog(line: string): ParsedEvent | null {
  if (line.length > MAX_EVENT_LINE_LEN) {
    return null;
  }
  const match = EVENT_RE.exec(line);
  if (!match) {
    return null;
  }

  const [, type, fields] = match;
  const tokens = fields.trim().split(/\s+/);
  if (tokens.length > MAX_EVENT_FIELDS) {
    return null;
  }
  const payload: ParsedEvent["payload"] = {};
  for (const token of tokens) {
    const separator = token.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = token.slice(0, separator);
    const value = token.slice(separator + 1);
    payload[key] =
      key === "paused" && (value === "true" || value === "false")
        ? value === "true"
        : value;
  }

  return {
    type: type as EventType,
    payload,
  };
}

export function parseGenerationEventPayload(
  event: ParsedEvent,
): GenerationEventPayload | null {
  if (event.type !== "generation") {
    return null;
  }

  const generation = readString(event.payload.generation);
  const side = readString(event.payload.side);
  const amount = readString(event.payload.amount);
  const trader = readString(event.payload.trader);
  const tokenAccount = readString(event.payload.token_account);
  const mint = readString(event.payload.mint);
  const soul = readString(event.payload.soul);
  const seedHash = readString(event.payload.seed_hash);

  if (
    !generation ||
    (side !== "buy" && side !== "sell") ||
    !amount ||
    !trader ||
    !tokenAccount ||
    !mint ||
    !soul ||
    !seedHash ||
    event.payload.signature !== undefined ||
    event.payload.slot !== undefined ||
    event.payload.blockTime !== undefined ||
    !/^\d+$/.test(generation) ||
    !/^\d+$/.test(amount) ||
    !GENERATION_SEED_HASH_RE.test(seedHash)
  ) {
    return null;
  }

  const parsedGeneration = Number(generation);
  if (!Number.isSafeInteger(parsedGeneration) || parsedGeneration < 0) {
    return null;
  }

  return {
    generation: parsedGeneration,
    side,
    amount,
    trader,
    tokenAccount,
    mint,
    soul,
    seedHash: seedHash.toLowerCase(),
  };
}

export function decodeReceiptAccount(data: Uint8Array): DecodedReceiptAccount {
  if (data.byteLength < RECEIPT_ACCOUNT_SIZE) {
    throw new Error(
      `ReceiptAccount data too small: expected ${RECEIPT_ACCOUNT_SIZE}, got ${data.byteLength}`,
    );
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    soul: publicKeyString(data, RECEIPT_SOUL_OFFSET),
    claimant: publicKeyString(data, RECEIPT_CLAIMANT_OFFSET),
    tokenMint: publicKeyString(data, RECEIPT_TOKEN_MINT_OFFSET),
    nftMint: publicKeyString(data, RECEIPT_NFT_MINT_OFFSET),
    sequence: view.getBigUint64(RECEIPT_SEQUENCE_OFFSET, true).toString(),
    generationCount: view.getBigUint64(RECEIPT_GENERATION_COUNT_OFFSET, true).toString(),
    boundQuantity: view.getBigUint64(RECEIPT_BOUND_QUANTITY_OFFSET, true).toString(),
    boundBoundary: view.getBigUint64(RECEIPT_BOUND_BOUNDARY_OFFSET, true).toString(),
    lifecycleState: decodeReceiptLifecycleState(data[RECEIPT_LIFECYCLE_STATE_OFFSET] ?? 0),
  };
}

function decodeReceiptLifecycleState(value: number): ReceiptLifecycleState {
  if (value === 1) {
    return "active";
  }
  if (value === 2) {
    return "burned";
  }
  if (value === 3) {
    return "forfeited";
  }
  throw new Error(`Unknown receipt lifecycle state: ${value}`);
}

function publicKeyString(data: Uint8Array, offset: number): string {
  return new PublicKey(data.slice(offset, offset + 32)).toBase58();
}

function readString(value: ParsedEvent["payload"][string]): string | undefined {
  return typeof value === "string" ? value : undefined;
}
