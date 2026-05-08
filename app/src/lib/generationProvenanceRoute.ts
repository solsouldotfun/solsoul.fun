import { NextResponse } from "next/server";
import type { Connection } from "@solana/web3.js";
import { getRpcEndpoint } from "@/lib/config";
import { createRpcConnection, redactedEndpointLabel } from "@/lib/rpc";
import { publicApiErrorMessage, publicApiWarning } from "@/lib/publicApiErrors";
import {
  fetchGenerationRowsFromFinalizedRpc,
  generationRowsResponseBody,
  isTransientRpcError,
  type GenerationProvenanceRow,
  type GenerationRowFilters,
} from "./generationProvenance";

export interface GenerationRouteParams {
  mint?: string;
  soul?: string;
  generation?: string;
}

export interface GenerationRowsRouteResponseOptions {
  connection?: Connection;
  loadGenerationRows?: (options: {
    connection: Connection;
    filters: GenerationRowFilters;
    signatureLimit: number | undefined;
  }) => Promise<GenerationProvenanceRow[]>;
  rpcEndpoint?: string;
  timeoutMs?: number;
}

type GenerationRouteBody = ReturnType<typeof generationRowsResponseBody> & {
  filters: GenerationRowFilters;
  rpcEndpoint: string;
  source: ReturnType<typeof generationRowsResponseBody>["source"] & {
    partial?: boolean;
    warnings?: string[];
    fallback?: "memory-cache" | "empty-transient";
  };
};

type GenerationRouteCacheEntry = {
  body: GenerationRouteBody;
  cachedAtMs: number;
};

const GENERATION_ROUTE_CACHE_MAX_ENTRIES = 64;
const GENERATION_ROUTE_CACHE_TTL_MS = 60_000;
const generationRouteCache = new Map<string, GenerationRouteCacheEntry>();
const GENERATION_ROUTE_TIMEOUT_MS = 20_000;
const PUBLIC_SIGNATURE_LIMIT_MAX = 100;
const PUBLIC_MAX_TRANSACTIONS = 100;

export async function generationRowsRouteResponse(
  request: Request,
  params: GenerationRouteParams = {},
  options: GenerationRowsRouteResponseOptions = {},
): Promise<NextResponse> {
  const url = new URL(request.url);
  let filters: GenerationRowFilters | undefined;
  let signatureLimit: number | undefined;
  let cacheKey: string | undefined;
  try {
    filters = filtersFromRequest(url, params);
    signatureLimit = signatureLimitForRequest(filters, parseOptionalLimit(url.searchParams.get("limit")));
    cacheKey = generationRouteCacheKey(filters, signatureLimit);
    const connection = options.connection ?? createRpcConnection({ commitment: "finalized" });
    const rpcEndpoint = redactedEndpointLabel(options.rpcEndpoint ?? getRpcEndpoint());
    const generations = await withRouteTimeout(
      (options.loadGenerationRows ?? defaultLoadGenerationRows)({
        connection,
        filters,
        signatureLimit,
      }),
      options.timeoutMs ?? GENERATION_ROUTE_TIMEOUT_MS,
    );
    const body = {
      ...generationRowsResponseBody(generations),
      filters,
      rpcEndpoint,
    };
    setGenerationRouteCache(cacheKey, body);

    return NextResponse.json(
      body,
      {
        headers: {
          "cache-control": "public, max-age=15, stale-while-revalidate=45",
        },
      },
    );
  } catch (error: unknown) {
    if (filters && cacheKey && isTransientRpcError(error)) {
      const cached = getGenerationRouteCache(cacheKey);
      const warning = publicApiWarning("generation provenance");
      const emptyResponse = generationRowsResponseBody([]);
      const body: GenerationRouteBody = cached
        ? {
            ...cached,
            source: {
              ...cached.source,
              partial: true,
              warnings: [warning],
              fallback: "memory-cache",
            },
          }
        : {
            ...emptyResponse,
            filters,
            rpcEndpoint: redactedEndpointLabel(options.rpcEndpoint ?? getRpcEndpoint()),
            source: {
              ...emptyResponse.source,
              partial: true,
              warnings: [warning],
              fallback: "empty-transient",
            },
          };

      return NextResponse.json(body, {
        status: 200,
        headers: {
          "cache-control": cached ? "public, max-age=5, stale-while-revalidate=30" : "no-store",
        },
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: publicApiErrorMessage("Unable to load generation rows."),
      },
      {
        status: 400,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }
}

function withRouteTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`generation provenance timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function defaultLoadGenerationRows({
  connection,
  filters,
  signatureLimit,
}: {
  connection: Connection;
  filters: GenerationRowFilters;
  signatureLimit: number | undefined;
}): Promise<GenerationProvenanceRow[]> {
  return fetchGenerationRowsFromFinalizedRpc({
    connection,
    filters,
    signatureLimit,
    maxTransactions: PUBLIC_MAX_TRANSACTIONS,
    stopAfterRows: signatureLimit ?? PUBLIC_SIGNATURE_LIMIT_MAX,
  });
}

function generationRouteCacheKey(
  filters: GenerationRowFilters,
  signatureLimit: number | undefined,
): string {
  return JSON.stringify({
    mint: filters.mint ?? null,
    soul: filters.soul ?? null,
    generation: filters.generation ?? null,
    signatureLimit: signatureLimit ?? null,
  });
}

function filtersFromRequest(url: URL, params: GenerationRouteParams): GenerationRowFilters {
  return {
    mint: params.mint ?? url.searchParams.get("mint") ?? url.searchParams.get("token") ?? undefined,
    soul: params.soul ?? url.searchParams.get("soul") ?? undefined,
    generation: parseOptionalGeneration(
      params.generation ?? url.searchParams.get("generation") ?? undefined,
    ),
  };
}

function parseOptionalGeneration(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid generation number: ${value}`);
  }
  return parsed;
}

