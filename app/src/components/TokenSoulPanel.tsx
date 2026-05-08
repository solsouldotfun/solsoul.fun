"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  fetchBondingCurve,
  fetchReceiptRegistryAccount,
  fetchSettlementReceiptCandidates,
  fetchSoul,
  resolveSoulTheme,
  type BondingCurveAccount,
  type GenerationProvenance,
  type ReceiptSettlementState,
  type SettlementReceiptCandidate,
  type SoulAccount,
  selectSettlementReceipts,
} from "sdk";
import type { PreSignTransactionReview } from "../lib/preSignReview";
import { ClaimButton } from "@/components/ClaimButton";
import { GenerateAgainButton } from "@/components/GenerateAgainButton";
import { TokenActionCenter, TokenClaimActionCard } from "@/components/TokenActionCenter";
import { TokenTechnicalSections } from "@/components/TokenTechnicalSections";
import {
  RiskAcknowledgementCheckbox,
  isRiskAcknowledgedForSubmit,
} from "@/components/RiskDisclaimerModal";
import { getRpcEndpoint } from "../lib/config";
import {
  applySlippage,
  calculateLockFee,
  parseSlippageBps,
  parseSolAmountToLamports,
  quoteBuyTokenOut,
  submitWalletBuy,
} from "../lib/buySubmit";
import {
  isSettlementPreviewMismatchError,
  type BoundarySettlementExpectation,
  type BoundarySettlementPreview,
} from "../lib/settlementSubmit";
import {
  fetchOwnerTokenBalance,
  parseTokenAmountToBaseUnits,
  quoteSellSolOut,
  selectDiscoveredTokenAccount,
  submitWalletSell,
  type DiscoveredTokenAccount,
} from "../lib/sellSubmit";
import {
  formatSolAmount,
  formatTokenAmount,
  formatTokenDisplayAmount,
} from "@/lib/tokenFormatting";
import {
  MAX_BUY_SOL_LAMPORTS,
  MT_CLAIM_QUANTUM_BASE_UNITS,
  estimateBuySolForTokenTarget,
} from "../lib/curveMath";
import {
  classifyDirectTransferError,
  directTransferErrorMessage,
  formatDirectTransferAmount,
  submitWalletDirectTransfer,
  type DirectTransferWarningCode,
} from "../lib/directTransferSubmit";
import { classifyWalletActionError } from "../lib/walletActionErrors";
import {
  deriveSolSoulTokenPdas,
  safeTokenLoadErrorMessage,
} from "../lib/tokenPdaValidation";
import { usePauseStatus } from "./PauseBanner";
import { buildCurveEconomicsView, formatFixedEconomicsCopy } from "../lib/curveEconomics";
import { deriveSoulRarity } from "../lib/soulRarity";
import {
  deriveAppSoulTraitDisplayGroups,
  type AppSoulTraitDisplayGroups,
} from "../lib/soulTraits";
import type { AnimatedSoulProfile } from "../lib/animatedSoulProfile";
import {
  animatedSoulEvolutionStateForProfile,
  deriveAnimatedSoulProfileForPreview,
  deriveSoulEvolutionDisplayState,
  type SoulEvolutionDisplayState,
} from "../lib/animatedSoulSurfaces";
import { PlatformBadge } from "./PlatformBadge";
import { TokenTimeline } from "./TokenTimeline";
import { GenerationRulesCard, buildGenerationRulesCopy } from "./GenerationRulesCard";
import { joinClasses, uiPrimitives } from "./uiPrimitives";
import { PreSignTransactionReviewCard } from "./PreSignTransactionReviewCard";
import {
  BondingCurveChart,
  LifecycleCurveVisual,
  MarketCurveOverview,
  QuoteBreakdown,
} from "./TokenDetailMarket";
import {
  SoulLifecycleStateMachine,
  getSoulLifecycleState,
  type SoulLifecyclePrimaryAction,
  type SoulLifecycleStage,
  type SoulLifecycleState,
} from "./TokenDetailLifecycle";
import {
  SoulRarityPreviewCard,
  TokenDetailSurfaceHeader,
  TradeGenerationMoment,
  type TokenDetailTradeAction,
} from "./TokenDetailSoulHero";
import { TokenMtSoulExplainer, type TokenMtSoulExplainerCopy } from "./TokenMtSoulExplainer";
import { TokenDetailProofRail, type TokenProofRailItem, type TokenProofRailLabels } from "./TokenDetailProofRail";
import {
  TokenClaimPriorityNotice,
  TokenSellClaimSemanticsNotice,
  TokenTradeErrorAlert,
  TokenTradeSuccessCard,
} from "./TokenTradeStatus";
import { resolveTokenDetailFieldLabel } from "./TokenDetailFallbacks";
import { AmbientSoulBackground } from "./AmbientSoulBackground";
import { TokenTradeSoulCard } from "./TokenTradeSoulCard";
import {
  BUY_PRESET_SOL_AMOUNTS,
  SELL_PRESET_PERCENTAGES,
  TokenTradePresetChips,
  deriveSellPresetAmount,
  type TradePreset,
} from "./TokenTradePresets";
import { WalletConnectButton } from "./WalletConnectButton";

export { PreSignTransactionReviewCard } from "./PreSignTransactionReviewCard";
export { BondingCurveChart, LifecycleCurveVisual, MarketCurveOverview, QuoteBreakdown } from "./TokenDetailMarket";
export { SoulLifecycleStateMachine, getSoulLifecycleState } from "./TokenDetailLifecycle";
export type {
  SoulLifecyclePrimaryAction,
  SoulLifecycleStage,
  SoulLifecycleState,
} from "./TokenDetailLifecycle";
export {
  SoulRarityPreviewCard,
  TokenDetailSurfaceHeader,
  TradeGenerationMoment,
} from "./TokenDetailSoulHero";

type TokenSoulPanelProps = {
  mint: string;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; soul: SoulAccount }
  | { status: "error"; message: string };

type CurveLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; curve: BondingCurveAccount }
  | { status: "error"; message: string };

type BuyState =
  | { status: "idle" }
  | { status: "buying" }
  | {
      status: "success";
      signature: string;
      solInLamports: bigint;
      minAmountOut: bigint;
      expectedTokenOut: bigint;
      nftMint: string | null;
    }
  | { status: "error"; message: string };

type SellState =
  | { status: "idle" }
  | { status: "selling" }
  | {
      status: "success";
      signature: string;
      tokenIn: bigint;
      minAmountOut: bigint;
      expectedSolOut: bigint;
      sellerTokenAccount: PublicKey;
      settlement: BoundarySettlementPreview;
    }
  | { status: "error"; message: string };

type DirectTransferState =
  | { status: "idle" }
  | { status: "transferring" }
  | {
      status: "success";
      signature: string;
      amount: bigint;
      sourceTokenAccount: PublicKey;
      destinationTokenAccount: PublicKey;
      settlement: BoundarySettlementPreview;
    }
  | { status: "error"; message: string; code?: DirectTransferWarningCode };

type TradeGenerationMomentState = {
  action: TradeAction;
  generation: string;
  signature: string;
  svg: string;
  animationProfile: AnimatedSoulProfile | null;
  provenance: GenerationProvenance | null;
};

type TokenBalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "loaded";
      baseUnits: bigint;
      amount: string;
      accounts: DiscoveredTokenAccount[];
    }
  | { status: "error"; message: string };

type SolBalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; lamports: number }
  | { status: "error"; message: string };

type MtGateQuickBuyEstimate =
  | { status: "ready"; solAmount: string; estimatedTokens: string; minimumTokens: string }
  | { status: "met" }
  | {
      status: "unavailable";
      reason:
        | "connectWallet"
        | "balanceLoading"
        | "balanceUnavailable"
        | "curveLoading"
        | "curveUnavailable"
        | "tooLarge";
    };

type SettlementReceiptLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "loaded";
      activeReceiptCount: bigint;
      candidates: SettlementReceiptCandidate[];
    }
  | { status: "error"; message: string };

type BoundarySettlementDisplay =
  | {
      status: "none";
      state?: ReceiptSettlementState;
      activeReceiptCount?: bigint;
      postWholeUnits?: bigint;
      sourceTokenAccount?: PublicKey;
      sourceTokenBalanceBaseUnits?: bigint;
    }
  | {
      status: "required";
      state: ReceiptSettlementState;
      activeReceiptCount: bigint;
      postWholeUnits: bigint;
      selectedReceipts: SettlementReceiptCandidate[];
      sourceTokenAccount?: PublicKey;
      sourceTokenBalanceBaseUnits?: bigint;
    }
  | { status: "blocked"; message: string };

export type TradeAction = TokenDetailTradeAction;

export type TradeDisabledReason =
  | "paused"
  | "busy"
  | "connectWallet"
  | "curveLoading"
  | "curveUnavailable"
  | "graduated"
  | "acknowledgeRisk"
  | "invalidAmount"
  | "balanceLoading"
  | "buyTokensFirst"
  | "sellAmountExceedsBalance";

export type DirectTransferDisabledReason =
  | "paused"
  | "connectWallet"
  | "balanceLoading"
  | "buyTokensFirst"
  | "invalidAmount"
  | "amountExceedsBalance"
  | "recipientRequired"
  | "openingWallet";

function traitDisplayGroupsForSoul(soul: SoulAccount | undefined): AppSoulTraitDisplayGroups {
  if (!soul || soul.provenanceGeneration === 0n) {
    return {
      launchGuidedCoreTraits: [],
      systemCoreTraits: [],
      generatedTraits: [],
    };
  }
  return deriveAppSoulTraitDisplayGroups({
    seed: soul.provenanceSeedHash,
    theme: resolveSoulTheme(soul).id,
    provenanceSide: soul.provenanceSide,
    generation: soul.provenanceGeneration,
    amount: soul.provenanceAmount,
    tokenAmount: soul.provenanceTokenAmount,
    styleParams: soul.styleParamsBytes,
  });
}

function evolutionDisplayForSoul(params: {
  soul?: SoulAccount;
  rarity?: ReturnType<typeof deriveSoulRarity> | null;
}): SoulEvolutionDisplayState | null {
  if (!params.soul) {
    return null;
  }
  return deriveSoulEvolutionDisplayState({
    generation: params.soul.provenanceGeneration,
    provenanceSide: params.soul.provenanceSide,
    amount: params.soul.provenanceAmount,
    tokenAmount: params.soul.provenanceTokenAmount,
    claimCount: params.soul.claimCount,
    rarityTier: params.rarity?.tier ?? null,
    rarityScore: params.rarity?.score ?? null,
  });
}

function animationProfileForSoul(params: {
  soul?: SoulAccount;
  evolutionDisplay?: SoulEvolutionDisplayState | null;
}): AnimatedSoulProfile | null {
  const { soul, evolutionDisplay } = params;
  if (!soul || soul.provenanceGeneration === 0n) {
    return null;
  }
  return deriveAnimatedSoulProfileForPreview({
    seed: soul.provenanceSeedHash,
    theme: resolveSoulTheme(soul).id,
    provenanceSide: soul.provenanceSide,
    generation: soul.provenanceGeneration,
    amount: soul.provenanceAmount,
    tokenAmount: soul.provenanceTokenAmount,
    styleParams: soul.styleParamsBytes,
  }, {
    evolutionState: evolutionDisplay
      ? animatedSoulEvolutionStateForProfile(evolutionDisplay)
      : undefined,
    displayState: { surface: "tokenDetail", density: "hero", motion: "auto" },
  });
}

