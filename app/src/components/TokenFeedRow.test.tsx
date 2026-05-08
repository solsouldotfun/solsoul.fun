import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { TokenFeedRow } from "./TokenFeedRow";
import type { LaunchedTokenFeedItem } from "@/lib/tokenFeed";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) =>
    (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        "tokens.viewToken": "View token",
        "tokens.latestSoulAlt": "Latest Soul",
        "tokens.previewMotionCaveat": "Compact website preview only; metadata remains static.",
        "tokens.noGenerationTitle": "No Soul yet",
        "tokens.noGenerationBody": "Fractal preview awakens after the first trade.",
        "tokens.stats.flow": "Flow",
        "tokens.stats.generated": "Souls",
        "tokens.stats.generatedValue": `${values?.count} generated`,
        "tokens.stats.energy": "Energy",
        "tokens.stats.energyValue": `${values?.tier} · ${values?.score}`,
        "tokens.stats.energyPending": "Awaiting",
        "tokens.stats.collectors": "Collectors",
        "tokens.stats.collectorsValue": `${values?.count} claimed`,
        "tokens.stats.progress": "Progress",
        "tokens.stats.freshness": "Fresh",
        "tokens.rarityTiers.rare": "Rare",
      };
      return labels[namespace ? `${namespace}.${key}` : key] ?? key;
    },
}));

describe("TokenFeedRow", () => {
  it("renders a clean art-forward card with symbol, price, status, and trade link", () => {
    const markup = renderToStaticMarkup(<TokenFeedRow item={tokenFeedItem()} />);

    expect(markup).toContain(
      'data-token-feed-row="Mint11111111111111111111111111111111111111"',
    );
    expect(markup).toContain("PD8");
    expect(markup).toContain("0.000001 SOL/token");
    expect(markup).toContain("Generated / unclaimed");
    expect(markup).toContain("Flow");
    expect(markup).toContain("latest buy 0.99 tokens");
    expect(markup).toContain("8 generated");
    expect(markup).toContain("Rare · 842");
    expect(markup).toContain("3 claimed");
    expect(markup).toContain("0.05%");
    expect(markup).toContain("Apr 30, 2026, 05:00 UTC");
    expect(markup).toContain('href="/token/Mint11111111111111111111111111111111111111"');
    expect(markup).toContain("View token");
    expect(markup).toContain('data-testid="token-feed-animated-soul-preview"');
    expect(markup).toContain('data-motion-source="website-only"');
    expect(markup).toContain('data-motion="auto"');
    expect(markup).toContain('data-preview-surface="feed"');
    expect(markup).toContain('data-preview-density="compact"');
    expect(markup).toContain('data-preview-state="animated-soul"');
    expect(markup).toContain("Compact website preview only; metadata remains static.");
    expect(markup).not.toContain("Buy Soul");
    expect(markup).not.toContain("Sell Soul");
    expect(markup).not.toContain("Buy now");
    expect(markup).not.toContain("List NFT");
  });

  it("shows a placeholder when no Soul has been generated yet", () => {
    const item = tokenFeedItem({
      latestSoulSvg: null,
      soulStatusLabel: "No Soul yet",
      latestEnergyScore: null,
      latestRarityTier: null,
    });

    const markup = renderToStaticMarkup(<TokenFeedRow item={item} />);

    expect(markup).toContain("No Soul yet");
    expect(markup).toContain("Fractal preview awakens after the first trade.");
    expect(markup).toContain('data-preview-state="awaiting-soul"');
    expect(markup).toContain('data-testid="token-feed-soul-placeholder"');
    expect(markup).toContain("motion-safe:animate-pulse");
    expect(markup).toContain("View token");
  });

  it("renders fresh SVG previews with a browser-image-safe namespace data URI", () => {
    const item = tokenFeedItem({
      latestSoulSvg:
        '<svg viewBox="0 0 256 256" data-soul="fractal"><rect width="256" height="256" fill="#1a1a1a"/><circle cx="128" cy="128" r="60" fill="none" stroke="#fff" stroke-width="2"/></svg>',
    });

    const markup = renderToStaticMarkup(<TokenFeedRow item={item} />);
    const src = firstImageSrc(markup);
    const decoded = decodeURIComponent(
      src.replace("data:image/svg+xml;charset=utf-8,", ""),
    );

    expect(src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decoded).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"');
    expect(decoded).toContain('data-soul="fractal"');
    expect(src).toContain("%231a1a1a");
  });
});

function firstImageSrc(markup: string): string {
  const src = markup.match(/<img[^>]+src="([^"]+)"/)?.[1];
  expect(src).toBeTruthy();
  return src ?? "";
}

function tokenFeedItem(
  overrides: Partial<LaunchedTokenFeedItem> = {},
): LaunchedTokenFeedItem {
  return {
    mint: "Mint11111111111111111111111111111111111111",
    mintLabel: "Mint…1111",
    href: "/token/Mint11111111111111111111111111111111111111",
    symbol: "PD8",
    creator: "Creator111111111111111111111111111111111111",
    creatorLabel: "Crea…1111",
    currentPrice: "0.000001 SOL/token",
    availability: "Trade available",
    createdAtLabel: "Apr 30, 2026, 05:00 UTC",
    latestSoulSvg: "<svg><circle /></svg>",
    soulStatus: "generated-unclaimed",
    soulStatusLabel: "Generated / unclaimed",
    flowLabel: "0.346574 SOL locked",
    latestFlowLabel: "latest buy 0.99 tokens",
    marketProgressLabel: "0.05%",
    latestEnergyScore: 842,
    latestRarityTier: "rare",
    generationCount: "8",
    claimCount: "3",
    claimStatusLabel: "5 unclaimed Soul candidates",
    holderGateLabel:
      "Holder-gated claimable: hold at least 10000.000000 meme token.",
    artTheme: {
      id: "fractal",
      label: "Fractal Structure",
      renderer: "built-in",
    },
    marketProvenance: {
      generation: "8",
      side: "buy",
      amount: "990000",
      trader: "Trader1111111111111111111111111111111111",
      traderLabel: "Trad…1111",
      seedHash: "c613e02aa48460b1",
      signature: "Signature111111111111111111111111111111111",
      slot: "458769366",
      tokenMint: "Mint11111111111111111111111111111111111111",
      soul: "Soul111111111111111111111111111111111111",
      explorerUrl:
        "https://explorer.solana.com/tx/Signature111111111111111111111111111111111?cluster=devnet",
    },
    marketProvenanceStatus: "available",
    discoverySort: {
      createdAtUnix: 1777525200,
      cumulativeSolLamports: "346574000000",
      totalMintedBaseUnits: "10500000000000",
      generationCount: "8",
      claimCount: "3",
      latestTradeAmount: "990000",
      energyScore: 842,
      hasSoul: true,
    },
    ...overrides,
  };
}
