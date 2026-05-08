import { Connection, type ConnectionConfig } from "@solana/web3.js";
import { getRpcEndpoint, getRpcFallbackEndpoint } from "./config";
import { describeRpcSource } from "./rpcSource";

type RpcFetch = typeof fetch;
type RpcFetchInfo = Parameters<RpcFetch>[0];
type RpcFetchInit = Parameters<RpcFetch>[1];

const RPC_FETCH_TIMEOUT_MS = 20_000;

export interface RpcFailoverEvent {
  primaryEndpointLabel: string;
  fallbackEndpointLabel: string;
  usedEndpointLabel: string;
  reason: string;
  status?: number;
}

export interface RpcFailoverObserver {
  (event: RpcFailoverEvent): void;
}

function shouldRetryOnFallback(response: Response): boolean {
  return response.status === 429 || (response.status >= 500 && response.status <= 599);
}

const BACKOFF_BASE_MS = 250;
const BACKOFF_MAX_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("Retry-After");
  if (!header) return undefined;
  const seconds = parseFloat(header);
  if (!isFinite(seconds) || seconds < 0) return undefined;
  return seconds * 1000;
}

export function redactedEndpointLabel(endpoint: string): string {
  return describeRpcSource(endpoint).rpcEndpointLabel;
}

function withFallbackUrl(info: RpcFetchInfo, fallbackUrl: string, init: RpcFetchInit): RpcFetchInfo {
  if (typeof info === "string") {
    return fallbackUrl;
  }

  if (info instanceof URL) {
    return new URL(fallbackUrl);
  }

  if (typeof Request !== "undefined" && info instanceof Request) {
    return new Request(fallbackUrl, {
      body: init?.body ?? null,
      cache: info.cache,
      credentials: info.credentials,
      headers: init?.headers ?? info.headers,
      integrity: info.integrity,
      keepalive: init?.keepalive ?? info.keepalive,
      method: init?.method ?? info.method,
      mode: info.mode,
      redirect: info.redirect,
      referrer: info.referrer,
      referrerPolicy: info.referrerPolicy,
      signal: init?.signal ?? info.signal,
    });
  }

  return fallbackUrl;
}

export function createRpcFailoverFetch(
  primaryUrl: string,
  fallbackUrl: string | undefined,
  fetchImpl: RpcFetch = fetch,
  failoverObserver?: RpcFailoverObserver,
): RpcFetch {
  return async (info, init) => {
    let primaryResponse: Response;
    try {
      primaryResponse = await fetchWithTimeout(fetchImpl, info, init);
    } catch (error) {
      if (!fallbackUrl) {
        throw error;
      }
      const event = {
        primaryEndpointLabel: redactedEndpointLabel(primaryUrl),
        fallbackEndpointLabel: redactedEndpointLabel(fallbackUrl),
        usedEndpointLabel: redactedEndpointLabel(fallbackUrl),
        reason: "network_error",
      } satisfies RpcFailoverEvent;
      failoverObserver?.(event);
      console.log(
        `[app] RPC primary request failed; retrying once on ${event.fallbackEndpointLabel}`,
      );
      return fetchWithTimeout(fetchImpl, withFallbackUrl(info, fallbackUrl, init), init);
    }

    if (!fallbackUrl || !shouldRetryOnFallback(primaryResponse)) {
      return primaryResponse;
    }

    const event = {
      primaryEndpointLabel: redactedEndpointLabel(primaryUrl),
      fallbackEndpointLabel: redactedEndpointLabel(fallbackUrl),
      usedEndpointLabel: redactedEndpointLabel(fallbackUrl),
      reason: "http_status",
      status: primaryResponse.status,
    } satisfies RpcFailoverEvent;
    failoverObserver?.(event);
    console.log(
      `[app] RPC primary returned HTTP ${primaryResponse.status}; retrying once on ${event.fallbackEndpointLabel}`,
    );

    if (primaryResponse.status === 429) {
      const retryAfterMs = parseRetryAfterMs(primaryResponse);
      const waitMs =
        retryAfterMs !== undefined
          ? Math.min(retryAfterMs, BACKOFF_MAX_MS)
          : Math.min(BACKOFF_BASE_MS, BACKOFF_MAX_MS);
      await sleep(waitMs);
    }

    return fetchWithTimeout(fetchImpl, withFallbackUrl(info, fallbackUrl, init), init);
  };
}

async function fetchWithTimeout(
  fetchImpl: RpcFetch,
  info: RpcFetchInfo,
  init: RpcFetchInit,
): Promise<Response> {
  if (typeof AbortController === "undefined" || init?.signal) {
    return fetchImpl(info, init);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(info, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function createRpcConnectionConfig(
  config: ConnectionConfig = {},
  failoverObserver?: RpcFailoverObserver,
): ConnectionConfig {
  const primaryUrl = getRpcEndpoint();
  const fallbackUrl = getRpcFallbackEndpoint();

  return {
    ...config,
    ...(fallbackUrl ? { disableRetryOnRateLimit: true } : {}),
    fetch: createRpcFailoverFetch(primaryUrl, fallbackUrl, config.fetch ?? fetch, failoverObserver),
  };
}

export function createRpcConnection(
  config: ConnectionConfig = {},
  failoverObserver?: RpcFailoverObserver,
): Connection {
  return new Connection(getRpcEndpoint(), createRpcConnectionConfig(config, failoverObserver));
}
