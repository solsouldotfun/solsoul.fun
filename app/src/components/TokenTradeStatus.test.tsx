// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TokenClaimPriorityNotice,
  TokenSellClaimSemanticsNotice,
  TokenTradeSuccessCard,
} from "./TokenTradeStatus";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("TokenTradeSuccessCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps raw buy transaction evidence behind disclosure while primary result stays readable", async () => {
    await act(async () => {
      root.render(
        <TokenTradeSuccessCard
          title="Buy complete"
          body="Your token balance, Soul state, market quote, and story timeline have been refreshed."
          detailsLabel="Inspect trade evidence"
          evidence={[
            {
              label: "Buy transaction",
              value: "Buy complete. Transaction: BuySig111111111111111111111111111111111111111",
            },
            { label: "Minimum tokens received", value: "1.000000" },
          ]}
        />,
      );
    });

    const primary = container.querySelector('[data-testid="trade-result-primary"]');
    const evidence = container.querySelector('[data-testid="trade-result-evidence"]');
    expect(primary?.textContent).toContain("Buy complete");
    expect(primary?.textContent).toContain("Soul state");
    expect(primary?.textContent).not.toContain("BuySig111111111111111111111111111111111111111");
    expect(evidence?.textContent).toContain("BuySig111111111111111111111111111111111111111");
  });

  it("keeps sell settlement evidence inspectable without dominating the primary result", async () => {
    await act(async () => {
      root.render(
        <TokenTradeSuccessCard
          title="Sell complete"
          body="Your settlement preview, token balance, Soul state, and market quote have been refreshed."
          detailsLabel="Inspect trade evidence"
          evidence={[
            { label: "Sell transaction", value: "SellSig11111111111111111111111111111111111111" },
            { label: "Source token account", value: "TokenAcct111111111111111111111111111111111" },
            { label: "Selected receipt set", value: "Receipt1111111111111111111111111111111111" },
          ]}
        />,
      );
    });

    const primary = container.querySelector('[data-testid="trade-result-primary"]');
    const evidence = container.querySelector('[data-testid="trade-result-evidence"]');
    expect(primary?.textContent).toContain("Sell complete");
    expect(primary?.textContent).toContain("token balance");
    expect(primary?.textContent).not.toContain("Receipt1111111111111111111111111111111111");
    expect(evidence?.textContent).toContain("Receipt1111111111111111111111111111111111");
  });

  it("renders a pre-sell warning that separates visual moments from claimable MT/Soul provenance", async () => {
    await act(async () => {
      root.render(
        <TokenSellClaimSemanticsNotice
          title="Before you sell"
          body="Selling can awaken a visual Soul moment, but it does not create a claimable MT/Soul. If a buy-backed Soul is currently unclaimed, selling first may make that buy provenance no longer the latest claimable candidate."
        />,
      );
    });

    const notice = container.querySelector('[data-testid="sell-claim-semantics-notice"]');
    expect(notice?.textContent).toContain("Before you sell");
    expect(notice?.textContent).toContain("visual Soul moment");
    expect(notice?.textContent).toContain("does not create a claimable MT/Soul");
    expect(notice?.textContent).toContain("buy provenance no longer the latest claimable candidate");
  });

  it("surfaces a claimable Soul next action without exposing raw evidence by default", async () => {
    await act(async () => {
      root.render(
        <TokenClaimPriorityNotice
          title="Collect this Soul first"
          body="Confirmed buy-backed eligibility is available for the latest Soul."
          href="#claim-soul"
          ctaLabel="Collect Soul"
        />,
      );
    });

    const nextAction = container.querySelector('[data-testid="claimable-next-action"]');
    const cta = nextAction?.querySelector('a[href="#claim-soul"]');
    expect(nextAction?.textContent).toContain("Collect this Soul first");
    expect(nextAction?.textContent).toContain("Confirmed buy-backed eligibility");
    expect(cta?.textContent).toBe("Collect Soul");
    expect(nextAction?.textContent).not.toContain("receipt");
    expect(nextAction?.textContent).not.toContain("provenance");
  });

  it("prioritizes collect first in sell-before-claim mode while stating the warning is visual guidance", async () => {
    await act(async () => {
      root.render(
        <div>
          <TokenClaimPriorityNotice
            title="Collect first if you want this Soul"
            body="Visual note only: selling can awaken the next market Soul. This is guidance, not a protocol block."
            href="#claim-soul"
            ctaLabel="Collect Soul first"
            note="Sell stays available below when quote, balance, and settlement checks pass."
            testId="sell-before-claim-priority"
          />
          <button type="button">Sell</button>
        </div>,
      );
    });

    const priority = container.querySelector('[data-testid="sell-before-claim-priority"]');
    expect(priority?.textContent).toContain("Collect first if you want this Soul");
    expect(priority?.textContent).toContain("Visual note only");
    expect(priority?.textContent).toContain("not a protocol block");
    expect(priority?.textContent).toContain("Sell stays available below");
    const collectCta = container.querySelector('a[href="#claim-soul"]');
    const sellButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Sell",
    );
    expect(collectCta).toBeTruthy();
    expect(sellButton).toBeTruthy();
    expect(
      collectCta!.compareDocumentPosition(sellButton!),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
