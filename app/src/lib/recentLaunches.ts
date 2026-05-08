export const RECENT_LAUNCHES_STORAGE_KEY = "solsoul:recent-launches";
const MAX_RECENT_LAUNCHES = 5;

export type RecentLaunch = {
  mint: string;
  signature: string;
  symbol: string;
  name: string;
  artThemeId?: string;
  launchedAt: number;
};

export function loadRecentLaunches(storage = browserStorage()): RecentLaunch[] {
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(RECENT_LAUNCHES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(toRecentLaunch)
      .filter((launch): launch is RecentLaunch => launch !== null)
      .sort((a, b) => b.launchedAt - a.launchedAt)
      .slice(0, MAX_RECENT_LAUNCHES);
  } catch {
    return [];
  }
}

export function rememberRecentLaunch(
  launch: RecentLaunch,
  storage = browserStorage(),
): RecentLaunch[] {
  if (!storage) {
    return [];
  }

  try {
    const launches = [
      launch,
      ...loadRecentLaunches(storage).filter((item) => item.mint !== launch.mint),
    ]
      .sort((a, b) => b.launchedAt - a.launchedAt)
      .slice(0, MAX_RECENT_LAUNCHES);

    storage.setItem(RECENT_LAUNCHES_STORAGE_KEY, JSON.stringify(launches));
    return launches;
  } catch {
    return [];
  }
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

function toRecentLaunch(value: unknown): RecentLaunch | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const launch = value as Partial<RecentLaunch>;
  const { mint, signature, symbol, name, artThemeId, launchedAt } = launch;
  const isValid =
    typeof mint === "string" &&
    typeof signature === "string" &&
    typeof symbol === "string" &&
    typeof name === "string" &&
    (artThemeId === undefined || typeof artThemeId === "string") &&
    typeof launchedAt === "number" &&
    Number.isFinite(launchedAt);

  if (!isValid) {
    return null;
  }

  return {
    mint,
    signature,
    symbol,
    name,
    ...(artThemeId ? { artThemeId } : {}),
    launchedAt,
  };
}
