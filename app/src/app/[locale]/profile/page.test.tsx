// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readMessages(locale: "en" | "zh") {
  return JSON.parse(readFileSync(path.join(process.cwd(), `messages/${locale}.json`), "utf8")) as {
    profile: {
      title: string;
      description: string;
      connectPrompt: string;
      empty: string;
    };
  };
}

function readLocalizedProfilePageSource() {
  return readFileSync(path.join(process.cwd(), "src/app/[locale]/profile/page.tsx"), "utf8");
}

describe("/[locale]/profile My Souls route", () => {
  it("renders the shared wallet-owned Soul gallery through the profile copy namespace", () => {
    const source = readLocalizedProfilePageSource();

    expect(source).toContain("WalletSoulGalleryPage");
    expect(source).toContain('messages="profile"');
  });

  it("has EN/ZH disconnected-state copy that clearly asks users to connect a wallet", () => {
    const en = readMessages("en").profile;
    const zh = readMessages("zh").profile;

    expect(en.title).toContain("My Souls");
    expect(en.description).toContain("claimed MT/Soul NFTs");
    expect(en.description).toContain("10,000 tokens");
    expect(en.connectPrompt).toContain("Connect Phantom");
    expect(en.empty).toContain("trade to generate");

    expect(zh.title).toContain("我的灵魂");
    expect(zh.description).toContain("已领取");
    expect(zh.connectPrompt).toContain("连接 Phantom");
    expect(zh.empty).toContain("交易生成");
  });
});
