import { describe, expect, it } from "vitest";
import { uiPrimitives } from "./uiPrimitives";

const retiredVisualTerms = new RegExp(["doo" + "dle", "stick" + "er", "play" + "ful", "cu" + "te", "cart" + "oon", "sk" + "etch"].join("|"), "i");

describe("premium visual design primitives", () => {
  it("exposes reusable black-gallery foundations for shared surfaces", () => {
    expect(uiPrimitives.panel).toContain("rounded-3xl");
    expect(uiPrimitives.panel).toContain("border-white/10");
    expect(uiPrimitives.card).toContain("bg-neutral-950/85");
    expect(uiPrimitives.buttonPrimary).toContain("bg-soul-mint");
    expect(uiPrimitives.buttonPrimary).toContain("focus-visible:ring-soul-mint");
    expect(uiPrimitives.buttonSecondary).toContain("bg-white/[0.04]");
    expect(uiPrimitives.pill).toContain("border-soul-mint/20");
    expect(uiPrimitives.banner).toContain("bg-[linear-gradient");
    expect(uiPrimitives.statusNeutral).toContain("bg-white/[0.04]");
  });

  it("does not expose retired casual visual naming in active primitives", () => {
    for (const [name, classes] of Object.entries(uiPrimitives)) {
      expect(classes, name).not.toMatch(retiredVisualTerms);
    }
  });

  it("keeps readable responsive wallet and navigation hooks available", () => {
    expect(uiPrimitives.navLink).toContain("sm:inline-flex");
    expect(uiPrimitives.walletTrigger).toContain("!max-w-[8.5rem]");
    expect(uiPrimitives.walletTrigger).toContain("!overflow-hidden");
  });
});
