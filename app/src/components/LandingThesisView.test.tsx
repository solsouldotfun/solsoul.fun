import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LandingThesisView } from "./LandingThesisView";

describe("LandingThesisView", () => {
  it("renders the soul-first market activity thesis as visible markup", () => {
    const html = renderToStaticMarkup(
      <LandingThesisView
        eyebrow="A Soul-first devnet object protocol"
        headline="Market activity creates living on-chain Soul objects."
        body="Launch initializes a lifecycle, trades generate Soul candidates, and holders claim the resulting SVG objects."
        loopTitle="The SolSoul loop"
        actions={
          <div>
            <a href="/tokens">Explore / trade Souls</a>
            <a href="/launch">Launch a lifecycle</a>
          </div>
        }
        steps={[
          { title: "Launch initializes", body: "Creation starts the lifecycle." },
          { title: "Trades generate", body: "Market activity generates Soul candidates." },
          { title: "Holders claim", body: "Holders claim generated Souls." },
        ]}
      />,
    );

    expect(html).toContain("Market activity creates living on-chain Soul objects.");
    expect(html).toContain("Launch initializes a lifecycle");
    expect(html).toContain("trades generate Soul candidates");
    expect(html).toContain("Holders claim");
  });

  it("keeps the first viewport sparse and editorial instead of card-dashboard dense", () => {
    const html = renderToStaticMarkup(
      <LandingThesisView
        eyebrow="A Soul-first devnet object protocol"
        headline="Market activity creates living on-chain Soul objects."
        body="Launch initializes a lifecycle, trades generate Soul candidates, and holders claim the resulting SVG objects."
        loopTitle="The lifecycle"
        actions={
          <div>
            <a href="/tokens">Explore / trade Souls</a>
            <a href="/launch">Launch a lifecycle</a>
          </div>
        }
        steps={[
          { title: "Launch", body: "Initialize." },
          { title: "Trade", body: "Generate." },
          { title: "Claim", body: "Collect." },
        ]}
      />,
    );

    expect(html).toContain("font-serif");
    expect(html).toContain("border-l");
    expect(html).not.toContain("grid-cols-3");
    expect(html).not.toContain("rounded-3xl border border-white/10 bg-white/[0.03] p-4");
  });

  it("renders dominant explore/trade and secondary launch CTAs before the lifecycle loop", () => {
    const html = renderToStaticMarkup(
      <LandingThesisView
        eyebrow="A Soul-first devnet object protocol"
        headline="Market activity creates living on-chain Soul objects."
        body="Launch initializes a lifecycle, trades generate Soul candidates, and holders claim the resulting SVG objects."
        loopTitle="The lifecycle"
        actions={
          <div>
            <a href="/tokens" className="bg-soul-glow text-black">
              Explore / trade Souls
            </a>
            <a href="/launch">Launch a lifecycle</a>
          </div>
        }
        steps={[
          { title: "Launch", body: "Initialize." },
          { title: "Trade", body: "Generate." },
          { title: "Claim", body: "Collect." },
        ]}
      />,
    );

    const ctaIndex = html.indexOf('data-testid="landing-first-viewport-ctas"');
    const loopIndex = html.indexOf("The lifecycle");

    expect(ctaIndex).toBeGreaterThan(-1);
    expect(loopIndex).toBeGreaterThan(-1);
    expect(ctaIndex).toBeLessThan(loopIndex);
    expect(html).toContain("Explore / trade Souls");
    expect(html).toContain("Launch a lifecycle");
    expect(html).toContain("bg-soul-glow");
  });
});
