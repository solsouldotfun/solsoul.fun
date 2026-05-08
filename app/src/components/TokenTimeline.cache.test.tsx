// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenTimeline } from "./TokenTimeline";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => React.createElement("a", { href, ...props }, children),
}));

let currentLocale = "en";

const translations: Record<string, Record<string, string>> = {
  en: {
    title: "Public timeline",
    body: "Market-created Soul evidence",
    loading: "Loading timeline",
    loadError: "Timeline unavailable",
    unavailableTitle: "Story is temporarily unavailable",
    unavailableBody: "The public story endpoint is taking longer than expected. Trading and Soul actions remain available while you retry.",
    retryHint: "Refresh this token page to retry the story timeline.",
    cachedNotice: "Showing the last saved story while the public endpoint recovers.",
    timeoutError: "Timeline timed out",
    invalidData: "Timeline data incomplete",
    empty: "No public timeline evidence yet",
    source: "Source",
    signature: "Signature",
    slot: "Slot",
    "evidence.show": "Inspect evidence",
    "evidence.hide": "Hide evidence",
    "evidence.title": "Technical evidence",
    "evidence.source": "Evidence source",
    "evidence.address": "Evidence address",
    "evidence.blockTime": "Block time",
    "evidence.eventId": "Event ID",
    "evidence.tokenMint": "Token mint",
    "evidence.soulAccount": "Soul account",
    "evidence.rawEvent": "Raw event evidence",
    "details.side": "Side",
    "details.amount": "Amount",
    "details.trader": "Trader",
    "details.tokenAccount": "Token account",
    "details.seedHash": "Seed hash",
    "details.receiptLifecycle": "Receipt lifecycle",
    "details.receiptAccount": "Receipt account",
    "details.receiptBoundQuantity": "Bound quantity",
    "details.receiptBoundBoundary": "Bound boundary",
    "events.launch.title": "Launch",
    "events.trade.title": "Trade",
    "events.generation.title": "Soul generation",
    "events.claim.title": "Claim",
    "events.launch.description": "Launched {token}",
    "events.trade.description": "Trade activity for {token}",
    "events.generation.description": "Generated Soul #{generation}",
    "events.claim.description": "Claimed Soul #{sequence}",
    "links.token": "Token",
    "links.gallery": "Gallery",
    "links.soul": "Soul",
    "links.transaction": "Explorer tx",
    "links.mint": "Mint",
    "links.nft": "NFT",
  },
  zh: {
    title: "故事时间线",
    body: "市场创造的 Soul 证据",
    loading: "正在加载故事",
    loadError: "故事暂时不可用",
    unavailableTitle: "故事暂时不可用",
    unavailableBody: "公开故事接口暂时没有返回。你仍可查看页面、交易或领取；稍后可刷新重试。",
    retryHint: "刷新该代币页面即可重新获取故事时间线。",
    cachedNotice: "正在显示本浏览器保存的上一份故事；公开接口恢复后会自动刷新。",
    timeoutError: "时间线超时",
    invalidData: "时间线数据不完整",
    empty: "暂无公开故事证据",
    source: "来源",
    signature: "交易",
    slot: "Slot",
    "evidence.show": "查看证据",
    "evidence.hide": "收起证据",
    "evidence.title": "技术证据",
    "evidence.source": "证据来源",
    "evidence.address": "证据地址",
    "evidence.blockTime": "区块时间",
    "evidence.eventId": "事件 ID",
    "evidence.tokenMint": "代币 mint",
    "evidence.soulAccount": "Soul 账户",
    "evidence.rawEvent": "原始事件证据",
    "details.side": "方向",
    "details.amount": "数量",
    "details.trader": "交易者",
    "details.tokenAccount": "代币账户",
    "details.seedHash": "Soul 种子",
    "details.receiptLifecycle": "收据生命周期",
    "details.receiptAccount": "收据账户",
    "details.receiptBoundQuantity": "绑定数量",
    "details.receiptBoundBoundary": "绑定边界",
    "events.launch.title": "发射",
    "events.trade.title": "交易",
    "events.generation.title": "Soul 生成",
    "events.claim.title": "领取",
    "events.launch.description": "{token} 已发射",
    "events.trade.description": "{token} 的交易活动",
    "events.generation.description": "生成 Soul #{generation}",
    "events.claim.description": "领取 Soul #{sequence}",
    "links.token": "代币",
    "links.gallery": "画廊",
    "links.soul": "Soul",
    "links.transaction": "Explorer 交易",
    "links.mint": "Mint",
    "links.nft": "NFT",
  },
};