export function getTradeDisabledReason(params: {
  action: TradeAction;
  connected: boolean;
  hasPublicKey: boolean;
  riskAcknowledged: boolean;
  curveStatus: CurveLoadState["status"];
  isGraduated: boolean;
  hasValidQuote: boolean;
  isPaused?: boolean;
  isBusy?: boolean;
  tokenBalanceStatus?: TokenBalanceState["status"];
  tokenBalanceBaseUnits?: bigint;
  requestedSellBaseUnits?: bigint;
}): TradeDisabledReason | null {
  if (params.isPaused) {
    return "paused";
  }

  if (params.isBusy) {
    return "busy";
  }

  if (!params.connected || !params.hasPublicKey) {
    return "connectWallet";
  }

  if (params.curveStatus === "loading" || params.curveStatus === "idle") {
    return "curveLoading";
  }

  if (params.curveStatus === "error") {
    return "curveUnavailable";
  }

  if (params.isGraduated) {
    return "graduated";
  }

  if (!params.riskAcknowledged) {
    return "acknowledgeRisk";
  }

  if (!params.hasValidQuote) {
    return "invalidAmount";
  }

  if (params.action === "sell") {
    if (params.tokenBalanceStatus === "loading") {
      return "balanceLoading";
    }

    if (
      params.tokenBalanceStatus === "loaded" &&
      (params.tokenBalanceBaseUnits === undefined || params.tokenBalanceBaseUnits <= 0n)
    ) {
      return "buyTokensFirst";
    }

    if (
      params.tokenBalanceStatus === "loaded" &&
      params.tokenBalanceBaseUnits !== undefined &&
      params.requestedSellBaseUnits !== undefined &&
      params.requestedSellBaseUnits > params.tokenBalanceBaseUnits
    ) {
      return "sellAmountExceedsBalance";
    }
  }

  return null;
}

export function getDirectTransferDisabledReason(params: {
  connected: boolean;
  hasPublicKey: boolean;
  isPaused?: boolean;
  isBusy?: boolean;
  tokenBalanceStatus?: TokenBalanceState["status"];
  tokenBalanceBaseUnits?: bigint;
  requestedTransferBaseUnits?: bigint;
  hasRecipient: boolean;
}): DirectTransferDisabledReason | null {
  if (params.isPaused) {
    return "paused";
  }
  if (params.isBusy) {
    return "openingWallet";
  }
  if (!params.connected || !params.hasPublicKey) {
    return "connectWallet";
  }
  if (params.tokenBalanceStatus === "loading") {
    return "balanceLoading";
  }
  if (
    params.tokenBalanceStatus === "loaded" &&
    (params.tokenBalanceBaseUnits === undefined || params.tokenBalanceBaseUnits <= 0n)
  ) {
    return "buyTokensFirst";
  }
  if (!params.requestedTransferBaseUnits) {
    return "invalidAmount";
  }
  if (
    params.tokenBalanceStatus === "loaded" &&
    params.tokenBalanceBaseUnits !== undefined &&
    params.requestedTransferBaseUnits > params.tokenBalanceBaseUnits
  ) {
    return "amountExceedsBalance";
  }
  if (!params.hasRecipient) {
    return "recipientRequired";
  }
  return null;
}

export function buildBoundarySettlementDisplay(params: {
  owner?: PublicKey | null;
  mint?: PublicKey | null;
  currentBalanceBaseUnits?: bigint;
  movementAmountBaseUnits?: bigint | null;
  settlementState: ReceiptSettlementState;
  receiptState: SettlementReceiptLoadState;
  sourceTokenAccount?: PublicKey | null;
  sourceTokenBalanceBaseUnits?: bigint;
  blockedMessage?: string;
}): BoundarySettlementDisplay {
  if (
    !params.owner ||
    !params.mint ||
    params.currentBalanceBaseUnits === undefined ||
    !params.movementAmountBaseUnits ||
    params.receiptState.status !== "loaded"
  ) {
    return { status: "none" };
  }

  try {
    const selected = selectSettlementReceipts({
      owner: params.owner,
      mint: params.mint,
      currentBalance: params.currentBalanceBaseUnits,
      movementAmount: params.movementAmountBaseUnits,
      activeReceiptCount: params.receiptState.activeReceiptCount,
      candidates: params.receiptState.candidates,
    });
    if (selected.requiredCount === 0n) {
      return {
        status: "none",
        state: params.settlementState,
        activeReceiptCount: selected.activeReceiptCount,
        postWholeUnits: selected.postWholeUnits,
        sourceTokenAccount: params.sourceTokenAccount ?? undefined,
        sourceTokenBalanceBaseUnits: params.sourceTokenBalanceBaseUnits,
      };
    }
    return {
      status: "required",
      state: params.settlementState,
      activeReceiptCount: selected.activeReceiptCount,
      postWholeUnits: selected.postWholeUnits,
      selectedReceipts: selected.selectedReceipts,
      sourceTokenAccount: params.sourceTokenAccount ?? undefined,
      sourceTokenBalanceBaseUnits: params.sourceTokenBalanceBaseUnits,
    };
  } catch (error) {
    console.warn("[TokenSoulPanel] settlement preview failed", error);
    return {
      status: "blocked",
      message:
        params.blockedMessage ??
        "Settlement evidence is temporarily unavailable. Refresh and try again.",
    };
  }
}

function selectSettlementSourceAccountForAmount(
  tokenBalanceState: TokenBalanceState,
  movementAmountBaseUnits: bigint | null,
): DiscoveredTokenAccount | null {
  if (tokenBalanceState.status !== "loaded" || !movementAmountBaseUnits) {
    return null;
  }
  try {
    return selectDiscoveredTokenAccount(tokenBalanceState.accounts, movementAmountBaseUnits);
  } catch {
    return null;
  }
}

function buildBoundarySettlementExpectation(
  display: BoundarySettlementDisplay,
  source: DiscoveredTokenAccount | null,
): BoundarySettlementExpectation | undefined {
  if (
    !source ||
    display.status === "blocked" ||
    display.activeReceiptCount === undefined ||
    display.postWholeUnits === undefined ||
    !display.state
  ) {
    return undefined;
  }

  const preview: BoundarySettlementPreview =
    display.status === "required"
      ? {
          required: true,
          activeReceiptCount: display.activeReceiptCount,
          postWholeUnits: display.postWholeUnits,
          selectedReceipts: display.selectedReceipts,
          state: display.state,
        }
      : {
          required: false,
          activeReceiptCount: display.activeReceiptCount,
          postWholeUnits: display.postWholeUnits,
          selectedReceipts: [],
          state: display.state,
        };

  return {
    preview,
    sourceTokenAccount: source.pubkey,
    sourceTokenBalance: source.amount,
  };
}

