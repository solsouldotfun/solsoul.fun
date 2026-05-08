import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SoulGalleryCard } from "./SoulGalleryCard";
import type { ClaimedSoulNftGalleryItem, SoulNftGalleryItem } from "@/lib/soulGallery";
import { deriveSoulRarity } from "@/lib/soulRarity";

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
    (key: string, values?: Record<string, string | number>) => {
      const labels: Record<string, string> = {
        "publicGallery.imageLabel": `${values?.name ?? "Soul"} SVG`,
        "publicGallery.previewMotionCaveat": "Compact website preview only; metadata remains static.",
        "publicGallery.tokenMint": "View token",
        "publicGallery.claimer": "Claimer wallet",
        "gallery.imageLabel": `${values?.name ?? "Soul"} SVG`,
        "gallery.previewMotionCaveat": "Compact website preview only; metadata remains static.",
        "gallery.tokenMint": "View token",
        "gallery.claimer": "Claimer wallet",
        "soulRarity.tiers.common": "Common",
        "soulRarity.tiers.uncommon": "Uncommon",
        "soulRarity.tiers.rare": "Rare",
        "soulRarity.tiers.epic": "Epic",
        "soulRarity.tiers.legendary": "Legendary",
        "soulRarity.tiers.mythic": "Mythic",
      };
      return labels[namespace ? `${namespace}.${key}` : key] ?? key;
    },
}));

describe("SoulGalleryCard", () => {
  it("renders a clean art-forward gallery card with name, rarity, and actions", () => {
    const markup = renderToStaticMarkup(
      <SoulGalleryCard item={claimedSoul()} scope="publicGallery" />,
    );

    expect(markup).toContain('data-soul-gallery-card="NftMint111111111111111111111111111111111"');
    expect(markup).toContain('data-preview-density="compact"');
    expect(markup).toContain("sm:grid-cols-[minmax(7.5rem,9rem)_minmax(0,1fr)]");
    expect(markup).toContain("h-44 w-full");
    expect(markup).toContain("PD8 Soul #4");
    expect(markup).toContain("Common");
    expect(markup).not.toContain(">common<");
    expect(markup).toContain('href="/token/TokenMint111111111111111111111111111111"');
    expect(markup).toContain("View token");
    expect(markup).toContain('data-testid="soul-gallery-animated-preview"');
    expect(markup).toContain('data-motion-source="website-only"');
    expect(markup).toContain('data-motion="reduced"');
    expect(markup).toContain('data-preview-surface="gallery"');
    expect(markup).toContain('data-preview-density="compact"');
    expect(markup).toContain("Compact website preview only; metadata remains static.");
    expect(decodedFirstImageSvg(markup)).toContain("<circle");
  });

  it("renders pending-provenance wallet cards without provenance details", () => {
    const markup = renderToStaticMarkup(
      <SoulGalleryCard item={walletSoul()} scope="gallery" />,
    );

    expect(markup).toContain("OLD Soul #1");
    expect(markup).toContain("Rare");
    expect(markup).not.toContain("Explorer");
  });

  it("renders fractal SVG cards without old toy theme references", () => {
    const markup = renderToStaticMarkup(
      <SoulGalleryCard item={fractalClaimedSoul()} scope="publicGallery" />,
    );

    expect(decodedFirstImageSvg(markup)).toContain('data-soul="fractal-sample"');
    expect(markup).toContain("Fractal Soul #5");
    expect(markup.toLowerCase()).not.toContain("unicorn");
    expect(markup.toLowerCase()).not.toContain("pixel-cat");
    expect(markup.toLowerCase()).not.toContain("neonpuff");
  });

  it("constrains animated SVG previews within the card bounds", () => {
    const markup = renderToStaticMarkup(
      <SoulGalleryCard item={fractalClaimedSoul()} scope="publicGallery" />,
    );

    expect(markup).toContain("overflow-hidden");
    expect(markup).toContain("solsoul-animated-soul-preview");
    expect(markup).toContain('data-static-svg-present="true"');
  });

  it("renders claimer action when claim is available", () => {
    const markup = renderToStaticMarkup(
      <SoulGalleryCard item={claimableSoul()} scope="gallery" />,
    );

    expect(markup).toContain("Claimer wallet");
    expect(markup).toContain('href="/token/TokenMint111111111111111111111111111111#claim-soul"');
  });

  it("does not render claimer when claim is unavailable", () => {
    const soul = claimedSoul();
    const item = { ...soul, claim: undefined } as unknown as ClaimedSoulNftGalleryItem;
    const markup = renderToStaticMarkup(
      <SoulGalleryCard item={item} scope="publicGallery" />,
    );

    expect(markup).not.toContain("Claimer wallet");
  });
});