const translate = (key: string) => {
  const labels = translations[currentLocale] ?? translations.en;
  return labels[key] ?? key;
};

vi.mock("next-intl", () => ({
  useLocale: () => currentLocale,
  useTranslations: () => translate,
}));

const originalFetch = globalThis.fetch;
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  currentLocale = "en";
  globalThis.fetch = originalFetch;
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
  }
});

describe("TokenTimeline cache schema", () => {
  it("replaces the full-reload loading state with chronological API rows when the timeline fetch succeeds", async () => {
    const mint = "TokenMint111111111111111111111111111111111";
    const apiSnapshot = buildSnapshot(mint);
    let resolveFetch!: (value: Response) => void;
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;

    const { container, unmount } = renderTimeline(mint);
    try {
      expect(container.textContent).toContain("Loading timeline");

      await act(async () => {
        resolveFetch(jsonResponse({ ok: true, ...apiSnapshot }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(container.textContent).not.toContain("Loading timeline");
      expect(container.textContent).toContain("Launched PD7");
      expect(container.textContent).toContain("Trade activity for PD7");
      expect(container.textContent).toContain("Generated Soul #2");
      expect(container.textContent).toContain("Claimed Soul #1");
      expect(container.textContent).toContain("Inspect evidence");
      expect(container.textContent).not.toContain("FinalizedGenerationSignature111111111111111111");
      expect(container.textContent).not.toContain("458769366");

      expandEvidence(container, 2);

      expect(container.textContent).toContain("FinalizedGenerationSignature111111111111111111");
      expect(container.textContent).toContain("Slot");
      expect(container.textContent).toContain("458769366");
      expect(container.textContent).toContain("Raw event evidence");

      expandEvidence(container, 2);

      expect(container.textContent).toContain("Receipt account");
      expect(container.textContent).toContain("Receipt1111111111111111111111111111111111");
      expect(container.textContent).toContain("active");
    } finally {
      unmount();
    }
  });

  it("shows a bounded fallback during a slow no-cache refresh and still renders a delayed public API success", async () => {
    vi.useFakeTimers();
    const mint = "TokenMint111111111111111111111111111111111";
    const apiSnapshot = buildSnapshot(mint);
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(jsonResponse({ ok: true, ...apiSnapshot }));
          }, 12_500);
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { container, unmount } = renderTimeline(mint);
    try {
      expect(container.textContent).toContain("Loading timeline");
      const fetchInit = (
        fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined]
      )[1];
      expect(fetchInit?.cache).toBeUndefined();

      await act(async () => {
        vi.advanceTimersByTime(10_000);
        await Promise.resolve();
      });

      expect(container.textContent).toContain("Story is temporarily unavailable");
      expect(container.textContent).toContain("Refresh this token page to retry the story timeline.");
      expect(container.textContent).toContain("No public timeline evidence yet");
      expect(container.textContent).not.toContain("Loading timeline");

      await act(async () => {
        vi.advanceTimersByTime(2_500);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(container.textContent).not.toContain("Timeline unavailable");
      expect(container.textContent).not.toContain("Loading timeline");
      expect(container.textContent).toContain("Generated Soul #2");
      expect(container.textContent).not.toContain("FinalizedGenerationSignature111111111111111111");

      expandEvidence(container, 2);

      expect(container.textContent).toContain("FinalizedGenerationSignature111111111111111111");
    } finally {
      unmount();
    }
  });

  it("rejects old heuristic generation timeline cache entries during API failure fallback", async () => {
    const storage = new MemoryStorage();
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
    });
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, error: "RPC unavailable" }),
    })) as unknown as typeof fetch;
    storage.setItem(
      "solsoul:token-timeline:TokenMint111111111111111111111111111111111",
      JSON.stringify({
        tokenMint: "TokenMint111111111111111111111111111111111",
        events: [
          {
            id: "generation:heuristic:1",
            kind: "generation",
            tokenMint: "TokenMint111111111111111111111111111111111",
            tokenLabel: "OLD",
            generation: "1",
            signature: "heuristicSoulAccountSignature",
            slot: 42,
            links: [
              {
                labelKey: "transaction",
                href: "https://explorer.solana.com/tx/heuristicSoulAccountSignature?cluster=devnet",
                external: true,
              },
            ],
          },
        ],
        source: {
          fetchedAt: "2026-04-28T00:00:00.000Z",
          rpcEndpoint: "pre-PD7 heuristic cache",
        },
      }),
    );

    const { container, unmount } = renderTimeline("TokenMint111111111111111111111111111111111");
    try {
      await waitForText(container, "Story is temporarily unavailable");

      expect(container.textContent).not.toContain("heuristicSoulAccountSignature");
      expect(container.textContent).not.toContain("Generated Soul #1");
      expect(container.textContent).toContain("No public timeline evidence yet");
    } finally {
      unmount();
    }
  });

  it("hydrates a valid PD7 provenance timeline cache when the API refresh fails", async () => {
    const storage = new MemoryStorage();
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
    });
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, error: "RPC unavailable" }),
    })) as unknown as typeof fetch;
    storage.setItem(
      "solsoul:token-timeline:v2:TokenMint111111111111111111111111111111111",
      JSON.stringify({
        schemaVersion: 2,
        snapshot: {
          tokenMint: "TokenMint111111111111111111111111111111111",
          events: [
            {
              id: "generation:TokenMint111111111111111111111111111111111:Soul111111111111111111111111111111111111:2",
              kind: "generation",
              tokenMint: "TokenMint111111111111111111111111111111111",
              tokenLabel: "PD7",
              generation: "2",
              side: "buy",
              amount: "990000",
              trader: "Trader1111111111111111111111111111111111",
              tokenAccount: "TraderToken11111111111111111111111111111",
              seedHash: "c613e02aa48460b1",
              soul: "Soul111111111111111111111111111111111111",
              signature: "FinalizedGenerationSignature111111111111111111",
              slot: 458769366,
              links: [
                {
                  labelKey: "token",
                  href: "/token/TokenMint111111111111111111111111111111111",
                },
                {
                  labelKey: "soul",
                  href: "https://explorer.solana.com/address/Soul111111111111111111111111111111111111?cluster=devnet",
                  external: true,
                },
                {
                  labelKey: "transaction",
                  href: "https://explorer.solana.com/tx/FinalizedGenerationSignature111111111111111111?cluster=devnet",
                  external: true,
                },
              ],
            },
          ],
          source: {
            fetchedAt: "2026-04-29T00:00:00.000Z",
            rpcEndpoint: "https://api.devnet.solana.com",
          },
        },
      }),
    );

    const { container, unmount } = renderTimeline("TokenMint111111111111111111111111111111111");
    try {
      await waitForText(container, "Generated Soul #2");

      expect(container.textContent).toContain("Generated Soul #2");
      expect(container.textContent).not.toContain("FinalizedGenerationSignature111111111111111111");

      expandEvidence(container, 0);

      expect(container.textContent).toContain("FinalizedGenerationSignature111111111111111111");
      expect(container.textContent).toContain("Side");
      expect(container.textContent).toContain("990000");
      expect(container.textContent).toContain("c613e02aa48460b1");
    } finally {
      unmount();
    }
  });

  it("keeps a valid v2 cache visible with a localized fallback while a refresh hangs", async () => {
    vi.useFakeTimers();
    const mint = "TokenMint111111111111111111111111111111111";
    const storage = new MemoryStorage();
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
    });
    storage.setItem(
      `solsoul:token-timeline:v2:${mint}`,
      JSON.stringify({
        schemaVersion: 2,
        snapshot: buildSnapshot(mint),
      }),
    );
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;

    const { container, unmount } = renderTimeline(mint);
    try {
      expect(container.textContent).toContain("Generated Soul #2");
      expect(container.textContent).toContain("Loading timeline");

      await act(async () => {
        vi.advanceTimersByTime(10_000);
        await Promise.resolve();
      });

      expect(container.textContent).toContain("Generated Soul #2");
      expect(container.textContent).toContain("Story is temporarily unavailable");
      expect(container.textContent).toContain("Showing the last saved story while the public endpoint recovers.");
      expect(container.textContent).not.toContain("FinalizedGenerationSignature111111111111111111");
      expandEvidence(container, 2);
      expect(container.textContent).toContain("FinalizedGenerationSignature111111111111111111");
      expect(container.textContent).not.toContain("Timeline unavailable");
      expect(container.textContent).not.toContain("Timeline timed out");
      expect(container.textContent).not.toContain("Loading timeline");
    } finally {
      unmount();
    }
  });

  it("transitions no-cache loading to a neutral fallback after the bounded timeout", async () => {
    vi.useFakeTimers();
    const mint = "TokenMint111111111111111111111111111111111";
    const apiSnapshot = buildSnapshot(mint);
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(jsonResponse({ ok: true, ...apiSnapshot }));
          }, 35_000);
        }),
    ) as unknown as typeof fetch;

    const { container, unmount } = renderTimeline(mint);
    try {
      expect(container.textContent).toContain("Loading timeline");

      await act(async () => {
        vi.advanceTimersByTime(10_000);
        await Promise.resolve();
      });

      expect(container.textContent).toContain("Story is temporarily unavailable");
      expect(container.textContent).toContain("Refresh this token page to retry the story timeline.");
      expect(container.textContent).toContain("No public timeline evidence yet");
      expect(container.textContent).not.toContain("Loading timeline");
      expect(container.textContent).not.toContain("Timeline timed out");

      await act(async () => {
        vi.advanceTimersByTime(25_000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(container.textContent).not.toContain("Loading timeline");
      expect(container.textContent).toContain("Generated Soul #2");
      expect(container.textContent).not.toContain("FinalizedGenerationSignature111111111111111111");
      expandEvidence(container, 2);
      expect(container.textContent).toContain("FinalizedGenerationSignature111111111111111111");
    } finally {
      unmount();
    }
  });

  it("falls back to cache instead of rendering malformed API timeline rows", async () => {
    const mint = "TokenMint111111111111111111111111111111111";
    const storage = new MemoryStorage();
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
    });
    storage.setItem(
      `solsoul:token-timeline:v2:${mint}`,
      JSON.stringify({
        schemaVersion: 2,
        snapshot: buildSnapshot(mint),
      }),
    );
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        ok: true,
        tokenMint: mint,
        events: [
          {
            id: "generation:missing-provenance",
            kind: "generation",
            tokenMint: mint,
            tokenLabel: "BROKEN",
            links: [],
          },
        ],
        source: {
          fetchedAt: "2026-04-29T00:00:00.000Z",
          rpcEndpoint: "https://api.devnet.solana.com",
        },
      }),
    ) as unknown as typeof fetch;

    const { container, unmount } = renderTimeline(mint);
    try {
      await waitForText(container, "Timeline data incomplete");

      expect(container.textContent).toContain("Generated Soul #2");
      expect(container.textContent).not.toContain("FinalizedGenerationSignature111111111111111111");
      expandEvidence(container, 2);
      expect(container.textContent).toContain("FinalizedGenerationSignature111111111111111111");
      expect(container.textContent).not.toContain("BROKEN");
    } finally {
      unmount();
    }
  });

  it("renders a neutral localized retry fallback for transient API failures without raw mixed-language errors", async () => {
    currentLocale = "zh";
    const mint = "TokenMint111111111111111111111111111111111";
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 504,
      json: async () => ({ ok: false, error: "Unable to load token timeline." }),
    })) as unknown as typeof fetch;

    const { container, unmount } = renderTimeline(mint);
    try {
      await waitForText(container, "故事暂时不可用");

      expect(container.textContent).toContain("刷新该代币页面即可重新获取故事时间线");
      expect(container.textContent).toContain("暂无公开故事证据");
      expect(container.textContent).not.toContain("无法加载故事: Unable to load token timeline.");
      expect(container.textContent).not.toContain("Unable to load token timeline.");
      expect(container.textContent).not.toContain("timed out");
      expect(container.querySelector('[role="alert"]')).toBeNull();
    } finally {
      unmount();
    }
  });

  it("replaces a hung Chinese no-cache loading state with neutral retry copy after 10 seconds", async () => {
    vi.useFakeTimers();
    currentLocale = "zh";
    const mint = "TokenMint111111111111111111111111111111111";
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;

    const { container, unmount } = renderTimeline(mint);
    try {
      expect(container.textContent).toContain("正在加载故事");

      await act(async () => {
        vi.advanceTimersByTime(10_000);
        await Promise.resolve();
      });

      expect(container.textContent).toContain("故事暂时不可用");
      expect(container.textContent).toContain("刷新该代币页面即可重新获取故事时间线");
      expect(container.textContent).toContain("暂无公开故事证据");
      expect(container.textContent).not.toContain("正在加载故事");
      expect(container.textContent).not.toContain("Unable to load token timeline.");
      expect(container.textContent).not.toContain("无法加载故事: Unable to load token timeline.");
      expect(container.querySelector('[role="alert"]')).toBeNull();
    } finally {
      unmount();
    }
  });

  it("keeps valid cached timeline rows visible and localized when a transient refresh fails", async () => {
    currentLocale = "zh";
    const mint = "TokenMint111111111111111111111111111111111";
    const storage = new MemoryStorage();
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
    });
    storage.setItem(
      `solsoul:token-timeline:v2:${mint}`,
      JSON.stringify({
        schemaVersion: 2,
        snapshot: buildSnapshot(mint),
      }),
    );
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({ ok: false, error: "Unable to load token timeline." }),
    })) as unknown as typeof fetch;

    const { container, unmount } = renderTimeline(mint);
    try {
      await waitForText(container, "正在显示本浏览器保存的上一份故事");

      expect(container.textContent).toContain("生成 Soul #2");
      expect(container.textContent).toContain("正在显示本浏览器保存的上一份故事");
      expect(container.textContent).not.toContain("Unable to load token timeline.");
      expect(container.textContent).not.toContain("无法加载故事: Unable to load token timeline.");
      expect(container.textContent).not.toContain("FinalizedGenerationSignature111111111111111111");
      expandEvidence(container, 2);
      expect(container.textContent).toContain("FinalizedGenerationSignature111111111111111111");
    } finally {
      unmount();
    }
  });
});

