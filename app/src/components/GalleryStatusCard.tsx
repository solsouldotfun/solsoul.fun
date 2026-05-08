import type { ReactNode } from "react";
import { uiPrimitives } from "./uiPrimitives";

type GalleryStatusCardTone = "neutral" | "error";

type GalleryStatusCardProps = {
  children: ReactNode;
  tone?: GalleryStatusCardTone;
};

export function GalleryStatusCard({ children, tone = "neutral" }: GalleryStatusCardProps) {
  const className =
    tone === "error"
      ? uiPrimitives.statusError
      : uiPrimitives.statusNeutral;

  return (
    <div
      className={className}
      data-surface-state={tone}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
