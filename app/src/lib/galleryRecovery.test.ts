import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildClaimedSoulGalleryCacheKey,
  formatGalleryFallbackMessage,
  GalleryLoadTimeoutError,
  readCachedClaimedSoulGalleryPage,
  runBoundedGalleryRequest,
  writeCachedClaimedSoulGalleryPage,
  type CachedClaimedSoulGalleryPage,
} from "./galleryRecovery";
import { deriveSoulRarity } from "./soulRarity";

class ThrowingStorage implements Storage {
  length = 0;

  clear(): void {
    throw new Error("storage unavailable");
  }

  getItem(_key: string): string | null {
    throw new Error("storage unavailable");
  }

  key(_index: number): string | null {
    return null;
  }

  removeItem(_key: string): void {
    throw new Error("storage unavailable");
  }

  setItem(_key: string, _value: string): void {
    throw new Error("quota exceeded");
  }
}

function snapshot(): CachedClaimedSoulGalleryPage {
  return {
    version: 2,
    savedAt: "2026-04-30T00:00:00.000Z",
    page: {
      page: 1,
      pageSize: 24,
      total: 1,
      hasNextPage: false,
    },
    items: [
      {
        claim: "Claim111111111111111111111111111111111111",
        claimer: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
        claimerLabel: "8uAP…cd1i",
        nftMint: "Nft11111111111111111111111111111111111111",
        tokenMint: "ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r",
        tokenMintLabel: "ADLA…p16r",
        name: "PD6 Soul #0",
        symbol: "PD6",
        sanitizedSvg: "<svg><circle /></svg>",
        sequence: 0,
        artTheme: {
          label: "Legacy / unknown art theme",
          source: "legacy",
        },
        soulRarity: deriveSoulRarity({
          claim: "Claim111111111111111111111111111111111111",
          nftMint: "Nft11111111111111111111111111111111111111",
          tokenMint: "********************************************",
          soul: "Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ",
          generation: "2",
          sequence: 0,
          artTheme: "Legacy / unknown art theme",
        }),
        marketProvenance: null,
        marketProvenanceStatus: "pending",
        marketProvenanceLookup: {
          tokenMint: "ADLARTUded8VFhQy3WwSv9PJpQW3PFMGLVYHmf8Mp16r",
          soul: "Daq5KXjhH8PRjC3wLPvXF2XP2VgBaZmf1dW65XB2AmnQ",
          generation: "2",
        },
      },
    ],
  };
}

describe("galleryRecovery", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries transient gallery failures before resolving live data", async () => {
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("429 Too Many Requests"))
      .mockResolvedValueOnce("loaded");

    await expect(
      runBoundedGalleryRequest(request, {
        timeoutMs: 100,
        retryDelaysMs: [1],
      }),
    ).resolves.toBe("loaded");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rejects with a bounded timeout instead of leaving the gallery loading forever", async () => {
    vi.useFakeTimers();
    const result = runBoundedGalleryRequest(
      () => new Promise<string>(() => undefined),
      {
        timeoutMs: 25,
        retryDelaysMs: [],
      },
    );
    const assertion = expect(result).rejects.toThrow("timed out");

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });

  it("persists and restores public gallery cache snapshots with guarded storage access", () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    } as Storage;
    const key = buildClaimedSoulGalleryCacheKey("public", 1);
    const value = snapshot();

    writeCachedClaimedSoulGalleryPage(key, value, storageLike);

    expect(readCachedClaimedSoulGalleryPage(key, storageLike)).toEqual(value);
    expect(readCachedClaimedSoulGalleryPage(key, new ThrowingStorage())).toBeNull();
    expect(() => writeCachedClaimedSoulGalleryPage(key, value, new ThrowingStorage())).not.toThrow();
  });

  it("formats stable localized fallback messages without leaking raw RPC or HTTP details", () => {
    const messages = {
      loadError: "Unable to load Souls right now.",
      timeoutError: "Souls are taking longer than expected.",
      retryGuidance: "Refresh to retry; visible cards stay stable when evidence is unavailable.",
    };

    expect(
      formatGalleryFallbackMessage(
        new Error("HTTP 502 Invalid seeds from devnet RPC provider"),
        messages,
      ),
    ).toBe("Unable to load Souls right now. Refresh to retry; visible cards stay stable when evidence is unavailable.");
    expect(
      formatGalleryFallbackMessage(new GalleryLoadTimeoutError(12_000), messages),
    ).toBe("Souls are taking longer than expected. Refresh to retry; visible cards stay stable when evidence is unavailable.");
  });
});
