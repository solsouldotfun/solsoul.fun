import type { CSSProperties, ReactNode } from "react";
import type { AnimatedSoulProfile } from "@/lib/animatedSoulProfile";
import { svgToDataUri } from "@/lib/svgPreview";
import { AnimatedSoulFlowCanvas } from "./AnimatedSoulFlowCanvas";
import { AnimatedSoulThreeLayer } from "./AnimatedSoulThreeLayer";
import { joinClasses } from "./uiPrimitives";

export type AnimatedSoulPreviewMotion = "auto" | "reduced" | "off";

export type AnimatedSoulPreviewProps = {
  staticSvg: string;
  profile: AnimatedSoulProfile;
  alt: string;
  motion?: AnimatedSoulPreviewMotion;
  className?: string;
  imageClassName?: string;
  caption?: ReactNode;
  fallbackLabel?: string;
  style?: CSSProperties;
  testId?: string;
};

export function AnimatedSoulPreview({
  staticSvg,
  profile,
  alt,
  motion = "auto",
  className,
  imageClassName,
  caption,
  fallbackLabel = alt,
  style,
  testId = "animated-soul-preview",
}: AnimatedSoulPreviewProps) {
  const imageSrc = svgToDataUri(staticSvg);
  const motionClass =
    motion === "reduced"
      ? "solsoul-animated-soul-preview--reduced"
      : motion === "off"
        ? "solsoul-animated-soul-preview--off"
        : null;
  const previewStyle = {
    ...profile.cssVariables,
    ...style,
  } as CSSProperties;

  return (
    <figure
      className={joinClasses(
        "solsoul-animated-soul-preview relative isolate aspect-square overflow-hidden rounded-[1.75rem] bg-soul-ink",
        motionClass,
        className,
      )}
      data-behavior-family={profile.behaviorFamily}
      data-flow-family={profile.flowProfile.family}
      data-flow-particle-budget={profile.flowProfile.particleBudget}
      data-motion={motion}
      data-preview-density={profile.displayState?.density}
      data-preview-surface={profile.displayState?.surface}
      data-three-particle-budget={profile.threeProfile.particleBudget}
      data-three-quality-tier={profile.threeProfile.qualityTier}
      data-three-surface-intent={profile.threeProfile.surfaceIntent}
      data-motion-source="website-only"
      data-static-svg-present={imageSrc ? "true" : "false"}
      data-testid={testId}
      style={previewStyle}
    >
      <div
        aria-hidden="true"
        className="solsoul-animated-soul-preview__glow absolute inset-0"
      />
      {imageSrc ? (
        <img
          alt={alt}
          className={joinClasses(
            "solsoul-animated-soul-preview__image relative z-10 h-full w-full object-contain",
            imageClassName,
          )}
          decoding="async"
          draggable={false}
          src={imageSrc}
        />
      ) : (
        <div
          className="relative z-10 grid h-full w-full place-items-center border border-dashed border-white/15 bg-black/40 p-6 text-center text-sm text-white/45"
          role="img"
          aria-label={fallbackLabel}
        >
          {fallbackLabel}
        </div>
      )}
      <AnimatedSoulFlowCanvas
        motion={motion}
        profile={profile.flowProfile}
        testId={`${testId}-flow-canvas`}
      />
      <AnimatedSoulThreeLayer
        motion={motion}
        profile={profile.threeProfile}
        testId={`${testId}-three-layer`}
      />
      <div
        aria-hidden="true"
        className="solsoul-animated-soul-preview__shimmer pointer-events-none absolute inset-[-20%] z-20"
      />
      <div
        aria-hidden="true"
        className="solsoul-animated-soul-preview__orbit pointer-events-none absolute z-20"
      />
      {caption ? (
        <figcaption className="sr-only">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
