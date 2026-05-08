import type { GenerationProvenance } from "sdk";
import type { GenerationProvenanceRow } from "./generationProvenance";

export type MarketTradeSide = "buy" | "sell";

export interface MarketProvenanceDetails {
  generation: string;
  side: MarketTradeSide;
  amount: string;
  trader: string;
  traderLabel: string;
  tokenAccount?: string;
  tokenMint?: string;
  soul?: string;
  seedHash: string;
  signature?: string;
  slot?: string;
  explorerUrl?: string;
}

export interface MarketProvenanceLookup {
  tokenMint?: string;
  soul?: string;
  generation?: string | number | bigint;
}

export type MarketProvenanceEvidenceState = "available" | "pending" | "not-applicable";

type MetadataAttribute = {
  trait_type?: unknown;
  value?: unknown;
};

type GenerationRowsResponse = {
  ok?: boolean;
  generations?: GenerationProvenanceRow[];
};

type StatsActivityResponse = {
  ok?: boolean;
  recentActivity?: StatsGenerationActivity[];
};

type StatsGenerationActivity = {
  id?: unknown;
  kind?: unknown;
  generation?: unknown;
  side?: unknown;
  amount?: unknown;
  trader?: unknown;
  tokenAccount?: unknown;
  seedHash?: unknown;
  signature?: unknown;
  slot?: unknown;
  soul?: unknown;
};

type TokenTimelineResponse = {
  ok?: boolean;
  events?: TokenTimelineEvent[];
};

type TokenTimelineEvent = StatsGenerationActivity & {
  tokenMint?: unknown;
};

type ProvenanceResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

const MARKET_PROVENANCE_FETCH_TIMEOUT_MS = 30_000;
const MARKET_PROVENANCE_RETRY_DELAYS_MS = [250, 750] as const;
const MARKET_PROVENANCE_RESPONSE_CACHE_TTL_MS = 15_000;
const MARKET_PROVENANCE_TRANSIENT_BACKOFF_MS = 30_000;
const statsActivityCache = new WeakMap<ProvenanceFetch, Promise<StatsActivityResponse | null>>();
const provenanceUrlCache = new WeakMap<
  ProvenanceFetch,
  Map<string, { expiresAt: number; promise: Promise<ProvenanceResponse> }>
>();

export type ProvenanceFetch = (
  input: string,
  init?: RequestInit,
) => Promise<ProvenanceResponse>;

export function marketProvenanceFromSdk(
  provenance: GenerationProvenance | null | undefined,
): MarketProvenanceDetails | null {
  if (!provenance) {
    return null;
  }
  const trader = provenance.trader.toBase58();
  const signature = provenance.signature;

  return {
    generation: provenance.generation.toString(),
    side: provenance.side,
    amount: provenance.amount.toString(),
    trader,
    traderLabel: truncateMarketAddress(trader),
    tokenAccount: provenance.tokenAccount.toBase58(),
    tokenMint: provenance.tokenMint.toBase58(),
    soul: provenance.soul.toBase58(),
    seedHash: provenance.seedHash,
    signature,
    slot: provenance.slot === undefined ? undefined : provenance.slot.toString(),
    explorerUrl: provenance.explorerUrl ?? (signature ? explorerTransactionUrl(signature) : undefined),
  };
}

export function marketProvenanceFromGenerationRow(
  row: GenerationProvenanceRow,
): MarketProvenanceDetails {
  return {
    generation: row.generation.toString(),
    side: row.side,
    amount: row.amount,
    trader: row.trader,
    traderLabel: truncateMarketAddress(row.trader),
    tokenAccount: row.tokenAccount,
    tokenMint: row.tokenMint,
    soul: row.soul,
    seedHash: row.seedHash,
    signature: row.signature,
    slot: row.slot.toString(),
    explorerUrl: explorerTransactionUrl(row.signature),
  };
}

export function marketProvenanceFromMetadataAttributes(
  attributes: unknown,
): MarketProvenanceDetails | null {
  if (!Array.isArray(attributes)) {
    return null;
  }
  const byTrait = new Map<string, string>();
  for (const attribute of attributes as MetadataAttribute[]) {
    if (typeof attribute.trait_type === "string" && typeof attribute.value === "string") {
      byTrait.set(attribute.trait_type, attribute.value);
    }
  }

  const generation = byTrait.get("Generation");
  const side = byTrait.get("Trade side");
  const amount = byTrait.get("Trade amount");
  const trader = byTrait.get("Trader wallet");
  const seedHash = byTrait.get("Seed hash");
  if (
    !generation ||
    !/^\d+$/.test(generation) ||
    (side !== "buy" && side !== "sell") ||
    !amount ||
    !/^\d+$/.test(amount) ||
    !trader ||
    !seedHash
  ) {
    return null;
  }

  return {
    generation,
    side,
    amount,
    trader,
    traderLabel: truncateMarketAddress(trader),
    tokenAccount: byTrait.get("Trader token account"),
    tokenMint: byTrait.get("Token mint"),
    soul: byTrait.get("Soul PDA"),
    seedHash,
  };
}