export function BoundarySettlementPreviewCard({
  preview,
  labels,
}: {
  preview: BoundarySettlementDisplay;
  labels: {
    title: string;
    burnMode: string;
    forfeitMode: string;
    body: string;
    selectedReceipts: string;
    postWholeUnits: string;
    blocked: string;
    sourceSelectionNotice: string;
    sourceAccount: string;
    sourceBalance: string;
    activeReceipts: string;
    boundary: string;
  };
}) {
  if (preview.status === "none") {
    return null;
  }

  if (preview.status === "blocked") {
    return (
      <div className="rounded-2xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100" role="alert">
        <p className="font-semibold">{labels.blocked}</p>
        <p className="mt-1 break-words">{preview.message}</p>
      </div>
    );
  }

  const modeLabel = preview.state === "burned" ? labels.burnMode : labels.forfeitMode;
  return (
    <div className="rounded-2xl border border-soul-glow/40 bg-soul-glow/10 p-3 text-sm text-white/75" role="status">
      <p className="font-semibold text-white">{labels.title}</p>
      <p className="mt-1">{labels.body.replace("{mode}", modeLabel)}</p>
      <p className="mt-2 text-xs text-white/55">{labels.sourceSelectionNotice}</p>
      {preview.sourceTokenAccount ? (
        <p className="mt-2 break-all font-mono text-xs text-white/65">
          {labels.sourceAccount}: {preview.sourceTokenAccount.toBase58()}
        </p>
      ) : null}
      {preview.sourceTokenBalanceBaseUnits !== undefined ? (
        <p className="mt-1 font-mono text-xs text-white/65">
          {labels.sourceBalance}: {formatTokenAmount(preview.sourceTokenBalanceBaseUnits)}
        </p>
      ) : null}
      <p className="mt-2 font-mono text-xs text-white/65">
        {labels.postWholeUnits}: {preview.postWholeUnits.toString()} / {labels.activeReceipts}:{" "}
        {preview.activeReceiptCount.toString()}
      </p>
      <div className="mt-2">
        <p className="text-xs uppercase tracking-[0.14em] text-white/45">
          {labels.selectedReceipts}
        </p>
        <ul className="mt-1 grid gap-1">
          {preview.selectedReceipts.map((receipt) => (
            <li className="break-all font-mono text-xs text-soul-mint" key={receipt.receiptAccount.toBase58()}>
              {receipt.receiptAccount.toBase58()} · {labels.boundary}{" "}
              {formatTokenAmount(receipt.receipt.boundBoundary)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function TokenSoulPanel({ mint }: TokenSoulPanelProps) {
  const t = useTranslations("token");
  const generationRulesT = useTranslations("generationRules");
  const locale = useLocale();
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const { isPaused } = usePauseStatus();
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [curveLoadState, setCurveLoadState] = useState<CurveLoadState>({ status: "idle" });
  const [tokenBalanceState, setTokenBalanceState] = useState<TokenBalanceState>({ status: "idle" });
  const [buyState, setBuyState] = useState<BuyState>({ status: "idle" });
  const [sellState, setSellState] = useState<SellState>({ status: "idle" });
  const [directTransferState, setDirectTransferState] =
    useState<DirectTransferState>({ status: "idle" });
  const [preSignReview, setPreSignReview] =
    useState<PreSignTransactionReview | null>(null);
  const [settlementReceiptState, setSettlementReceiptState] =
    useState<SettlementReceiptLoadState>({ status: "idle" });
  const [tradeGenerationMoment, setTradeGenerationMoment] =
    useState<TradeGenerationMomentState | null>(null);
  const [solBalanceState, setSolBalanceState] = useState<SolBalanceState>({ status: "idle" });
  const [activeTrade, setActiveTrade] = useState<TradeAction>("buy");
  const [solAmount, setSolAmount] = useState("0.1");
  const [slippagePercent, setSlippagePercent] = useState("1");
  const [sellTokenAmount, setSellTokenAmount] = useState("1");
  const [sellSlippagePercent, setSellSlippagePercent] = useState("1");
  const [transferTokenAmount, setTransferTokenAmount] = useState("0.000001");
  const [transferRecipient, setTransferRecipient] = useState("");
  const [settlementMode, setSettlementMode] = useState<ReceiptSettlementState>("burned");
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const parsedMint = useMemo(() => parseMint(mint), [mint]);
  const addresses = useMemo(() => {
    if (!parsedMint) {
      return null;
    }
    try {
      const { curve, soul } = deriveSolSoulTokenPdas(parsedMint);
      return {
        curve: curve.toBase58(),
        soul: soul.toBase58(),
      };
    } catch {
      return {
        error: t("unsupportedMint"),
      };
    }
  }, [parsedMint, t]);

  useEffect(() => {
    if (!parsedMint) {
      setLoadState({ status: "error", message: t("invalidMint") });
      setCurveLoadState({ status: "error", message: t("invalidMint") });
      return;
    }
    if (addresses && "error" in addresses) {
      setLoadState({ status: "error", message: t("unsupportedMint") });
      setCurveLoadState({ status: "error", message: t("unsupportedMint") });
      return;
    }

    let isMounted = true;
    setLoadState({ status: "loading" });
    setCurveLoadState({ status: "loading" });
    fetchSoul(connection, parsedMint)
      .then((soul) => {
        if (isMounted) {
          setLoadState({ status: "loaded", soul });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setLoadState({
            status: "error",
            message: safeTokenLoadErrorMessage(error, t("loadSoulError")),
          });
        }
      });
    fetchBondingCurve(connection, parsedMint)
      .then((curve) => {
        if (isMounted) {
          setCurveLoadState({ status: "loaded", curve });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setCurveLoadState({
            status: "error",
            message: safeTokenLoadErrorMessage(error, t("loadCurveError")),
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [addresses, connection, parsedMint, t]);

  const hasLiveSoulSvg = loadState.status === "loaded" && loadState.soul.lastSvgLen > 0;
  const liveSvg = hasLiveSoulSvg ? loadState.soul.lastSvg : "";
  const generationCount =
    loadState.status === "loaded" ? loadState.soul.generationCount.toString() : "0";
  const claimCount = loadState.status === "loaded" ? loadState.soul.claimCount.toString() : "0";
  const artThemeLabel = resolveTokenDetailFieldLabel({
    status: loadState.status,
    loadedValue:
      loadState.status === "loaded"
        ? (loadState.soul.artTheme ?? resolveSoulTheme(loadState.soul)).label
        : null,
    loadingLabel: t("surfaceHeader.loadingArtTheme"),
    unavailableLabel: t("unavailable"),
  });
  const latestTraitGroups =
    loadState.status === "loaded"
      ? traitDisplayGroupsForSoul(loadState.soul)
      : { launchGuidedCoreTraits: [], systemCoreTraits: [], generatedTraits: [] };
  const isGraduated =
    curveLoadState.status === "loaded" ? curveLoadState.curve.selfDeprecated : false;
  const buyLamports = useMemo(() => {
    try {
      return parseSolAmountToLamports(solAmount);
    } catch {
      return null;
    }
  }, [solAmount]);
  const buySlippageBps = useMemo(() => {
    try {
      return parseSlippageBps(slippagePercent);
    } catch {
      return null;
    }
  }, [slippagePercent]);
  const buyQuote = useMemo(() => {
    if (curveLoadState.status !== "loaded" || buyLamports === null) {
      return null;
    }
    try {
      return quoteBuyTokenOut(
        curveLoadState.curve.cumulativeSol,
        curveLoadState.curve.totalMinted,
        buyLamports,
      );
    } catch {
      return null;
    }
  }, [buyLamports, curveLoadState]);
  const buyMinTokenOut = useMemo(() => {
    if (buyQuote === null || buySlippageBps === null) {
      return null;
    }
    try {
      return applySlippage(buyQuote, buySlippageBps);
    } catch {
      return null;
    }
  }, [buyQuote, buySlippageBps]);
  const mtGateQuickBuy = useMemo<MtGateQuickBuyEstimate>(() => {
    if (!connected) {
      return { status: "unavailable", reason: "connectWallet" };
    }
    if (tokenBalanceState.status === "loading") {
      return { status: "unavailable", reason: "balanceLoading" };
    }
    if (tokenBalanceState.status === "error" || tokenBalanceState.status !== "loaded") {
      return { status: "unavailable", reason: "balanceUnavailable" };
    }
    if (tokenBalanceState.baseUnits >= MT_CLAIM_QUANTUM_BASE_UNITS) {
      return { status: "met" };
    }
    if (curveLoadState.status === "loading" || curveLoadState.status === "idle") {
      return { status: "unavailable", reason: "curveLoading" };
    }
    if (curveLoadState.status !== "loaded") {
      return { status: "unavailable", reason: "curveUnavailable" };
    }

    const targetTokenOut = MT_CLAIM_QUANTUM_BASE_UNITS - tokenBalanceState.baseUnits;
    try {
      const estimate = estimateBuySolForTokenTarget({
        cumulativeSol: curveLoadState.curve.cumulativeSol,
        totalMinted: curveLoadState.curve.totalMinted,
        targetTokenOut,
      });
      if (estimate.grossSolInLamports > MAX_BUY_SOL_LAMPORTS) {
        return { status: "unavailable", reason: "tooLarge" };
      }

      return {
        status: "ready",
        solAmount: formatSolAmount(estimate.grossSolInLamports),
        estimatedTokens: formatTokenAmount(estimate.estimatedTokenOut),
        minimumTokens: formatTokenAmount(
          buySlippageBps === null
            ? estimate.estimatedTokenOut
            : applySlippage(estimate.estimatedTokenOut, buySlippageBps),
        ),
      };
    } catch {
      return { status: "unavailable", reason: "curveUnavailable" };
    }
  }, [buySlippageBps, connected, curveLoadState, tokenBalanceState]);

  const requestedSellBaseUnits = useMemo(() => {
    try {
      return parseTokenAmountToBaseUnits(sellTokenAmount);
    } catch {
      return null;
    }
  }, [sellTokenAmount]);
  const sellSlippageBps = useMemo(() => {
    try {
      return parseSlippageBps(sellSlippagePercent);
    } catch {
      return null;
    }
  }, [sellSlippagePercent]);

  const sellQuote = useMemo(() => {
    if (curveLoadState.status !== "loaded") {
      return null;
    }
    if (requestedSellBaseUnits === null) {
      return null;
    }
    try {
      return quoteSellSolOut(
        curveLoadState.curve.cumulativeSol,
        curveLoadState.curve.totalMinted,
        requestedSellBaseUnits,
      );
    } catch {
      return null;
    }
  }, [curveLoadState, requestedSellBaseUnits]);
  const sellMinSolOut = useMemo(() => {
    if (sellQuote === null || sellSlippageBps === null) {
      return null;
    }
    try {
      return applySlippage(sellQuote, sellSlippageBps);
    } catch {
      return null;
    }
  }, [sellQuote, sellSlippageBps]);

  const requestedTransferBaseUnits = useMemo(() => {
    try {
      return parseTokenAmountToBaseUnits(transferTokenAmount);
    } catch {
      return null;
    }
  }, [transferTokenAmount]);

  useEffect(() => {
    if (!parsedMint || !connected || !publicKey) {
      setTokenBalanceState({ status: "idle" });
      setSolBalanceState({ status: "idle" });
      setSettlementReceiptState({ status: "idle" });
      return;
    }

    let isMounted = true;
    setTokenBalanceState({ status: "loading" });
    setSolBalanceState({ status: "loading" });
    fetchOwnerTokenBalance(connection, publicKey, parsedMint)
      .then((balance) => {
        if (isMounted) {
          setTokenBalanceState({
            status: "loaded",
            baseUnits: balance.amount,
            amount: formatTokenAmount(balance.amount),
            accounts: balance.accounts,
          });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          const message = error instanceof Error ? error.message : "";
          if (/could not find account|Invalid param|AccountNotFound/i.test(message)) {
            setTokenBalanceState({
              status: "loaded",
              baseUnits: 0n,
              amount: "0.000000",
              accounts: [],
            });
          } else {
            console.warn("[TokenSoulPanel] token balance fetch failed", error);
            setTokenBalanceState({
              status: "error",
              message: t("tradeControls.tokenBalanceUnavailable"),
            });
          }
        }
      });
    connection
      .getBalance(publicKey, "confirmed")
      .then((lamports) => {
        if (isMounted) {
          setSolBalanceState({ status: "loaded", lamports });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          console.warn("[TokenSoulPanel] SOL balance fetch failed", error);
          setSolBalanceState({
            status: "error",
            message: t("tradeControls.solBalanceUnavailable"),
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [connection, connected, parsedMint, publicKey]);

  useEffect(() => {
    if (!parsedMint || !connected || !publicKey) {
      setSettlementReceiptState({ status: "idle" });
      return;
    }

    let isMounted = true;
    setSettlementReceiptState({ status: "loading" });
    Promise.all([
      fetchReceiptRegistryAccount(connection, publicKey, parsedMint),
      fetchSettlementReceiptCandidates(connection, publicKey, parsedMint),
    ])
      .then(([registry, candidates]) => {
        if (isMounted) {
          setSettlementReceiptState({
            status: "loaded",
            activeReceiptCount:
              registry?.registry.activeReceipts ??
              BigInt(candidates.filter((candidate) => candidate.receipt.lifecycleState === "active").length),
            candidates,
          });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          console.warn("[TokenSoulPanel] settlement receipt fetch failed", error);
          setSettlementReceiptState({
            status: "error",
            message: t("settlement.stateUnavailable"),
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [connection, connected, parsedMint, publicKey]);

  async function refreshSoul(): Promise<SoulAccount | null> {
    if (!parsedMint) {
      return null;
    }

    try {
      const soul = await fetchSoul(connection, parsedMint);
      setLoadState({ status: "loaded", soul });
      return soul;
    } catch (error) {
      setLoadState({
        status: "error",
        message: safeTokenLoadErrorMessage(error, t("refreshSoulError")),
      });
      return null;
    }
  }

  async function refreshCurve() {
    if (!parsedMint) {
      return;
    }

    try {
      const curve = await fetchBondingCurve(connection, parsedMint);
      setCurveLoadState({ status: "loaded", curve });
    } catch (error) {
      setCurveLoadState({
        status: "error",
        message: safeTokenLoadErrorMessage(error, t("loadCurveError")),
      });
    }
  }

  async function refreshTokenBalance() {
    if (!parsedMint || !connected || !publicKey) {
      setTokenBalanceState({ status: "idle" });
      return;
    }

    try {
      const balance = await fetchOwnerTokenBalance(connection, publicKey, parsedMint);
      setTokenBalanceState({
        status: "loaded",
        baseUnits: balance.amount,
        amount: formatTokenAmount(balance.amount),
        accounts: balance.accounts,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/could not find account|Invalid param|AccountNotFound/i.test(message)) {
        setTokenBalanceState({
          status: "loaded",
          baseUnits: 0n,
          amount: "0.000000",
          accounts: [],
        });
      } else {
        console.warn("[TokenSoulPanel] token balance refresh failed", error);
        setTokenBalanceState({
          status: "error",
          message: t("tradeControls.tokenBalanceUnavailable"),
        });
      }
    }
  }

  async function refreshSettlementReceiptState() {
    if (!parsedMint || !connected || !publicKey) {
      setSettlementReceiptState({ status: "idle" });
      return;
    }

    try {
      const [registry, candidates] = await Promise.all([
        fetchReceiptRegistryAccount(connection, publicKey, parsedMint),
        fetchSettlementReceiptCandidates(connection, publicKey, parsedMint),
      ]);
      setSettlementReceiptState({
        status: "loaded",
        activeReceiptCount:
          registry?.registry.activeReceipts ??
          BigInt(candidates.filter((candidate) => candidate.receipt.lifecycleState === "active").length),
        candidates,
      });
    } catch (error) {
      console.warn("[TokenSoulPanel] settlement receipt refresh failed", error);
      setSettlementReceiptState({
        status: "error",
        message: t("settlement.stateUnavailable"),
      });
    }
  }

  async function refreshSolBalance() {
    if (!connected || !publicKey) {
      setSolBalanceState({ status: "idle" });
      return;
    }

    try {
      const lamports = await connection.getBalance(publicKey, "confirmed");
      setSolBalanceState({ status: "loaded", lamports });
    } catch (error) {
      console.warn("[TokenSoulPanel] SOL balance refresh failed", error);
      setSolBalanceState({
        status: "error",
        message: t("tradeControls.solBalanceUnavailable"),
      });
    }
  }

  async function handleBuy() {
    if (!parsedMint || isPaused || buyState.status === "buying") {
      return;
    }

    if (!isRiskAcknowledgedForSubmit(riskAcknowledged)) {
      setBuyState({ status: "error", message: t("riskRequired") });
      return;
    }

    setTradeGenerationMoment(null);
    setPreSignReview(null);
    setBuyState({ status: "buying" });
    try {
      const result = await submitWalletBuy({
        connection,
        payer: publicKey,
        connected,
        sendTransaction,
        mint: parsedMint,
        solAmount,
        slippagePercent,
        curve: curveLoadState.status === "loaded" ? curveLoadState.curve : null,
        onPreSignReview: setPreSignReview,
      });
      setBuyState({ status: "success", ...result });
      const [refreshedSoul] = await Promise.all([
        refreshSoul(),
        refreshCurve(),
        refreshTokenBalance(),
        refreshSolBalance(),
      ]);
      if (refreshedSoul && refreshedSoul.lastSvgLen > 0) {
        setTradeGenerationMoment({
          action: "buy",
          generation: refreshedSoul.generationCount.toString(),
          signature: result.signature,
          svg: refreshedSoul.lastSvg,
          animationProfile: animationProfileForSoul({
            soul: refreshedSoul,
            evolutionDisplay: evolutionDisplayForSoul({ soul: refreshedSoul }),
          }),
          provenance:
            result.generationProvenance ??
            fallbackGenerationProvenance({
              soul: refreshedSoul,
              signature: result.signature,
              action: "buy",
              amount: result.solInLamports - (result.solInLamports * 10n / 10_000n),
              trader: publicKey,
              tokenAccount:
                publicKey && parsedMint
                  ? getAssociatedTokenAddressSync(
                      parsedMint,
                      publicKey,
                      false,
                      TOKEN_2022_PROGRAM_ID,
                    )
                  : null,
              mint: parsedMint,
              generation: refreshedSoul.generationCount,
            }),
        });
      }
    } catch (error) {
      setBuyState({
        status: "error",
        message: t(`walletErrors.buy.${classifyWalletActionError(error)}`),
      });
    }
  }

  async function handleSell() {
    if (!parsedMint || isPaused || sellState.status === "selling") {
      return;
    }

    if (!isRiskAcknowledgedForSubmit(riskAcknowledged)) {
      setSellState({ status: "error", message: t("riskRequired") });
      return;
    }

    setTradeGenerationMoment(null);
    setPreSignReview(null);
    setSellState({ status: "selling" });
    try {
      const result = await submitWalletSell({
        connection,
        payer: publicKey,
        connected,
        sendTransaction,
        mint: parsedMint,
        tokenAmount: sellTokenAmount,
        slippagePercent: sellSlippagePercent,
        curve: curveLoadState.status === "loaded" ? curveLoadState.curve : null,
        settlementMode,
        settlementCandidates:
          settlementReceiptState.status === "loaded" ? settlementReceiptState.candidates : undefined,
        activeReceiptCount:
          settlementReceiptState.status === "loaded"
            ? settlementReceiptState.activeReceiptCount
            : undefined,
        expectedSettlement: sellSettlementExpectation,
        onPreSignReview: setPreSignReview,
      });
      setSellState({ status: "success", ...result });
      const [refreshedSoul] = await Promise.all([
        refreshSoul(),
        refreshCurve(),
        refreshTokenBalance(),
        refreshSolBalance(),
        refreshSettlementReceiptState(),
      ]);
      if (refreshedSoul && refreshedSoul.lastSvgLen > 0) {
        setTradeGenerationMoment({
          action: "sell",
          generation: refreshedSoul.generationCount.toString(),
          signature: result.signature,
          svg: refreshedSoul.lastSvg,
          animationProfile: animationProfileForSoul({
            soul: refreshedSoul,
            evolutionDisplay: evolutionDisplayForSoul({ soul: refreshedSoul }),
          }),
          provenance:
            result.generationProvenance ??
            fallbackGenerationProvenance({
              soul: refreshedSoul,
              signature: result.signature,
              action: "sell",
              amount: result.tokenIn,
              trader: publicKey,
              tokenAccount: result.sellerTokenAccount,
              mint: parsedMint,
              generation: refreshedSoul.generationCount,
            }),
        });
      }
    } catch (error) {
      if (isSettlementPreviewMismatchError(error)) {
        setSellState({ status: "error", message: t("settlement.sourceMismatch") });
        return;
      }
      setSellState({
        status: "error",
        message: t(`walletErrors.sell.${classifyWalletActionError(error)}`),
      });
    }
  }

  async function handleDirectTransfer() {
    if (!parsedMint || isPaused || directTransferState.status === "transferring") {
      return;
    }

    setDirectTransferState({ status: "transferring" });
    setPreSignReview(null);
    try {
      const result = await submitWalletDirectTransfer({
        connection,
        payer: publicKey,
        connected,
        sendTransaction,
        mint: parsedMint,
        recipientOwner: transferRecipient,
        tokenAmount: transferTokenAmount,
        settlementMode,
        settlementCandidates:
          settlementReceiptState.status === "loaded" ? settlementReceiptState.candidates : undefined,
        activeReceiptCount:
          settlementReceiptState.status === "loaded"
            ? settlementReceiptState.activeReceiptCount
            : undefined,
        expectedSettlement: directTransferSettlementExpectation,
        onPreSignReview: setPreSignReview,
      });
      setDirectTransferState({ status: "success", ...result });
      await Promise.all([
        refreshTokenBalance(),
        refreshSoul(),
        refreshCurve(),
        refreshSettlementReceiptState(),
      ]);
    } catch (error) {
      if (isSettlementPreviewMismatchError(error)) {
        setDirectTransferState({ status: "error", message: t("settlement.sourceMismatch") });
        return;
      }
      const rawMessage = error instanceof Error ? error.message : String(error);
      if (/valid recipient wallet/i.test(rawMessage)) {
        setDirectTransferState({
          status: "error",
          message: t("directTransfer.validation.invalidRecipient"),
        });
        return;
      }
      if (/Connect a devnet wallet/i.test(rawMessage)) {
        setDirectTransferState({
          status: "error",
          message: t("directTransfer.connectWallet"),
        });
        return;
      }
      if (/Insufficient token balance/i.test(rawMessage)) {
        setDirectTransferState({
          status: "error",
          message: t("directTransfer.amountExceedsBalance"),
        });
        return;
      }
      if (/token amount/i.test(rawMessage)) {
        setDirectTransferState({
          status: "error",
          message: t("directTransfer.invalidAmount"),
        });
        return;
      }
      const code = classifyDirectTransferError(error);
      setDirectTransferState({
        status: "error",
        code,
        message: directTransferErrorMessage(code, {
          directTransferBoundaryRejected: t("directTransfer.warnings.directTransferBoundaryRejected"),
          directTransferHookMetasMissing: t("directTransfer.warnings.directTransferHookMetasMissing"),
          directTransferRegistryMissing: t("directTransfer.warnings.directTransferRegistryMissing"),
          directTransferUnsupportedHook: t("directTransfer.warnings.directTransferUnsupportedHook"),
          directTransferPreflightFailed: t("directTransfer.warnings.directTransferPreflightFailed"),
        }),
      });
    }
  }

  const curveView =
    curveLoadState.status === "loaded" ? buildCurveEconomicsView(curveLoadState.curve) : null;
  const currentPriceLabel = resolveTokenDetailFieldLabel({
    status: curveLoadState.status,
    loadedValue: curveView?.currentPrice,
    loadingLabel: t("lifecycle.loadingPrice"),
    unavailableLabel: t("unavailable"),
  });
  const percentMintedLabel = resolveTokenDetailFieldLabel({
    status: curveLoadState.status,
    loadedValue: curveView?.percentMinted,
    loadingLabel: t("lifecycle.loadingProgress"),
    unavailableLabel: t("unavailable"),
  });
  const tokenBalanceText =
    tokenBalanceState.status === "loaded"
      ? tokenBalanceState.amount
      : tokenBalanceState.status === "loading"
        ? t("tradeControls.loading")
        : tokenBalanceState.status === "error"
          ? tokenBalanceState.message
          : connected
            ? "0"
            : t("tradeControls.connectWallet");
  const solBalanceText =
    solBalanceState.status === "loaded"
      ? formatSolAmount(BigInt(solBalanceState.lamports))
      : solBalanceState.status === "loading"
        ? t("tradeControls.loading")
        : solBalanceState.status === "error"
          ? solBalanceState.message
          : connected
            ? "0"
            : t("tradeControls.connectWallet");
  const buyLockFee = buyLamports !== null ? calculateLockFee(buyLamports) : null;
  const buyPriceImpact =
    curveLoadState.status === "loaded" && buyLamports !== null && buyQuote !== null
      ? estimateTradePriceImpact({
          curve: curveLoadState.curve,
          quoteAmount: buyQuote,
          solAmount: buyLamports - (buyLockFee ?? 0n),
          side: "buy",
        })
      : null;
  const sellPriceImpact =
    curveLoadState.status === "loaded" && requestedSellBaseUnits !== null && sellQuote !== null
      ? estimateTradePriceImpact({
          curve: curveLoadState.curve,
          quoteAmount: requestedSellBaseUnits,
          solAmount: sellQuote,
          side: "sell",
        })
      : null;
  const soulRarity = useMemo(() => {
    if (loadState.status !== "loaded" || loadState.soul.generationCount === 0n) {
      return null;
    }
    return deriveSoulRarity({
      tokenMint: mint,
      soul: loadState.soul.provenanceSoul.toBase58(),
      generation: loadState.soul.generationCount,
      sequence: loadState.soul.claimCount,
      artTheme: artThemeLabel,
      seedHash: loadState.soul.provenanceSeedHashHex,
      side: provenanceSideToTradeAction(loadState.soul.provenanceSide),
      amount: loadState.soul.provenanceAmount,
      trader: loadState.soul.provenanceTrader.toBase58(),
      tokenAccount: loadState.soul.provenanceTokenAccount.toBase58(),
    });
  }, [artThemeLabel, loadState, mint]);
  const latestEvolutionDisplay =
    loadState.status === "loaded"
      ? evolutionDisplayForSoul({ soul: loadState.soul, rarity: soulRarity })
      : null;
  const latestAnimationProfile =
    loadState.status === "loaded"
      ? animationProfileForSoul({
          soul: loadState.soul,
          evolutionDisplay: latestEvolutionDisplay,
        })
      : null;
  const soulSeedHash =
    loadState.status === "loaded" && loadState.soul.provenanceSeedHashHex
      ? loadState.soul.provenanceSeedHashHex
      : t("unavailable");
  const buyDisabledReason = getTradeDisabledReason({
    action: "buy",
    connected,
    hasPublicKey: Boolean(publicKey),
    riskAcknowledged,
    curveStatus: curveLoadState.status,
    isGraduated,
    hasValidQuote: Boolean(buyQuote),
    isPaused,
    isBusy: buyState.status === "buying",
  });
  const sellDisabledReason = getTradeDisabledReason({
    action: "sell",
    connected,
    hasPublicKey: Boolean(publicKey),
    riskAcknowledged,
    curveStatus: curveLoadState.status,
    isGraduated,
    hasValidQuote: Boolean(sellQuote),
    isPaused,
    isBusy: sellState.status === "selling",
    tokenBalanceStatus: tokenBalanceState.status,
    tokenBalanceBaseUnits:
      tokenBalanceState.status === "loaded" ? tokenBalanceState.baseUnits : undefined,
    requestedSellBaseUnits: requestedSellBaseUnits ?? undefined,
  });
  const directTransferDisabledReason = getDirectTransferDisabledReason({
    connected,
    hasPublicKey: Boolean(publicKey),
    isPaused,
    isBusy: directTransferState.status === "transferring",
    tokenBalanceStatus: tokenBalanceState.status,
    tokenBalanceBaseUnits:
      tokenBalanceState.status === "loaded" ? tokenBalanceState.baseUnits : undefined,
    requestedTransferBaseUnits: requestedTransferBaseUnits ?? undefined,
    hasRecipient: transferRecipient.trim().length > 0,
  });
  const buyHelp = buyDisabledReason
    ? t(`tradeDisabled.${buyDisabledReason}`, { action: t("buy") })
    : t("tradeReady.buy");
  const sellHelp = sellDisabledReason
    ? t(`tradeDisabled.${sellDisabledReason}`, { action: t("sell") })
    : t("tradeReady.sell");
  const directTransferHelp = directTransferDisabledReason
    ? directTransferDisabledReason === "paused"
      ? t("tradeDisabled.paused")
      : t(`directTransfer.${directTransferDisabledReason}`)
    : t("directTransfer.ready");
  const buyPresetOptions: TradePreset[] = [
    ...BUY_PRESET_SOL_AMOUNTS.map((amount) => ({
      key: `buy-${amount}`,
      label: `${amount} SOL`,
      value: amount,
    })),
    {
      key: "buy-mt-gate",
      label: t("tradeControls.buyPresetMtGate"),
      value: mtGateQuickBuy.status === "ready" ? mtGateQuickBuy.solAmount : "",
      disabled: mtGateQuickBuy.status !== "ready",
      helper:
        mtGateQuickBuy.status === "ready"
          ? t("tradeControls.mtGateEstimateReady", {
              sol: mtGateQuickBuy.solAmount,
              tokens: mtGateQuickBuy.estimatedTokens,
              minimum: mtGateQuickBuy.minimumTokens,
            })
          : undefined,
    },
  ];
  const mtGateEstimateText =
    mtGateQuickBuy.status === "ready"
      ? t("tradeControls.mtGateEstimateReady", {
          sol: mtGateQuickBuy.solAmount,
          tokens: mtGateQuickBuy.estimatedTokens,
          minimum: mtGateQuickBuy.minimumTokens,
        })
      : mtGateQuickBuy.status === "met"
        ? t("tradeControls.mtGateEstimateMet")
        : t(`tradeControls.mtGateEstimateUnavailable.${mtGateQuickBuy.reason}`);
  const sellPresetOptions: TradePreset[] = SELL_PRESET_PERCENTAGES.map((percentage) => {
    const value = deriveSellPresetAmount(
      tokenBalanceState.status === "loaded" ? tokenBalanceState.baseUnits : null,
      percentage,
    );
    return {
      key: `sell-${percentage}`,
      label: percentage === 100 ? t("tradeControls.sellPresetMax") : `${percentage}%`,
      value: value ?? "",
      disabled: value === null,
    };
  });
  const sellPresetUnavailableText =
    tokenBalanceState.status === "loaded" && tokenBalanceState.baseUnits > 0n
      ? null
      : tokenBalanceState.status === "loading"
        ? t("tradeControls.sellPresetUnavailable.loading")
        : tokenBalanceState.status === "error"
          ? t("tradeControls.sellPresetUnavailable.unavailable")
          : connected
            ? t("tradeControls.sellPresetUnavailable.empty")
            : t("tradeControls.sellPresetUnavailable.connectWallet");
  const walletBalanceBaseUnits =
    tokenBalanceState.status === "loaded" ? tokenBalanceState.baseUnits : undefined;
  const sellSettlementSource = selectSettlementSourceAccountForAmount(
    tokenBalanceState,
    requestedSellBaseUnits,
  );
  const directTransferSettlementSource = selectSettlementSourceAccountForAmount(
    tokenBalanceState,
    requestedTransferBaseUnits,
  );
  const sellSettlementPreview = buildBoundarySettlementDisplay({
    owner: publicKey,
    mint: parsedMint,
    currentBalanceBaseUnits: sellSettlementSource?.amount,
    movementAmountBaseUnits: requestedSellBaseUnits,
    settlementState: settlementMode,
    receiptState: settlementReceiptState,
    sourceTokenAccount: sellSettlementSource?.pubkey,
    sourceTokenBalanceBaseUnits: sellSettlementSource?.amount,
    blockedMessage: t("settlement.blockedUnavailable"),
  });
  const directTransferSettlementPreview = buildBoundarySettlementDisplay({
    owner: publicKey,
    mint: parsedMint,
    currentBalanceBaseUnits: directTransferSettlementSource?.amount,
    movementAmountBaseUnits: requestedTransferBaseUnits,
    settlementState: settlementMode,
    receiptState: settlementReceiptState,
    sourceTokenAccount: directTransferSettlementSource?.pubkey,
    sourceTokenBalanceBaseUnits: directTransferSettlementSource?.amount,
    blockedMessage: t("settlement.blockedUnavailable"),
  });
  const settlementPreviewLabels = {
    title: t("settlement.title"),
    burnMode: t("settlement.burnMode"),
    forfeitMode: t("settlement.forfeitMode"),
    body: t("settlement.body", {
      mode: settlementMode === "burned" ? t("settlement.burnMode") : t("settlement.forfeitMode"),
    }),
    selectedReceipts: t("settlement.selectedReceipts"),
    postWholeUnits: t("settlement.postWholeUnits"),
    blocked: t("settlement.blocked"),
    sourceSelectionNotice: t("settlement.sourceSelectionNotice"),
    sourceAccount: t("settlement.sourceAccount"),
    sourceBalance: t("settlement.sourceBalance"),
    activeReceipts: t("tradeControls.activeReceipts"),
    boundary: t("settlement.boundary"),
  };
  const sellSettlementExpectation = buildBoundarySettlementExpectation(
    sellSettlementPreview,
    sellSettlementSource,
  );
  const directTransferSettlementExpectation = buildBoundarySettlementExpectation(
    directTransferSettlementPreview,
    directTransferSettlementSource,
  );
  const sellSettlementBlocked = sellSettlementPreview.status === "blocked";
  const directTransferSettlementBlocked =
    directTransferSettlementPreview.status === "blocked";
  const lifecycleState = getSoulLifecycleState({
    soul: loadState.status === "loaded" ? loadState.soul : undefined,
    connected,
    walletPublicKey: publicKey ?? undefined,
    walletTokenBalanceBaseUnits:
      tokenBalanceState.status === "loaded" ? tokenBalanceState.baseUnits : undefined,
    isTokenBalanceLoading: tokenBalanceState.status === "loading",
  });
  const hasConfirmedClaimableSoul = lifecycleState.stage === "claimable";
  const lifecycleLabels = {
    eyebrow: t("lifecycleMachine.eyebrow"),
    title: t("lifecycleMachine.title"),
    body: t("lifecycleMachine.body"),
    currentState: t("lifecycleMachine.currentState"),
    nextAction: t("lifecycleMachine.nextAction"),
    generation: t("lifecycleMachine.generation", {
      generation: lifecycleState.generation,
    }),
    requiredBalance: t("lifecycleMachine.requiredBalance", {
      required: formatTokenDisplayAmount(lifecycleState.requiredBalance),
    }),
    steps: {
      noSoulYet: {
        label: t("lifecycleMachine.steps.noSoulYet.label"),
        description: t("lifecycleMachine.steps.noSoulYet.description"),
      },
      generatedUnclaimed: {
        label: t("lifecycleMachine.steps.generatedUnclaimed.label"),
        description: t("lifecycleMachine.steps.generatedUnclaimed.description"),
      },
      claimable: {
        label: t("lifecycleMachine.steps.claimable.label"),
        description: t("lifecycleMachine.steps.claimable.description"),
      },
      ineligible: {
        label: t("lifecycleMachine.steps.ineligible.label"),
        description: t("lifecycleMachine.steps.ineligible.description"),
      },
      claimedInCollection: {
        label: t("lifecycleMachine.steps.claimedInCollection.label"),
        description: t("lifecycleMachine.steps.claimedInCollection.description"),
      },
    },
    actions: {
      tradeToGenerate: t("lifecycleMachine.actions.tradeToGenerate"),
      connectWallet: t("lifecycleMachine.actions.connectWallet"),
      claimSoul: t("lifecycleMachine.actions.claimSoul"),
      buyOrHold: t("lifecycleMachine.actions.buyOrHold"),
      viewCollection: t("lifecycleMachine.actions.viewCollection"),
    },
  };
  const surfaceHeaderLabels = {
    eyebrow: t("surfaceHeader.eyebrow"),
    title: t("surfaceHeader.title"),
    identity: t("surfaceHeader.identity"),
    latestSoul: t("surfaceHeader.latestSoul"),
    trade: t("surfaceHeader.trade"),
    claim: t("surfaceHeader.claim"),
    progress: t("surfaceHeader.progress"),
    provenance: t("surfaceHeader.provenance"),
    artTheme: t("surfaceHeader.artTheme"),
    generations: t("labels.generations"),
    claims: t("labels.claims"),
    currentPrice: t("lifecycle.currentPrice"),
    percentMinted: t("lifecycle.percentMinted"),
    openTrade: t("surfaceHeader.openTrade"),
    openClaim: t("surfaceHeader.openClaim"),
    openTimeline: t("surfaceHeader.openTimeline"),
    openGallery: t("openTokenGallery"),
    nextAction: t("lifecycleMachine.nextAction"),
    mint: t("labels.mint"),
    motionCaveat: t("soulPreview.motionCaveat"),
  };
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
    capProgress: t("tokenMtSoulExplainer.capProgress", { claimCount }),
  };
  const marketOverviewLabels = {
    title: t("marketOverview.title"),
    body: t("marketOverview.body"),
    price: t("marketOverview.price"),
    reserve: t("marketOverview.reserve"),
    circulating: t("marketOverview.circulating"),
    progress: t("marketOverview.progress"),
    oneSolQuote: t("marketOverview.oneSolQuote"),
    maxBuy: t("marketOverview.maxBuy"),
    lockFee: t("marketOverview.lockFee"),
    live: t("tradeControls.live"),
    deprecated: t("tradeControls.selfDeprecated"),
  };
  const bondingCurveChartLabels = {
    title: t("bondingCurveChart.title"),
    eyebrow: t("bondingCurveChart.eyebrow"),
    body: t("bondingCurveChart.body"),
    summary: t("bondingCurveChart.summary", {
      currentPrice: currentPriceLabel,
      percentMinted: percentMintedLabel,
      totalMinted: curveView?.totalMinted ?? t("unavailable"),
    }),
    unavailableTitle: t("bondingCurveChart.unavailableTitle"),
    unavailableBody: t("bondingCurveChart.unavailableBody"),
    currentPoint: t("bondingCurveChart.currentPoint"),
    mintedProgress: t("bondingCurveChart.mintedProgress"),
    priceAxis: t("bondingCurveChart.priceAxis"),
    tokenAxis: t("bondingCurveChart.tokenAxis"),
    firstMtMarker: t("bondingCurveChart.firstMtMarker"),
    capMarker: t("bondingCurveChart.capMarker"),
    capHelper: t("bondingCurveChart.capHelper"),
    currentPrice: t("bondingCurveChart.stats.currentPrice"),
    totalMinted: t("bondingCurveChart.stats.totalMinted"),
    percentMinted: t("bondingCurveChart.stats.percentMinted"),
  };
  const proofRailLabels: TokenProofRailLabels = {
    eyebrow: t("proofRail.eyebrow"),
    title: t("proofRail.title"),
    body: t("proofRail.body"),
    tradeSoul: t("proofRail.tradeSoul"),
    openTrade: t("proofRail.openTrade"),
    claimStatus: t("proofRail.claimStatus"),
    latestSoul: t("proofRail.latestSoul"),
    holders: t("proofRail.holders"),
    collectors: t("proofRail.collectors"),
    progress: t("proofRail.progress"),
    lockedSol: t("proofRail.lockedSol"),
    provenance: t("proofRail.provenance"),
    advancedSummary: t("proofRail.advancedSummary"),
  };
  const proofRailItems: TokenProofRailItem[] = [
    {
      label: proofRailLabels.claimStatus,
      value: lifecycleLabels.steps[lifecycleState.stage].label,
      helper: lifecycleLabels.actions[lifecycleState.primaryAction],
      testId: "proof-rail-claim-status",
    },
    {
      label: proofRailLabels.latestSoul,
      value: t("proofRail.latestSoulValue", { generation: generationCount }),
      helper: hasLiveSoulSvg ? artThemeLabel : t("autoIssue.noPreview"),
      testId: "proof-rail-latest-soul",
    },
    {
      label: proofRailLabels.holders,
      value: tokenBalanceText,
      helper: t("proofRail.holdersHelper"),
      testId: "proof-rail-holders",
    },
    {
      label: proofRailLabels.collectors,
      value: claimCount,
      helper: t("proofRail.collectorsHelper"),
      testId: "proof-rail-collectors",
    },
    {
      label: proofRailLabels.progress,
      value: percentMintedLabel,
      helper: curveView?.totalMinted ?? t("unavailable"),
      testId: "proof-rail-progress",
    },
    {
      label: proofRailLabels.lockedSol,
      value: curveView?.cumulativeSol ?? t("unavailable"),
      helper: t("proofRail.lockedSolHelper"),
      testId: "proof-rail-locked-sol",
    },
    {
      label: proofRailLabels.provenance,
      value: soulSeedHash === t("unavailable") ? t("unavailable") : shortAddress(soulSeedHash),
      helper: t("proofRail.provenanceHelper"),
      testId: "proof-rail-provenance",
    },
  ];
  const proofRailProvenanceItems: TokenProofRailItem[] = [
    {
      label: t("labels.mint"),
      value: mint,
    },
    {
      label: t("surfaceHeader.provenance"),
      value: soulSeedHash,
    },
    {
      label: t("labels.soulPda"),
      value: addresses?.soul ?? t("unavailable"),
    },
  ];
  const quoteLabels = {
    youReceive: t("quote.youReceive"),
    minReceived: t("quote.minReceived"),
    lockFee: t("quote.lockFee"),
    priceImpact: t("quote.priceImpact"),
    balance: t("quote.balance"),
    route: t("quote.route"),
  };
  const soulPreviewLabels = {
    title: t("soulPreview.title"),
    body: t("soulPreview.body"),
    deterministicSeed: t("soulPreview.deterministicSeed"),
    claimStatus: t("soulPreview.claimStatus"),
    generated: t("soulPreview.generated"),
    notGenerated: t("soulPreview.notGenerated"),
    previewAlt: t("soulPreview.previewAlt"),
    motionCaveat: t("soulPreview.motionCaveat"),
  };
  const generationRulesCopy = buildGenerationRulesCopy(generationRulesT);

  return (
    <section className={joinClasses(uiPrimitives.panel, "relative isolate grid min-w-0 max-w-full gap-5 overflow-hidden p-4 sm:p-5")}>
      <AmbientSoulBackground variant="token" soulSvg={liveSvg} />
      <div className="relative z-10 grid min-w-0 max-w-full gap-6">
        <TokenDetailSurfaceHeader
          mint={mint}
          previewSvg={liveSvg}
          previewAlt={t("previewAlt")}
          artTheme={artThemeLabel}
          generationCount={generationCount}
          claimCount={claimCount}
          currentPrice={currentPriceLabel}
          percentMinted={percentMintedLabel}
          claimState={lifecycleLabels.steps[lifecycleState.stage].label}
          nextAction={lifecycleLabels.actions[lifecycleState.primaryAction]}
          animationProfile={latestAnimationProfile}
          evolutionDisplay={latestEvolutionDisplay}
          tradeHref="#trade-to-generate-souls"
          claimHref="#claim-soul"
          timelineHref="#token-timeline"
          galleryHref={`/${locale}/token/${mint}/gallery`}
          traitGroups={latestTraitGroups}
          labels={surfaceHeaderLabels}
        />

        <div className={joinClasses(uiPrimitives.denseRow, "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between")}>
          <div>
            <div className="mb-2">
              <PlatformBadge />
            </div>
            <p className="max-w-4xl text-sm text-white/55">{t("brandingNotice")}</p>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-white/70">{t("modelNotice")}</p>
          </div>
          <Link
            className={joinClasses(uiPrimitives.buttonSecondary, "shrink-0 px-4 py-3 text-center text-sm")}
            href={`/${locale}/tokens`}
          >
            {t("surfaceHeader.backToMarket")}
          </Link>
        </div>

        <TokenMtSoulExplainer
          claimCount={claimCount}
          copy={tokenMtSoulExplainerCopy}
        />

        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start" data-testid="token-detail-action-proof-layout">
          <TokenActionCenter
            eyebrow={t("lifecycle.tradeToGenerateSouls")}
            title={t("tradePanelTitle")}
            body={t("tradePanelBody")}
            claimPanel={(
              <div id="claim-soul">
                <TokenClaimActionCard
                  title={t("claimTitle")}
                  body={t("claimBody")}
                  statusLabel={lifecycleLabels.steps[lifecycleState.stage].label}
                  nextActionLabel={lifecycleLabels.actions[lifecycleState.primaryAction]}
                >
                  {parsedMint && loadState.status === "loaded" ? (
                    <ClaimButton
                      mint={parsedMint}
                      soul={loadState.soul}
                      walletTokenBalanceBaseUnits={
                        tokenBalanceState.status === "loaded" ? tokenBalanceState.baseUnits : undefined
                      }
                      isTokenBalanceLoading={tokenBalanceState.status === "loading"}
                      onSuccess={() => {
                        void refreshSoul();
                        void refreshTokenBalance();
                      }}
                    />
                  ) : (
                    <div className="grid gap-2">
                      <button className={joinClasses(uiPrimitives.buttonPrimary, "px-5 py-3")} disabled type="button">
                        {t("lifecycleMachine.actions.claimSoul")}
                      </button>
                      <p className="text-sm text-white/55">
                        {loadState.status === "loading" ? t("loadingSoul") : t("autoIssue.noPreview")}
                      </p>
                    </div>
                  )}
                </TokenClaimActionCard>
              </div>
            )}
          >
          {hasConfirmedClaimableSoul ? (
            <TokenClaimPriorityNotice
              title={t("tradeControls.claimableNextActionTitle")}
              body={t("tradeControls.claimableNextActionBody")}
              href="#claim-soul"
              ctaLabel={t("tradeControls.claimableNextActionCta")}
            />
          ) : null}
          <TokenTradeSoulCard
            eyebrow={t("tradeSoulCard.eyebrow")}
            title={t("tradeSoulCard.title")}
            body={t("tradeSoulCard.body")}
            buyLabel={t("buy")}
            sellLabel={t("sell")}
            activeTrade={activeTrade}
            onTradeChange={setActiveTrade}
            walletStatus={connected ? t("walletConnected") : t("walletPrompt")}
            walletAction={
              connected && publicKey ? (
                <span className={joinClasses(uiPrimitives.pill, "w-fit px-3 py-2 text-xs")}>
                  {shortAddress(publicKey.toBase58())}
                </span>
              ) : (
                <WalletConnectButton />
              )
            }
            controls={(
              <>
                <RiskAcknowledgementCheckbox
                  checked={riskAcknowledged}
                  onCheckedChange={setRiskAcknowledged}
                />

                {activeTrade === "buy" ? (
                  <div className={joinClasses(uiPrimitives.denseRow, "grid min-w-0 gap-3 p-4")}>
                    <label className="grid gap-2 text-sm text-white/65">
                      <span>{t("tradeControls.solAmount")}</span>
                      <input
                        className={joinClasses(uiPrimitives.input, "px-3 py-3 text-lg")}
                        inputMode="decimal"
                        min="0"
                        name="buy-sol-amount"
                        onChange={(event) => setSolAmount(event.target.value)}
                        placeholder="0.1"
                        step="0.001"
                        type="number"
                        value={solAmount}
                      />
                    </label>
                    <TokenTradePresetChips
                      label={t("tradeControls.quickBuyLabel")}
                      presets={buyPresetOptions}
                      unavailableLabel={mtGateEstimateText}
                      onSelect={setSolAmount}
                    />
                    <button
                      className={joinClasses(uiPrimitives.buttonPrimary, "w-full px-5 py-3")}
                      type="button"
                      disabled={Boolean(buyDisabledReason)}
                      onClick={handleBuy}
                    >
                      {buyState.status === "buying" ? t("tradeControls.openingWallet") : t("buy")}
                    </button>
                    <p className="break-words text-sm text-white/55">{buyHelp}</p>
                  </div>
                ) : (
                  <div className={joinClasses(uiPrimitives.denseRow, "grid min-w-0 gap-3 p-4")}>
                    <label className="grid gap-2 text-sm text-white/65">
                      <span>{t("tradeControls.sellTokenAmount")}</span>
                      <input
                        className={joinClasses(uiPrimitives.input, "px-3 py-3 text-lg")}
                        inputMode="decimal"
                        min="0"
                        name="sell-token-amount"
                        onChange={(event) => setSellTokenAmount(event.target.value)}
                        placeholder="1"
                        step="0.000001"
                        type="number"
                        value={sellTokenAmount}
                      />
                    </label>
                    <TokenTradePresetChips
                      label={t("tradeControls.quickSellLabel")}
                      presets={sellPresetOptions}
                      unavailableLabel={sellPresetUnavailableText}
                      onSelect={setSellTokenAmount}
                    />
                    {hasConfirmedClaimableSoul ? (
                      <TokenClaimPriorityNotice
                        title={t("tradeControls.sellBeforeClaimTitle")}
                        body={t("tradeControls.sellBeforeClaimBody")}
                        href="#claim-soul"
                        ctaLabel={t("tradeControls.sellBeforeClaimCta")}
                        note={t("tradeControls.sellBeforeClaimNote")}
                        testId="sell-before-claim-priority"
                      />
                    ) : null}
                    <TokenSellClaimSemanticsNotice
                      title={
                        hasConfirmedClaimableSoul
                          ? t("tradeControls.sellBeforeClaimWarningTitle")
                          : t("tradeControls.sellClaimWarningTitle")
                      }
                      body={
                        hasConfirmedClaimableSoul
                          ? t("tradeControls.sellBeforeClaimWarningBody")
                          : t("tradeControls.sellClaimWarningBody")
                      }
                    />
                    <button
                      className={joinClasses(
                        hasConfirmedClaimableSoul
                          ? uiPrimitives.buttonSecondary
                          : uiPrimitives.buttonPrimary,
                        "w-full px-5 py-3",
                      )}
                      type="button"
                      disabled={Boolean(sellDisabledReason) || sellSettlementBlocked}
                      onClick={handleSell}
                    >
                      {sellState.status === "selling" ? t("tradeControls.openingWallet") : t("sell")}
                    </button>
                    <p className="break-words text-sm text-white/55">{sellHelp}</p>
                  </div>
                )}
              </>
            )}
            quote={
              activeTrade === "buy" ? (
                <QuoteBreakdown
                  title={t("quote.buyTitle")}
                  quoteText={buyQuote ? `${formatTokenAmount(buyQuote)} tokens` : null}
                  minReceivedText={buyMinTokenOut ? `${formatTokenAmount(buyMinTokenOut)} tokens` : null}
                  lockFeeText={buyLockFee !== null ? `${formatSolAmount(buyLockFee)} SOL` : null}
                  priceImpactText={buyPriceImpact}
                  balanceText={`${t("tradeControls.solBalanceLabel")} ${solBalanceText}`}
                  routeText={t("quote.buyRoute")}
                  prompt={t("tradeControls.buyPreviewPrompt")}
                  labels={quoteLabels}
                />
              ) : (
                <QuoteBreakdown
                  title={t("quote.sellTitle")}
                  quoteText={sellQuote ? `${formatSolAmount(sellQuote)} SOL` : null}
                  minReceivedText={sellMinSolOut ? `${formatSolAmount(sellMinSolOut)} SOL` : null}
                  priceImpactText={sellPriceImpact}
                  balanceText={`${t("tradeControls.tokenBalanceLabel")} ${tokenBalanceText}`}
                  routeText={t("quote.sellRoute")}
                  prompt={t("tradeControls.sellPreviewPrompt")}
                  labels={quoteLabels}
                />
              )
            }
            advancedLabel={t("tradeControls.advanced")}
            advanced={(
              <>
                {activeTrade === "buy" ? (
                  <label className="grid gap-2 text-sm text-white/65">
                    <span>{t("tradeControls.slippagePercent")}</span>
                    <input
                      className={joinClasses(uiPrimitives.input, "px-3 py-2")}
                      inputMode="decimal"
                      min="0"
                      max="50"
                      name="buy-slippage"
                      onChange={(event) => setSlippagePercent(event.target.value)}
                      placeholder="1"
                      step="0.01"
                      type="number"
                      value={slippagePercent}
                    />
                  </label>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm text-white/65">
                      <span>{t("tradeControls.sellSlippagePercent")}</span>
                      <input
                        className={joinClasses(uiPrimitives.input, "px-3 py-2")}
                        inputMode="decimal"
                        min="0"
                        max="50"
                        name="sell-slippage"
                        onChange={(event) => setSellSlippagePercent(event.target.value)}
                        placeholder="1"
                        step="0.01"
                        type="number"
                        value={sellSlippagePercent}
                      />
                    </label>
                    <label className="grid gap-2 text-sm text-white/65">
                      <span>{t("settlement.modeLabel")}</span>
                      <select
                        className={joinClasses(uiPrimitives.input, "px-3 py-2")}
                        onChange={(event) =>
                          setSettlementMode(event.target.value as ReceiptSettlementState)
                        }
                        value={settlementMode}
                      >
                        <option value="burned">{t("settlement.burnMode")}</option>
                        <option value="forfeited">{t("settlement.forfeitMode")}</option>
                      </select>
                    </label>
                    <div className="sm:col-span-2">
                      <BoundarySettlementPreviewCard
                        preview={sellSettlementPreview}
                        labels={settlementPreviewLabels}
                      />
                    </div>
                  </div>
                )}

                <div className="grid min-w-0 gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:grid-cols-2">
                  <p className="text-sm font-semibold text-white sm:col-span-2">{t("directTransfer.title")}</p>
                  <p className="text-sm leading-6 text-white/55 sm:col-span-2">{t("directTransfer.body")}</p>
                  <label className="grid gap-2 text-sm text-white/65">
                    <span>{t("directTransfer.recipientLabel")}</span>
                    <input
                      className={joinClasses(uiPrimitives.input, "px-3 py-2")}
                      name="direct-transfer-recipient"
                      onChange={(event) => setTransferRecipient(event.target.value)}
                      placeholder={t("directTransfer.recipientPlaceholder")}
                      type="text"
                      value={transferRecipient}
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-white/65">
                    <span>{t("directTransfer.amountLabel")}</span>
                    <input
                      className={joinClasses(uiPrimitives.input, "px-3 py-2")}
                      inputMode="decimal"
                      min="0"
                      name="direct-transfer-token-amount"
                      onChange={(event) => setTransferTokenAmount(event.target.value)}
                      placeholder={t("directTransfer.amountPlaceholder")}
                      step="0.000001"
                      type="number"
                      value={transferTokenAmount}
                    />
                  </label>
                  <p className="break-words text-sm text-white/55 sm:col-span-2">{directTransferHelp}</p>
                  <p className="break-words text-sm text-white/55 sm:col-span-2">
                    {t("settlement.sourceSelectionNotice")}
                  </p>
                  <div className="sm:col-span-2">
                    <BoundarySettlementPreviewCard
                      preview={directTransferSettlementPreview}
                      labels={settlementPreviewLabels}
                    />
                  </div>
                  <button
                    className={joinClasses(uiPrimitives.buttonSecondary, "w-full px-5 py-3 sm:w-auto")}
                    type="button"
                    disabled={Boolean(directTransferDisabledReason) || directTransferSettlementBlocked}
                    onClick={handleDirectTransfer}
                  >
                    {directTransferState.status === "transferring"
                      ? t("tradeControls.openingWallet")
                      : t("transfer")}
                  </button>
                </div>

                <PreSignTransactionReviewCard review={preSignReview} />
              </>
            )}
          />
          </TokenActionCenter>

          <TokenDetailProofRail
            galleryHref={`/${locale}/token/${mint}/gallery`}
            items={proofRailItems}
            labels={proofRailLabels}
            provenanceDetails={proofRailProvenanceItems}
            tradeHref="#trade-to-generate-souls"
          />
        </div>

        <TokenTechnicalSections
          title={t("secondarySections.title")}
          body={t("secondarySections.body")}
        >
          <BondingCurveChart
            curve={curveLoadState.status === "loaded" ? curveLoadState.curve : null}
            currentPrice={currentPriceLabel}
            percentMinted={percentMintedLabel}
            totalMinted={curveView?.totalMinted ?? t("unavailable")}
            labels={bondingCurveChartLabels}
            soulFlow={{
              generationCount,
              claimCount,
              labels: {
                volumeMovement: t("bondingCurveChart.soulFlow.volumeMovement"),
                generationMarker: t("bondingCurveChart.soulFlow.generationMarker"),
                claimMarker: t("bondingCurveChart.soulFlow.claimMarker"),
                noMarkers: t("bondingCurveChart.soulFlow.noMarkers"),
                fixture: t("bondingCurveChart.soulFlow.fixture"),
              },
            }}
          />

          <SoulRarityPreviewCard
            previewSvg={liveSvg}
            rarity={soulRarity}
            generation={generationCount}
            seedHash={soulSeedHash}
            claimState={lifecycleLabels.steps[lifecycleState.stage].label}
            animationProfile={latestAnimationProfile}
            traitGroups={latestTraitGroups}
            labels={soulPreviewLabels}
          />

        {tradeGenerationMoment ? (
          <TradeGenerationMoment
            action={tradeGenerationMoment.action}
            amount={formatGenerationAmount(
              tradeGenerationMoment.provenance,
              tradeGenerationMoment.action,
              t("unavailable"),
            )}
            amountLabel={t("tradeGeneration.amount")}
            claimLabel={t(
              tradeGenerationMoment.action === "buy"
                ? "tradeGeneration.claimSoul"
                : "tradeGeneration.sellReviewClaimRules",
            )}
            claimSemantics={
              tradeGenerationMoment.action === "sell"
                ? t("tradeGeneration.sellVisualOnly")
                : undefined
            }
            generation={tradeGenerationMoment.generation}
            generatedLabel={t("tradeGeneration.generated", {
              generation: tradeGenerationMoment.generation,
            })}
            nextActionLabel={t(
              tradeGenerationMoment.action === "buy"
                ? "tradeGeneration.buyEyebrow"
                : "tradeGeneration.sellEyebrow",
            )}
            previewAlt={t("tradeGeneration.previewAlt")}
            seedHash={tradeGenerationMoment.provenance?.seedHash ?? t("unavailable")}
            seedHashLabel={t("tradeGeneration.seedHash")}
            signature={tradeGenerationMoment.signature}
            signatureLabel={t(
              tradeGenerationMoment.action === "buy"
                ? "tradeGeneration.buySignature"
                : "tradeGeneration.sellSignature",
            )}
            side={t(
              tradeGenerationMoment.action === "buy"
                ? "tradeGeneration.buySide"
                : "tradeGeneration.sellSide",
            )}
            sideLabel={t("tradeGeneration.side")}
            tradeAgainLabel={t("tradeGeneration.tradeAgain")}
            trader={shortAddress(
              tradeGenerationMoment.provenance?.trader.toBase58() ?? "",
            ) || t("unavailable")}
            traderLabel={t("tradeGeneration.trader")}
            transactionHref={
              tradeGenerationMoment.provenance?.explorerUrl ??
              explorerTxUrl(tradeGenerationMoment.signature)
            }
            transactionLabel={t("tradeGeneration.transaction")}
            viewGalleryLabel={t("tradeGeneration.viewCollection")}
            viewTokenGalleryHref={`/${locale}/token/${mint}/gallery`}
            svg={tradeGenerationMoment.svg}
            animationProfile={tradeGenerationMoment.animationProfile}
            onTradeAgain={() => setTradeGenerationMoment(null)}
          />
        ) : null}

        <div id="token-timeline">
          <TokenTimeline mint={mint} />
        </div>

        <SoulLifecycleStateMachine
          state={lifecycleState}
          labels={lifecycleLabels}
          claimHref="#claim-soul"
          galleryHref={`/${locale}/token/${mint}/gallery`}
          tradeHref="#trade-to-generate-souls"
        />

        {buyState.status === "success" ? (
          <TokenTradeSuccessCard
            title={t("tradeControls.buyCompleteTitle")}
            body={t("tradeControls.buyCompleteBody")}
            detailsLabel={t("tradeControls.tradeEvidence")}
            evidence={[
              {
                label: t("tradeControls.finalizedBuyLabel"),
                value: t("tradeControls.finalizedBuy", { signature: buyState.signature }),
              },
              {
                label: t("tradeControls.minimumTokenOutLabel"),
                value: formatTokenAmount(buyState.minAmountOut),
              },
              ...(buyState.nftMint
                ? [
                    {
                      label: t("autoIssue.nftMintedLabel"),
                      value: t("autoIssue.nftMinted", { mint: buyState.nftMint }),
                    },
                  ]
                : []),
            ]}
          />
        ) : null}

        {buyState.status === "error" ? (
          <TokenTradeErrorAlert message={buyState.message} />
        ) : null}

        {sellState.status === "success" ? (
          <TokenTradeSuccessCard
            title={t("tradeControls.sellCompleteTitle")}
            body={t("tradeControls.sellCompleteBody")}
            detailsLabel={t("tradeControls.tradeEvidence")}
            evidence={[
              {
                label: t("tradeControls.finalizedSellLabel"),
                value: t("tradeControls.finalizedSell", { signature: sellState.signature }),
              },
              {
                label: t("tradeControls.soldLabel"),
                value: formatTokenAmount(sellState.tokenIn),
              },
              {
                label: t("tradeControls.minimumSolOutLabel"),
                value: formatSolAmount(sellState.minAmountOut),
              },
              {
                label: t("tradeControls.tokenAccountLabel"),
                value: sellState.sellerTokenAccount.toBase58(),
              },
              ...(sellState.settlement.required
                ? [
                    {
                      label: t("settlement.selectedReceipts"),
                      value: sellState.settlement.selectedReceipts
                        .map((receipt) => receipt.receiptAccount.toBase58())
                        .join(", "),
                    },
                  ]
                : []),
            ]}
          />
        ) : null}

        {sellState.status === "error" ? (
          <TokenTradeErrorAlert message={sellState.message} />
        ) : null}

        {directTransferState.status === "success" ? (
          <div className={joinClasses(uiPrimitives.statusNeutral, "break-all text-sm text-soul-mint")} role="status">
            {t("directTransfer.success", { signature: directTransferState.signature })}
            <br />
            {t("directTransfer.sourceAccount", {
              account: directTransferState.sourceTokenAccount.toBase58(),
            })}
            <br />
            {t("directTransfer.destinationAccount", {
              account: directTransferState.destinationTokenAccount.toBase58(),
            })}
            <br />
            {formatDirectTransferAmount(directTransferState.amount)} tokens
            {directTransferState.settlement.required ? (
              <>
                <br />
                {t("settlement.selectedReceipts")}:{" "}
                {directTransferState.settlement.selectedReceipts
                  .map((receipt) => receipt.receiptAccount.toBase58())
                  .join(", ")}
              </>
            ) : null}
          </div>
        ) : null}

        {directTransferState.status === "error" ? (
          <p className={joinClasses(uiPrimitives.statusError, "break-words text-sm text-white/75")} role="alert">
            {directTransferState.message}
          </p>
        ) : null}

        {parsedMint && loadState.status === "loaded" && isGraduated ? (
          <div className={joinClasses(uiPrimitives.denseRow, "border-soul-mint/30 bg-soul-mint/10 p-4")}>
            <div className="mb-3">
              <p className="text-sm font-semibold text-white">{t("postGraduationTitle")}</p>
              <p className="text-sm text-white/55">{t("postGraduationBody")}</p>
            </div>
            <GenerateAgainButton
              mint={parsedMint}
              selfDeprecated={isGraduated}
              nextGeneration={loadState.soul.generationCount + 1n}
              onSuccess={refreshSoul}
            />
          </div>
        ) : null}

        <details className={joinClasses(uiPrimitives.card, "group p-4")}>
          <summary className="cursor-pointer list-none text-sm font-semibold text-white/75 transition group-open:text-white">
            {t("lifecycleMachine.technicalDetails")}
          </summary>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-4">
              <GenerationRulesCard copy={generationRulesCopy} />

              <MarketCurveOverview
                currentPrice={currentPriceLabel}
                cumulativeSol={curveView?.cumulativeSol ?? t("unavailable")}
                totalMinted={curveView?.totalMinted ?? t("unavailable")}
                percentMinted={percentMintedLabel}
                oneSolQuote={curveView?.oneSolQuote ?? t("unavailable")}
                selfDeprecated={isGraduated}
                labels={marketOverviewLabels}
              />

              <LifecycleCurveVisual
                currentPrice={currentPriceLabel}
                percentMinted={percentMintedLabel}
                selfDeprecated={isGraduated}
                heading={t("lifecycle.bondingCurve")}
                currentPriceLabel={t("lifecycle.currentPrice")}
                progressLabel={t("lifecycle.percentMinted")}
                tradePromptLabel={t("lifecycle.tradeToGenerateSouls")}
                spreadLabel={t("lifecycle.spreadCurveVisual")}
                liveStatus={t("tradeControls.live")}
                deprecatedStatus={t("tradeControls.selfDeprecated")}
              />
            </div>
            <p className="break-words text-sm text-white/60">
              {t("rpcDescription", { endpoint: getRpcEndpoint() })}
            </p>
            <dl className="grid min-w-0 max-w-full gap-3 text-sm sm:grid-cols-2">
              <MetadataRow label={t("labels.mint")} value={mint} />
              <MetadataRow
                label={t("labels.soulPda")}
                value={"soul" in (addresses ?? {}) ? addresses?.soul ?? t("unavailable") : t("unavailable")}
              />
              <MetadataRow
                label={t("labels.curvePda")}
                value={"curve" in (addresses ?? {}) ? addresses?.curve ?? t("unavailable") : t("unavailable")}
              />
              <MetadataRow label={t("labels.generations")} value={generationCount} />
              <MetadataRow label={t("labels.claims")} value={claimCount} />
              <MetadataRow label={t("labels.selfDeprecated")} value={isGraduated ? t("yes") : t("no")} />
            </dl>
            <CurveEconomicsPanel curveLoadState={curveLoadState} />
            {addresses && "error" in addresses ? (
              <div className="break-words rounded-2xl border border-white/15 bg-white/10 p-4 text-sm text-white/75">
                {t("pdaUnavailable", { message: addresses.error ?? t("derivePdaError") })}
              </div>
            ) : null}
            <SoulStatus loadState={loadState} />
            <CurveStatus curveLoadState={curveLoadState} />
          </div>
        </details>
        </TokenTechnicalSections>
      </div>
    </section>
  );
}

function CurveEconomicsPanel({ curveLoadState }: { curveLoadState: CurveLoadState }) {
  const t = useTranslations("token");
  const fixedEconomicsCopy = formatFixedEconomicsCopy({
    protocolFixedEconomics: t("economics.fixedCopy.protocolFixedEconomics"),
    decimalUnit: t("economics.fixedCopy.decimalUnit"),
    curve: t("economics.fixedCopy.curve"),
    supplyCap: t("economics.fixedCopy.supplyCap"),
    tokenUnit: t("economics.units.tokenUnit"),
    launchFee: t("economics.fixedCopy.launchFee"),
    buyLockFee: t("economics.fixedCopy.buyLockFee"),
    buyLockFeeSuffix: t("economics.fixedCopy.buyLockFeeSuffix"),
    noGraduation: t("economics.fixedCopy.noGraduation"),
    ammReferences: t("economics.fixedCopy.ammReferences"),
    supplyNotConfigurable: t("economics.supplyNotConfigurable"),
  });
  const viewLabels = {
    tokenUnit: t("economics.units.tokenUnit"),
    baseUnit: t("economics.units.baseUnit"),
    solPerToken: t("economics.units.solPerToken"),
    launchFee: t("economics.units.launchFee"),
    buyLockFee: t("economics.units.buyLockFee"),
    selfDeprecatedYes: t("yes"),
    selfDeprecatedNo: t("no"),
    supplyNotConfigurable: t("economics.supplyNotConfigurable"),
  };

  if (curveLoadState.status === "loading" || curveLoadState.status === "idle") {
    return (
      <section className="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-4">
        <p className="text-sm font-semibold text-white">{t("economics.title")}</p>
        <p className="text-sm text-white/55">{t("economics.loading")}</p>
        <p className="text-sm text-white/55">{fixedEconomicsCopy}</p>
      </section>
    );
  }

  if (curveLoadState.status === "error") {
    const isMissing = /not found|could not find|accountnotfound|not initialized/i.test(
      curveLoadState.message,
    );
    return (
      <section
        className="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-4"
        role={isMissing ? "status" : "alert"}
      >
        <p className="text-sm font-semibold text-white">{t("economics.title")}</p>
        <p className="text-sm text-white/55">
          {isMissing ? t("economics.empty") : t("economics.error", { message: curveLoadState.message })}
        </p>
        <p className="text-sm text-white/55">{fixedEconomicsCopy}</p>
      </section>
    );
  }

  const view = buildCurveEconomicsView(curveLoadState.curve, viewLabels);
  const rows = [
    [t("economics.labels.decimals"), view.decimals],
    [t("economics.labels.fixedSupply"), view.fixedSupply],
    [t("economics.labels.fixedSupplyBaseUnits"), view.fixedSupplyBaseUnits],
    [t("economics.labels.protocolCurveParams"), view.protocolCurveParams],
    [t("economics.labels.protocolFees"), view.protocolFees],
    [t("economics.labels.currentPrice"), view.currentPrice],
    [t("economics.labels.oneSolQuote"), view.oneSolQuote],
    [t("economics.labels.cumulativeSol"), view.cumulativeSol],
    [t("economics.labels.totalMinted"), view.totalMinted],
    [t("economics.labels.percentMinted"), view.percentMinted],
    [t("economics.labels.percentToDeprecated"), view.percentToDeprecated],
    [t("economics.labels.selfDeprecated"), view.selfDeprecated],
  ];

  return (
    <section className="grid gap-4 rounded-2xl border border-soul-mint/20 bg-soul-mint/10 p-4">
      <div>
        <p className="text-sm font-semibold text-white">{t("economics.title")}</p>
        <p className="mt-1 text-sm text-white/65">{fixedEconomicsCopy}</p>
        <p className="mt-1 text-sm text-soul-mint">{view.supplyNotConfigurable}</p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <MetadataRow key={label} label={label} value={value} />
        ))}
      </dl>
    </section>
  );
}

function CurveStatus({ curveLoadState }: { curveLoadState: CurveLoadState }) {
  const t = useTranslations("token");

  if (curveLoadState.status === "loading") {
    return <p className="text-sm text-white/55">{t("loadingCurve")}</p>;
  }

  if (curveLoadState.status === "loaded") {
    return (
      <p className="text-sm text-white/55">
        {t("curveStatus", {
          status: curveLoadState.curve.selfDeprecated ? t("curveDeprecated") : t("curveActive"),
        })}
      </p>
    );
  }

  if (curveLoadState.status === "error") {
    return <p className="break-words text-sm text-white/55">{t("curveUnavailable", { message: curveLoadState.message })}</p>;
  }

  return null;
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4">
      <dt className="text-white/45">{label}</dt>
      <dd className="mt-2 break-all font-mono text-white">{value}</dd>
    </div>
  );
}

function SoulStatus({ loadState }: { loadState: LoadState }) {
  const t = useTranslations("token");

  if (loadState.status === "loading") {
    return <p className="text-sm text-white/55">{t("loadingSoul")}</p>;
  }

  if (loadState.status === "loaded") {
    return (
      <p className="text-sm text-soul-mint">
        {t("loadedSoul", { bytes: loadState.soul.lastSvgLen })}
      </p>
    );
  }

  if (loadState.status === "error") {
    return <p className="break-words text-sm text-white/55">{t("fallbackPreview", { message: loadState.message })}</p>;
  }

  return null;
}

function provenanceSideToTradeAction(side: SoulAccount["provenanceSide"]): TradeAction | undefined {
  if (side === 1) {
    return "buy";
  }
  if (side === 2) {
    return "sell";
  }
  return undefined;
}

function estimateTradePriceImpact({
  curve,
  quoteAmount,
  solAmount,
  side,
}: {
  curve: BondingCurveAccount;
  quoteAmount: bigint;
  solAmount: bigint;
  side: TradeAction;
}): string | null {
  if (curve.totalMinted <= 0n || quoteAmount <= 0n || solAmount <= 0n) {
    return null;
  }
  const currentLamportsPerBaseUnit = Number(curve.cumulativeSol) / Number(curve.totalMinted);
  if (!Number.isFinite(currentLamportsPerBaseUnit) || currentLamportsPerBaseUnit <= 0) {
    return null;
  }
  const effectiveLamportsPerBaseUnit =
    side === "buy"
      ? Number(solAmount) / Number(quoteAmount)
      : Number(solAmount) / Number(quoteAmount);
  const impact = ((effectiveLamportsPerBaseUnit - currentLamportsPerBaseUnit) / currentLamportsPerBaseUnit) * 100;
  if (!Number.isFinite(impact)) {
    return null;
  }
  return `${impact >= 0 ? "+" : ""}${impact.toFixed(2)}%`;
}

function parseMint(mint: string): PublicKey | null {
  try {
    return new PublicKey(mint);
  } catch {
    return null;
  }
}

export function fallbackGenerationProvenance({
  soul,
  signature,
  action,
  amount,
  trader,
  tokenAccount,
  mint,
  generation,
}: {
  soul: SoulAccount;
  signature: string;
  action: TradeAction;
  amount: bigint;
  trader: PublicKey | null;
  tokenAccount: PublicKey | null;
  mint: PublicKey | null;
  generation: bigint | null;
}): GenerationProvenance | null {
  const latest = soul.latestGenerationProvenance;
  if (
    !latest ||
    !trader ||
    !tokenAccount ||
    !mint ||
    generation === null ||
    latest.side !== action ||
    latest.amount !== amount ||
    latest.generation !== generation ||
    !latest.trader.equals(trader) ||
    !latest.tokenAccount.equals(tokenAccount) ||
    !latest.tokenMint.equals(mint)
  ) {
    return null;
  }
  return {
    ...latest,
    signature,
    explorerUrl: explorerTxUrl(signature),
  };
}

function formatGenerationAmount(
  provenance: GenerationProvenance | null,
  action: TradeAction,
  unavailable: string,
): string {
  if (!provenance) {
    return unavailable;
  }
  return action === "buy"
    ? `${formatSolAmount(provenance.amount)} SOL`
    : `${formatTokenAmount(provenance.amount)} tokens`;
}

function shortAddress(address: string): string {
  if (address.length <= 8) {
    return address;
  }
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
