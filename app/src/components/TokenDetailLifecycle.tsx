"use client";

import type { PublicKey } from "@solana/web3.js";
import {
  MIN_CLAIM_BALANCE,
  getSoulClaimEligibility,
  resolveMtClaimQuantum,
  type SoulAccount,
  type SoulClaimEligibilityReason,
} from "sdk";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

export type SoulLifecycleStage =
  | "noSoulYet"
  | "generatedUnclaimed"
  | "claimable"
  | "ineligible"
  | "claimedInCollection";

export type SoulLifecyclePrimaryAction =
  | "tradeToGenerate"
  | "connectWallet"
  | "claimSoul"
  | "buyOrHold"
  | "viewCollection";

export type SoulLifecycleState = {
  stage: SoulLifecycleStage;
  activeStepIndex: number;
  primaryAction: SoulLifecyclePrimaryAction;
  generation: string;
  requiredBalance: bigint;
  eligibilityReason: SoulClaimEligibilityReason | null;
};

export function getSoulLifecycleState(params: {
  soul?: SoulAccount;
  connected: boolean;
  walletPublicKey?: PublicKey;
  walletTokenBalanceBaseUnits?: bigint;
  isTokenBalanceLoading?: boolean;
}): SoulLifecycleState {
  const requiredBalance = getRequiredLifecycleClaimBalance(params.soul);

  if (!params.soul || params.soul.generationCount === 0n || params.soul.lastSvgLen === 0) {
    return {
      stage: "noSoulYet",
      activeStepIndex: 0,
      primaryAction: "tradeToGenerate",
      generation: "0",
      requiredBalance,
      eligibilityReason: "noGeneratedSoul",
    };
  }

  if (params.soul.claimCount >= params.soul.generationCount) {
    return {
      stage: "claimedInCollection",
      activeStepIndex: 3,
      primaryAction: "viewCollection",
      generation: params.soul.generationCount.toString(),
      requiredBalance,
      eligibilityReason: "alreadyClaimed",
    };
  }

  const provenanceEligibility = getSoulClaimEligibility({
    soul: params.soul,
    wallet: params.walletPublicKey,
  });
  if (
    provenanceEligibility.reason === "missingProvenance" ||
    provenanceEligibility.reason === "sellGenerated" ||
    provenanceEligibility.reason === "subWholeProvenance" ||
    provenanceEligibility.reason === "walletMismatch"
  ) {
    return {
      stage: "ineligible",
      activeStepIndex: 2,
      primaryAction:
        provenanceEligibility.reason === "subWholeProvenance" ||
        provenanceEligibility.reason === "sellGenerated" ||
        provenanceEligibility.reason === "missingProvenance"
          ? "tradeToGenerate"
          : "connectWallet",
      generation: params.soul.generationCount.toString(),
      requiredBalance,
      eligibilityReason: provenanceEligibility.reason,
    };
  }

  if (
    !params.connected ||
    params.isTokenBalanceLoading ||
    params.walletTokenBalanceBaseUnits === undefined
  ) {
    return {
      stage: "generatedUnclaimed",
      activeStepIndex: 1,
      primaryAction: "connectWallet",
      generation: params.soul.generationCount.toString(),
      requiredBalance,
      eligibilityReason: provenanceEligibility.reason,
    };
  }

  const eligibility = getSoulClaimEligibility({
    soul: params.soul,
    wallet: params.walletPublicKey,
    walletTokenBalanceBaseUnits: params.walletTokenBalanceBaseUnits,
  });

  if (eligibility.claimable) {
    return {
      stage: "claimable",
      activeStepIndex: 2,
      primaryAction: "claimSoul",
      generation: params.soul.generationCount.toString(),
      requiredBalance,
      eligibilityReason: null,
    };
  }

  return {
    stage: "ineligible",
    activeStepIndex: 2,
    primaryAction: "buyOrHold",
    generation: params.soul.generationCount.toString(),
    requiredBalance,
    eligibilityReason: eligibility.reason,
  };
}

