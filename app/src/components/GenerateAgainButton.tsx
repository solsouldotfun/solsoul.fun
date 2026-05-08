"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { generateSoul } from "sdk";
import {
  withPreSignTransactionReview,
  type PreSignTransactionReview,
} from "../lib/preSignReview";
import { classifyWalletActionError } from "../lib/walletActionErrors";
import { PreSignTransactionReviewCard } from "./PreSignTransactionReviewCard";
import { usePauseStatus } from "./PauseBanner";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

type GenerateAgainButtonProps = {
  mint: PublicKey;
  selfDeprecated: boolean;
  nextGeneration: bigint;
  onSuccess?: (signature: string) => void;
};

type GenerateAgainState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "success"; signature: string }
  | { status: "error"; message: string };

export type GenerateAgainDisabledReason = "paused" | "notGraduated" | "connectWallet";

export function getGenerateAgainDisabledReason(params: {
  connected: boolean;
  hasPublicKey: boolean;
  selfDeprecated: boolean;
  isPaused?: boolean;
}): GenerateAgainDisabledReason | null {
  if (params.isPaused) {
    return "paused";
  }

  if (!params.selfDeprecated) {
    return "notGraduated";
  }

  if (!params.connected || !params.hasPublicKey) {
    return "connectWallet";
  }

  return null;
}

export function syntheticSwapAmount(nextGeneration: bigint, nowMs = Date.now()): bigint {
  return (BigInt(nowMs) << 16n) ^ nextGeneration;
}

export function GenerateAgainButton({
  mint,
  selfDeprecated,
  nextGeneration,
  onSuccess,
}: GenerateAgainButtonProps) {
  const t = useTranslations("generateAgain");
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const { isPaused } = usePauseStatus();
  const [state, setState] = useState<GenerateAgainState>({ status: "idle" });
  const [preSignReview, setPreSignReview] = useState<PreSignTransactionReview | null>(null);
  const disabledReason = getGenerateAgainDisabledReason({
    connected,
    hasPublicKey: Boolean(publicKey),
    selfDeprecated,
    isPaused,
  });
  const isGenerating = state.status === "generating";

  async function handleGenerateAgain() {
    if (!publicKey || disabledReason || isGenerating) {
      return;
    }

    setState({ status: "generating" });
    setPreSignReview(null);

    try {
      const signature = await generateSoul({
        connection,
        mint,
        payer: publicKey,
        sendTransaction: withPreSignTransactionReview(sendTransaction, setPreSignReview),
        swapAmount: syntheticSwapAmount(nextGeneration),
        isBuy: true,
        commitment: "confirmed",
      });
      setState({ status: "success", signature });
      onSuccess?.(signature);
    } catch (error) {
      console.warn("[GenerateAgainButton] generation failed", error);
      setState({
        status: "error",
        message: t(`errors.${classifyWalletActionError(error)}`),
      });
    }
  }

  return (
    <div className="grid gap-3">
      <button
        className={joinClasses(uiPrimitives.buttonPrimary, "px-5 py-3")}
        type="button"
        disabled={Boolean(disabledReason) || isGenerating}
        onClick={handleGenerateAgain}
      >
        {isGenerating ? t("generating") : t("button")}
      </button>

      {disabledReason ? <p className="text-sm text-white/55">{t(`disabled.${disabledReason}`)}</p> : null}

      <PreSignTransactionReviewCard
        review={preSignReview}
        testId="generate-again-pre-sign-transaction-review"
      />

      {state.status === "success" ? (
        <div
          className={joinClasses(uiPrimitives.statusNeutral, "break-all text-sm text-soul-mint")}
          aria-live="polite"
          role="status"
        >
          {t("success", { signature: state.signature })}
        </div>
      ) : null}

      {state.status === "error" ? (
        <p
          className={joinClasses(uiPrimitives.statusError, "text-sm text-white/75")}
          role="alert"
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
