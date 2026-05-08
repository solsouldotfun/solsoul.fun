"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { uiPrimitives } from "./uiPrimitives";

export const RISK_DISCLAIMER_STORAGE_KEY = "solsoul:risk_disclaimer:accepted_at";
const RISK_DISCLAIMER_RESHOW_DAYS = 90;
const MS_PER_DAY = 1000 * 86400;

export type RiskDisclaimerDecision = {
  isOpen: boolean;
  acceptedAt?: string;
};

export function shouldShowRiskDisclaimer(acceptedAt: string | null, nowMs = Date.now()): boolean {
  if (!acceptedAt) {
    return true;
  }

  const acceptedAtMs = new Date(acceptedAt).getTime();
  if (!Number.isFinite(acceptedAtMs)) {
    return true;
  }

  const ageDays = (nowMs - acceptedAtMs) / MS_PER_DAY;
  return ageDays > RISK_DISCLAIMER_RESHOW_DAYS;
}

export function acceptRiskDisclaimer(
  storage: Pick<Storage, "setItem">,
  nowMs = Date.now(),
): RiskDisclaimerDecision {
  const acceptedAt = new Date(nowMs).toISOString();
  storage.setItem(RISK_DISCLAIMER_STORAGE_KEY, acceptedAt);
  return { isOpen: false, acceptedAt };
}

export function declineRiskDisclaimer(): RiskDisclaimerDecision {
  return { isOpen: true };
}

export function isRiskAcknowledgedForSubmit(riskAcknowledged: boolean): boolean {
  return riskAcknowledged;
}

export function normalizeRiskDisclaimerBullets(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function RiskDisclaimerModalView({
  isOpen,
  title,
  intro,
  bullets,
  acceptLabel,
  declineLabel,
  onAccept,
  onDecline,
}: {
  isOpen: boolean;
  title: string;
  intro: string;
  bullets: string[];
  acceptLabel: string;
  declineLabel: string;
  onAccept?: () => void;
  onDecline?: () => void;
}): ReactNode {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4 py-6 backdrop-blur-sm">
      <section
        aria-labelledby="risk-disclaimer-title"
        aria-modal="true"
        className={uiPrimitives.modalShell}
        role="dialog"
      >
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-soul-mint">
          SolSoul.fun
        </p>
        <h2 id="risk-disclaimer-title" className="text-2xl font-black sm:text-3xl">
          {title}
        </h2>
        <p className="mt-4 text-sm leading-6 text-white/70">{intro}</p>
        <ul className="mt-5 grid gap-3 text-sm text-white/80">
          {bullets.map((bullet) => (
            <li
              className="rounded-2xl border border-white/10 bg-white/5 p-3"
              key={bullet}
            >
              {bullet}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            className="rounded-xl border border-white/15 px-5 py-3 font-semibold text-white/80 transition hover:border-white/35"
            onClick={onDecline}
            type="button"
          >
            {declineLabel}
          </button>
          <button
            className={uiPrimitives.buttonPrimary}
            onClick={onAccept}
            type="button"
          >
            {acceptLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function RiskAcknowledgementCheckbox({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const t = useTranslations("riskDisclaimer");

  return (
    <label className="flex items-start gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 text-sm text-white/80">
      <input
        checked={checked}
        className="mt-1 h-4 w-4 shrink-0 accent-soul-mint"
        onChange={(event) => onCheckedChange(event.target.checked)}
        type="checkbox"
      />
      <span>
        <span className="font-semibold">{t("acknowledgeLabel")}</span>
        <span className="block text-white/60">{t("acknowledgeHelp")}</span>
      </span>
    </label>
  );
}

export function RiskDisclaimerModal(): ReactNode {
  const t = useTranslations("riskDisclaimer");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      setIsOpen(
        shouldShowRiskDisclaimer(
          window.localStorage.getItem(RISK_DISCLAIMER_STORAGE_KEY),
        ),
      );
    } catch (error) {
      console.warn("[app] risk disclaimer localStorage unavailable", error);
      setIsOpen(true);
    }
  }, []);

  function handleAccept() {
    try {
      setIsOpen(acceptRiskDisclaimer(window.localStorage).isOpen);
    } catch (error) {
      console.warn("[app] risk disclaimer acceptance could not be persisted", error);
      setIsOpen(false);
    }
  }

  function handleDecline() {
    setIsOpen(declineRiskDisclaimer().isOpen);
  }

  return (
    <RiskDisclaimerModalView
      acceptLabel={t("accept")}
      bullets={normalizeRiskDisclaimerBullets(t.raw("bullets"))}
      declineLabel={t("decline")}
      intro={t("intro")}
      isOpen={isOpen}
      title={t("title")}
      onAccept={handleAccept}
      onDecline={handleDecline}
    />
  );
}
