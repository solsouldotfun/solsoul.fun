// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PublicKey } from "@solana/web3.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TARGET_AMM } from "sdk";
import { LaunchForm } from "./LaunchForm";
import {
  buildDevnetLaunchPayload,
  submitInitializeSoulPreview,
  submitWalletLaunch,
  submitWalletTemplateUpload,
} from "../lib/launchSubmit";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  connection: { rpcEndpoint: "https://api.devnet.solana.com" },
  locale: "en",
  publicKey: {
    toBase58: () => "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
  },
  sendTransaction: vi.fn(),
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useConnection: () => ({ connection: mocks.connection }),
  useWallet: () => ({
    connected: true,
    publicKey: mocks.publicKey,
    sendTransaction: mocks.sendTransaction,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => React.createElement("a", { href, ...props }, children),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => React.createElement("a", { href: `/${mocks.locale}${href}`, ...props }, children),
}));

vi.mock("next-intl", () => ({
  useLocale: () => mocks.locale,
  useTranslations: () => {
    const translate = ((key: string, values?: Record<string, string>) => {
      if (key === "submit") {
        return "Launch token";
      }
      if (key === "creating") {
        return "Creating…";
      }
      if (key === "uploadingTemplate") {
        return "Uploading template…";
      }
      if (key === "errors.riskRequired") {
        return "Risk acknowledgement is required";
      }
      if (key === "errors.walletRequired") {
        return "Connect a wallet first";
      }
      if (key === "nameLabel") {
        return "Token name";
      }
      if (key === "tickerLabel") {
        return "Ticker";
      }
      if (key === "descriptionLabel") {
        return "Description";
      }
      if (key === "artThemeLabel") {
        return "Art style";
      }
      if (key === "artThemeHelp") {
        return "Pick a renderer. Choose Custom only if you want to upload your own SVG.";
      }
      if (key === "artThemeStoredLabel") {
        return "Selected art theme";
      }
      if (key === "artThemeStored") {
        return `${values?.label ?? ""} stored via ${values?.styleParams ?? ""}`;
      }
      if (key === "artThemePreviewTitle") {
        return `${values?.label ?? ""} preview`;
      }
      if (key === "samplePreviewTitle") {
        return "Live sample Soul";
      }
      if (key === "samplePreviewBody") {
        return "This sample updates as you guide traits.";
      }
      if (key === "samplePreviewCaveat") {
        return "Website motion preview only: the on-chain Soul SVG and marketplace metadata stay static, deterministic, and tied to the signed launch, trade, and generation seed.";
      }
      if (key === "samplePreviewSelected") {
        return `${values?.count ?? "0"} guided traits in this sample`;
      }
      if (key === "samplePreviewAlt") {
        return "Deterministic sample Soul preview";
      }
      if (key === "artCustomizeSummary") {
        return "Change art recipe";
      }
      if (key === "artPersistenceTitle") {
        return "Art recipe";
      }
      if (key === "artPersistenceReady") {
        return `${values?.label ?? ""} with ${values?.count ?? "0"} guided traits is ready for wallet upload.`;
      }
      if (key === "artPersistenceWalletStep") {
        return "After launch signing, keep the wallet open for the required art upload step.";
      }
      if (key === "coreTraitTitle") {
        return "Guide the Soul";
      }
      if (key === "coreTraitHelp") {
        return `Choose up to ${values?.max ?? "3"} traits. Auto choices are completed by deterministic trade variation.`;
      }
      if (key === "coreTraitAuto") {
        return "Auto variation";
      }
      if (key === "coreTraitLimit") {
        return `${values?.count ?? "0"}/${values?.max ?? "3"} chosen`;
      }
      if (key === "customTemplateTraitNoticeTitle") {
        return "Custom Template uses SVG placeholders";
      }
      if (key === "customTemplateTraitNoticeBody") {
        return "Core trait guidance is hidden for Custom Template.";
      }
      if (key === "coreArtTraits.categories.palette.label") {
        return "Palette";
      }
      if (key === "coreArtTraits.categories.palette.description") {
        return "The color family users notice first.";
      }
      if (key === "coreArtTraits.categories.mood.label") {
        return "Mood";
      }
      if (key === "coreArtTraits.categories.mood.description") {
        return "The emotional temperature of the Soul.";
      }
      if (key === "coreArtTraits.categories.form.label") {
        return "Form";
      }
      if (key === "coreArtTraits.categories.form.description") {
        return "The dominant shape language.";
      }
      if (key === "coreArtTraits.categories.background.label") {
        return "Background";
      }
      if (key === "coreArtTraits.categories.background.description") {
        return "The scene behind the generated art.";
      }
      const optionLabel = key.match(/^coreArtTraits\.options\.[^.]+\.([^.]+)$/);
      if (optionLabel) {
        return optionLabel[1]!.replace(/_/g, " ");
      }
      if (key === "artThemes.fractal.label") {
        return "Fractal Structure";
      }
      if (key === "artThemes.fractal.description") {
        return "IFS fractal — mathematical beauty from affine transforms.";
      }
      if (key === "artThemes.field.label") {
        return "Vector Field";
      }
      if (key === "artThemes.field.description") {
        return "Flowing vector field visualization.";
      }
      if (key === "artThemes.lattice.label") {
        return "Crystal Lattice";
      }
      if (key === "artThemes.lattice.description") {
        return "Geometric lattice structure.";
      }
      if (key === "artThemes.chaos.label") {
        return "Strange Attractor";
      }
      if (key === "artThemes.chaos.description") {
        return "Chaos system attractor — deterministic yet unpredictable.";
      }
      if (key === "artThemes.harmonic.label") {
        return "Harmonic Wave";
      }
      if (key === "artThemes.harmonic.description") {
        return "Sine wave harmonics — pure mathematical oscillation.";
      }
      if (key === "artThemes.pixel_fractal.label") {
        return "Pixel Fractal";
      }
      if (key === "artThemes.pixel_fractal.description") {
        return "IFS fractal rendered as pixel blocks.";
      }
      if (key === "artThemes.pixel_art.label") {
        return "Pixel Art";
      }
      if (key === "artThemes.pixel_art.description") {
        return "Value noise driven pixel art.";
      }
      if (key === "artThemes.symphony.label") {
        return "Symphony";
      }
      if (key === "artThemes.symphony.description") {
        return "Layered pixel landscape renderer.";
      }
      if (key === "artThemes.custom.label") {
        return "Custom Template";
      }
      if (key === "artThemes.custom.description") {
        return "Upload an edited SVG template with your wallet.";
      }
      if (key === "walletReady") {
        return `Wallet: ${values?.address ?? ""}`;
      }
      if (key === "brandingNotice") {
        return "SolSoul adds a display badge and platform metadata; your name and ticker stay unchanged.";
      }
      if (key === "title") {
        return "SolSoul platform metadata";
      }
      if (key === "label") {
        return "Badge-branded by SolSoul";
      }
      if (key === "compactLabel") {
        return "SolSoul badge";
      }
      if (key === "assistiveText") {
        return " through platform metadata";
      }
      if (key === "successTitle") {
        return mocks.locale === "zh" ? "发射成功" : "Launch finalized";
      }
      if (key === "successBody") {
        return mocks.locale === "zh"
          ? "代币已经就绪。直接前往 Trade Soul 卡片，完成首次买入或准备下一次交易。"
          : "The token is ready. Jump straight to its Trade Soul card to make the first buy or prepare the next trade.";
      }
      if (key === "viewTokenTradeNow") {
        return mocks.locale === "zh" ? "开始首次交易" : "Start first trade";
      }
      if (key === "submitted") {
        return mocks.locale === "zh"
          ? `${values?.name ?? ""}（${values?.ticker ?? ""}）已发射，符号为 ${
              values?.symbol ?? ""
            }。继续前往 Trade Soul 卡片完成首次买入，观看新 Soul 出现，并延续这段旅程。`
          : `Launched ${values?.name ?? ""} (${values?.ticker ?? ""}) with ${
              values?.symbol ?? ""
            }. Continue to the Trade Soul card for the first buy, watch new Souls appear, and keep the journey moving.`;
      }
      if (key === "templateUploadStatusLabel") {
        return "Step 2 template upload";
      }
      if (key === "templateUploadPending") {
        return "Template upload pending";
      }
      if (key === "templateUploadOpeningWallet") {
        return "Template upload opening wallet";
      }
      if (key === "templateUploadFinalized") {
        return `Template upload signature: ${values?.signature ?? ""}`;
      }
      if (key === "templateUploadFailed") {
        return "Template upload could not finish. Retry when the wallet or network is ready.";
      }
      if (key === "templateUploadRetry") {
        return "Retry template upload";
      }
      if (key === "artUploadActionKicker") {
        return "Required art upload";
      }
      if (key === "artUploadActionPendingTitle") {
        return "Keep the wallet open to finish the art";
      }
      if (key === "artUploadActionPendingBody") {
        return "Your token launch transaction landed, but the selected art recipe is not complete until the wallet signs this upload.";
      }
      if (key === "artUploadActionFailedTitle") {
        return "Finish the art upload";
      }
      if (key === "artUploadActionFailedBody") {
        return "The token launch landed, but selected art will not be trusted until this upload succeeds.";
      }
      if (key === "errors.templateInvalid") {
        return "Fix the template";
      }
      if (key === "errors.templateUploadInvalid") {
        return "Template cannot be uploaded yet. Check the SVG requirements and try again.";
      }
      if (key === "errors.launch.walletRejected") {
        return "Launch was not signed. Approve the wallet request when you are ready.";
      }
      if (key === "errors.launch.validation") {
        return "Launch cannot be submitted yet. Check the token details, wallet state, and art settings.";
      }
      if (key === "errors.launch.settlement") {
        return "Launch could not continue because wallet state changed. Refresh and try again.";
      }
      if (key === "errors.launch.rpcUnavailable") {
        return "Launch could not reach devnet reliably. Nothing changed; retry after the network recovers.";
      }
      if (key === "errors.launch.submissionFailed") {
        return "Launch did not complete. Nothing changed; retry or inspect Advanced details if it repeats.";
      }
      if (key === "recentLaunchesTitle") {
        return "Recent launches";
      }
      if (key === "recentLaunchesDescription") {
        return "Recover recently launched token pages after a refresh.";
      }
      if (key === "recentLaunchLink") {
        return `${values?.symbol ?? "TOKEN"} token`;
      }
      if (key === "commandCenterEyebrow") {
        return "Wallet-signed lifecycle launch";
      }
      if (key === "commandCenterBody") {
        return "Add token details, choose an art style, then sign with your connected devnet wallet.";
      }
      if (key === "stageTokenKicker") {
        return "Stage 1";
      }
      if (key === "stageTokenTitle") {
        return "Token identity";
      }
      if (key === "stageTokenDescription") {
        return "Name the market object and describe the Soul it will awaken.";
      }
      if (key === "stageArtKicker") {
        return "Stage 2";
      }
      if (key === "stageArtTitle") {
        return "Soul art";
      }
      if (key === "stageArtDescription") {
        return "Choose the first visual world for generated Souls.";
      }
      if (key === "stageSignKicker") {
        return "Stage 3";
      }
      if (key === "stageSignTitle") {
        return "Sign launch";
      }
      if (key === "stageSignDescription") {
        return "Review the launch, acknowledge the risk, then sign with your wallet.";
      }
      if (key === "tokenMtSoulExplainer.eyebrow") {
        return "Token → MT → Soul";
      }
      if (key === "tokenMtSoulExplainer.title") {
        return "How the supply layers fit";
      }
      if (key === "tokenMtSoulExplainer.body") {
        return "A SolSoul launch has a fungible token market, MT holder gates, and scarce collectible Souls.";
      }
      if (key === "tokenMtSoulExplainer.steps.token.label") {
        return "Token";
      }
      if (key === "tokenMtSoulExplainer.steps.token.value") {
        return "21,000,000 fungible tokens";
      }
      if (key === "tokenMtSoulExplainer.steps.token.body") {
        return "Tradeable on the forever curve.";
      }
      if (key === "tokenMtSoulExplainer.steps.mt.label") {
        return "MT gate";
      }
      if (key === "tokenMtSoulExplainer.steps.mt.value") {
        return "10,000 tokens per MT";
      }
      if (key === "tokenMtSoulExplainer.steps.mt.body") {
        return "One MT requires a qualifying buy plus current holder balance.";
      }
      if (key === "tokenMtSoulExplainer.steps.soul.label") {
        return "Soul";
      }
      if (key === "tokenMtSoulExplainer.steps.soul.value") {
        return "2,100 MT/Soul cap";
      }
      if (key === "tokenMtSoulExplainer.steps.soul.body") {
        return "Scarce collectible Souls sit above the fungible market.";
      }
      if (key === "tokenMtSoulExplainer.capProgressLaunch") {
        return "Claim cap: 0 of 2,100 claimed before this token launches.";
      }
      if (key === "tokenMtSoulExplainer.capProgress") {
        return `Claim progress: ${values?.claimCount ?? "0"} of 2,100 MT/Soul NFTs claimed.`;
      }
      if (key === "advancedToggleShow") {
        return "Show Advanced";
      }
      if (key === "advancedToggleHide") {
        return "Hide Advanced";
      }
      if (key === "advancedNetworkTitle") {
        return "Network and curve details";
      }
      if (key === "rpcEndpoint") {
        return `Advanced network endpoint: ${values?.endpoint ?? ""}`;
      }
      if (key === "curveTierLabel") {
        return "Market path";
      }
      if (key === "launchFee") {
        return "Launch fee";
      }
      if (key === "lockFee") {
        return "Buy lock fee";
      }
      if (key === "curveParamS") {
        return "Scale (S)";
      }
      if (key === "curveParamK") {
        return "Supply cap (K)";
      }
      if (key === "feeExplanation") {
        return "Fees support the always-on market.";
      }
      return key;
    }) as ((key: string, values?: Record<string, string>) => string) & {
      rich: (key: string, values?: Record<string, unknown>) => React.ReactNode;
    };
    translate.rich = (key: string, values?: Record<string, unknown>) => {
      if (key === "submitted") {
        return `Launched ${String(values?.name)} (${String(values?.ticker)}) with ${String(
          values?.symbol,
        )}. Continue from the detail page to buy, watch new Souls appear, and keep the journey moving.`;
      }
      return key;
    };
    return translate;
  },
}));

