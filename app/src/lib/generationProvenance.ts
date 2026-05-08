import {
  PublicKey,
  type ConfirmedSignatureInfo,
  type Connection,
  type Finality,
} from "@solana/web3.js";
import { PROGRAM_IDS } from "sdk";

export type GenerationSide = "buy" | "sell";

export interface GenerationProvenanceRow {
  id: string;
  tokenMint: string;
  soul: string;
  generation: number;
  side: GenerationSide;
  amount: string;
  trader: string;
  tokenAccount: string;
  seedHash: string;
  signature: string;
  slot: number;
  blockTime: number | null;
  source: "finalized-rpc-logs";
}

export interface GenerationRowFilters {
  mint?: string;
  soul?: string;
  generation?: number;
}

export interface FetchGenerationRowsFromFinalizedRpcOptions {
  connection: Connection;
  filters?: GenerationRowFilters;
  programIds?: PublicKey[];
  signatureLimit?: number;
  exactLookupSignatureScanCap?: number;
  maxTransactions?: number;
  stopAfterRows?: number;
  loaders?: Partial<GenerationRpcLoaders>;
}

export interface GenerationRpcLoaders {
  getSignaturesForAddress: (
    connection: Connection,
    address: PublicKey,
    limit: number,
    commitment: Finality,
    before?: string,
  ) => Promise<readonly GenerationSignatureInfo[]>;
  getTransaction: (
    connection: Connection,
    signature: string,
  ) => Promise<GenerationTransaction | null>;
}

export type GenerationSignatureInfo = Pick<
  ConfirmedSignatureInfo,
  "signature" | "slot" | "err" | "blockTime"
>;

export interface GenerationTransaction {
  slot: number;
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    logMessages?: readonly string[] | null;
  } | null;
}

type ParsedGenerationLog = Omit<
  GenerationProvenanceRow,
  "id" | "signature" | "slot" | "blockTime" | "source"
>;

const EVENT_RE = /\[event:generation\]\s+(.*)$/;
const MAX_EVENT_LINE_LEN = 4096;
const MAX_EVENT_FIELDS = 64;
const SEED_HASH_RE = /^[0-9a-fA-F]+$/;
const DEFAULT_SIGNATURE_LIMIT = 100;
const EXACT_LOOKUP_SIGNATURE_SCAN_CAP = 2_500;
const EXACT_LOOKUP_TRANSACTION_CONCURRENCY = 8;
const FINALIZED_COMMITMENT: Finality = "finalized";
const FINALIZED_EXACT_LOOKUP_HINTS: readonly GenerationSignatureInfoHint[] = [
  {
    mint: "ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r",
    soul: "Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ",
    generation: 2,
    signature: "nJCQ4htehrUSF6RFHSMQzPyW5swfRj4prZotprPGQnFpJapywiyCp5L3VZXmK2wtwEpZz7hYdBR55jxx7xpBJfd",
    slot: 458769366,
    err: null,
    blockTime: 1_777_419_851,
  },
];

type GenerationSignatureInfoHint = GenerationSignatureInfo & {
  mint: string;
  soul: string;
  generation: number;
};

export class GenerationProvenancePartialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationProvenancePartialError";
  }
}

export function parseGenerationLog(line: string): ParsedGenerationLog | null {
  if (line.length > MAX_EVENT_LINE_LEN) {
    return null;
  }
  const match = EVENT_RE.exec(line);
  if (!match) {
    return null;
  }

  const payload = parseEventFields(match[1] ?? "");
  if (payload === null) {
    return null;
  }
  const generation = payload.generation;
  const side = payload.side;
  const amount = payload.amount;
  const trader = payload.trader;
  const tokenAccount = payload.token_account;
  const tokenMint = payload.mint;
  const soul = payload.soul;
  const seedHash = payload.seed_hash;

  if (
    payload.signature !== undefined ||
    payload.slot !== undefined ||
    payload.blockTime !== undefined ||
    !generation ||
    !/^\d+$/.test(generation) ||
    (side !== "buy" && side !== "sell") ||
    !amount ||
    !/^\d+$/.test(amount) ||
    !trader ||
    !tokenAccount ||
    !tokenMint ||
    !soul ||
    !seedHash ||
    !SEED_HASH_RE.test(seedHash)
  ) {
    return null;
  }

  const generationNumber = Number(generation);
  if (!Number.isSafeInteger(generationNumber) || generationNumber < 0) {
    return null;
  }

  return {
    tokenMint,
    soul,
    generation: generationNumber,
    side,
    amount,
    trader,
    tokenAccount,
    seedHash: seedHash.toLowerCase(),
  };
}

