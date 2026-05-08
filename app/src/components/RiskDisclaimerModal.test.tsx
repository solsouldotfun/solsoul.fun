import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import {
  RISK_DISCLAIMER_STORAGE_KEY,
  RiskDisclaimerModalView,
  acceptRiskDisclaimer,
  declineRiskDisclaimer,
  isRiskAcknowledgedForSubmit,
  shouldShowRiskDisclaimer,
} from "./RiskDisclaimerModal";

class MemoryStorage implements Pick<Storage, "setItem" | "getItem"> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("risk disclaimer persistence", () => {
  it("accept -> hidden + localStorage set", () => {
    const storage = new MemoryStorage();
    const acceptedAtMs = Date.parse("2026-04-27T12:00:00.000Z");

    const decision = acceptRiskDisclaimer(storage, acceptedAtMs);

    expect(decision.isOpen).toBe(false);
    expect(storage.getItem(RISK_DISCLAIMER_STORAGE_KEY)).toBe("2026-04-27T12:00:00.000Z");
    expect(shouldShowRiskDisclaimer(storage.getItem(RISK_DISCLAIMER_STORAGE_KEY), acceptedAtMs)).toBe(false);
  });

  it("decline -> stays open + submit blocked", () => {
    expect(declineRiskDisclaimer().isOpen).toBe(true);
    expect(isRiskAcknowledgedForSubmit(false)).toBe(false);
  });

  it("90 days expired -> re-show", () => {
    const acceptedAt = "2026-01-01T00:00:00.000Z";
    const after91Days = Date.parse("2026-04-02T00:00:00.000Z");

    expect(shouldShowRiskDisclaimer(acceptedAt, after91Days)).toBe(true);
  });
});

describe("RiskDisclaimerModalView", () => {
  it.each([
    ["en", en.riskDisclaimer],
    ["zh", zh.riskDisclaimer],
  ])("%s renders all mandatory bullets", (_locale, messages) => {
    const html = renderToStaticMarkup(
      <RiskDisclaimerModalView
        isOpen={true}
        title={messages.title}
        intro={messages.intro}
        bullets={messages.bullets}
        acceptLabel={messages.accept}
        declineLabel={messages.decline}
      />,
    );
    const decodedHtml = html.replace(/&#x27;/g, "'");

    expect(decodedHtml).toContain(messages.title);
    for (const bullet of messages.bullets) {
      expect(decodedHtml).toContain(bullet);
    }
    expect(decodedHtml).toContain(messages.bullets[2]);
    expect(decodedHtml).not.toContain("creator-selected AMM");
  });

  it("uses the shared neutral modal shell instead of purple or amber glass styling", () => {
    const html = renderToStaticMarkup(
      <RiskDisclaimerModalView
        isOpen={true}
        title={en.riskDisclaimer.title}
        intro={en.riskDisclaimer.intro}
        bullets={en.riskDisclaimer.bullets}
        acceptLabel={en.riskDisclaimer.accept}
        declineLabel={en.riskDisclaimer.decline}
      />,
    );

    expect(html).toContain("border-white/15");
    expect(html).toContain("bg-neutral-950");
    expect(html).toContain("text-white");
    expect(html).not.toContain("purple");
    expect(html).not.toContain("amber");
  });
});