function getRequiredLifecycleClaimBalance(soul?: SoulAccount): bigint {
  return resolveMtClaimQuantum(soul?.minClaimBalance ?? MIN_CLAIM_BALANCE);
}

export function SoulLifecycleStateMachine({
  state,
  labels,
  claimHref,
  connectWalletHref = "#connect-wallet",
  galleryHref,
  tradeHref,
}: {
  state: SoulLifecycleState;
  labels: {
    eyebrow: string;
    title: string;
    body: string;
    currentState: string;
    nextAction: string;
    generation: string;
    requiredBalance: string;
    steps: Record<SoulLifecycleStage, { label: string; description: string }>;
    actions: Record<SoulLifecyclePrimaryAction, string>;
  };
  claimHref: string;
  connectWalletHref?: string;
  galleryHref: string;
  tradeHref: string;
}) {
  const orderedSteps: Array<{ stage: SoulLifecycleStage; index: number }> = [
    { stage: "noSoulYet", index: 0 },
    { stage: "generatedUnclaimed", index: 1 },
    { stage: state.stage === "ineligible" ? "ineligible" : "claimable", index: 2 },
    { stage: "claimedInCollection", index: 3 },
  ];
  const primaryHref =
    state.primaryAction === "claimSoul"
      ? claimHref
      : state.primaryAction === "viewCollection"
        ? galleryHref
        : state.primaryAction === "connectWallet"
          ? connectWalletHref
          : tradeHref;

  return (
    <section className={joinClasses(uiPrimitives.card, "p-5")}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soul-glow">
            {labels.eyebrow}
          </p>
          <h2 className="mt-2 text-3xl font-black text-white">{labels.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">{labels.body}</p>
        </div>
        <div className={joinClasses(uiPrimitives.denseRow, "p-4")}>
          <p className="text-xs uppercase tracking-[0.16em] text-white/45">
            {labels.currentState}
          </p>
          <p className="mt-2 text-xl font-black text-white">{labels.steps[state.stage].label}</p>
          <p className="mt-2 text-sm text-white/60">{labels.generation}</p>
          <p className="mt-1 text-sm text-white/60">{labels.requiredBalance}</p>
        </div>
      </div>

      <ol className="mt-5 grid gap-3 md:grid-cols-4">
        {orderedSteps.map(({ stage, index }) => {
          const isActive = state.activeStepIndex === index;
          const isPast = state.activeStepIndex > index;
          return (
            <li
              aria-current={isActive ? "step" : undefined}
              className={`rounded-2xl border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${
                isActive
                  ? "border-soul-mint bg-soul-mint/15 text-white"
                  : isPast
                    ? "border-soul-mint/25 bg-soul-mint/5 text-white/70"
                    : "border-white/10 bg-black/25 text-white/55"
              }`}
              key={`${index}-${stage}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.15em]">
                {index === 0 ? "01" : index === 1 ? "02" : index === 2 ? "03" : "04"}
              </p>
              <p className="mt-2 text-lg font-black">{labels.steps[stage].label}</p>
              <p className="mt-2 text-sm leading-6">{labels.steps[stage].description}</p>
            </li>
          );
        })}
      </ol>

      <div className={joinClasses(uiPrimitives.denseRow, "mt-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between")}>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-white/45">
            {labels.nextAction}
          </p>
          <p className="mt-1 text-xl font-black text-white">
            {labels.actions[state.primaryAction]}
          </p>
          <p className="mt-1 text-sm text-white/55">{labels.steps[state.stage].description}</p>
        </div>
        <a
          className={joinClasses(uiPrimitives.buttonPrimary, "px-5 py-3 text-center")}
          href={primaryHref}
        >
          {labels.actions[state.primaryAction]}
        </a>
      </div>
    </section>
  );
}

