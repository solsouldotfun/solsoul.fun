"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  validateTemplateUploadInput,
  type PublicKeyLike,
  type TargetAmm,
} from "sdk";
import { getRpcEndpoint } from "../lib/config";
import { redactedEndpointLabel } from "../lib/rpc";
import { classifyWalletActionError } from "../lib/walletActionErrors";
import {
  ACTIVE_LAUNCH_TARGET_AMM,
  submitWalletLaunch,
  submitWalletTemplateUpload,
} from "../lib/launchSubmit";
import {
  DEFAULT_LAUNCH_ART_THEME_ID,
  LAUNCH_ART_THEMES,
  STARTER_TEMPLATES,
  getLaunchArtTheme,
  isCustomLaunchArtTheme,
  type LaunchArtThemeId,
  type StarterTemplate,
} from "@/lib/starterTemplates";
import { Link } from "@/i18n/navigation";
import {
  RiskAcknowledgementCheckbox,
  isRiskAcknowledgedForSubmit,
} from "@/components/RiskDisclaimerModal";
import { TemplateEditor, type TemplateValidation } from "@/components/TemplateEditor";
import { LaunchSoulArtPreview } from "@/components/LaunchSoulArtPreview";
import { TokenMtSoulExplainer, type TokenMtSoulExplainerCopy } from "@/components/TokenMtSoulExplainer";
import {
  loadRecentLaunches,
  rememberRecentLaunch,
  type RecentLaunch,
} from "@/lib/recentLaunches";
import {
  APP_CORE_ART_TRAIT_CATEGORIES,
  APP_MAX_USER_CORE_TRAIT_SELECTIONS,
  encodeAppCoreArtTraitStyleParams,
  type AppCoreArtTraitCategoryId,
  type AppCoreArtTraitSelection,
} from "@/lib/soulTraits";
import { formatCompactAddress } from "@/lib/tokenFormatting";
import type { PreSignTransactionReview } from "@/lib/preSignReview";
import { isLaunchSubmitDisabled, usePauseStatus } from "./PauseBanner";
import { PlatformBadge } from "./PlatformBadge";
import { PreSignTransactionReviewCard } from "./PreSignTransactionReviewCard";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

export type CurveTierId = "standard";

export interface CurveTier {
  id: CurveTierId;
  label: string;
  sSol: number;
  kTokens: number;
  description: string;
}

export const CURVE_TIERS: CurveTier[] = [
  {
    id: "standard",
    label: "Standard",
    sSol: 500,
    kTokens: 21_000_000,
    description:
      "Balanced exponential curve: S = 500 SOL, K = 21M tokens. No graduation — the curve runs forever.",
  },
];

function starterTemplateLabelKey(template: StarterTemplate) {
  return `starterTemplates.${template.id}.label`;
}

function classifiedLaunchErrorKey(error: unknown) {
  return `errors.launch.${classifyWalletActionError(error)}`;
}

function launchArtThemeLabelKey(themeId: LaunchArtThemeId) {
  return `artThemes.${themeId}.label`;
}

function launchArtThemeDescriptionKey(themeId: LaunchArtThemeId) {
  return `artThemes.${themeId}.description`;
}

function coreArtTraitCategoryLabelKey(categoryId: AppCoreArtTraitCategoryId) {
  return `coreArtTraits.categories.${categoryId}.label`;
}

function coreArtTraitCategoryDescriptionKey(categoryId: AppCoreArtTraitCategoryId) {
  return `coreArtTraits.categories.${categoryId}.description`;
}

function coreArtTraitOptionLabelKey(categoryId: AppCoreArtTraitCategoryId, optionId: string) {
  return `coreArtTraits.options.${categoryId}.${optionId}`;
}

function isLaunchArtThemeId(themeId: string | undefined): themeId is LaunchArtThemeId {
  return LAUNCH_ART_THEMES.some((theme) => theme.id === themeId);
}

function countSelectedCoreArtTraits(selection: AppCoreArtTraitSelection) {
  return Object.values(selection).filter(Boolean).length;
}

type PendingTemplateUpload = {
  mint: PublicKeyLike;
  template: string;
  styleParams: string;
  recentLaunch: RecentLaunch;
};

