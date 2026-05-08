import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TokenActionCenter, TokenClaimActionCard } from "./TokenActionCenter";
import { TokenTechnicalSections } from "./TokenTechnicalSections";

function tokenSoulPanelSource() {
  return readFileSync(fileURLToPath(import.meta.url).replace(/TokenDetailHeroActionOrder\.test\.tsx$/, "TokenSoulPanel.tsx"), "utf8");
}

describe("token detail Soul hero action center", () => {
  it("keeps hero and Buy/Sell/Claim action center before technical sections in source order", () => {
    const source = tokenSoulPanelSource();
    const hero = source.indexOf("<TokenDetailSurfaceHeader");
    const actionCenter = source.indexOf("<TokenActionCenter");
    const tradeSoulCard = source.indexOf("<TokenTradeSoulCard", actionCenter);
    const secondary = source.indexOf("<TokenTechnicalSections");
    const generationRules = source.indexOf("<GenerationRulesCard", secondary);
    const marketOverview = source.indexOf("<MarketCurveOverview", secondary);
    const lifecycleCurve = source.indexOf("<LifecycleCurveVisual", secondary);
    const timeline = source.indexOf("<TokenTimeline", secondary);

    expect(hero).toBeGreaterThan(-1);
    expect(actionCenter).toBeGreaterThan(hero);
    expect(tradeSoulCard).toBeGreaterThan(actionCenter);
    expect(secondary).toBeGreaterThan(actionCenter);
    expect(timeline).toBeGreaterThan(actionCenter);
    expect(generationRules).toBeGreaterThan(actionCenter);
    expect(marketOverview).toBeGreaterThan(actionCenter);
    expect(lifecycleCurve).toBeGreaterThan(actionCenter);
  });

  it("routes ordinary trading through one Trade Soul card with quote before Advanced controls", () => {
    const source = tokenSoulPanelSource();
    const tradeSoulCards = source.match(/<TokenTradeSoulCard/g) ?? [];
    const proofRails = source.match(/<TokenDetailProofRail/g) ?? [];
    const tradeSoulCard = source.indexOf("<TokenTradeSoulCard");
    const quote = source.indexOf("quote={", tradeSoulCard);
    const advanced = source.indexOf("advanced={", tradeSoulCard);
    const directTransfer = source.indexOf("directTransfer.title", advanced);
    const preSignReview = source.indexOf("<PreSignTransactionReviewCard", advanced);

    expect(tradeSoulCards).toHaveLength(1);
    expect(proofRails).toHaveLength(1);
    expect(quote).toBeGreaterThan(tradeSoulCard);
    expect(advanced).toBeGreaterThan(quote);
    expect(directTransfer).toBeGreaterThan(advanced);
    expect(preSignReview).toBeGreaterThan(advanced);
  });

  it("keeps the desktop proof rail adjacent to the action center and behind collapsed provenance", () => {
    const source = tokenSoulPanelSource();
    const layout = source.indexOf('data-testid="token-detail-action-proof-layout"');
    const actionCenter = source.indexOf("<TokenActionCenter", layout);
    const proofRail = source.indexOf("<TokenDetailProofRail", actionCenter);
    const technicalSections = source.indexOf("<TokenTechnicalSections", proofRail);
    const provenanceItems = source.indexOf("proofRailProvenanceItems", actionCenter);

    expect(layout).toBeGreaterThan(-1);
    expect(actionCenter).toBeGreaterThan(layout);
    expect(proofRail).toBeGreaterThan(actionCenter);
    expect(technicalSections).toBeGreaterThan(proofRail);
    expect(provenanceItems).toBeGreaterThan(-1);
  });

  it("surfaces confirmed claimable Souls as the next action before the Trade Soul card", () => {
    const source = tokenSoulPanelSource();
    const actionCenter = source.indexOf("<TokenActionCenter");
    const claimableFlag = source.indexOf("hasConfirmedClaimableSoul", actionCenter);
    const nextAction = source.indexOf('t("tradeControls.claimableNextActionTitle")', actionCenter);
    const collectCta = source.indexOf('t("tradeControls.claimableNextActionCta")', nextAction);
    const tradeSoulCard = source.indexOf("<TokenTradeSoulCard", actionCenter);

    expect(claimableFlag).toBeGreaterThan(-1);
    expect(nextAction).toBeGreaterThan(actionCenter);
    expect(collectCta).toBeGreaterThan(nextAction);
    expect(nextAction).toBeLessThan(tradeSoulCard);
  });

  it("keeps quick buy and sell presets inside the Trade Soul controls", () => {
    const source = tokenSoulPanelSource();
    const tradeSoulCard = source.indexOf("<TokenTradeSoulCard");
    const buyPresets = source.indexOf('label={t("tradeControls.quickBuyLabel")}', tradeSoulCard);
    const mtGateEstimate = source.indexOf("mtGateEstimateText", buyPresets);
    const buySelect = source.indexOf("onSelect={setSolAmount}", buyPresets);
    const sellPresets = source.indexOf('label={t("tradeControls.quickSellLabel")}', tradeSoulCard);
    const sellSelect = source.indexOf("onSelect={setSellTokenAmount}", sellPresets);
    const quote = source.indexOf("quote={", tradeSoulCard);

    expect(buyPresets).toBeGreaterThan(tradeSoulCard);
    expect(mtGateEstimate).toBeGreaterThan(-1);
    expect(buySelect).toBeGreaterThan(buyPresets);
    expect(sellPresets).toBeGreaterThan(tradeSoulCard);
    expect(sellSelect).toBeGreaterThan(sellPresets);
    expect(buyPresets).toBeLessThan(quote);
    expect(sellPresets).toBeLessThan(quote);
  });

  it("keeps sell-before-claim collect-first guidance ahead of the sell transaction button", () => {
    const source = tokenSoulPanelSource();
    const tradeSoulCard = source.indexOf("<TokenTradeSoulCard");
    const sellBranch = source.indexOf('label={t("tradeControls.quickSellLabel")}', tradeSoulCard);
    const collectFirst = source.indexOf('testId="sell-before-claim-priority"', sellBranch);
    const visualWarning = source.indexOf('t("tradeControls.sellBeforeClaimWarningBody")', collectFirst);
    const sellButton = source.indexOf('onClick={handleSell}', visualWarning);

    expect(collectFirst).toBeGreaterThan(sellBranch);
    expect(visualWarning).toBeGreaterThan(collectFirst);
    expect(sellButton).toBeGreaterThan(visualWarning);
  });

  it("renders one adjacent Buy/Sell/Claim action center contract", () => {
    const markup = renderToStaticMarkup(
      <TokenActionCenter
        eyebrow="Trade to awaken Souls"
        title="Buy or sell to awaken the next Soul"
        body="Every market action can awaken the next Soul."
        claimPanel={
          <TokenClaimActionCard
            title="Collect the generated Soul"
            body="Collecting is available when holder rules are met."
            statusLabel="Claimable"
            nextActionLabel="Collect Soul"
          >
            <button type="button">Collect Soul</button>
          </TokenClaimActionCard>
        }
      >
        <button type="button">Buy</button>
        <button type="button">Sell</button>
      </TokenActionCenter>,
    );

    expect(markup).toContain('data-testid="token-action-center"');
    expect(markup).toContain('data-testid="token-claim-action"');
    expect(markup).toContain("Buy");
    expect(markup).toContain("Sell");
    expect(markup).toContain("Collect Soul");
    expect(markup.indexOf("Buy")).toBeLessThan(markup.indexOf("Collect Soul"));
  });

  it("places secondary protocol content behind an ordinary collapsed disclosure", () => {
    const markup = renderToStaticMarkup(
      <TokenTechnicalSections
        title="Story and advanced layers"
        body="Secondary context stays below the hero."
      >
        <details>
          <summary>Advanced technical details</summary>
          <div>GenerationRules · MarketCurveOverview · PDA evidence</div>
        </details>
      </TokenTechnicalSections>,
    );

    expect(markup).toContain('data-testid="token-secondary-technical-sections"');
    expect(markup).toContain("<details>");
    expect(markup).not.toContain("<details open");
    expect(markup.indexOf("Story and advanced layers")).toBeLessThan(
      markup.indexOf("Advanced technical details"),
    );
  });
});
