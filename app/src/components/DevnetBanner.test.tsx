import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { DevnetBannerView } from "./DevnetBanner";

describe("DevnetBannerView", () => {
  it("renders the high-contrast premium devnet banner when visible", () => {
    const html = renderToStaticMarkup(
      <DevnetBannerView visible={true} label={en.shared.devnetBanner.label} />,
    );

    expect(html).toContain("DEVNET TESTNET");
    expect(html).toContain("funds are not real");
    expect(html).toContain("border-soul-mint/20");
    expect(html).toContain("bg-[linear-gradient");
    expect(html).toContain("text-white/85");
    expect(html).not.toContain("red-");
    expect(html).toContain("role=\"status\"");
  });

  it("matches the snapshot when visible", () => {
    const html = renderToStaticMarkup(
      <DevnetBannerView visible={true} label={en.shared.devnetBanner.label} />,
    );
    expect(html).toMatchInlineSnapshot(
      `"<div class="w-full border-b border-soul-mint/20 bg-[linear-gradient(90deg,rgba(215,255,63,0.16),rgba(155,92,255,0.12),rgba(34,211,238,0.12))] px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-white/85 shadow-[0_0_30px_rgba(155,92,255,0.18)] sm:text-sm" role="status" aria-live="polite">DEVNET TESTNET — funds are not real</div>"`,
    );
  });

  it("renders Chinese banner copy without the reported English leak", () => {
    const html = renderToStaticMarkup(
      <DevnetBannerView visible={true} label={zh.shared.devnetBanner.label} />,
    );

    expect(html).toContain("DEVNET 测试网");
    expect(html).toContain("资金没有真实价值");
    expect(html).not.toContain("DEVNET TESTNET");
    expect(html).not.toContain("funds are not real");
  });

  it("hides the banner when not visible", () => {
    expect(
      renderToStaticMarkup(
        <DevnetBannerView visible={false} label={en.shared.devnetBanner.label} />,
      ),
    ).toBe("");
  });
});
