import type {
  TokenTimelineEvent,
  TokenTimelineLink,
  TokenTimelineSnapshot,
} from "./tokenTimeline";

export const TOKEN_TIMELINE_CACHE_SCHEMA_VERSION = 2;

export function tokenTimelineCacheKey(mint: string): string {
  return `solsoul:token-timeline:v${TOKEN_TIMELINE_CACHE_SCHEMA_VERSION}:${mint}`;
}

interface CachedTokenTimelineEnvelope {
  schemaVersion: typeof TOKEN_TIMELINE_CACHE_SCHEMA_VERSION;
  snapshot: TokenTimelineSnapshot;
}

export function readCachedTokenTimeline(
  mint: string,
  storage: Storage | undefined = browserStorage(),
): TokenTimelineSnapshot | null {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(tokenTimelineCacheKey(mint));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<CachedTokenTimelineEnvelope>;
    if (
      parsed.schemaVersion !== TOKEN_TIMELINE_CACHE_SCHEMA_VERSION ||
      !parsed.snapshot ||
      !isValidTokenTimelineSnapshot(parsed.snapshot, mint)
    ) {
      return null;
    }
    return parsed.snapshot;
  } catch {
    return null;
  }
}

export function writeCachedTokenTimeline(
  mint: string,
  snapshot: TokenTimelineSnapshot,
  storage: Storage | undefined = browserStorage(),
): boolean {
  if (!storage || !isValidTokenTimelineSnapshot(snapshot, mint)) {
    return false;
  }

  try {
    const envelope: CachedTokenTimelineEnvelope = {
      schemaVersion: TOKEN_TIMELINE_CACHE_SCHEMA_VERSION,
      snapshot,
    };
    storage.setItem(tokenTimelineCacheKey(mint), JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function isValidTokenTimelineSnapshot(
  snapshot: TokenTimelineSnapshot,
  mint: string,
): snapshot is TokenTimelineSnapshot {
  return (
    isObject(snapshot) &&
    snapshot.tokenMint === mint &&
    Array.isArray(snapshot.events) &&
    snapshot.events.every((event) => isValidTimelineEvent(event, mint)) &&
    isObject(snapshot.source) &&
    isNonEmptyString(snapshot.source.fetchedAt) &&
    isNonEmptyString(snapshot.source.rpcEndpoint)
  );
}

function isValidTimelineEvent(event: TokenTimelineEvent, mint: string): boolean {
  if (!isObject(event) || !isNonEmptyString(event.id) || event.tokenMint !== mint) {
    return false;
  }
  if (!["launch", "trade", "generation", "claim"].includes(event.kind)) {
    return false;
  }
  if (!Array.isArray(event.links) || !event.links.every(isValidTimelineLink)) {
    return false;
  }
  if (event.kind !== "generation") {
    return true;
  }

  return isValidGenerationTimelineEvent(event, mint);
}

function isValidGenerationTimelineEvent(event: TokenTimelineEvent, mint: string): boolean {
  return (
    event.tokenMint === mint &&
    (event.side === "buy" || event.side === "sell") &&
    isDecimalString(event.amount) &&
    isDecimalString(event.generation) &&
    isNonEmptyString(event.trader) &&
    isNonEmptyString(event.tokenAccount) &&
    isHexString(event.seedHash) &&
    isNonEmptyString(event.soul) &&
    isNonEmptyString(event.signature) &&
    typeof event.slot === "number" &&
    Number.isSafeInteger(event.slot) &&
    event.slot >= 0 &&
    hasLink(event.links, "token", `/token/${mint}`) &&
    hasExternalLinkContaining(event.links, "soul", `/address/${event.soul}`) &&
    hasExternalLinkContaining(event.links, "transaction", `/tx/${event.signature}`)
  );
}

function isValidTimelineLink(link: TokenTimelineLink): boolean {
  return (
    isObject(link) &&
    ["token", "gallery", "soul", "transaction", "mint", "nft"].includes(link.labelKey) &&
    isNonEmptyString(link.href) &&
    (link.external === undefined || typeof link.external === "boolean")
  );
}

function hasLink(links: TokenTimelineLink[], labelKey: string, href: string): boolean {
  return links.some((link) => link.labelKey === labelKey && link.href === href);
}

function hasExternalLinkContaining(
  links: TokenTimelineLink[],
  labelKey: string,
  fragment: string,
): boolean {
  return links.some(
    (link) => link.labelKey === labelKey && link.external === true && link.href.includes(fragment),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

function isHexString(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F]+$/.test(value);
}

function browserStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
