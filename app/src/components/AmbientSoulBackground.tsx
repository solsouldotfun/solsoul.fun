import { svgToDataUri } from "@/lib/svgPreview";
import { joinClasses } from "./uiPrimitives";

type AmbientSoulBackgroundVariant = "home" | "launch" | "token";

type AmbientSoulBackgroundProps = {
  variant: AmbientSoulBackgroundVariant;
  soulSvg?: string;
  className?: string;
};

function getVariantGlowClass(variant: AmbientSoulBackgroundVariant) {
  switch (variant) {
    case "home":
      return "opacity-70";
    case "launch":
      return "opacity-80";
    case "token":
      return "opacity-90";
  }
}

const variantSoulClasses = {
  home: "-right-24 top-10 h-72 w-72 rotate-12 opacity-[0.16] sm:h-96 sm:w-96",
  launch: "-right-16 top-12 h-64 w-64 rotate-6 opacity-[0.18] sm:h-96 sm:w-96",
  token: "-right-20 -top-16 h-80 w-80 rotate-12 opacity-[0.24] sm:h-[30rem] sm:w-[30rem]",
} satisfies Record<AmbientSoulBackgroundVariant, string>;

export function AmbientSoulBackground({
  variant,
  soulSvg,
  className,
}: AmbientSoulBackgroundProps) {
  const currentSoulSrc = soulSvg ? svgToDataUri(soulSvg) : "";

  return (
    <div
      aria-hidden="true"
      className={joinClasses(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden",
        className,
      )}
      data-current-soul={currentSoulSrc ? "true" : "false"}
      data-testid={`ambient-soul-background-${variant}`}
    >
      <div
        className={joinClasses(
          "absolute -left-24 top-8 h-72 w-72 rounded-full bg-soul-purple/20 blur-3xl sm:h-96 sm:w-96",
          getVariantGlowClass(variant),
        )}
      />
      <div className="absolute -bottom-24 right-1/4 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl sm:h-[28rem] sm:w-[28rem]" />
      {currentSoulSrc ? (
        <img
          alt=""
          className={joinClasses(
            "absolute max-w-none rounded-[2.5rem] blur-2xl saturate-150",
            variantSoulClasses[variant],
          )}
          decoding="async"
          src={currentSoulSrc}
        />
      ) : (
        <div
          className={joinClasses(
            "absolute max-w-none overflow-hidden rounded-[2.5rem] border border-white/10 bg-black/30 blur-[1px]",
            variantSoulClasses[variant],
          )}
        >
          <SampleMathematicalSoul />
        </div>
      )}
      <svg
        className="absolute inset-x-[-12%] top-6 h-72 w-[124%] opacity-[0.16] sm:top-10 sm:h-[28rem]"
        fill="none"
        role="presentation"
        viewBox="0 0 960 360"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 285C132 201 189 201 307 285C426 369 490 369 610 285C729 201 792 201 948 285"
          stroke="url(#ambient-soul-wave-a)"
          strokeLinecap="round"
          strokeWidth="1.4"
        />
        <path
          d="M14 122C136 44 226 44 348 122C471 201 536 201 658 122C780 44 842 44 946 122"
          stroke="url(#ambient-soul-wave-b)"
          strokeLinecap="round"
          strokeWidth="1"
        />
        <path
          d="M68 329C198 118 286 70 436 184C584 297 672 252 890 35"
          stroke="url(#ambient-soul-wave-c)"
          strokeDasharray="2 14"
          strokeLinecap="round"
          strokeWidth="1.2"
        />
        <defs>
          <linearGradient id="ambient-soul-wave-a" x1="0" x2="960" y1="0" y2="0">
            <stop stopColor="#14f195" stopOpacity="0" />
            <stop offset="0.45" stopColor="#d7ff3f" />
            <stop offset="1" stopColor="#9945ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ambient-soul-wave-b" x1="0" x2="960" y1="0" y2="0">
            <stop stopColor="#9945ff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#38d5ff" />
            <stop offset="1" stopColor="#14f195" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ambient-soul-wave-c" x1="0" x2="960" y1="0" y2="0">
            <stop stopColor="#38d5ff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#9945ff" />
            <stop offset="1" stopColor="#d7ff3f" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.06),transparent_35%),linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,0.52))]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:88px_88px] opacity-20 [mask-image:radial-gradient(circle_at_50%_30%,black,transparent_72%)]" />
    </div>
  );
}

function SampleMathematicalSoul() {
  return (
    <svg
      className="h-full w-full"
      role="presentation"
      viewBox="0 0 220 220"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#050507" height="220" rx="34" width="220" />
      <circle cx="110" cy="110" fill="#14f195" opacity="0.08" r="72" />
      <circle cx="110" cy="110" fill="none" opacity="0.52" r="56" stroke="#d7ff3f" strokeWidth="2" />
      <path
        d="M32 116C55 60 81 165 110 116C139 67 168 168 190 116"
        fill="none"
        stroke="#14f195"
        strokeLinecap="round"
        strokeWidth="7"
      />
      <path
        d="M45 143C73 96 93 163 119 143C146 122 160 96 181 143"
        fill="none"
        opacity="0.72"
        stroke="#9945ff"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path
        d="M110 34L160 110L110 186L60 110Z"
        fill="none"
        opacity="0.42"
        stroke="#38d5ff"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <circle cx="110" cy="110" fill="#38d5ff" r="6" />
    </svg>
  );
}