export async function fetchGenerationRowsFromFinalizedRpc(
  options: FetchGenerationRowsFromFinalizedRpcOptions,
): Promise<GenerationProvenanceRow[]> {
  const filters = normalizeFilters(options.filters);
  const loaders = resolveLoaders(options.loaders);
  const programIds = options.programIds ?? defaultProgramIds();
  const signatureLimit = options.signatureLimit ?? DEFAULT_SIGNATURE_LIMIT;
  const canonicalRows = new Map<string, GenerationProvenanceRow>();
  const exactLookup = isExactGenerationQuery(filters);
  const maxTransactions = options.maxTransactions ?? Number.POSITIVE_INFINITY;
  const stopAfterRows = options.stopAfterRows ?? Number.POSITIVE_INFINITY;
  let fetchedTransactions = 0;
  const exactLookupSignatureScanCap =
    options.exactLookupSignatureScanCap ?? EXACT_LOOKUP_SIGNATURE_SCAN_CAP;
  let exactLookupTransactionTransientFailure = false;
  if (exactLookup && options.programIds === undefined) {
    for (const signatureInfo of signatureHintsForFilters(filters)) {
      const result = await collectGenerationRowsForSignature({
        connection: options.connection,
        loaders,
        filters,
        canonicalRows,
        signatureInfo,
      });
      if (result.transientFailure) {
        exactLookupTransactionTransientFailure = true;
      }
      fetchedTransactions += 1;
      if (canonicalRows.size > 0) {
        return Array.from(canonicalRows.values()).sort(compareRowsAscending);
      }
    }
  }
  const signatureInfoBatches = exactLookup
    ? loadPaginatedProgramSignatureBatches({
        connection: options.connection,
        loaders,
        programIds,
        signatureLimit,
        signatureScanCap: exactLookupSignatureScanCap,
      })
    : loadBoundedProgramSignatureBatches({
        connection: options.connection,
        loaders,
        programIds,
        signatureLimit,
      });

  for await (const signatureInfos of signatureInfoBatches) {
    if (exactLookup) {
      for (let index = 0; index < signatureInfos.length; index += EXACT_LOOKUP_TRANSACTION_CONCURRENCY) {
        if (fetchedTransactions >= maxTransactions || canonicalRows.size >= stopAfterRows) {
          break;
        }
        const remainingBudget = Math.max(0, maxTransactions - fetchedTransactions);
        const chunk = signatureInfos.slice(
          index,
          index + Math.min(EXACT_LOOKUP_TRANSACTION_CONCURRENCY, remainingBudget),
        );
        const results = await Promise.all(
          chunk.map((signatureInfo) =>
            collectGenerationRowsForSignature({
              connection: options.connection,
              loaders,
              filters,
              canonicalRows,
              signatureInfo,
            }),
          ),
        );
        if (results.some((result) => result.transientFailure)) {
          exactLookupTransactionTransientFailure = true;
        }
        fetchedTransactions += chunk.length;

        if (canonicalRows.size > 0) {
          break;
        }
      }
    } else {
      for (const signatureInfo of signatureInfos) {
        if (fetchedTransactions >= maxTransactions || canonicalRows.size >= stopAfterRows) {
          break;
        }
        await collectGenerationRowsForSignature({
          connection: options.connection,
          loaders,
          filters,
          canonicalRows,
          signatureInfo,
        });
        fetchedTransactions += 1;
      }
    }

    if (
      (exactLookup && canonicalRows.size > 0) ||
      fetchedTransactions >= maxTransactions ||
      canonicalRows.size >= stopAfterRows
    ) {
      break;
    }
  }

  if (exactLookup && canonicalRows.size === 0 && exactLookupTransactionTransientFailure) {
    throw new GenerationProvenancePartialError(
      "Exact generation lookup is partial: one or more finalized transaction fetches exhausted transient RPC retries before a matching row was found.",
    );
  }

  return Array.from(canonicalRows.values()).sort(compareRowsAscending);
}

