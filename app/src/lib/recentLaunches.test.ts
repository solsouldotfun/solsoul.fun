// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  RECENT_LAUNCHES_STORAGE_KEY,
  loadRecentLaunches,
  rememberRecentLaunch,
  type RecentLaunch,
} from "./recentLaunches";

function launch(overrides: Partial<RecentLaunch> = {}): RecentLaunch {
  return {
    mint: overrides.mint ?? "Mint111111111111111111111111111111111111111",
    signature: overrides.signature ?? "Sig1111111111111111111111111111111111111111",
    symbol: overrides.symbol ?? "SOUL",
    name: overrides.name ?? "SolSoul Launch",
    artThemeId: overrides.artThemeId,
    launchedAt: overrides.launchedAt ?? 1_714_200_000_000,
  };
}

describe("recent launch recovery storage", () => {
  const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
    window,
    "localStorage",
  );

  afterEach(() => {
    if (originalLocalStorageDescriptor) {
      Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
    }
  });

  it("persists the newest launched mint first so refresh can recover token pages", () => {
    const storage = new MapStorage();
    const first = launch({
      mint: "Mint111111111111111111111111111111111111111",
      artThemeId: "monochrome",
      launchedAt: 1,
    });
    const second = launch({ mint: "Mint222222222222222222222222222222222222222", launchedAt: 2 });

    rememberRecentLaunch(first, storage);
    const saved = rememberRecentLaunch(second, storage);

    expect(saved.map((item) => item.mint)).toEqual([second.mint, first.mint]);
    expect(loadRecentLaunches(storage).map((item) => item.mint)).toEqual([
      second.mint,
      first.mint,
    ]);
    expect(storage.getItem(RECENT_LAUNCHES_STORAGE_KEY)).toContain(second.signature);
    expect(loadRecentLaunches(storage)[1]).toMatchObject({
      artThemeId: "monochrome",
    });
    expect(storage.getItem(RECENT_LAUNCHES_STORAGE_KEY)).not.toContain("artThemeLabel");
  });

  it("strips legacy localized artThemeLabel strings while preserving stable theme ids", () => {
    const storage = new MapStorage();
    storage.setItem(
      RECENT_LAUNCHES_STORAGE_KEY,
      JSON.stringify([
        {
          mint: "MintLegacy1111111111111111111111111111111111",
          signature: "SigLegacy111111111111111111111111111111111",
          symbol: "LEG",
          name: "Legacy Launch",
          artThemeId: "hexagram",
          artThemeLabel: "Hexagram Oracle",
          launchedAt: 3,
        },
      ]),
    );

    const [loaded] = loadRecentLaunches(storage);

    expect(loaded).toMatchObject({
      mint: "MintLegacy1111111111111111111111111111111111",
      artThemeId: "hexagram",
    });
    expect(loaded).not.toHaveProperty("artThemeLabel");
  });

  it("deduplicates a relaunched mint and keeps at most five recoverable launches", () => {
    const storage = new MapStorage();

    for (let index = 0; index < 7; index += 1) {
      rememberRecentLaunch(
        launch({
          mint: `Mint${index}111111111111111111111111111111111111`,
          signature: `Sig${index}111111111111111111111111111111111111`,
          launchedAt: index,
        }),
        storage,
      );
    }
    const duplicate = launch({
      mint: "Mint3111111111111111111111111111111111111",
      signature: "SigDuplicate1111111111111111111111111111111",
      launchedAt: 99,
    });
    const saved = rememberRecentLaunch(duplicate, storage);

    expect(saved).toHaveLength(5);
    expect(saved[0]).toMatchObject({ mint: duplicate.mint, signature: duplicate.signature });
    expect(saved.filter((item) => item.mint === duplicate.mint)).toHaveLength(1);
    expect(saved.map((item) => item.mint)).not.toContain("Mint0111111111111111111111111111111111111");
  });

  it("ignores malformed persisted JSON instead of blocking the launch page", () => {
    const storage = new MapStorage();
    storage.setItem(RECENT_LAUNCHES_STORAGE_KEY, "{not json");

    expect(loadRecentLaunches(storage)).toEqual([]);
  });

  it("treats restricted browser localStorage access as optional recovery", () => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("localStorage is unavailable");
      },
      configurable: true,
    });

    expect(loadRecentLaunches()).toEqual([]);
    expect(rememberRecentLaunch(launch())).toEqual([]);
  });
});

class MapStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length() {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}