function LaunchArtThemePreview({
  label,
  previewSvg,
  testId,
}: {
  label: string;
  previewSvg: string;
  testId: string;
}) {
  return (
    <>
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className="block aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-black/35 shadow-[0_0_28px_rgba(20,241,149,0.08)] [&>svg]:h-full [&>svg]:w-full"
        data-testid={testId}
        dangerouslySetInnerHTML={{ __html: previewSvg }}
      />
    </>
  );
}

function LaunchStage({
  testId,
  kicker,
  title,
  description,
  children,
}: {
  testId: string;
  kicker: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const titleId = `${testId}-title`;

  return (
    <section
      aria-labelledby={titleId}
      className={joinClasses(uiPrimitives.card, "grid gap-4 p-4 sm:p-5")}
      data-testid={testId}
    >
      <div>
        <p className={joinClasses(uiPrimitives.label, "text-soul-mint")}>{kicker}</p>
        <h2 id={titleId} className="mt-2 text-2xl font-bold text-white">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-white/60">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function LaunchForm() {
  const t = useTranslations("launch.form");
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const { isPaused } = usePauseStatus();
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [selectedArtThemeId, setSelectedArtThemeId] = useState<LaunchArtThemeId>(
    DEFAULT_LAUNCH_ART_THEME_ID,
  );
  const [coreArtTraitSelection, setCoreArtTraitSelection] =
    useState<AppCoreArtTraitSelection>({});
  const [starterTemplateId, setStarterTemplateId] = useState("");
  const [starterTemplateSvg, setStarterTemplateSvg] = useState<string>();
  const [starterTemplateError, setStarterTemplateError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [initializedSymbolPreview, setInitializedSymbolPreview] = useState("");
  const [templateSvg, setTemplateSvg] = useState("");
  const [templateValidation, setTemplateValidation] = useState<TemplateValidation>();
  const targetAmm = ACTIVE_LAUNCH_TARGET_AMM;
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [devnetMint, setDevnetMint] = useState("");
  const [devnetLaunchSig, setDevnetLaunchSig] = useState("");
  const [templateUploadSig, setTemplateUploadSig] = useState("");
  const [templateUploadError, setTemplateUploadError] = useState("");
  const [pendingTemplateUpload, setPendingTemplateUpload] = useState<{
    mint: PublicKeyLike;
    template: string;
    styleParams: string;
    recentLaunch: RecentLaunch;
  }>();
  const [preSignReview, setPreSignReview] = useState<PreSignTransactionReview | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isUploadingTemplate, setIsUploadingTemplate] = useState(false);
  const [recentLaunches, setRecentLaunches] = useState<RecentLaunch[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [successAdvancedOpen, setSuccessAdvancedOpen] = useState(false);
  const successPanelRef = useRef<HTMLElement>(null);
  const normalizedTicker = ticker.trim().toUpperCase();
  const canCreate = Boolean(name.trim() && normalizedTicker && description.trim());
  const selectedArtTheme = getLaunchArtTheme(selectedArtThemeId);
  const isCustomTheme = isCustomLaunchArtTheme(selectedArtThemeId);
  const selectedArtThemeLabel = t(launchArtThemeLabelKey(selectedArtTheme.id));
  const effectiveCoreArtTraitSelection = isCustomTheme ? {} : coreArtTraitSelection;
  const selectedCoreArtTraitCount = countSelectedCoreArtTraits(effectiveCoreArtTraitSelection);
  const selectedStyleParams = isCustomTheme
    ? selectedArtTheme.styleParams
    : encodeAppCoreArtTraitStyleParams(
        effectiveCoreArtTraitSelection,
        selectedArtTheme.styleParams,
      );
  const selectedCurveTier = CURVE_TIERS[0] as CurveTier;
  const tokenMtSoulExplainerCopy: TokenMtSoulExplainerCopy = {
    eyebrow: t("tokenMtSoulExplainer.eyebrow"),
    title: t("tokenMtSoulExplainer.title"),
    body: t("tokenMtSoulExplainer.body"),
    steps: [
      {
        label: t("tokenMtSoulExplainer.steps.token.label"),
        value: t("tokenMtSoulExplainer.steps.token.value"),
        body: t("tokenMtSoulExplainer.steps.token.body"),
      },
      {
        label: t("tokenMtSoulExplainer.steps.mt.label"),
        value: t("tokenMtSoulExplainer.steps.mt.value"),
        body: t("tokenMtSoulExplainer.steps.mt.body"),
      },
      {
        label: t("tokenMtSoulExplainer.steps.soul.label"),
        value: t("tokenMtSoulExplainer.steps.soul.value"),
        body: t("tokenMtSoulExplainer.steps.soul.body"),
      },
    ],
    capProgress: t("tokenMtSoulExplainer.capProgressLaunch"),
  };

  useEffect(() => {
    setRecentLaunches(loadRecentLaunches());
  }, []);

  useEffect(() => {
    if (!submitted || !devnetMint) {
      return;
    }

    const successPanel = successPanelRef.current;
    successPanel?.scrollIntoView({ block: "start", behavior: "smooth" });
    successPanel?.focus({ preventScroll: true });
  }, [devnetMint, submitted]);

  async function handleStarterTemplateChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextTemplateId = event.target.value;
    setStarterTemplateId(nextTemplateId);
    setStarterTemplateError("");

    if (!nextTemplateId) {
      return;
    }

    const starterTemplate = STARTER_TEMPLATES.find((template) => template.id === nextTemplateId);
    if (!starterTemplate) {
      setStarterTemplateError(t("errors.unknownTemplate"));
      return;
    }

    const label = t(starterTemplateLabelKey(starterTemplate));

    try {
      const response = await fetch(starterTemplate.path);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setStarterTemplateSvg(await response.text());
    } catch (error) {
      console.warn("[LaunchForm] starter template load failed", error);
      setStarterTemplateError(t("errors.loadTemplate", { label }));
    }
  }

  function updateCoreArtTraitSelection(
    categoryId: AppCoreArtTraitCategoryId,
    value: string,
  ) {
    if (isCustomTheme) {
      return;
    }
    setCoreArtTraitSelection((current) => {
      const next: AppCoreArtTraitSelection = { ...current };
      if (value) {
        if (!current[categoryId] && countSelectedCoreArtTraits(current) >= APP_MAX_USER_CORE_TRAIT_SELECTIONS) {
          return current;
        }
        (next as Record<AppCoreArtTraitCategoryId, string | undefined>)[categoryId] = value;
      } else {
        delete next[categoryId];
      }
      try {
        encodeAppCoreArtTraitStyleParams(next, selectedArtTheme.styleParams);
        return next;
      } catch {
        return current;
      }
    });
  }

  async function uploadTemplateForLaunch(upload: PendingTemplateUpload) {
    if (!connected || !publicKey) {
      setTemplateUploadError(t("errors.walletRequired"));
      setPendingTemplateUpload(upload);
      return undefined;
    }

    setIsUploadingTemplate(true);
    setTemplateUploadError("");
    setPendingTemplateUpload(upload);
    try {
      const uploadSignature = await submitWalletTemplateUpload({
        connection,
        payer: publicKey,
        mint: upload.mint,
        template: upload.template,
        styleParams: upload.styleParams,
        sendTransaction,
        onPreSignReview: setPreSignReview,
      });
      setTemplateUploadSig(uploadSignature);
      setPendingTemplateUpload(undefined);
      setRecentLaunches(rememberRecentLaunch(upload.recentLaunch));
      return uploadSignature;
    } catch (error) {
      console.warn("[LaunchForm] template upload failed", error);
      setTemplateUploadSig("");
      setTemplateUploadError(t("templateUploadFailed"));
      setPendingTemplateUpload(upload);
      return undefined;
    } finally {
      setIsUploadingTemplate(false);
    }
  }

  return (
    <form
      className={joinClasses(uiPrimitives.panel, "grid min-w-0 gap-4 p-4 sm:p-5")}
      data-testid="launch-compact-editorial-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const templateForUpload =
          isCustomTheme ? templateSvg || String(formData.get("templateSvg") ?? "") : "";
        const styleParamsForUpload = selectedStyleParams;
        setSubmitError("");
        setInitializedSymbolPreview("");
        setDevnetLaunchSig("");
        setTemplateUploadSig("");
        setTemplateUploadError("");
        setPreSignReview(null);
        setPendingTemplateUpload(undefined);
        setDevnetMint("");
        if (isPaused) {
          return;
        }
        if (isCustomTheme && !templateValidation?.isValid) {
          setSubmitError(t("errors.templateInvalid"));
          return;
        }
        try {
          validateTemplateUploadInput({
            template: templateForUpload,
            styleParams: styleParamsForUpload,
          });
        } catch (error) {
          console.warn("[LaunchForm] template validation failed", error);
          setSubmitError(t("errors.templateUploadInvalid"));
          return;
        }
        if (!isRiskAcknowledgedForSubmit(riskAcknowledged)) {
          setSubmitError(t("errors.riskRequired"));
          return;
        }
        if (!connected || !publicKey) {
          setSubmitError(t("errors.walletRequired"));
          return;
        }
        setIsLaunching(true);
        try {
          const result = await submitWalletLaunch({
            connection,
            payer: publicKey,
            sendTransaction,
            symbol: normalizedTicker,
            targetAmm: targetAmm as TargetAmm,
            onPreSignReview: setPreSignReview,
          });
          const mintAddress = result.mint.toBase58();
          const recentLaunch: RecentLaunch = {
            mint: mintAddress,
            signature: result.signature,
            symbol: result.symbol || normalizedTicker,
            name: name.trim(),
            artThemeId: selectedArtTheme.id,
            launchedAt: Date.now(),
          };
          setDevnetMint(mintAddress);
          setDevnetLaunchSig(result.signature);
          setInitializedSymbolPreview(result.symbol || normalizedTicker);
          setSubmitted(true);
          await uploadTemplateForLaunch({
            mint: result.mint,
            template: templateForUpload,
            styleParams: styleParamsForUpload,
            recentLaunch,
          });
        } catch (error) {
          console.warn("[LaunchForm] launch transaction failed", error);
          setSubmitError(t(classifiedLaunchErrorKey(error)));
        } finally {
          setIsUploadingTemplate(false);
          setIsLaunching(false);
        }
      }}
    >
      {submitted && devnetMint ? (
        <section
          ref={successPanelRef}
          aria-labelledby="launch-success-title"
          className={joinClasses(uiPrimitives.card, "p-5 outline-none focus-visible:ring-2 focus-visible:ring-soul-mint")}
          data-testid={templateUploadSig ? "launch-success-panel" : "launch-art-upload-panel"}
          role="region"
          tabIndex={-1}
        >
          <div className="mb-3">
            <PlatformBadge />
          </div>
          {templateUploadSig ? (
            <>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-soul-mint">
                {t("successTitle")}
              </p>
              <h2 id="launch-success-title" className="mt-2 text-2xl font-bold text-white">
                {t("viewTokenTradeNow")}
              </h2>
              <p className="mt-2 text-sm text-white/75">{t("successBody")}</p>
              <p className="mt-3 text-sm leading-6 text-white/65" data-testid="launch-success-copy">
                {t("submitted", {
                  name,
                  ticker: normalizedTicker,
                  symbol: initializedSymbolPreview || normalizedTicker,
                })}
              </p>
              <Link
                className={joinClasses(uiPrimitives.buttonPrimary, "mt-4 w-full py-4 text-center text-base sm:w-auto")}
                data-testid="launch-success-primary-cta"
                href={`/token/${devnetMint}#trade-soul-card`}
              >
                {t("viewTokenTradeNow")}
              </Link>
            </>
          ) : (
            <div
              className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4"
              data-testid="launch-art-upload-follow-up"
              role={templateUploadError ? "alert" : "status"}
            >
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-200">
                {t("artUploadActionKicker")}
              </p>
              <h2 id="launch-success-title" className="mt-2 text-2xl font-bold text-white">
                {templateUploadError
                  ? t("artUploadActionFailedTitle")
                  : t("artUploadActionPendingTitle")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/75">
                {templateUploadError
                  ? t("artUploadActionFailedBody")
                  : t("artUploadActionPendingBody")}
              </p>
              <p className="mt-3 break-words rounded-2xl border border-white/10 bg-black/30 p-3 text-sm font-semibold text-amber-100">
                {isUploadingTemplate
                  ? t("templateUploadOpeningWallet")
                  : templateUploadError || t("templateUploadPending")}
              </p>
              {templateUploadError && pendingTemplateUpload ? (
                <button
                  className={joinClasses(uiPrimitives.buttonPrimary, "mt-4 w-full text-center text-sm sm:w-auto")}
                  type="button"
                  disabled={isUploadingTemplate}
                  onClick={() => {
                    void uploadTemplateForLaunch(pendingTemplateUpload);
                  }}
                >
                  {t("templateUploadRetry")}
                </button>
              ) : null}
            </div>
          )}
          <div className="mt-4">
            <button
              aria-controls="launch-success-advanced-panel"
              aria-expanded={successAdvancedOpen}
              className={joinClasses(uiPrimitives.buttonSecondary, "w-full justify-between px-4 py-3 text-left text-sm sm:w-auto")}
              data-testid="launch-success-advanced-toggle"
              type="button"
              onClick={() => setSuccessAdvancedOpen((open) => !open)}
            >
              {successAdvancedOpen ? t("advancedToggleHide") : t("advancedToggleShow")}
            </button>
            {successAdvancedOpen ? (
            <dl
              id="launch-success-advanced-panel"
              className="mt-3 grid gap-3 text-sm"
              data-testid="launch-success-advanced-panel"
            >
              <div>
                <dt className="text-white/50">{t("mintLabel", { mint: "" }).replace(": ", "")}</dt>
                <dd className="break-all font-mono text-soul-mint">{devnetMint}</dd>
              </div>
              {devnetLaunchSig ? (
                <div>
                  <dt className="text-white/50">
                    {t("signatureLabel", { signature: "" }).replace(": ", "")}
                  </dt>
                  <dd className="break-all font-mono text-soul-mint">{devnetLaunchSig}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-white/50">
                  {t("templateUploadStatusLabel")}
                </dt>
                <dd className="break-all font-mono text-soul-mint">
                  {templateUploadSig
                    ? t("templateUploadFinalized", { signature: templateUploadSig })
                    : isUploadingTemplate
                      ? t("templateUploadOpeningWallet")
                      : templateUploadError
                        ? templateUploadError
                        : t("templateUploadPending")}
                </dd>
              </div>
              <div>
                <dt className="text-white/50">
                  {t("artThemeStoredLabel")}
                </dt>
                <dd className="break-all font-mono text-soul-mint">
                  {t("artThemeStored", {
                    label: selectedArtThemeLabel,
                    styleParams: selectedStyleParams,
                  })}
                </dd>
              </div>
            </dl>
            ) : null}
          </div>
        </section>
      ) : null}

      <ol className="grid gap-4" data-testid="launch-stages">
        <li>
          <LaunchStage
            testId="launch-stage-token-identity"
            kicker={t("stageTokenKicker")}
            title={t("stageTokenTitle")}
            description={t("stageTokenDescription")}
          >
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-white" htmlFor="name">
                {t("nameLabel")}
              </label>
              <input
                id="name"
                name="name"
                className={uiPrimitives.input}
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-white" htmlFor="ticker">
                {t("tickerLabel")}
              </label>
              <input
                id="ticker"
                name="ticker"
                className={joinClasses(uiPrimitives.input, "uppercase")}
                placeholder={t("tickerPlaceholder")}
                value={ticker}
                onChange={(event) => setTicker(event.target.value.toUpperCase())}
                maxLength={16}
              />
              <p className="text-sm text-white/55">{t("tickerHelp")}</p>
              <div
                className={joinClasses(
                  uiPrimitives.denseRow,
                  "mt-2 flex flex-col gap-2 p-3 text-sm text-white/70",
                )}
              >
                <PlatformBadge />
                <p>{t("brandingNotice")}</p>
              </div>
            </div>
            <TokenMtSoulExplainer copy={tokenMtSoulExplainerCopy} />
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-white" htmlFor="description">
                {t("descriptionLabel")}
              </label>
              <textarea
                id="description"
                name="description"
                className={joinClasses(uiPrimitives.input, "min-h-28")}
                placeholder={t("descriptionPlaceholder")}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </LaunchStage>
        </li>
        <li>
          <LaunchStage
            testId="launch-stage-soul-art"
            kicker={t("stageArtKicker")}
            title={t("stageArtTitle")}
            description={t("stageArtDescription")}
          >
            <section
              className={joinClasses(
                uiPrimitives.denseRow,
                "grid gap-3 p-3 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-center",
              )}
              data-testid="launch-art-minimal-summary"
            >
              <LaunchArtThemePreview
                label={t("artThemePreviewTitle", { label: selectedArtThemeLabel })}
                previewSvg={selectedArtTheme.previewSvg}
                testId={`launch-selected-art-theme-preview-${selectedArtTheme.id}`}
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soul-mint">
                  {selectedArtThemeLabel}
                </p>
                <p className="mt-2 text-sm leading-6 text-white/60">{t("artThemeHelp")}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                  {t("coreTraitLimit", {
                    count: selectedCoreArtTraitCount.toString(),
                    max: APP_MAX_USER_CORE_TRAIT_SELECTIONS.toString(),
                  })}
                </p>
              </div>
            </section>

            <LaunchSoulArtPreview
              themeId={selectedArtTheme.id}
              styleParams={selectedStyleParams}
              selectedTraitCount={selectedCoreArtTraitCount}
            />

            <details className={joinClasses(uiPrimitives.denseRow, "group p-4")} data-testid="launch-art-customize-details">
              <summary className="cursor-pointer list-none text-sm font-semibold text-white/75 transition group-open:text-white">
                {t("artCustomizeSummary")}
              </summary>
              <fieldset className="mt-4 grid gap-3">
                <legend className="text-sm font-semibold text-white">
                  {t("artThemeLabel")}
                </legend>
                <p className="text-sm leading-6 text-white/55">{t("artThemeHelp")}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                {LAUNCH_ART_THEMES.map((theme) => {
                  const checked = selectedArtThemeId === theme.id;
                  const themeLabel = t(launchArtThemeLabelKey(theme.id));
                  return (
                    <label
                      key={theme.id}
                      className={`grid min-w-0 cursor-pointer grid-cols-[4.75rem_1fr] items-start gap-3 rounded-2xl border p-3 transition sm:grid-cols-[5.5rem_1fr] ${
                        checked
                          ? "border-soul-mint bg-soul-mint/10 text-white"
                          : "border-white/10 bg-white/[0.03] text-white/75 hover:border-white/30"
                      }`}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="artTheme"
                        value={theme.id}
                        checked={checked}
                        onChange={() => setSelectedArtThemeId(theme.id)}
                      />
                      <span className="relative">
                        <LaunchArtThemePreview
                          label={t("artThemePreviewTitle", { label: themeLabel })}
                          previewSvg={theme.previewSvg}
                          testId={`launch-art-theme-preview-${theme.id}`}
                        />
                        <span
                          aria-hidden="true"
                          className={`absolute right-2 top-2 h-3 w-3 rounded-full border shadow ${
                            checked ? "border-soul-mint bg-soul-mint" : "border-white/40 bg-black/50"
                          }`}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">{themeLabel}</span>
                        <span className="mt-1 block text-xs leading-5 text-white/50">
                          {t(launchArtThemeDescriptionKey(theme.id))}
                        </span>
                      </span>
                    </label>
                  );
                })}
                </div>
              </fieldset>

              {!isCustomTheme ? (
                <fieldset
                  className="mt-4 grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4"
                  data-testid="launch-core-trait-selector"
                >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <legend className="text-sm font-semibold text-white">
                      {t("coreTraitTitle")}
                    </legend>
                    <p className="mt-1 text-sm leading-6 text-white/55">
                      {t("coreTraitHelp", {
                        max: APP_MAX_USER_CORE_TRAIT_SELECTIONS.toString(),
                      })}
                    </p>
                  </div>
                  <p className="shrink-0 rounded-full border border-soul-mint/25 bg-soul-mint/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-soul-mint">
                    {t("coreTraitLimit", {
                      count: selectedCoreArtTraitCount.toString(),
                      max: APP_MAX_USER_CORE_TRAIT_SELECTIONS.toString(),
                    })}
                  </p>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {APP_CORE_ART_TRAIT_CATEGORIES.map((category) => {
                    const selectedValue = coreArtTraitSelection[category.id] ?? "";
                    const categoryHasSelection = Boolean(selectedValue);
                    const limitReached =
                      selectedCoreArtTraitCount >= APP_MAX_USER_CORE_TRAIT_SELECTIONS;
                    return (
                      <div
                        key={category.id}
                        className="rounded-2xl border border-white/10 bg-black/20 p-3"
                      >
                        <p className="text-sm font-bold text-white">
                          {t(coreArtTraitCategoryLabelKey(category.id))}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-white/50">
                          {t(coreArtTraitCategoryDescriptionKey(category.id))}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <label
                            className={joinClasses(
                              "cursor-pointer rounded-full border px-3 py-2 text-xs font-semibold transition",
                              selectedValue === ""
                                ? "border-soul-mint bg-soul-mint/10 text-white"
                                : "border-white/10 bg-white/[0.03] text-white/65 hover:border-white/30",
                            )}
                          >
                            <input
                              className="sr-only"
                              type="radio"
                              name={`coreTrait-${category.id}`}
                              value=""
                              checked={selectedValue === ""}
                              onChange={() => updateCoreArtTraitSelection(category.id, "")}
                            />
                            {t("coreTraitAuto")}
                          </label>
                          {category.options.map((option) => {
                            const disabled = !categoryHasSelection && limitReached;
                            const checked = selectedValue === option.id;
                            return (
                              <label
                                key={option.id}
                                className={joinClasses(
                                  "rounded-full border px-3 py-2 text-xs font-semibold transition",
                                  checked
                                    ? "border-soul-mint bg-soul-mint/10 text-white"
                                    : disabled
                                      ? "cursor-not-allowed border-white/5 bg-white/[0.02] text-white/30"
                                      : "cursor-pointer border-white/10 bg-white/[0.03] text-white/65 hover:border-white/30",
                                )}
                              >
                                <input
                                  className="sr-only"
                                  type="radio"
                                  name={`coreTrait-${category.id}`}
                                  value={option.id}
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={() => updateCoreArtTraitSelection(category.id, option.id)}
                                />
                                {t(coreArtTraitOptionLabelKey(category.id, option.id))}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
              ) : (
                <section
                  className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/65"
                  data-testid="launch-custom-template-trait-notice"
                >
                  <p className="font-semibold text-white">{t("customTemplateTraitNoticeTitle")}</p>
                  <p className="leading-6">{t("customTemplateTraitNoticeBody")}</p>
                </section>
              )}
            </details>

            {isCustomTheme ? (
              <>
                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-white" htmlFor="starter-template">
                    {t("starterTemplateLabel")}
                  </label>
                  <select
                    id="starter-template"
                    name="starterTemplate"
                    className={uiPrimitives.input}
                    value={starterTemplateId}
                    onChange={handleStarterTemplateChange}
                  >
                    <option value="">{t("starterTemplateDefault")}</option>
                    {STARTER_TEMPLATES.map((template) => (
                      <option key={template.id} value={template.id}>
                        {t(starterTemplateLabelKey(template))}
                      </option>
                    ))}
                  </select>
                  <p className="text-sm text-white/55">{t("starterTemplateHelp")}</p>
                  {starterTemplateError ? (
                    <p className={uiPrimitives.statusError} role="alert">
                      {starterTemplateError}
                    </p>
                  ) : null}
                </div>

                <TemplateEditor
                  starterTemplate={starterTemplateSvg}
                  onTemplateChange={setTemplateSvg}
                  onValidationChange={setTemplateValidation}
                />
              </>
            ) : null}
          </LaunchStage>
        </li>
        <li>
          <LaunchStage
            testId="launch-stage-sign-launch"
            kicker={t("stageSignKicker")}
            title={t("stageSignTitle")}
            description={t("stageSignDescription")}
          >
            <PreSignTransactionReviewCard
              review={preSignReview}
              testId="launch-pre-sign-transaction-review"
            />

            <RiskAcknowledgementCheckbox
              checked={riskAcknowledged}
              onCheckedChange={setRiskAcknowledged}
            />

            <div>
              <button
                aria-controls="launch-advanced-panel"
                aria-expanded={advancedOpen}
                className={joinClasses(uiPrimitives.buttonSecondary, "w-full justify-between px-4 py-3 text-left text-sm")}
                data-testid="launch-advanced-toggle"
                type="button"
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                {advancedOpen ? t("advancedToggleHide") : t("advancedToggleShow")}
              </button>
              {advancedOpen ? (
                <section
                  id="launch-advanced-panel"
                  className={joinClasses(uiPrimitives.denseRow, "mt-3 grid gap-3 p-4 text-sm text-white/65 sm:grid-cols-2")}
                  data-testid="launch-advanced-panel"
                >
                  <h3 className="font-semibold text-white sm:col-span-2">
                    {t("advancedNetworkTitle")}
                  </h3>
                  <div>
                    <p className="text-white/40">{t("curveTierLabel")}</p>
                    <p className="font-semibold text-white">{selectedCurveTier.label}</p>
                  </div>
                  <div>
                    <p className="text-white/40">{t("launchFee")}</p>
                    <p className="font-mono text-soul-mint">0.03 SOL</p>
                  </div>
                  <div>
                    <p className="text-white/40">{t("lockFee")}</p>
                    <p className="font-mono text-soul-mint">0.1%</p>
                  </div>
                  <div className="sm:col-span-2" data-testid="launch-art-persistence-summary">
                    <p className="text-white/40">{t("artPersistenceTitle")}</p>
                    <p className="font-semibold text-white">
                      {t("artPersistenceReady", {
                        label: selectedArtThemeLabel,
                        count: selectedCoreArtTraitCount.toString(),
                      })}
                    </p>
                    <p className="text-white/55">{t("artPersistenceWalletStep")}</p>
                  </div>
                  <div>
                    <p className="text-white/40">{t("rpcEndpoint", { endpoint: "" }).replace(": ", "")}</p>
                    <p className="break-all font-mono text-soul-mint">
                      {redactedEndpointLabel(getRpcEndpoint())}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/40">{t("artThemeStoredLabel")}</p>
                    <p className="break-all font-mono text-soul-mint">
                      {t("artThemeStored", {
                        label: selectedArtThemeLabel,
                        styleParams: selectedStyleParams,
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/40">{t("curveParamS")}</p>
                    <p className="font-mono text-white">{selectedCurveTier.sSol} SOL</p>
                  </div>
                  <div>
                    <p className="text-white/40">{t("curveParamK")}</p>
                    <p className="font-mono text-white">
                      {selectedCurveTier.kTokens.toLocaleString()}
                    </p>
                  </div>
                  <p className="sm:col-span-2">{t("feeExplanation")}</p>
                </section>
              ) : null}
            </div>

            <button
              className={joinClasses(uiPrimitives.buttonPrimary, "px-4 py-3")}
              type="submit"
              disabled={
                isLaunchSubmitDisabled({ canCreate, isLaunching, isPaused }) ||
                isUploadingTemplate ||
                (isCustomTheme && !templateValidation?.isValid) ||
                !isRiskAcknowledgedForSubmit(riskAcknowledged)
              }
            >
              {isUploadingTemplate
                ? t("uploadingTemplate")
                : isLaunching
                  ? t("creating")
                  : t("submit")}
            </button>

            <p className="text-sm text-white/60">
              {connected && publicKey
                ? t("walletReady", { address: formatCompactAddress(publicKey.toBase58()) })
                : t("walletPrompt")}
            </p>
            {submitError ? (
              <p className={uiPrimitives.statusError} role="alert">
                {submitError}
              </p>
            ) : null}
          </LaunchStage>
        </li>
      </ol>

      {recentLaunches.length > 0 ? (
        <section
          className={joinClasses(uiPrimitives.denseRow, "p-4")}
          data-testid="recent-launches"
        >
          <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-soul-mint">
            {t("recentLaunchesTitle")}
          </h2>
          <p className="mt-1 text-sm text-white/60">{t("recentLaunchesDescription")}</p>
          <ul className="mt-3 grid gap-2">
            {recentLaunches.map((launch) => (
              <li key={`${launch.mint}-${launch.signature}`}>
                <Link
                  className={joinClasses(uiPrimitives.denseRow, "block px-3 py-2 text-sm text-white transition hover:border-soul-mint/40 hover:text-soul-mint")}
                  href={`/token/${launch.mint}`}
                >
                  <span className="font-semibold">
                    {t("recentLaunchLink", { symbol: launch.symbol || launch.name })}
                  </span>
                  <span className="mt-1 block break-all font-mono text-xs text-white/55">
                    {launch.mint}
                  </span>
                  {isLaunchArtThemeId(launch.artThemeId) ? (
                    <span className="mt-1 block text-xs text-soul-mint">
                      {t(launchArtThemeLabelKey(launch.artThemeId))}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </form>
  );
}