function decodedFirstImageSvg(markup: string): string {
  const src = markup.match(/<img[^>]+src="([^"]+)"/)?.[1];
  expect(src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  return decodeURIComponent(src?.replace("data:image/svg+xml;charset=utf-8,", "") ?? "");
}

function claimedSoul(): ClaimedSoulNftGalleryItem {
  return {
    claim: "Claim111111111111111111111111111111111111",
    claimer: "Claimer111111111111111111111111111111111",
    claimerLabel: "Clai…1111",
    nftMint: "NftMint111111111111111111111111111111111",
    tokenMint: "TokenMint111111111111111111111111111111",
    tokenMintLabel: "Toke…1111",
    name: "PD8 Soul #4",
    symbol: "PD8",
    sanitizedSvg: "<svg><circle /></svg>",
    sequence: 4,
    artTheme: {
      label: "Fractal Structure",
      source: "metadata",
    },
    soulRarity: deriveSoulRarity({
      nftMint: "NftMint111111111111111111111111111111111",
      tokenMint: "TokenMint111111111111111111111111111111",
      soul: "Soul111111111111111111111111111111111111",
      generation: "4",
      sequence: 4,
      artTheme: "Fractal Structure",
      seedHash: "abcdef0123456789",
      side: "sell",
      amount: "1000000",
      trader: "Trader1111111111111111111111111111111111",
    }),
    marketProvenance: {
      generation: "4",
      side: "sell",
      amount: "1000000",
      trader: "Trader1111111111111111111111111111111111",
      traderLabel: "Trad…1111",
      seedHash: "abcdef0123456789",
      tokenMint: "TokenMint111111111111111111111111111111",
      soul: "Soul111111111111111111111111111111111111",
      signature: "Signature111111111111111111111111111111111",
      slot: "458798744",
      explorerUrl:
        "https://explorer.solana.com/tx/Signature111111111111111111111111111111111?cluster=devnet",
    },
    marketProvenanceStatus: "available",
    marketProvenanceLookup: {
      tokenMint: "TokenMint111111111111111111111111111111",
      soul: "Soul111111111111111111111111111111111111",
      generation: "4",
    },
  };
}

function walletSoul(): SoulNftGalleryItem {
  return {
    tokenAccount: "TokenAccount11111111111111111111111111111",
    mint: "WalletNft11111111111111111111111111111111",
    tokenMint: "TokenMint111111111111111111111111111111",
    tokenMintLabel: "Toke…1111",
    name: "OLD Soul #1",
    symbol: "OLD",
    sanitizedSvg: "<svg><rect /></svg>",
    artTheme: {
      label: "Legacy / unknown art theme",
      source: "legacy",
    },
    soulRarity: deriveSoulRarity({
      nftMint: "WalletNft11111111111111111111111111111111",
      tokenMint: "TokenMint111111111111111111111111111111",
      tokenAccount: "TokenAccount111111111111111111111111111111",
      generation: "1",
      artTheme: "Legacy / unknown art theme",
    }),
    marketProvenance: null,
    marketProvenanceStatus: "pending",
  };
}

function fractalClaimedSoul(): ClaimedSoulNftGalleryItem {
  return {
    ...claimedSoul(),
    name: "Fractal Soul #5",
    sequence: 5,
    sanitizedSvg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" data-soul="fractal-sample"><rect width="96" height="96" rx="16" fill="#1a1a1a"/><circle cx="48" cy="48" r="30" fill="none" stroke="#fff" stroke-width="2"/></svg>',
    artTheme: {
      label: "Fractal Structure",
      source: "metadata",
    },
  };
}

function claimableSoul(): ClaimedSoulNftGalleryItem {
  return {
    ...claimedSoul(),
    claim: "Claim111111111111111111111111111111111111",
  };
}