export async function hydrateMarketProvenanceWithRpc(
  provenance: MarketProvenanceDetails | null | undefined,
  fetchImpl: ProvenanceFetch = globalThis.fetch,
  lookup?: MarketProvenanceLookup,
): Promise<MarketProvenanceDetails | null> {
  const lookupContext = normalizeLookup(provenance, lookup);
  if (!provenance && !lookupContext) {
    return null;
  }

  if (provenance?.signature || !lookupContext) {
    return provenance ?? null;
  }

  try {
    const recentStatsRow = await fetchRecentStatsGenerationRow(fetchImpl, lookupContext, provenance);
    if (recentStatsRow) {
      return recentStatsRow;
    }

    const inventoryUrl = generationInventoryLookupUrl(lookupContext);
    if (shouldUseInventoryBeforeExactLookup(lookupContext) && inventoryUrl) {
      const timelineProvenance = await fetchTokenTimelineGenerationProvenance(
        fetchImpl,
        lookupContext,
        provenance,
      );
      if (timelineProvenance !== undefined) {
        return timelineProvenance ?? provenance ?? null;
      }

      const inventoryRow = await fetchBestGenerationInventoryRow(
        fetchImpl,
        inventoryUrl,
        lookupContext,
      );
      if (inventoryRow !== undefined) {
        return inventoryRow ? marketProvenanceFromGenerationRow(inventoryRow) : provenance ?? null;
      }
    }

    try {
      const response = await fetchGenerationRows(fetchImpl, generationLookupUrl(lookupContext));
      if (response.ok) {
        const body = (await response.json()) as GenerationRowsResponse;
        const row = body.generations?.find((candidate) =>
          generationRowMatches(candidate, lookupContext),
        );
        if (row) {
          return marketProvenanceFromGenerationRow(row);
        }
      }
    } catch {
      // Continue to the bounded inventory fallback below.
    }

    if (!inventoryUrl) {
      return provenance ?? null;
    }
    const inventoryRow = await fetchBestGenerationInventoryRow(fetchImpl, inventoryUrl, lookupContext);
    return inventoryRow ? marketProvenanceFromGenerationRow(inventoryRow) : provenance ?? null;
  } catch {
    return provenance ?? null;
  }
}

async function fetchRecentStatsGenerationRow(
  fetchImpl: ProvenanceFetch,
  lookup: Required<Pick<MarketProvenanceLookup, "generation">> &
    Pick<MarketProvenanceLookup, "tokenMint" | "soul">,
  provenance: MarketProvenanceDetails | null | undefined,
): Promise<MarketProvenanceDetails | null> {
  try {
    const body = await fetchStatsActivity(fetchImpl);
    const activity = body.recentActivity?.find((candidate) =>
      statsActivityMatches(candidate, lookup, provenance),
    );
    return activity ? marketProvenanceFromStatsActivity(activity, provenance) : null;
  } catch {
    return null;
  }
}

async function fetchStatsActivity(fetchImpl: ProvenanceFetch): Promise<StatsActivityResponse> {
  let cached = statsActivityCache.get(fetchImpl);
  if (!cached) {
    cached = (async () => {
      try {
        const response = await fetchGenerationRows(fetchImpl, "/api/stats");
        if (!response.ok) {
          return null;
        }
        return (await response.json()) as StatsActivityResponse;
      } catch (error) {
        statsActivityCache.delete(fetchImpl);
        throw error;
      }
    })();
    statsActivityCache.set(fetchImpl, cached);
  }

  return (await cached) ?? {};
}

export function marketProvenanceEvidenceState(
  provenance: MarketProvenanceDetails | null | undefined,
  lookup?: MarketProvenanceLookup,
): MarketProvenanceEvidenceState {
  if (provenance) {
    return "available";
  }
  return normalizeLookup(null, lookup) ? "pending" : "not-applicable";
}

