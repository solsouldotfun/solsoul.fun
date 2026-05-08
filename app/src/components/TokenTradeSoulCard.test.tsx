import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TokenTradeSoulCard } from "./TokenTradeSoulCard";
import { QuoteBreakdown } from "./TokenDetailMarket";

function renderCard(overrides: Partial<React.ComponentProps<typeof TokenTradeSoulCard>> = {}) {
  return renderToStaticMarkup(
    <TokenTradeSoulCard
      eyebrow="Trade Soul"
      title="Trade Soul"
      body="Quotes stay visible while advanced controls stay collapsed."
      buyLabel="Buy"
      sellLabel="Sell"
      activeTrade="buy"
      onTradeChange={() => undefined}
      walletStatus="Connect Phantom to prepare buy or sell."
      walletAction={<button type="button">Select wallet</button>}
      controls={
        <div>
          <label htmlFor="buy-sol-amount">SOL amount</label>
          <input id="buy-sol-amount" name="buy-sol-amount" />
          <button type="button">Buy</button>
        </div>
      }
      quote={
        <div data-testid="quote-breakdown">
          <p>Buy quote</p>
          <p>12.000000 tokens</p>
        </div>
      }
      advancedLabel="Advanced"
      advanced={
        <>
          <label htmlFor="buy-slippage">Slippage (%)</label>
          <input id="buy-slippage" name="buy-slippage" />
          <p>Receipt settlement mode</p>
          <p>Hook-aware wallet transfer</p>
          <p>Pre-sign decoded transaction review</p>
        </>
      }
      {...overrides}
    />,
  );
}

describe("TokenTradeSoulCard", () => {
  it("renders one minimal Trade Soul card with the active quote visible by default", () => {
    const markup = renderCard();

    expect(markup).toContain('data-testid="trade-soul-card"');
    expect(markup).toContain('id="trade-soul-card"');
    expect(markup.match(/data-testid="trade-soul-card"/g)).toHaveLength(1);
    expect(markup).toContain('data-testid="quote-breakdown"');
    expect(markup).toContain("Buy quote");
    expect(markup).toContain("12.000000 tokens");
    expect(markup.indexOf("Buy quote")).toBeLessThan(markup.indexOf("<details"));
  });

  it("keeps the disconnected wallet state inline and actionable inside the card", () => {
    const markup = renderCard();

    expect(markup).toContain("Connect Phantom to prepare buy or sell.");
    expect(markup).toContain("Select wallet");
    expect(markup.indexOf("Connect Phantom")).toBeLessThan(markup.indexOf("SOL amount"));
  });

  it("collapses slippage, settlement, direct transfer, and proof controls behind Advanced", () => {
    const markup = renderCard();

    expect(markup).toContain("<summary");
    expect(markup).toContain("Advanced");
    expect(markup).not.toContain("<details open");
    expect(markup.indexOf("Advanced")).toBeLessThan(markup.indexOf("Slippage (%)"));
    expect(markup.indexOf("Advanced")).toBeLessThan(markup.indexOf("Receipt settlement mode"));
    expect(markup.indexOf("Advanced")).toBeLessThan(markup.indexOf("Hook-aware wallet transfer"));
    expect(markup.indexOf("Advanced")).toBeLessThan(markup.indexOf("Pre-sign decoded transaction review"));
  });

  it("renders sell mode in the same card instead of a second competing trade panel", () => {
    const markup = renderCard({
      activeTrade: "sell",
      controls: (
        <div>
          <label htmlFor="sell-token-amount">Amount to sell</label>
          <input id="sell-token-amount" name="sell-token-amount" />
          <button type="button">Sell</button>
        </div>
      ),
      quote: (
        <div data-testid="quote-breakdown">
          <p>Sell quote</p>
          <p>0.050000000 SOL</p>
        </div>
      ),
    });

    expect(markup.match(/data-testid="trade-soul-card"/g)).toHaveLength(1);
    expect(markup).toContain("Sell quote");
    expect(markup).toContain("0.050000000 SOL");
    expect(markup).toContain('aria-pressed="true"');
  });

  it("shows safe localized quote fallback copy without fabricated numeric markers", () => {
    const markup = renderCard({
      quote: (
        <QuoteBreakdown
          title="Buy quote"
          quoteText={null}
          minReceivedText={null}
          lockFeeText={null}
          priceImpactText={null}
          balanceText="SOL balance: Unavailable"
          routeText="Wallet → SolSoul market → tokens + new Soul moment"
          prompt="Curve quote data is unavailable, so no MT gate estimate is shown."
          labels={{
            youReceive: "You receive",
            minReceived: "Minimum received",
            lockFee: "Locked fee",
            priceImpact: "Price impact",
            balance: "Wallet balance",
            route: "Path",
          }}
        />
      ),
    });

    expect(markup).toContain("Buy quote");
    expect(markup).toContain("Curve quote data is unavailable");
    expect(markup).not.toContain("You receive");
    expect(markup).not.toContain("Minimum received");
    expect(markup).not.toMatch(/\b\d+\.\d+\s*(?:SOL|tokens)\b/);
    expect(markup).not.toContain("10,000 tokens / MT");
  });
});