function parseOptionalLimit(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > PUBLIC_SIGNATURE_LIMIT_MAX) {
    throw new Error(`Invalid limit: ${value}`);
  }
  return parsed;
}

function signatureLimitForRequest(
  filters: GenerationRowFilters,
  requestedLimit: number | undefined,
): number | undefined {
  const isExactLookup =
    filters.generation !== undefined && (filters.mint !== undefined || filters.soul !== undefined);
  if (!isExactLookup) {
    return requestedLimit;
  }

  return Math.min(Math.max(requestedLimit ?? 100, 100), PUBLIC_SIGNATURE_LIMIT_MAX);
}

function getGenerationRouteCache(cacheKey: string): GenerationRouteBody | undefined {
  const entry = generationRouteCache.get(cacheKey);
  if (!entry) {
    return undefined;
  }

  if (Date.now() - entry.cachedAtMs > GENERATION_ROUTE_CACHE_TTL_MS) {
    generationRouteCache.delete(cacheKey);
    return undefined;
  }

  generationRouteCache.delete(cacheKey);
  generationRouteCache.set(cacheKey, entry);
  return entry.body;
}

function setGenerationRouteCache(cacheKey: string, body: GenerationRouteBody): void {
  if (body.generations.length === 0) {
    return;
  }

  generationRouteCache.delete(cacheKey);
  generationRouteCache.set(cacheKey, {
    body,
    cachedAtMs: Date.now(),
  });
  evictExpiredGenerationRouteCacheEntries();
  while (generationRouteCache.size > GENERATION_ROUTE_CACHE_MAX_ENTRIES) {
    const oldestKey = generationRouteCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    generationRouteCache.delete(oldestKey);
  }
}

function evictExpiredGenerationRouteCacheEntries(): void {
  const now = Date.now();
  for (const [key, entry] of generationRouteCache.entries()) {
    if (now - entry.cachedAtMs > GENERATION_ROUTE_CACHE_TTL_MS) {
      generationRouteCache.delete(key);
    }
  }
}

export const __generationRouteCacheForTests = {
  clear(): void {
    generationRouteCache.clear();
  },
  size(): number {
    evictExpiredGenerationRouteCacheEntries();
    return generationRouteCache.size;
  },
  maxEntries: GENERATION_ROUTE_CACHE_MAX_ENTRIES,
  ttlMs: GENERATION_ROUTE_CACHE_TTL_MS,
  timeoutMs: GENERATION_ROUTE_TIMEOUT_MS,
};
