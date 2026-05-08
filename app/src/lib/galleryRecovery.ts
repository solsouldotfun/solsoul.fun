import type { ClaimedSoulNftGalleryItem } from "./soulGallery";

export interface CachedClaimedSoulGalleryPage {
  version: 2;
  savedAt: string;
  page: {
    page: number;
    pageSize: number;
    total: number;
    hasNextPage: boolean;
  };
  items: ClaimedSoulNftGalleryItem[];
}

export class GalleryLoadTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Gallery request timed out after ${timeoutMs}ms`);
    this.name = "GalleryLoadTimeoutError";
  }
}

export interface GalleryFallbackMessages {
  loadError: string;
  timeoutError: string;
  retryGuidance: string;
}

const DEFAULT_GALLERY_TIMEOUT_MS = 12_000;
const DEFAULT_GALLERY_RETRY_DELAYS_MS = [500, 1_500] as const;

export function buildClaimedSoulGalleryCacheKey(scope: string, page: number, mint?: string): string {
  return ["solsoul", "claimed-soul-gallery", "v2", scope, mint ?? "all", page.toString()].join(":");
}

export async function runBoundedGalleryRequest<T>(
  request: () => Promise<T>,
  options: {
    timeoutMs?: number;
    retryDelaysMs?: readonly number[];
  } = {},
): Promise<T> {
  const timeoutMs = normalizePositiveNumber(options.timeoutMs, DEFAULT_GALLERY_TIMEOUT_MS);
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_GALLERY_RETRY_DELAYS_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await withTimeout(request(), timeoutMs);
    } catch (error) {
      lastError = error;
      if (!isRetryableGalleryError(error) || attempt === retryDelaysMs.length) {
        throw error;
      }
      await sleep(retryDelaysMs[attempt] ?? 0);
    }
  }

  throw lastError;
}

export function readCachedClaimedSoulGalleryPage(
  key: string,
  storage: Storage | null | undefined = safeLocalStorage(),
): CachedClaimedSoulGalleryPage | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    return isCachedClaimedSoulGalleryPage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedClaimedSoulGalleryPage(
  key: string,
  snapshot: CachedClaimedSoulGalleryPage,
  storage: Storage | null | undefined = safeLocalStorage(),
): void {
  try {
    storage?.setItem(key, JSON.stringify(snapshot));
  } catch {
    // Browser storage is an optional public-UX optimization; quota/private-mode
    // failures must never block live finalized gallery evidence from rendering.
  }
}

export function formatGalleryFallbackMessage(
  error: unknown,
  messages: GalleryFallbackMessages,
): string {
  if (error instanceof GalleryLoadTimeoutError) {
    return `${messages.timeoutError} ${messages.retryGuidance}`;
  }
  return `${messages.loadError} ${messages.retryGuidance}`;
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new GalleryLoadTimeoutError(timeoutMs));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function isRetryableGalleryError(error: unknown): boolean {
  if (error instanceof GalleryLoadTimeoutError) {
    return true;
  }
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /408|429|5\d\d|too many requests|timeout|timed out|aborted|network|fetch/i.test(message);
}

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function isCachedClaimedSoulGalleryPage(value: unknown): value is CachedClaimedSoulGalleryPage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<CachedClaimedSoulGalleryPage>;
  return (
    candidate.version === 2 &&
    typeof candidate.savedAt === "string" &&
    isCachedPageMetadata(candidate.page) &&
    Array.isArray(candidate.items)
  );
}

function isCachedPageMetadata(value: unknown): value is CachedClaimedSoulGalleryPage["page"] {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<CachedClaimedSoulGalleryPage["page"]>;
  return (
    typeof candidate.page === "number" &&
    typeof candidate.pageSize === "number" &&
    typeof candidate.total === "number" &&
    typeof candidate.hasNextPage === "boolean"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