function buildSnapshot(mint: string) {
  return {
    tokenMint: mint,
    events: [
      {
        id: `launch:${mint}`,
        kind: "launch",
        tokenMint: mint,
        tokenLabel: "PD7",
        signature: "LaunchSignature111111111111111111111111111",
        slot: 458769300,
        links: [
          {
            labelKey: "token",
            href: `/token/${mint}`,
          },
          {
            labelKey: "transaction",
            href: "https://explorer.solana.com/tx/LaunchSignature111111111111111111111111111?cluster=devnet",
            external: true,
          },
        ],
      },
      {
        id: `trade:${mint}:2`,
        kind: "trade",
        tokenMint: mint,
        tokenLabel: "PD7",
        generation: "2",
        signature: "TradeSignature1111111111111111111111111111",
        slot: 458769340,
        links: [
          {
            labelKey: "token",
            href: `/token/${mint}`,
          },
          {
            labelKey: "transaction",
            href: "https://explorer.solana.com/tx/TradeSignature1111111111111111111111111111?cluster=devnet",
            external: true,
          },
        ],
      },
      {
        id: `generation:${mint}:Soul111111111111111111111111111111111111:2`,
        kind: "generation",
        tokenMint: mint,
        tokenLabel: "PD7",
        generation: "2",
        side: "buy",
        amount: "990000",
        trader: "Trader1111111111111111111111111111111111",
        tokenAccount: "TraderToken11111111111111111111111111111",
        seedHash: "c613e02aa48460b1",
        soul: "Soul111111111111111111111111111111111111",
        signature: "FinalizedGenerationSignature111111111111111111",
        slot: 458769366,
        links: [
          {
            labelKey: "token",
            href: `/token/${mint}`,
          },
          {
            labelKey: "soul",
            href: "https://explorer.solana.com/address/Soul111111111111111111111111111111111111?cluster=devnet",
            external: true,
          },
          {
            labelKey: "transaction",
            href: "https://explorer.solana.com/tx/FinalizedGenerationSignature111111111111111111?cluster=devnet",
            external: true,
          },
        ],
      },
      {
        id: "claim:Claim11111111111111111111111111111111111",
        kind: "claim",
        tokenMint: mint,
        tokenLabel: "PD7",
        generation: "2",
        sequence: "1",
        receiptLifecycleState: "active",
        receiptAccount: "Receipt1111111111111111111111111111111111",
        receiptBoundQuantity: "1000000",
        receiptBoundBoundary: "1",
        signature: "ClaimSignature111111111111111111111111111",
        slot: 458769390,
        links: [
          {
            labelKey: "gallery",
            href: `/token/${mint}/gallery`,
          },
          {
            labelKey: "transaction",
            href: "https://explorer.solana.com/tx/ClaimSignature111111111111111111111111111?cluster=devnet",
            external: true,
          },
        ],
      },
    ],
    source: {
      fetchedAt: "2026-04-29T00:00:00.000Z",
      rpcEndpoint: "https://api.devnet.solana.com",
    },
  } as const;
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

function renderTimeline(mint: string): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(<TokenTimeline mint={mint} />);
  });

  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function expandEvidence(container: HTMLElement, index: number): void {
  const evidenceButtons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"]'),
  );
  expect(evidenceButtons[index]).toBeTruthy();
  act(() => {
    evidenceButtons[index]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function waitForText(container: HTMLElement, text: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 1_000) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    if (container.textContent?.includes(text)) {
      return;
    }
  }
  expect(container.textContent).toContain(text);
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
