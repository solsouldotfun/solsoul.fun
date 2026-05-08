import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const componentPath = join(process.cwd(), "src/components/WalletSoulGalleryPage.tsx");

describe("WalletSoulGalleryPage receipt-first data flow", () => {
  it("queries receipt-backed claimed Souls by connected claimer before optional wallet NFT enrichment", () => {
    const source = readFileSync(componentPath, "utf8");

    expect(source).toContain("listClaimedSoulNftsByClaimer");
    expect(source).toContain("buildClaimedSoulNftGalleryItems");
    expect(source.indexOf("listClaimedSoulNftsByClaimer")).toBeLessThan(
      source.indexOf("getParsedTokenAccountsByOwner"),
    );
  });

  it("keeps the profile copy honest about trade-to-generate and claim flow", () => {
    const en = JSON.parse(readFileSync(join(process.cwd(), "messages/en.json"), "utf8"));
    const zh = JSON.parse(readFileSync(join(process.cwd(), "messages/zh.json"), "utf8"));

    expect(en.profile.description).toContain("claimed MT/Soul NFTs");
    expect(en.profile.description).toContain("10,000 tokens");
    expect(en.profile.description).toContain("claim");
    expect(en.profile.loading).toContain("Loading");
    expect(en.profile.timeoutError).toContain("taking longer");
    expect(en.profile.retryGuidance).toContain("Refresh");
    expect(zh.profile.description).toContain("已领取");
    expect(zh.profile.description).toContain("交易");
    expect(zh.profile.loading).toContain("加载");
    expect(zh.profile.timeoutError).toContain("时间");
    expect(zh.profile.retryGuidance).toContain("刷新");
  });

  it("uses bounded sanitized fallbacks instead of appending raw wallet/RPC errors", () => {
    const source = readFileSync(componentPath, "utf8");

    expect(source).toContain("runBoundedGalleryRequest");
    expect(source).toContain("formatGalleryFallbackMessage");
    expect(source).not.toContain('`${t("loadError")} ${error.message}`');
  });
});