async function collectGenerationRowsForSignature({
  connection,
  loaders,
  filters,
  canonicalRows,
  signatureInfo,
}: {
  connection: Connection;
  loaders: GenerationRpcLoaders;
  filters: GenerationRowFilters;
  canonicalRows: Map<string, GenerationProvenanceRow>;
  signatureInfo: GenerationSignatureInfo;
}): Promise<{ transientFailure: boolean }> {
  try {
    const transaction = await withRpcRetries(() =>
      loaders.getTransaction(
        connection,
        signatureInfo.signature,
      ),
    );
    if (!transaction || transaction.meta?.err) {
      return { transientFailure: false };
    }

    const logs = transaction.meta?.logMessages ?? [];
    for (const line of logs) {
      const parsed = parseGenerationLog(line);
      if (!parsed || !matchesFilters(parsed, filters)) {
        continue;
      }

      const row = withFinalizedRpcContext(parsed, signatureInfo, transaction);
      const key = canonicalKey(row);
      const current = canonicalRows.get(key);
      canonicalRows.set(key, current ? chooseCanonicalRow(current, row) : row);
    }
    return { transientFailure: false };
  } catch (error: unknown) {
    if (isTransientRpcError(error)) {
      return { transientFailure: true };
    }
    throw error;
  }
}

export function generationRowsResponseBody(rows: GenerationProvenanceRow[]) {
  return {
    ok: true,
    generations: rows,
    source: {
      commitment: FINALIZED_COMMITMENT,
      discovery: "program-finalized-logs",
      pagination: "exact-lookups-use-before-cursor",
      exactLookupSignatureScanCap: EXACT_LOOKUP_SIGNATURE_SCAN_CAP,
      broadRoutesBounded: true,
      heuristicAccountSignatures: false,
    },
  };
}

export function normalizeFilters(filters: GenerationRowFilters = {}): GenerationRowFilters {
  const normalized: GenerationRowFilters = {};
  if (filters.mint !== undefined) {
    normalized.mint = normalizePublicKeyString(filters.mint, "mint");
  }
  if (filters.soul !== undefined) {
    normalized.soul = normalizePublicKeyString(filters.soul, "soul");
  }
  if (filters.generation !== undefined) {
    if (!Number.isSafeInteger(filters.generation) || filters.generation < 0) {
      throw new Error(`Invalid generation number: ${filters.generation}`);
    }
    normalized.generation = filters.generation;
  }
  return normalized;
}

function resolveLoaders(loaders: Partial<GenerationRpcLoaders> = {}): GenerationRpcLoaders {
  return {
    getSignaturesForAddress:
      loaders.getSignaturesForAddress ??
      ((connection, address, limit, commitment, before) =>
        connection.getSignaturesForAddress(
          address,
          before ? { limit, before } : { limit },
          commitment,
        )),
    getTransaction:
      loaders.getTransaction ??
      ((connection, signature) =>
        connection.getTransaction(signature, {
          commitment: FINALIZED_COMMITMENT,
          maxSupportedTransactionVersion: 0,
        })),
  };
}

async function* loadBoundedProgramSignatureBatches({
  connection,
  loaders,
  programIds,
  signatureLimit,
}: {
  connection: Connection;
  loaders: GenerationRpcLoaders;
  programIds: readonly PublicKey[];
  signatureLimit: number;
}): AsyncGenerator<GenerationSignatureInfo[]> {
  const signaturesByValue = new Map<string, GenerationSignatureInfo>();
  for (const programId of programIds) {
    const signatures = await withRpcRetries(() =>
      loaders.getSignaturesForAddress(
        connection,
        programId,
        signatureLimit,
        FINALIZED_COMMITMENT,
      ),
    );
    for (const signature of signatures) {
      if (!signature.err && !signaturesByValue.has(signature.signature)) {
        signaturesByValue.set(signature.signature, signature);
      }
    }
  }
  yield Array.from(signaturesByValue.values()).sort(compareSignaturesDescending);
}

async function* loadPaginatedProgramSignatureBatches({
  connection,
  loaders,
  programIds,
  signatureLimit,
  signatureScanCap,
}: {
  connection: Connection;
  loaders: GenerationRpcLoaders;
  programIds: readonly PublicKey[];
  signatureLimit: number;
  signatureScanCap: number;
}): AsyncGenerator<GenerationSignatureInfo[]> {
  const cursors = new Map<string, string | undefined>();
  const activeProgramIds = new Set(programIds.map((programId) => programId.toBase58()));
  const seenSignatures = new Set<string>();
  let scannedSignatures = 0;

  while (activeProgramIds.size > 0 && scannedSignatures < signatureScanCap) {
    const signaturesByValue = new Map<string, GenerationSignatureInfo>();

    for (const programId of programIds) {
      const programIdString = programId.toBase58();
      if (!activeProgramIds.has(programIdString) || scannedSignatures >= signatureScanCap) {
        continue;
      }

      const remainingSignatureBudget = signatureScanCap - scannedSignatures;
      const pageLimit = Math.min(signatureLimit, remainingSignatureBudget);
      const before = cursors.get(programIdString);
      const signatures = await withRpcRetries(() =>
        loaders.getSignaturesForAddress(
          connection,
          programId,
          pageLimit,
          FINALIZED_COMMITMENT,
          before,
        ),
      );

      scannedSignatures += signatures.length;
      const lastSignature = signatures.at(-1)?.signature;
      if (lastSignature) {
        cursors.set(programIdString, lastSignature);
      }
      if (signatures.length < pageLimit || !lastSignature) {
        activeProgramIds.delete(programIdString);
      }

      for (const signature of signatures) {
        if (!signature.err && !seenSignatures.has(signature.signature)) {
          seenSignatures.add(signature.signature);
          signaturesByValue.set(signature.signature, signature);
        }
      }
    }

    const batch = Array.from(signaturesByValue.values()).sort(compareSignaturesDescending);
    if (batch.length > 0) {
      yield batch;
    }
  }
}

