import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("PD17 product premium surfaces", () => {
  it("applies shared premium primitives to launch, token detail, Profile, timeline, and token-gallery surfaces", () => {
    const files = [
      "src/components/LaunchForm.tsx",
      "src/components/TokenSoulPanel.tsx",
      "src/components/WalletSoulGalleryPage.tsx",
      "src/components/TokenTimeline.tsx",
      "src/app/[locale]/token/[mint]/gallery/page.tsx",
    ];

    for (const path of files) {
      const text = source(path);
      expect(text, path).toContain("uiPrimitives");
      expect(text, path).toContain("joinClasses");
      expect(text, path).toMatch(/uiPrimitives\.(panel|card|heroPanel|denseRow)/);
      expect(text, path).toMatch(/uiPrimitives\.(buttonPrimary|buttonSecondary|input|statusNeutral|statusError)/);
    }
  });

  it("routes wallet pre-sign states through the localized shared premium review component", () => {
    const sharedReview = source("src/components/PreSignTransactionReviewCard.tsx");
    expect(sharedReview).toContain('useTranslations("preSignReview")');
    expect(sharedReview).toContain("uiPrimitives.card");
    expect(sharedReview).toContain("uiPrimitives.denseRow");
    expect(sharedReview).toContain("aria-label={t(\"ariaLabel\")}");

    for (const path of [
      "src/components/LaunchForm.tsx",
      "src/components/ClaimButton.tsx",
      "src/components/GenerateAgainButton.tsx",
      "src/components/TokenSoulPanel.tsx",
    ]) {
      const text = source(path);
      expect(text, path).toContain("PreSignTransactionReviewCard");
    }

    const generateAgain = source("src/components/GenerateAgainButton.tsx");
    expect(generateAgain).toContain("uiPrimitives.buttonPrimary");
    expect(generateAgain).toContain("uiPrimitives.statusNeutral");
    expect(generateAgain).toContain("uiPrimitives.statusError");
  });

  it("keeps loading, empty, error, and stats/tokens/soul cards on accessible premium status surfaces", () => {
    const galleryStatus = source("src/components/GalleryStatusCard.tsx");
    expect(galleryStatus).toContain('role={tone === "error" ? "alert" : "status"}');
    expect(galleryStatus).toContain("uiPrimitives.statusError");
    expect(galleryStatus).toContain("uiPrimitives.statusNeutral");

    const stats = source("src/components/StatsDashboard.tsx");
    expect(stats).toContain("data-dust-dashboard");
    expect(stats).toMatch(/joinClasses\(uiPrimitives\.panel/);
    expect(stats).toMatch(/joinClasses\(uiPrimitives\.card/);
    expect(stats).toContain("uiPrimitives.statusNeutral");
    expect(stats).toContain("uiPrimitives.statusError");

    const tokenFeed = source("src/components/TokenFeedRow.tsx");
    expect(tokenFeed).toContain("uiPrimitives.card");
    expect(tokenFeed).toContain("uiPrimitives.buttonPrimary");

    const soulCard = source("src/components/SoulGalleryCard.tsx");
    expect(soulCard).toContain("uiPrimitives.card");
    expect(soulCard).toContain("uiPrimitives.buttonPrimary");
  });

  it("uses localized token-detail labels for buy, sell, transfer, loading, and success states", () => {
    const tokenPanel = source("src/components/TokenSoulPanel.tsx");
    expect(tokenPanel).toContain('t("tradeControls.solAmount")');
    expect(tokenPanel).toContain('t("tradeControls.sellTokenAmount")');
    expect(tokenPanel).toContain('t("tradeControls.openingWallet")');
    expect(tokenPanel).toContain('t("tradeControls.finalizedBuy"');
    expect(tokenPanel).toContain('t("tradeControls.finalizedSell"');

    const en = source("messages/en.json");
    const zh = source("messages/zh.json");
    for (const key of ["solAmount", "sellTokenAmount", "openingWallet", "finalizedBuy", "finalizedSell"]) {
      expect(en, `en token tradeControls.${key}`).toContain(`"${key}"`);
      expect(zh, `zh token tradeControls.${key}`).toContain(`"${key}"`);
    }
  });

  it("applies premium primitives to landing, launch, stats, tokens, souls, and profile page shells", () => {
    const pages: Array<[string, RegExp[]]> = [
      // Landing page uses premium label and CTA primitives
      ["src/app/[locale]/page.tsx", [
        /uiPrimitives\.(label|buttonPrimary|buttonSecondary)/,
      ]],
      // Launch page uses heroPanel, denseRow, label
      ["src/app/[locale]/launch/page.tsx", [
        /uiPrimitives\.(heroPanel|denseRow|label)/,
      ]],
      // Stats page uses panel, label
      ["src/app/[locale]/stats/page.tsx", [
        /uiPrimitives\.(panel|label)/,
      ]],
      // Tokens page uses panel, label
      ["src/app/[locale]/tokens/page.tsx", [
        /uiPrimitives\.(panel|label)/,
      ]],
      // Souls page uses panel, label, card, denseRow, statusNeutral, statusError
      ["src/app/[locale]/souls/page.tsx", [
        /uiPrimitives\.(panel|label|card|denseRow|statusNeutral|statusError)/,
      ]],
      // Profile page delegates to WalletSoulGalleryPage
      ["src/app/[locale]/profile/page.tsx", [
        /WalletSoulGalleryPage/,
      ]],
    ];

    for (const [path, patterns] of pages) {
      const text = source(path);
      for (const pattern of patterns) {
        expect(text, `${path} matches ${pattern}`).toMatch(pattern);
      }
    }
  });

  it("applies premium style to global shell, navigation, banners, and modals", () => {
    // Layout uses premium navigation primitives and Solana accent brand treatment
    const layout = source("src/app/[locale]/layout.tsx");
    expect(layout).toContain("uiPrimitives");
    expect(layout).toContain("border-soul-mint/25");
    expect(layout).toMatch(/uiPrimitives\.(navLink|navLinkMuted)/);

    // MobileBottomNav uses premium active/inactive states
    const mobileNav = source("src/components/MobileBottomNav.tsx");
    expect(mobileNav).toContain("border-soul-mint/45");
    expect(mobileNav).toContain("bg-white/[0.035]");
    expect(mobileNav).toContain("aria-current");
    expect(mobileNav).toContain("aria-label");

    // DevnetBanner uses uiPrimitives.banner and accessible role
    const banner = source("src/components/DevnetBanner.tsx");
    expect(banner).toContain("uiPrimitives.banner");
    expect(banner).toContain('role="status"');
    expect(banner).toContain("aria-live");

    // WalletConnectButton uses premium walletTrigger
    const walletBtn = source("src/components/WalletConnectButton.tsx");
    expect(walletBtn).toContain("uiPrimitives.walletTrigger");

    // RiskDisclaimerModal uses premium modalShell and buttonPrimary
    const riskModal = source("src/components/RiskDisclaimerModal.tsx");
    expect(riskModal).toContain("uiPrimitives.modalShell");
    expect(riskModal).toContain("uiPrimitives.buttonPrimary");
    expect(riskModal).toContain('role="dialog"');
    expect(riskModal).toContain("aria-labelledby");
    expect(riskModal).toContain("aria-modal");

    // PrivacyPageView uses premium label, statusNeutral, denseRow
    const privacy = source("src/components/PrivacyPageView.tsx");
    expect(privacy).toContain("uiPrimitives.label");
    expect(privacy).toContain("uiPrimitives.statusNeutral");
    expect(privacy).toContain("uiPrimitives.denseRow");
  });

  it("landing thesis uses premium label treatment and accessible art landmark", () => {
    const thesis = source("src/components/LandingThesisView.tsx");
    expect(thesis).toContain("uiPrimitives.label");
    expect(thesis).toContain("border-l border-white/10");
  });

  it("EN and ZH messages cover core premium surface namespaces", () => {
    const en = source("messages/en.json");
    const zh = source("messages/zh.json");

    // All core namespaces must exist in both locales
    const namespaces = [
      "landing",
      "launch",
      "token",
      "profile",
      "publicGallery",
      "tokens",
      "stats",
      "navigation",
      "riskDisclaimer",
      "preSignReview",
      "tokenGallery",
      "generationRules",
    ];

    for (const ns of namespaces) {
      expect(en, `en has ${ns}`).toContain(`"${ns}"`);
      expect(zh, `zh has ${ns}`).toContain(`"${ns}"`);
    }
  });

  it("core pages expose accessible roles and aria attributes for screen readers", () => {
    // GalleryStatusCard provides role=alert for errors and role=status for loading/neutral
    const galleryStatus = source("src/components/GalleryStatusCard.tsx");
    expect(galleryStatus).toContain('role={tone === "error" ? "alert" : "status"}');
    expect(galleryStatus).toContain('data-surface-state={tone}');

    // SoulGalleryCard image has accessible alt text through AnimatedSoulPreview.
    const soulCard = source("src/components/SoulGalleryCard.tsx");
    expect(soulCard).toContain("<AnimatedSoulPreview");
    expect(soulCard).toContain("alt=");

    // Landing art has role=img and title
    const landing = source("src/app/[locale]/page.tsx");
    expect(landing).toContain('role="img"');
    expect(landing).toContain("aria-labelledby");

    // Token timeline has accessible structure
    const timeline = source("src/components/TokenTimeline.tsx");
    expect(timeline).toMatch(/aria-label|role=/);

    // PreSignTransactionReviewCard has aria-label
    const preSign = source("src/components/PreSignTransactionReviewCard.tsx");
    expect(preSign).toContain('aria-label={t("ariaLabel")}');
  });
});
