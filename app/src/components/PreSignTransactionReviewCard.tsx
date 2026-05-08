"use client";

import { useTranslations } from "next-intl";
import type { PreSignInstructionReview, PreSignTransactionReview } from "@/lib/preSignReview";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

function instructionAccountSummary(
  instruction: PreSignInstructionReview,
  labels: {
    signer: string;
    nonSigner: string;
    writable: string;
    readonly: string;
  },
) {
  return instruction.accounts
    .map(
      (account) =>
        `${account.pubkey} (${account.isSigner ? labels.signer : labels.nonSigner}, ${
          account.isWritable ? labels.writable : labels.readonly
        })`,
    )
    .join("; ");
}

function receiptSettlementStateLabel(state: string, t: (key: string) => string) {
  switch (state) {
    case "burned":
      return t("receiptSettlementStates.burned");
    case "forfeited":
      return t("receiptSettlementStates.forfeited");
    default:
      return state;
  }
}

export function PreSignTransactionReviewCard({
  review,
  testId = "pre-sign-transaction-review",
}: {
  review: PreSignTransactionReview | null;
  testId?: string;
}) {
  const t = useTranslations("preSignReview");

  if (!review) {
    return null;
  }

  const pending = t("pending");
  const unknown = t("unknown");
  const flagLabels = {
    signer: t("flags.signer"),
    nonSigner: t("flags.nonSigner"),
    writable: t("flags.writable"),
    readonly: t("flags.readonly"),
  };
  const programIds = review.instructions.map((instruction) => instruction.programId).join(", ");

  return (
    <section
      className={joinClasses(uiPrimitives.card, "grid gap-3 p-4 text-sm text-white/75")}
      data-testid={testId}
      aria-label={t("ariaLabel")}
    >
      <div className={joinClasses(uiPrimitives.denseRow, "p-3")}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soul-mint">
          {t("title")}
        </p>
        <p className="mt-1 break-words text-white/60">
          {t("summary", {
            cluster: review.cluster,
            blockhash: review.recentBlockhash ?? pending,
            feePayer: review.feePayer ?? pending,
          })}
        </p>
        <p className="mt-1 break-words text-white/60">
          {t("programIds", { programIds })}
        </p>
      </div>

      {review.receiptIntent ? (
        <div className={joinClasses(uiPrimitives.denseRow, "break-words p-3")}>
          <p className="font-semibold text-white">{t("receiptIntentTitle")}</p>
          <p>
            {t("receiptIntentBody", {
              state: receiptSettlementStateLabel(review.receiptIntent.state, t),
              amount: review.receiptIntent.movementAmountBaseUnits,
              source: review.receiptIntent.sourceTokenAccount ?? t("unknownSource"),
            })}
          </p>
          <p>
            {t("receiptCapacity", {
              activeReceiptCount: review.receiptIntent.activeReceiptCount ?? unknown,
              postWholeUnits: review.receiptIntent.postWholeUnits ?? unknown,
            })}
          </p>
          <p>
            {t("selectedReceipts", {
              receipts: review.receiptIntent.selectedReceipts.join(", ") || t("none"),
            })}
          </p>
        </div>
      ) : null}

      <ol className="grid gap-2">
        {review.instructions.map((instruction) => (
          <li
            className={joinClasses(uiPrimitives.denseRow, "break-words p-3")}
            key={`${instruction.index}:${instruction.programId}`}
          >
            <p className="font-semibold text-white">
              {t("instructionTitle", {
                index: String(instruction.index + 1),
                programId: instruction.programId,
              })}
            </p>
            <p className="mt-1 text-white/60">
              {t("accounts", {
                accounts: instructionAccountSummary(instruction, flagLabels),
              })}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