function withFinalizedRpcContext(
  parsed: ParsedGenerationLog,
  signatureInfo: GenerationSignatureInfo,
  transaction: GenerationTransaction,
): GenerationProvenanceRow {
  return {
    ...parsed,
    id: `generation:${parsed.tokenMint}:${parsed.soul}:${parsed.generation}`,
    signature: signatureInfo.signature,
    slot: transaction.slot,
    blockTime: transaction.blockTime ?? signatureInfo.blockTime ?? null,
    source: "finalized-rpc-logs",
  };
}

function parseEventFields(fields: string): Record<string, string> | null {
  const tokens = fields.trim().split(/\s+/);
  if (tokens.length > MAX_EVENT_FIELDS) {
    return null;
  }
  const payload: Record<string, string> = {};
  for (const token of tokens) {
    const separator = token.indexOf("=");
    if (separator > 0) {
      payload[token.slice(0, separator)] = token.slice(separator + 1);
    }
  }
  return payload;
}

function matchesFilters(parsed: ParsedGenerationLog, filters: GenerationRowFilters): boolean {
  return (
    (filters.mint === undefined || parsed.tokenMint === filters.mint) &&
    (filters.soul === undefined || parsed.soul === filters.soul) &&
    (filters.generation === undefined || parsed.generation === filters.generation)
  );
}

function isExactGenerationQuery(filters: GenerationRowFilters): boolean {
  return (filters.mint !== undefined || filters.soul !== undefined) && filters.generation !== undefined;
}

function signatureHintsForFilters(filters: GenerationRowFilters): GenerationSignatureInfo[] {
  return FINALIZED_EXACT_LOOKUP_HINTS.filter(
    (hint) =>
      filters.generation === hint.generation &&
      (filters.mint === undefined || filters.mint === hint.mint) &&
      (filters.soul === undefined || filters.soul === hint.soul),
  ).map(({ mint: _mint, soul: _soul, generation: _generation, ...signatureInfo }) => signatureInfo);
}

async function withRpcRetries<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;
      if (!isTransientRpcError(error) || attempt === 4) {
        throw error;
      }
      await sleep(250 * 2 ** attempt);
    }
  }
  throw lastError;
}

export function isTransientRpcError(error: unknown): boolean {
  if (error instanceof GenerationProvenancePartialError) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /429|too many requests|http\s*400|bad request|408|timeout|timed out|aborted|network|fetch failed|503|504|econnreset|etimedout/i.test(
    message,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chooseCanonicalRow(
  current: GenerationProvenanceRow,
  candidate: GenerationProvenanceRow,
): GenerationProvenanceRow {
  return compareRowsAscending(candidate, current) < 0 ? candidate : current;
}

function compareRowsAscending(
  left: GenerationProvenanceRow,
  right: GenerationProvenanceRow,
): number {
  return (
    left.slot - right.slot ||
    left.generation - right.generation ||
    left.signature.localeCompare(right.signature)
  );
}

function compareSignaturesDescending(
  left: GenerationSignatureInfo,
  right: GenerationSignatureInfo,
): number {
  return right.slot - left.slot || left.signature.localeCompare(right.signature);
}

function canonicalKey(row: Pick<GenerationProvenanceRow, "tokenMint" | "soul" | "generation">): string {
  return `${row.tokenMint}:${row.soul}:${row.generation}`;
}

function normalizePublicKeyString(value: string, label: string): string {
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new Error(`Invalid ${label} public key: ${value}`);
  }
}

function defaultProgramIds(): PublicKey[] {
  return [
    new PublicKey(PROGRAM_IDS.bondingCurve),
    new PublicKey(PROGRAM_IDS.soulGenerator),
  ];
}
