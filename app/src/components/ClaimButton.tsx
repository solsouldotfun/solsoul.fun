"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  MIN_CLAIM_BALANCE,
  claimSoul,
  getSoulClaimEligibility,
  resolveMtClaimQuantum,
  type SoulAccount,
  type SoulClaimEligibilityReason,
} from "sdk";
import { Link } from "@/i18n/navigation";
import { usePauseStatus } from "./PauseBanner";
import { formatTokenDisplayAmount } from "../lib/tokenFormatting";
import {
  withPreSignTransactionReview,
  type PreSignTransactionReview,
} from "../lib/preSignReview";
import { classifyWalletActionError } from "../lib/walletActionErrors";
import { PreSignTransactionReviewCard } from "./PreSignTransactionReviewCard";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

type ClaimButtonProps = {
  mint: PublicKey;
  soul: SoulAccount;
  walletTokenBalanceBaseUnits?: bigint;
  isTokenBalanceLoading?: boolean;
  onSuccess?: (nftMint: string) => void;
};

type ClaimState =
  | { status: "idle" }
  | { status: "claiming" }
  | {
      status: "success";
      nftMint: string;
      signature: string;
      claimedMint: string;
      soulGenerationCount: bigint;
      soulClaimCount: bigint;
    }
  | { status: "error"; message: string };

export type ClaimDisabledReason =
  | "paused"
  | "connectWallet"
  | "generateFirst"
  | "alreadyClaimed"
  | "balanceLoading"
  | "insufficientBalance"
  | "provenanceMissing"
  | "provenanceSellGenerated"
  | "provenanceSubWhole"
  | "provenanceWalletMismatch";

export function getRequiredClaimBalance(soul?: SoulAccount): bigint {
  return resolveMtClaimQuantum(soul?.minClaimBalance ?? MIN_CLAIM_BALANCE);
}

export function getClaimDisabledReason(params: {
  connected: boolean;
  hasPublicKey: boolean;
  walletPublicKey?: PublicKey;
  soul?: SoulAccount;
  isPaused?: boolean;
  walletTokenBalanceBaseUnits?: bigint;
  isTokenBalanceLoading?: boolean;
}): ClaimDisabledReason | null {
  if (params.isPaused) {
    return "paused";
  }

  if (!params.connected || !params.hasPublicKey) {
    return "connectWallet";
  }

  if (!params.soul || params.soul.lastSvgLen === 0) {
    return "generateFirst";
  }

  if (params.soul.claimCount >= params.soul.generationCount) {
    return "alreadyClaimed";
  }

  const provenanceEligibility = getSoulClaimEligibility({
    soul: params.soul,
    wallet: params.walletPublicKey,
  });
  const provenanceReason = claimEligibilityReasonToDisabledReason(
    provenanceEligibility.reason,
  );
  if (provenanceReason) {
    return provenanceReason;
  }

  if (params.isTokenBalanceLoading || params.walletTokenBalanceBaseUnits === undefined) {
    return "balanceLoading";
  }
  if (params.walletTokenBalanceBaseUnits < getRequiredClaimBalance(params.soul)) {
    return "insufficientBalance";
  }

  return null;
}

function claimEligibilityReasonToDisabledReason(
  reason: SoulClaimEligibilityReason | null,
): ClaimDisabledReason | null {
  if (reason === "missingProvenance") {
    return "provenanceMissing";
  }
  if (reason === "sellGenerated") {
    return "provenanceSellGenerated";
  }
  if (reason === "subWholeProvenance") {
    return "provenanceSubWhole";
  }
  if (reason === "walletMismatch") {
    return "provenanceWalletMismatch";
  }
  return null;
}

export function ClaimButton({
  mint,
  soul,
  walletTokenBalanceBaseUnits,
  isTokenBalanceLoading,
  onSuccess,
}: ClaimButtonProps) {
  const t = useTranslations("claim");
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const { isPaused } = usePauseStatus();
  const mintAddress = mint.toBase58();
  const [claimState, setClaimState] = useState<ClaimState>({ status: "idle" });
  const disabledReason = getClaimDisabledReason({
    connected,
    hasPublicKey: Boolean(publicKey),
    walletPublicKey: publicKey ? new PublicKey(publicKey.toBase58()) : undefined,
    soul,
    isPaused,
    walletTokenBalanceBaseUnits,
    isTokenBalanceLoading,
  });
  const isClaiming = claimState.status === "claiming";
  const successMatchesCurrentClaimInputs =
    claimState.status === "success" &&
    claimState.claimedMint === mintAddress &&
    claimState.soulGenerationCount === soul.generationCount &&
    claimState.soulClaimCount === soul.claimCount;
  const isClaimed = disabledReason === "alreadyClaimed";
  const shouldShowClaimSuccess =
    claimState.status === "success" &&
    claimState.claimedMint === mintAddress &&
    (successMatchesCurrentClaimInputs || disabledReason === "alreadyClaimed");
  const requiredClaimBalance = getRequiredClaimBalance(soul);
  const [preSignReview, setPreSignReview] =
    useState<PreSignTransactionReview | null>(null);

  async function handleClaim() {
    if (disabledReason || isClaiming) {
      return;
    }

    setClaimState({ status: "claiming" });
    setPreSignReview(null);

    try {
      if (!publicKey) {
        return;
      }

      const nftMint = Keypair.generate();
      const signature = await claimSoul({
        connection,
        mint,
        payer: publicKey,
        nftMint,
        sendTransaction: withPreSignTransactionReview(sendTransaction, setPreSignReview),
        commitment: "confirmed",
      });

      const nftMintAddress = nftMint.publicKey.toBase58();
      setClaimState({
        status: "success",
        nftMint: nftMintAddress,
        signature,
        claimedMint: mintAddress,
        soulGenerationCount: soul.generationCount,
        soulClaimCount: soul.claimCount,
      });
      onSuccess?.(nftMintAddress);
    } catch (error) {
      setClaimState({
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
        disabled={Boolean(disabledReason) || isClaiming || isClaimed}
        onClick={handleClaim}
      >
        {isClaiming ? t("claiming") : isClaimed ? t("claimed") : t("claim")}
      </button>

      {disabledReason ? (
        <p className="text-sm text-white/55">
          {t(`disabled.${disabledReason}`, {
            required: formatTokenDisplayAmount(requiredClaimBalance),
          })}
        </p>
      ) : null}

      {claimState.status === "success" && shouldShowClaimSuccess ? (
        <div
          className={joinClasses(uiPrimitives.statusNeutral, "grid gap-3 break-all text-sm text-soul-mint")}
          aria-live="polite"
          role="status"
        >
          <p>{t("success", { mint: claimState.nftMint })}</p>
          <details className="group">
            <summary className="cursor-pointer list-none text-sm font-semibold text-white/75 transition group-open:text-white">
              {t("technicalDetails")}
            </summary>
            <p className="mt-2">{t("signature", { signature: claimState.signature })}</p>
          </details>
          <Link
            className={joinClasses(uiPrimitives.buttonPrimary, "w-fit px-4 py-2")}
            href="/profile"
          >
            {t("viewInMySouls")}
          </Link>
        </div>
      ) : null}

      {claimState.status === "error" ? (
        <p className={joinClasses(uiPrimitives.statusError, "text-sm text-white/75")} role="alert">
          {claimState.message}
        </p>
      ) : null}

      <PreSignTransactionReviewCard
        review={preSignReview}
        testId="claim-pre-sign-transaction-review"
      />
    </div>
  );
}
