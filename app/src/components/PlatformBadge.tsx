"use client";

import { useTranslations } from "next-intl";
import { joinClasses, uiPrimitives } from "./uiPrimitives";

type PlatformBadgeMessages = {
  title: string;
  label: string;
  compactLabel: string;
  assistiveText: string;
};

type PlatformBadgeProps = {
  className?: string;
  compact?: boolean;
};

type PlatformBadgeViewProps = PlatformBadgeProps & {
  messages: PlatformBadgeMessages;
};

export function PlatformBadgeView({
  className = "",
  compact = false,
  messages,
}: PlatformBadgeViewProps) {
  return (
    <span
      className={joinClasses(uiPrimitives.pill, className)}
      title={messages.title}
    >
      <span aria-hidden="true">✦</span>
      <span>{compact ? messages.compactLabel : messages.label}</span>
      <span className="sr-only">{messages.assistiveText}</span>
    </span>
  );
}

export function PlatformBadge(props: PlatformBadgeProps) {
  const t = useTranslations("shared.platformBadge");
  return (
    <PlatformBadgeView
      {...props}
      messages={{
        title: t("title"),
        label: t("label"),
        compactLabel: t("compactLabel"),
        assistiveText: t("assistiveText"),
      }}
    />
  );
}