vi.mock("../lib/launchSubmit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/launchSubmit")>();
  return {
    ...actual,
    buildDevnetLaunchPayload: vi.fn(actual.buildDevnetLaunchPayload),
    submitInitializeSoulPreview: vi.fn(actual.submitInitializeSoulPreview),
    submitWalletLaunch: vi.fn(),
    submitWalletTemplateUpload: vi.fn(),
  };
});

const submitWalletLaunchMock = vi.mocked(submitWalletLaunch);
const submitWalletTemplateUploadMock = vi.mocked(submitWalletTemplateUpload);
const submitInitializeSoulPreviewMock = vi.mocked(submitInitializeSoulPreview);
const buildDevnetLaunchPayloadMock = vi.mocked(buildDevnetLaunchPayload);

function setFieldValue(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  act(() => {
    valueSetter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("LaunchForm public submit path", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;
  let focusMock: ReturnType<typeof vi.fn>;
  let scrollIntoViewMock: ReturnType<typeof vi.fn>;
  const originalSmokeFlag = process.env.NEXT_PUBLIC_DEVNET_SMOKE;
  const originalRpc = process.env.NEXT_PUBLIC_RPC;

  beforeEach(async () => {
    mocks.locale = "en";
    process.env.NEXT_PUBLIC_DEVNET_SMOKE = "1";
    process.env.NEXT_PUBLIC_RPC = "https://api.devnet.solana.com";
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        mint: "SmokeMint111111111111111111111111111111111",
        launch_sig: "SmokeSig111111111111111111111111111111111",
      }),
      text: async () => "<svg></svg>",
    }));
    vi.stubGlobal("fetch", fetchMock);
    submitWalletLaunchMock.mockResolvedValue({
      signature: "WalletSig111111111111111111111111111111111",
      mint: new PublicKey("Bfvg3UM7CkVCmDsZgfqoAegjv8Z4Fow7rGwRRrHgJXmU"),
      curve: PublicKey.unique(),
      vault: PublicKey.unique(),
      soul: PublicKey.unique(),
      targetAmm: TARGET_AMM.Raydium,
      symbol: "REAL",
    });
    submitWalletTemplateUploadMock.mockResolvedValue(
      "TemplateSig1111111111111111111111111111111111",
    );
    Object.defineProperty(window, "localStorage", {
      value: new MapStorage(),
      configurable: true,
    });
    window.localStorage.clear();
    focusMock = vi.fn();
    scrollIntoViewMock = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, "focus", {
      value: focusMock,
      configurable: true,
    });
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      value: scrollIntoViewMock,
      configurable: true,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<LaunchForm />);
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_DEVNET_SMOKE = originalSmokeFlag;
    process.env.NEXT_PUBLIC_RPC = originalRpc;
  });

  it("submits the rendered form through wallet signing even when devnet smoke env is set", async () => {
    expect(container.querySelector('[data-testid="launch-compact-editorial-form"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="token-mt-soul-explainer"]')).not.toBeNull();
    expect(container.textContent).toContain("Token → MT → Soul");
    expect(container.textContent).toContain("21,000,000 fungible tokens");
    expect(container.textContent).toContain("10,000 tokens per MT");
    expect(container.textContent).toContain("2,100 MT/Soul cap");
    expect(container.textContent).toContain("Claim cap: 0 of 2,100");
    expect(container.querySelector('[data-testid="launch-art-minimal-summary"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="launch-animated-soul-preview"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="launch-animated-soul-preview"]')?.getAttribute("data-motion-source"),
    ).toBe("website-only");
    expect(container.textContent).toContain("Live sample Soul");
    expect(container.textContent).toContain(
      "Website motion preview only: the on-chain Soul SVG and marketplace metadata stay static, deterministic, and tied to the signed launch, trade, and generation seed.",
    );
    expect(container.querySelector('[data-testid="launch-art-customize-details"]')?.hasAttribute("open")).toBe(false);
    expect(container.textContent).toContain("Art style");
    expect(container.textContent).toContain("Guide the Soul");
    expect(container.textContent).toContain("Choose up to 3 traits");
    expect(container.textContent).toContain("Palette");
    expect(container.textContent).toContain("Mood");
    expect(container.textContent).toContain("Form");
    expect(container.textContent).toContain("Background");
    expect(container.textContent).toContain("Auto variation");
    expect(container.textContent).toContain("Fractal Structure");
    expect(container.textContent).toContain("Vector Field");
    expect(container.textContent).toContain("Crystal Lattice");
    expect(container.textContent).toContain("Strange Attractor");
    expect(container.textContent).toContain("Harmonic Wave");
    expect(container.textContent).toContain("Pixel Fractal");
    expect(container.textContent).toContain("Pixel Art");
    expect(container.textContent).toContain("Symphony");
    expect(container.textContent).toContain("Custom Template");
    expect(container.querySelectorAll('[data-testid^="launch-art-theme-preview-"] svg')).toHaveLength(9);
    expect(
      container.querySelector('[data-testid="launch-art-theme-preview-symphony"] svg path'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain(
      "Symphony with 0 guided traits is ready for wallet upload.",
    );
    expect(container.textContent).not.toContain(
      "After launch signing, keep the wallet open for the required art upload step.",
    );
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(
      container.querySelector<HTMLImageElement>('[data-testid="launch-animated-soul-preview"] img')
        ?.getAttribute("src"),
    ).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(container.querySelector('input[name="target_amm"]')).toBeNull();
    expect(container.textContent).not.toContain("Target AMM");
    expect(container.textContent).not.toContain("Raydium");
    expect(container.textContent).not.toContain("Pump");
    expect(container.textContent).not.toContain("Meteora");

    setFieldValue(container.querySelector<HTMLInputElement>('input[name="name"]')!, "Real Wallet Soul");
    setFieldValue(container.querySelector<HTMLInputElement>('input[name="ticker"]')!, "real");
    setFieldValue(
      container.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!,
      "A public launch that must ask the connected wallet to sign.",
    );
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[name="coreTrait-palette"][value="aurora"]')!.click();
      container.querySelector<HTMLInputElement>('input[name="coreTrait-mood"][value="charged"]')!.click();
    });

    const submitButton = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submitButton.disabled).toBe(true);

    await act(async () => {
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    });
    expect(submitButton.disabled).toBe(false);

    await act(async () => {
      container.querySelector<HTMLFormElement>("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(submitWalletLaunchMock).toHaveBeenCalledWith(expect.objectContaining({
      connection: mocks.connection,
      payer: mocks.publicKey,
      sendTransaction: mocks.sendTransaction,
      symbol: "REAL",
      targetAmm: TARGET_AMM.Raydium,
      onPreSignReview: expect.any(Function),
    }));
    expect(submitWalletTemplateUploadMock).toHaveBeenCalledWith(expect.objectContaining({
      connection: mocks.connection,
      payer: mocks.publicKey,
      mint: new PublicKey("Bfvg3UM7CkVCmDsZgfqoAegjv8Z4Fow7rGwRRrHgJXmU"),
      template: "",
      styleParams: "theme=symphony;trait_palette=aurora;trait_mood=charged",
      sendTransaction: mocks.sendTransaction,
      onPreSignReview: expect.any(Function),
    }));
    expect(submitInitializeSoulPreviewMock).not.toHaveBeenCalled();
    expect(buildDevnetLaunchPayloadMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/devnet-smoke",
      expect.anything(),
    );
    expect(container.textContent).toContain("Badge-branded by SolSoul");
    const primaryCta = container.querySelector<HTMLAnchorElement>(
      '[data-testid="launch-success-primary-cta"]',
    );
    expect(primaryCta?.textContent).toContain("Start first trade");
    expect(primaryCta?.getAttribute("href")).toBe(
      "/en/token/Bfvg3UM7CkVCmDsZgfqoAegjv8Z4Fow7rGwRRrHgJXmU#trade-soul-card",
    );
    const successPanel = container.querySelector<HTMLElement>(
      '[data-testid="launch-success-panel"]',
    );
    expect(successPanel).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="launch-success-panel"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="launch-success-primary-cta"]')).toHaveLength(1);
    expect(successPanel!.querySelectorAll("a")).toHaveLength(1);
    expect(successPanel!.textContent).not.toContain("Bfvg3UM7CkVCmDsZgfqoAegjv8Z4Fow7rGwRRrHgJXmU");
    expect(successPanel!.textContent).not.toContain("WalletSig111111111111111111111111111111111");
    expect(successPanel!.textContent).not.toContain(
      "Template upload signature: TemplateSig1111111111111111111111111111111111",
    );
    expect(successPanel!.textContent).not.toContain("theme=symphony");
    expect(successPanel!.textContent).not.toContain("trait_palette");
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
    expect(focusMock).toHaveBeenCalledWith({ preventScroll: true });
    expect(focusMock.mock.contexts[0]).toBe(successPanel);
    expect(container.querySelector('[data-testid="recent-launches"]')?.textContent).toContain(
      "REAL token",
    );
    expect(window.localStorage.getItem("solsoul:recent-launches")).toContain(
      "Bfvg3UM7CkVCmDsZgfqoAegjv8Z4Fow7rGwRRrHgJXmU",
    );
    expect(window.localStorage.getItem("solsoul:recent-launches")).toContain('"artThemeId":"symphony"');
    expect(window.localStorage.getItem("solsoul:recent-launches")).not.toContain("artThemeLabel");
    expect(container.querySelector('[data-testid="recent-launches"]')?.textContent).toContain(
      "Symphony",
    );
    expect(container.textContent).toContain(
      "Launched Real Wallet Soul (REAL) with REAL. Continue to the Trade Soul card for the first buy, watch new Souls appear, and keep the journey moving.",
    );
    expect(container.textContent).not.toContain(
      "Template upload signature: TemplateSig1111111111111111111111111111111111",
    );
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="launch-success-advanced-toggle"]')?.click();
    });
    expect(container.textContent).toContain(
      "Template upload signature: TemplateSig1111111111111111111111111111111111",
    );
    expect(container.textContent).toContain(
      "Symphony stored via theme=symphony;trait_palette=aurora;trait_mood=charged",
    );
    expect(container.textContent).not.toContain("Real Wallet Soul SolSoul");
    expect(container.textContent).not.toContain("REALSOUL");
    expect(container.textContent).not.toContain("REAL-SOLSoul");
  });

  it("preserves the Chinese locale and launched token identity through the success CTA", async () => {
    mocks.locale = "zh";

    await act(async () => {
      root.render(<LaunchForm key="zh-localized-journey" />);
    });

    setFieldValue(container.querySelector<HTMLInputElement>('input[name="name"]')!, "中文 Soul");
    setFieldValue(container.querySelector<HTMLInputElement>('input[name="ticker"]')!, "zh");
    setFieldValue(
      container.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!,
      "一次本地化发射，成功后必须进入同一个代币身份。",
    );

    await act(async () => {
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    });

    await act(async () => {
      container.querySelector<HTMLFormElement>("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    const successPanel = container.querySelector<HTMLElement>(
      '[data-testid="launch-success-panel"]',
    );
    expect(successPanel).not.toBeNull();
    const primaryCta = container.querySelector<HTMLAnchorElement>(
      '[data-testid="launch-success-primary-cta"]',
    );
    expect(container.querySelectorAll('[data-testid="launch-success-panel"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="launch-success-primary-cta"]')).toHaveLength(1);
    expect(successPanel!.querySelectorAll("a")).toHaveLength(1);
    expect(primaryCta?.textContent).toContain("开始首次交易");
    expect(primaryCta?.getAttribute("href")).toBe(
      "/zh/token/Bfvg3UM7CkVCmDsZgfqoAegjv8Z4Fow7rGwRRrHgJXmU#trade-soul-card",
    );
    expect(container.textContent).toContain(
      "中文 Soul（ZH）已发射，符号为 REAL。继续前往 Trade Soul 卡片完成首次买入，观看新 Soul 出现，并延续这段旅程。",
    );
    expect(successPanel!.textContent).not.toContain("Bfvg3UM7CkVCmDsZgfqoAegjv8Z4Fow7rGwRRrHgJXmU");
    expect(successPanel!.textContent).not.toContain("WalletSig111111111111111111111111111111111");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="launch-success-advanced-toggle"]')?.click();
    });

    expect(container.querySelector('[data-testid="launch-success-advanced-panel"]')?.textContent).toContain(
      "Bfvg3UM7CkVCmDsZgfqoAegjv8Z4Fow7rGwRRrHgJXmU",
    );
    expect(container.querySelector('[data-testid="launch-success-advanced-panel"]')?.textContent).toContain(
      "WalletSig111111111111111111111111111111111",
    );
  });

  it("classifies launch submit failures without rendering raw RPC or program details", async () => {
    const rawFailure =
      "HTTP 429 from devnet RPC: Transaction simulation failed: custom program error: 0x1771";
    submitWalletLaunchMock.mockRejectedValueOnce(new Error(rawFailure));

    setFieldValue(container.querySelector<HTMLInputElement>('input[name="name"]')!, "Noisy Error Soul");
    setFieldValue(container.querySelector<HTMLInputElement>('input[name="ticker"]')!, "err");
    setFieldValue(
      container.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!,
      "A public launch error should not expose provider or program internals.",
    );

    await act(async () => {
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    });

    await act(async () => {
      container.querySelector<HTMLFormElement>("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Launch could not reach devnet reliably",
    );
    expect(container.textContent).not.toContain(rawFailure);
    expect(container.textContent).not.toContain("custom program error");
    expect(container.textContent).not.toContain("HTTP 429");
  });

  it("renders accessible ordered stages with controls inside the right sections", () => {
    const stages = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="launch-stage-"]'),
    );
    expect(stages.map((stage) => stage.dataset.testid)).toEqual([
      "launch-stage-token-identity",
      "launch-stage-soul-art",
      "launch-stage-sign-launch",
    ]);
    expect(stages.map((stage) => stage.getAttribute("aria-labelledby"))).toEqual([
      "launch-stage-token-identity-title",
      "launch-stage-soul-art-title",
      "launch-stage-sign-launch-title",
    ]);

    const tokenStage = container.querySelector<HTMLElement>(
      '[data-testid="launch-stage-token-identity"]',
    )!;
    expect(tokenStage.textContent).toContain("Token identity");
    expect(tokenStage.querySelector('input[name="name"]')).not.toBeNull();
    expect(tokenStage.querySelector('input[name="ticker"]')).not.toBeNull();
    expect(tokenStage.querySelector('textarea[name="description"]')).not.toBeNull();

    const artStage = container.querySelector<HTMLElement>(
      '[data-testid="launch-stage-soul-art"]',
    )!;
    expect(artStage.textContent).toContain("Soul art");
    expect(artStage.querySelector('input[name="artTheme"]')).not.toBeNull();
    expect(artStage.querySelector('[data-testid="launch-core-trait-selector"]')).not.toBeNull();
    expect(artStage.querySelector('input[name="coreTrait-palette"][value=""]')).not.toBeNull();
    expect(artStage.textContent).toContain("Symphony");

    const signStage = container.querySelector<HTMLElement>(
      '[data-testid="launch-stage-sign-launch"]',
    )!;
    expect(signStage.textContent).toContain("Sign launch");
    expect(signStage.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(signStage.querySelector('button[type="submit"]')?.textContent).toContain(
      "Launch token",
    );
    expect(signStage.textContent).toContain("Wallet:");
  });

  it("limits launch guidance to three selected core traits and leaves the rest automatic", async () => {
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[name="coreTrait-palette"][value="aurora"]')!.click();
      container.querySelector<HTMLInputElement>('input[name="coreTrait-mood"][value="serene"]')!.click();
      container.querySelector<HTMLInputElement>('input[name="coreTrait-form"][value="wave"]')!.click();
    });

    expect(container.textContent).toContain("3/3 chosen");
    expect(
      container.querySelector<HTMLInputElement>('input[name="coreTrait-background"][value="grid"]')
        ?.disabled,
    ).toBe(true);

    await act(async () => {
      container.querySelector<HTMLInputElement>('input[name="coreTrait-mood"][value=""]')!.click();
    });

    expect(container.textContent).toContain("2/3 chosen");
    expect(
      container.querySelector<HTMLInputElement>('input[name="coreTrait-background"][value="grid"]')
        ?.disabled,
    ).toBe(false);
  });

  it("updates the deterministic sample Soul preview when launch traits change", async () => {
    const preview = () => decodedLaunchSampleSvg(container);

    expect(preview()).toContain('data-palette="solana"');
    expect(preview()).toContain("data-form=");

    await act(async () => {
      container.querySelector<HTMLInputElement>('input[name="coreTrait-palette"][value="aurora"]')!.click();
      container.querySelector<HTMLInputElement>('input[name="coreTrait-form"][value="crystal"]')!.click();
    });

    expect(preview()).toContain('data-palette="aurora"');
    expect(preview()).toContain('data-form="crystal"');
    expect(container.textContent).toContain("2 guided traits in this sample");

    await act(async () => {
      container.querySelector<HTMLInputElement>('input[name="coreTrait-palette"][value="ember"]')!.click();
    });

    expect(preview()).toContain('data-palette="ember"');
    expect(preview()).toContain('data-form="crystal"');
  });

  it("keeps advanced implementation details out of the default render until expanded", async () => {
    expect(container.textContent).not.toContain("Advanced network endpoint");
    expect(container.textContent).not.toContain("Scale (S)");
    expect(container.textContent).not.toContain("Supply cap (K)");
    expect(container.textContent).not.toContain("theme=symphony");

    const advancedToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="launch-advanced-toggle"]',
    );
    expect(advancedToggle).not.toBeNull();
    expect(advancedToggle?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      advancedToggle?.click();
    });

    expect(advancedToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Advanced network endpoint");
    expect(container.textContent).toContain("Scale (S)");
    expect(container.textContent).toContain("Supply cap (K)");
    expect(container.textContent).toContain("Symphony stored via theme=symphony");
    expect(container.textContent).toContain(
      "Symphony with 0 guided traits is ready for wallet upload.",
    );
    expect(container.textContent).toContain(
      "After launch signing, keep the wallet open for the required art upload step.",
    );
  });

  it("places recent launches after the primary launch stages when storage is prefilled", async () => {
    window.localStorage.setItem(
      "solsoul:recent-launches",
      JSON.stringify([
        {
          mint: "RecentMint11111111111111111111111111111111",
          signature: "RecentSig11111111111111111111111111111111",
          symbol: "OLD",
          name: "Old Soul",
          artThemeId: "symphony",
          launchedAt: Date.now(),
        },
      ]),
    );

    await act(async () => {
      root.render(<LaunchForm key="storage-prefilled" />);
    });

    const tokenStage = container.querySelector<HTMLElement>(
      '[data-testid="launch-stage-token-identity"]',
    )!;
    const artStage = container.querySelector<HTMLElement>(
      '[data-testid="launch-stage-soul-art"]',
    )!;
    const signStage = container.querySelector<HTMLElement>(
      '[data-testid="launch-stage-sign-launch"]',
    )!;
    const recentLaunches = container.querySelector<HTMLElement>('[data-testid="recent-launches"]')!;

    expect(recentLaunches.textContent).toContain("OLD token");
    expect(tokenStage.compareDocumentPosition(artStage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(artStage.compareDocumentPosition(signStage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(signStage.compareDocumentPosition(recentLaunches) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps custom template mode wallet-signed and uploads the edited SVG", async () => {
    const customThemeRadio = container.querySelector<HTMLInputElement>(
      'input[name="artTheme"][value="custom"]',
    );
    expect(customThemeRadio).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLInputElement>('input[name="coreTrait-palette"][value="ember"]')!.click();
    });

    await act(async () => {
      customThemeRadio?.click();
    });

    expect(container.querySelector('[data-testid="launch-core-trait-selector"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="launch-custom-template-trait-notice"]')?.textContent,
    ).toContain("Core trait guidance is hidden for Custom Template");
    expect(container.querySelector('input[name^="coreTrait-"]')).toBeNull();

    const editedTemplate =
      '<svg viewBox="0 0 16 16" data-test="custom-theme"><rect width="16" height="16" fill="#fff"/></svg>';
    setFieldValue(container.querySelector<HTMLInputElement>('input[name="name"]')!, "Custom Soul");
    setFieldValue(container.querySelector<HTMLInputElement>('input[name="ticker"]')!, "cstm");
    setFieldValue(
      container.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!,
      "A custom art-engine launch that should persist the edited SVG template.",
    );
    setFieldValue(container.querySelector<HTMLTextAreaElement>('textarea[name="templateSvg"]')!, editedTemplate);

    await act(async () => {
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    });

    await act(async () => {
      container.querySelector<HTMLFormElement>("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(submitWalletLaunchMock).toHaveBeenCalledWith(expect.objectContaining({
      connection: mocks.connection,
      payer: mocks.publicKey,
      sendTransaction: mocks.sendTransaction,
      symbol: "CSTM",
      targetAmm: TARGET_AMM.Raydium,
      onPreSignReview: expect.any(Function),
    }));
    expect(submitWalletTemplateUploadMock).toHaveBeenCalledWith(expect.objectContaining({
      connection: mocks.connection,
      payer: mocks.publicKey,
      mint: new PublicKey("Bfvg3UM7CkVCmDsZgfqoAegjv8Z4Fow7rGwRRrHgJXmU"),
      template: editedTemplate,
      styleParams: "theme=custom;mode=hsl;evolution=3",
      sendTransaction: mocks.sendTransaction,
      onPreSignReview: expect.any(Function),
    }));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="launch-success-advanced-toggle"]')?.click();
    });
    expect(container.textContent).toContain("Custom Template stored via theme=custom;mode=hsl;evolution=3");
  });

  it("still renders launch success when browser storage access is unavailable", async () => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("storage is restricted");
      },
      configurable: true,
    });

    setFieldValue(
      container.querySelector<HTMLInputElement>('input[name="name"]')!,
      "Storage Blocked Soul",
    );
    setFieldValue(container.querySelector<HTMLInputElement>('input[name="ticker"]')!, "stg");
    setFieldValue(
      container.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!,
      "A public launch that must not look failed when localStorage is unavailable.",
    );

    await act(async () => {
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    });

    await act(async () => {
      container.querySelector<HTMLFormElement>("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(submitWalletLaunchMock).toHaveBeenCalled();
    expect(submitWalletTemplateUploadMock).toHaveBeenCalled();
    expect(container.textContent).toContain("Launch finalized");
    expect(container.textContent).toContain("Start first trade");
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="launch-success-advanced-toggle"]')?.click();
    });
    expect(container.textContent).toContain("Bfvg3UM7CkVCmDsZgfqoAegjv8Z4Fow7rGwRRrHgJXmU");
    expect(container.textContent).not.toContain("launchFailed");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("blocks launch success and offers a prominent retry when post-launch art upload fails", async () => {
    submitWalletTemplateUploadMock
      .mockRejectedValueOnce(new Error("wallet rejected upload"))
      .mockResolvedValueOnce("RetryTemplateSig111111111111111111111111111111");

    setFieldValue(
      container.querySelector<HTMLInputElement>('input[name="name"]')!,
      "Recoverable Upload Soul",
    );
    setFieldValue(container.querySelector<HTMLInputElement>('input[name="ticker"]')!, "rty");
    setFieldValue(
      container.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!,
      "Launch success must remain visible even when the second wallet step fails.",
    );

    await act(async () => {
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    });

    await act(async () => {
      container.querySelector<HTMLFormElement>("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(submitWalletLaunchMock).toHaveBeenCalledOnce();
    expect(submitWalletTemplateUploadMock).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-testid="launch-success-panel"]')).toBeNull();
    expect(container.querySelector('[data-testid="launch-success-primary-cta"]')).toBeNull();
    expect(container.querySelector('[data-testid="launch-art-upload-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="launch-art-upload-follow-up"]')?.textContent).toContain(
      "Finish the art upload",
    );
    expect(container.textContent).toContain(
      "Template upload could not finish. Retry when the wallet or network is ready.",
    );
    expect(container.textContent).not.toContain("wallet rejected upload");
    expect(container.textContent).not.toContain("Launch finalized");
    expect(container.textContent).not.toContain("Start first trade");

    const retryButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Retry template upload"),
    );
    expect(retryButton).toBeDefined();

    await act(async () => {
      retryButton?.click();
    });

    expect(submitWalletTemplateUploadMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="launch-success-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="launch-success-primary-cta"]')?.textContent).toContain(
      "Start first trade",
    );
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="launch-success-advanced-toggle"]')?.click();
    });
    expect(container.textContent).toContain(
      "Template upload signature: RetryTemplateSig111111111111111111111111111111",
    );
    expect(container.textContent).not.toContain("Template upload failed");
  });

  it("shows pending art upload as the primary post-launch state until the second wallet signature resolves", async () => {
    let resolveUpload: (signature: string) => void = () => undefined;
    const pendingUpload = new Promise<string>((resolve) => {
      resolveUpload = resolve;
    });
    submitWalletTemplateUploadMock.mockReturnValueOnce(pendingUpload);

    setFieldValue(
      container.querySelector<HTMLInputElement>('input[name="name"]')!,
      "Pending Upload Soul",
    );
    setFieldValue(container.querySelector<HTMLInputElement>('input[name="ticker"]')!, "pnd");
    setFieldValue(
      container.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!,
      "A launch that should not look complete until the art upload transaction lands.",
    );

    await act(async () => {
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    });

    await act(async () => {
      container.querySelector<HTMLFormElement>("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="launch-art-upload-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="launch-success-panel"]')).toBeNull();
    expect(container.querySelector('[data-testid="launch-success-primary-cta"]')).toBeNull();
    expect(container.querySelector('[data-testid="launch-art-upload-follow-up"]')?.textContent).toContain(
      "Keep the wallet open to finish the art",
    );
    expect(container.textContent).toContain("Template upload opening wallet");

    await act(async () => {
      resolveUpload("PendingTemplateSig111111111111111111111111111111");
      await pendingUpload;
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="launch-success-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="launch-success-primary-cta"]')?.textContent).toContain(
      "Start first trade",
    );
  });
});

function decodedLaunchSampleSvg(container: HTMLElement): string {
  const src = container
    .querySelector<HTMLImageElement>('[data-testid="launch-animated-soul-preview"] img')
    ?.getAttribute("src");
  expect(src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  return decodeURIComponent(src?.replace("data:image/svg+xml;charset=utf-8,", "") ?? "");
}

class MapStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length() {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}