export function explorerTransactionUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function truncateMarketAddress(address: string): string {
  if (address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function normalizeLookup(
  provenance: MarketProvenanceDetails | null | undefined,
  lookup?: MarketProvenanceLookup,
): Required<Pick<MarketProvenanceLookup, "generation">> &
  Pick<MarketProvenanceLookup, "tokenMint" | "soul"> | null {
  const generation = lookup?.generation ?? provenance?.generation;
  const normalizedGeneration = normalizeGeneration(generation);
  if (!normalizedGeneration) {
    return null;
  }

  const tokenMint = lookup?.tokenMint ?? provenance?.tokenMint;
  const soul = lookup?.soul ?? provenance?.soul;
  if (!tokenMint && !soul) {
    return null;
  }

  return {
    tokenMint,
    soul,
    generation: normalizedGeneration,
  };
}

function normalizeGeneration(generation: string | number | bigint | undefined): string | null {
  if (generation === undefined) {
    return null;
  }
  const normalized = generation.toString();
  return /^\d+$/.test(normalized) ? normalized : null;
}

function generationLookupUrl(
  lookup: Required<Pick<MarketProvenanceLookup, "generation">> &
    Pick<MarketProvenanceLookup, "tokenMint" | "soul">,
): string {
  if (lookup.tokenMint) {
    return `/api/token/${lookup.tokenMint}/generations/${lookup.generation}?limit=20`;
  }
  return `/api/soul/${lookup.soul}/generations/${lookup.generation}?limit=20`;
}

function generationInventoryLookupUrl(
  lookup: Required<Pick<MarketProvenanceLookup, "generation">> &
    Pick<MarketProvenanceLookup, "tokenMint" | "soul">,
): string | null {
  if (!lookup.tokenMint || !lookup.soul) {
    return null;
  }
  return `/api/token/${lookup.tokenMint}/generations?limit=20`;
}

function shouldUseInventoryBeforeExactLookup(
  lookup: Required<Pick<MarketProvenanceLookup, "generation">> &
    Pick<MarketProvenanceLookup, "tokenMint" | "soul">,
): boolean {
  return Boolean(lookup.tokenMint && lookup.soul && BigInt(lookup.generation) <= 1n);
}

async function fetchBestGenerationInventoryRow(
  fetchImpl: ProvenanceFetch,
  url: string,
  lookup: Required<Pick<MarketProvenanceLookup, "generation">> &
    Pick<MarketProvenanceLookup, "tokenMint" | "soul">,
): Promise<GenerationProvenanceRow | null | undefined> {
  try {
    const inventoryResponse = await fetchGenerationRows(fetchImpl, url);
    if (!inventoryResponse.ok) {
      return undefined;
    }
    const inventoryBody = (await inventoryResponse.json()) as GenerationRowsResponse;
    return bestGenerationInventoryRow(inventoryBody.generations ?? [], lookup) ?? null;
  } catch {
    return undefined;
  }
}

async function fetchTokenTimelineGenerationProvenance(
  fetchImpl: ProvenanceFetch,
  lookup: Required<Pick<MarketProvenanceLookup, "generation">> &
    Pick<MarketProvenanceLookup, "tokenMint" | "soul">,
  provenance: MarketProvenanceDetails | null | undefined,
): Promise<MarketProvenanceDetails | null | undefined> {
  if (!lookup.tokenMint || !lookup.soul) {
    return undefined;
  }

  try {
    const response = await fetchGenerationRows(fetchImpl, `/api/token/${lookup.tokenMint}/timeline`);
    if (!response.ok) {
      return undefined;
    }
    const body = (await response.json()) as TokenTimelineResponse;
    const event = bestTimelineGenerationEvent(body.events ?? [], lookup);
    return event ? marketProvenanceFromTimelineEvent(event, lookup, provenance) : null;
  } catch {
    return undefined;
  }
}

function generationRowMatches(
  row: GenerationProvenanceRow,
  lookup: Required<Pick<MarketProvenanceLookup, "generation">> &
    Pick<MarketProvenanceLookup, "tokenMint" | "soul">,
): boolean {
  if (row.generation.toString() !== lookup.generation) {
    return false;
  }
  if (lookup.tokenMint && row.tokenMint !== lookup.tokenMint) {
    return false;
  }
  if (lookup.soul && row.soul !== lookup.soul) {
    return false;
  }
  return true;
}

function bestTimelineGenerationEvent(
  events: TokenTimelineEvent[],
  lookup: Required<Pick<MarketProvenanceLookup, "generation">> &
    Pick<MarketProvenanceLookup, "tokenMint" | "soul">,
): TokenTimelineEvent | undefined {
  const targetGeneration = BigInt(lookup.generation);
  return events
    .flatMap((event) => {
      if (event.kind !== "generation" && event.kind !== "tradeGeneration") {
        return [];
      }
      if (event.generation === undefined || event.generation === null) {
        return [];
      }
      const generation = BigInt(event.generation.toString());
      if (generation < targetGeneration) {
        return [];
      }
      const idParts = typeof event.id === "string" ? event.id.split(":") : [];
      const soul =
        typeof event.soul === "string"
          ? event.soul
          : idParts[0] === "generation"
            ? idParts[2]
            : undefined;
      return !lookup.soul || soul === lookup.soul ? [{ event, generation }] : [];
    })
    .sort((left, right) => (left.generation < right.generation ? -1 : 1))[0]?.event;
}

function bestGenerationInventoryRow(
  rows: GenerationProvenanceRow[],
  lookup: Required<Pick<MarketProvenanceLookup, "generation">> &
    Pick<MarketProvenanceLookup, "tokenMint" | "soul">,
): GenerationProvenanceRow | undefined {
  const targetGeneration = BigInt(lookup.generation);
  return rows
    .filter((row) => {
      if (lookup.tokenMint && row.tokenMint !== lookup.tokenMint) {
        return false;
      }
      if (lookup.soul && row.soul !== lookup.soul) {
        return false;
      }
      return BigInt(row.generation) >= targetGeneration;
    })
    .sort((left, right) => Number(BigInt(left.generation) - BigInt(right.generation)))[0];
}

function marketProvenanceFromTimelineEvent(
  event: TokenTimelineEvent,
  lookup: Required<Pick<MarketProvenanceLookup, "generation">> &
    Pick<MarketProvenanceLookup, "tokenMint" | "soul">,
  provenance: MarketProvenanceDetails | null | undefined,
): MarketProvenanceDetails | null {
  const generation = event.generation?.toString();
  const side = event.side;
  const amount = event.amount?.toString();
  const trader = typeof event.trader === "string" ? event.trader : undefined;
  const tokenAccount =
    typeof event.tokenAccount === "string" && !/^\*+$/.test(event.tokenAccount)
      ? event.tokenAccount
      : provenance?.tokenAccount;
  const seedHash = typeof event.seedHash === "string" ? event.seedHash : undefined;
  const signature = typeof event.signature === "string" ? event.signature : undefined;
  const slot = event.slot?.toString();
  const idParts = typeof event.id === "string" ? event.id.split(":") : [];
  const soul =
    typeof event.soul === "string" ? event.soul : idParts[0] === "generation" ? idParts[2] : lookup.soul;

  if (
    !generation ||
    (side !== "buy" && side !== "sell") ||
    !amount ||
    !trader ||
    !seedHash ||
    !signature
  ) {
    return null;
  }

  return {
    generation,
    side,
    amount,
    trader,
    traderLabel: truncateMarketAddress(trader),
    tokenAccount,
    tokenMint: lookup.tokenMint ?? provenance?.tokenMint,
    soul,
    seedHash,
    signature,
    slot,
    explorerUrl: explorerTransactionUrl(signature),
  };
}

function statsActivityMatches(
  activity: StatsGenerationActivity,
  lookup: Required<Pick<MarketProvenanceLookup, "generation">> &
    Pick<MarketProvenanceLookup, "tokenMint" | "soul">,
  provenance: MarketProvenanceDetails | null | undefined,
): boolean {
  if (activity.kind !== "tradeGeneration" || activity.generation?.toString() !== lookup.generation) {
    return false;
  }

  const idParts = typeof activity.id === "string" ? activity.id.split(":") : [];
  const tokenMint = idParts[0] === "generation" ? idParts[1] : undefined;
  const soul = idParts[0] === "generation" ? idParts[2] : undefined;
  const seedHash = typeof activity.seedHash === "string" ? activity.seedHash : undefined;
  if (provenance?.seedHash === seedHash) {
    return true;
  }
  if (lookup.tokenMint && tokenMint !== lookup.tokenMint) {
    return false;
  }
  if (lookup.soul && soul !== lookup.soul && provenance?.seedHash !== seedHash) {
    return false;
  }
  return true;
}

function marketProvenanceFromStatsActivity(
  activity: StatsGenerationActivity,
  provenance: MarketProvenanceDetails | null | undefined,
): MarketProvenanceDetails | null {
  const idParts = typeof activity.id === "string" ? activity.id.split(":") : [];
  const tokenMint = idParts[0] === "generation" ? idParts[1] : provenance?.tokenMint;
  const soul = idParts[0] === "generation" ? idParts[2] : provenance?.soul;
  const generation = activity.generation?.toString();
  const side = activity.side;
  const amount = activity.amount?.toString();
  const trader = typeof activity.trader === "string" ? activity.trader : undefined;
  const tokenAccount =
    typeof activity.tokenAccount === "string" && !/^\*+$/.test(activity.tokenAccount)
      ? activity.tokenAccount
      : provenance?.tokenAccount;
  const seedHash = typeof activity.seedHash === "string" ? activity.seedHash : undefined;
  const signature = typeof activity.signature === "string" ? activity.signature : undefined;
  const slot = activity.slot?.toString();

  if (
    !generation ||
    (side !== "buy" && side !== "sell") ||
    !amount ||
    !trader ||
    !seedHash ||
    !signature
  ) {
    return null;
  }

  return {
    generation,
    side,
    amount,
    trader,
    traderLabel: truncateMarketAddress(trader),
    tokenAccount,
    tokenMint,
    soul,
    seedHash,
    signature,
    slot,
    explorerUrl: explorerTransactionUrl(signature),
  };
}

async function fetchGenerationRows(fetchImpl: ProvenanceFetch, url: string): Promise<ProvenanceResponse> {
  const cache = provenanceCacheForFetch(fetchImpl);
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const entry = {
    expiresAt: now + MARKET_PROVENANCE_RESPONSE_CACHE_TTL_MS,
    promise: fetchGenerationRowsUncached(fetchImpl, url),
  };
  cache.set(url, entry);
  entry.promise.then(
    (response) => {
      entry.expiresAt =
        Date.now() +
        (isTransientProvenanceStatus(response.status)
          ? MARKET_PROVENANCE_TRANSIENT_BACKOFF_MS
          : MARKET_PROVENANCE_RESPONSE_CACHE_TTL_MS);
      return response;
    },
    () => {
      entry.expiresAt = Date.now() + MARKET_PROVENANCE_TRANSIENT_BACKOFF_MS;
    },
  );
  return entry.promise;
}

async function fetchGenerationRowsUncached(fetchImpl: ProvenanceFetch, url: string): Promise<ProvenanceResponse> {
  let lastTransientResponse:
    | ProvenanceResponse
    | undefined;

  for (let attempt = 0; attempt <= MARKET_PROVENANCE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetchGenerationRowsOnce(fetchImpl, url);
      if (!isTransientProvenanceStatus(response.status) || attempt === MARKET_PROVENANCE_RETRY_DELAYS_MS.length) {
        return materializeProvenanceResponse(response);
      }
      lastTransientResponse = await materializeProvenanceResponse(response);
    } catch (error) {
      if (!isTransientProvenanceError(error) || attempt === MARKET_PROVENANCE_RETRY_DELAYS_MS.length) {
        throw error;
      }
    }

    await sleep(MARKET_PROVENANCE_RETRY_DELAYS_MS[attempt] ?? 0);
  }

  return (
    lastTransientResponse ?? {
      ok: false,
      status: 503,
      json: async () => ({ ok: false }),
    }
  );
}

async function fetchGenerationRowsOnce(fetchImpl: ProvenanceFetch, url: string) {
  if (typeof AbortController === "undefined") {
    return fetchImpl(url, { cache: "no-store" } as RequestInit);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MARKET_PROVENANCE_FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      cache: "no-store",
      signal: controller.signal,
    } as RequestInit);
  } finally {
    clearTimeout(timeout);
  }
}

function provenanceCacheForFetch(
  fetchImpl: ProvenanceFetch,
): Map<string, { expiresAt: number; promise: Promise<ProvenanceResponse> }> {
  let cache = provenanceUrlCache.get(fetchImpl);
  if (!cache) {
    cache = new Map<string, { expiresAt: number; promise: Promise<ProvenanceResponse> }>();
    provenanceUrlCache.set(fetchImpl, cache);
  }
  return cache;
}

async function materializeProvenanceResponse(
  response: ProvenanceResponse,
): Promise<ProvenanceResponse> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = { ok: false };
  }
  return {
    ok: response.ok,
    status: response.status,
    json: async () => body,
  };
}

function isTransientProvenanceStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function isTransientProvenanceError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /429|too many requests|timeout|timed out|aborted|network/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
