import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  deriveAnimatedSoulProfile,
  type AnimatedSoulFinalizedTraits,
} from "@/lib/animatedSoulProfile";
import { AnimatedSoulPreview } from "./AnimatedSoulPreview";

const staticSoulSvg =
  '<svg viewBox="0 0 256 256" data-soul="animated-preview-fixture"><rect width="256" height="256" fill="#050505"/><circle cx="128" cy="128" r="68" fill="none" stroke="#d7ff3f" stroke-width="6"/></svg>';

const finalizedTraits = {
  core: {
    palette: "solana",
    mood: "mystic",
    form: "spiral",
    background: "nebula",
  },
  generated: {
    characterArchetype: "oracle_cat",
    gogglesEyes: "hologram_visor",
    expression: "zen_smirk",
    gasAuraCloud: "solana_mist",
    background: "aurora_grid",
    outfit: "space_jacket",
    relic: "ancient_receipt",
    gasLevel: "level_5",
  },
} satisfies AnimatedSoulFinalizedTraits;

const profile = deriveAnimatedSoulProfile({
  seed: "animated-soul-preview-component-fixture",
  finalizedTraits,
  animationBehavior: "aura_flow",
});

describe("AnimatedSoulPreview", () => {
  it("wraps immutable static Soul SVG bytes with website-only motion layers", () => {
    const originalBytes = staticSoulSvg;
    const markup = renderToStaticMarkup(
      <AnimatedSoulPreview
        alt="Latest deterministic Soul"
        profile={profile}
        staticSvg={staticSoulSvg}
      />,
    );
    const decodedImageSvg = decodeSvgImageSource(markup);

    expect(staticSoulSvg).toBe(originalBytes);
    expect(markup).toContain('data-testid="animated-soul-preview"');
    expect(markup).toContain('data-motion-source="website-only"');
    expect(markup).toContain('data-behavior-family="flow"');
    expect(markup).toContain('data-flow-family="curl"');
    expect(markup).toContain('data-flow-particle-budget="');
    expect(markup).toContain('data-three-surface-intent="webgl"');
    expect(markup).toContain('data-three-quality-tier="hero"');
    expect(markup).toContain('data-three-particle-budget="');
    expect(markup).toContain("--soul-flow-particle-budget");
    expect(markup).toContain("--soul-three-particle-budget");
    expect(markup).toContain("--soul-flow-palette-primary");
    expect(markup).toContain("--soul-three-palette-accent");
    expect(markup).toContain('alt="Latest deterministic Soul"');
    expect(markup).toContain("solsoul-animated-soul-preview__glow");
    expect(markup).toContain("solsoul-animated-soul-preview__flow-canvas");
    expect(markup).toContain('data-testid="animated-soul-preview-flow-canvas"');
    expect(markup).toContain('data-flow-motion="auto"');
    expect(markup).toContain('data-flow-dpr-max="1.5"');
    expect(markup).toContain("solsoul-animated-soul-preview__three-layer");
    expect(markup).toContain('data-testid="animated-soul-preview-three-layer"');
    expect(markup).toContain('data-three-renderer="client-only"');
    expect(markup).toContain('data-three-layer-state="client-pending"');
    expect(markup).toContain('data-three-fallback="none"');
    expect(markup).toContain('data-three-context-limit="2"');
    expect(markup).toContain("solsoul-animated-soul-preview__shimmer");
    expect(markup).toContain("solsoul-animated-soul-preview__orbit");
    expect(decodedImageSvg).toContain('data-soul="animated-preview-fixture"');
    expect(decodedImageSvg).not.toMatch(/<animate\b/i);
    expect(decodedImageSvg).not.toMatch(/<style\b/i);
    expect(decodedImageSvg).not.toMatch(/<script\b/i);
    expect(decodedImageSvg).not.toMatch(/<image\b/i);
  });

  it("uses the existing browser-image-safe SVG path instead of inline SVG injection", () => {
    const svgWithActiveContent =
      '<svg viewBox="0 0 16 16" onload="steal()"><script>alert(1)</script><style>svg{animation:x}</style><image href="https://example.invalid/x.svg"/><circle cx="8" cy="8" r="4" fill="#d7ff3f"/></svg>';
    const markup = renderToStaticMarkup(
      <AnimatedSoulPreview
        alt="Sanitized preview"
        profile={profile}
        staticSvg={svgWithActiveContent}
      />,
    );
    const decodedImageSvg = decodeSvgImageSource(markup);

    expect(markup).toContain("<img");
    expect(markup).not.toContain("dangerouslySetInnerHTML");
    expect(decodedImageSvg).toContain("<circle");
    expect(decodedImageSvg).not.toContain("onload");
    expect(decodedImageSvg).not.toContain("<script");
    expect(decodedImageSvg).not.toContain("<style");
    expect(decodedImageSvg).not.toContain("<image");
    expect(decodedImageSvg).not.toContain("https://");
  });

  it("can be forced into reduced motion while keeping the static artwork visible", () => {
    const markup = renderToStaticMarkup(
      <AnimatedSoulPreview
        alt="Reduced-motion Soul"
        motion="reduced"
        profile={profile}
        staticSvg={staticSoulSvg}
      />,
    );

    expect(markup).toContain('data-motion="reduced"');
    expect(markup).toContain("solsoul-animated-soul-preview--reduced");
    expect(markup).toContain('data-flow-motion="reduced"');
    expect(markup).toContain('data-flow-state="frozen"');
    expect(markup).toContain('data-three-fallback="motion-reduced"');
    expect(markup).toContain('data-three-layer-state="fallback"');
    expect(markup).toContain('data-three-particle-count="0"');
    expect(markup).toContain("<img");
    expect(markup).toContain('alt="Reduced-motion Soul"');
    expect(decodeSvgImageSource(markup)).toContain("<circle");
  });

  it("omits the canvas flow layer when motion is explicitly off", () => {
    const markup = renderToStaticMarkup(
      <AnimatedSoulPreview
        alt="Static-only Soul"
        motion="off"
        profile={profile}
        staticSvg={staticSoulSvg}
      />,
    );

    expect(markup).toContain('data-motion="off"');
    expect(markup).toContain("solsoul-animated-soul-preview--off");
    expect(markup).not.toContain("solsoul-animated-soul-preview__flow-canvas");
    expect(markup).toContain('data-three-fallback="motion-off"');
    expect(markup).toContain('data-three-layer-state="fallback"');
    expect(markup).toContain("<img");
    expect(decodeSvgImageSource(markup)).toContain("<circle");
  });

  it("ships CSS that freezes non-essential animation for prefers-reduced-motion", () => {
    const globalsCss = fs.readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    expect(globalsCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globalsCss).toContain(".solsoul-animated-soul-preview");
    expect(globalsCss).toContain(".solsoul-animated-soul-preview__flow-canvas");
    expect(globalsCss).toContain(".solsoul-animated-soul-preview__three-layer");
    expect(globalsCss).toContain("animation: none");
    expect(globalsCss).toContain("transform: none");
  });

  it("uses native canvas RAF with reduced-motion and offscreen pause guards", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/AnimatedSoulFlowCanvas.tsx"),
      "utf8",
    );

    expect(source).toContain("requestAnimationFrame");
    expect(source).toContain("cancelAnimationFrame");
    expect(source).toContain("IntersectionObserver");
    expect(source).toContain("ResizeObserver");
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain("MAX_CANVAS_DPR = 1.5");
    expect(source).toContain("PARTICLE_AREA_DIVISOR");
    expect(source).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|\bp5\b/);
    expect(source).not.toMatch(/dangerouslySetInnerHTML|fetch|XMLHttpRequest|wallet|publicKey/i);
  });

  it("uses a lazy client-only Three/WebGL layer with fallback and cleanup guards", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/AnimatedSoulThreeLayer.tsx"),
      "utf8",
    );

    expect(source).toContain('"use client"');
    expect(source).toContain('import("three")');
    expect(source).toContain("new THREE.WebGLRenderer");
    expect(source).toContain("MAX_ACTIVE_THREE_RENDERERS = 2");
    expect(source).toContain("MAX_THREE_DPR = 1.35");
    expect(source).toContain("WebGLRenderingContext");
    expect(source).toContain("webglcontextlost");
    expect(source).toContain("webglcontextrestored");
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain("IntersectionObserver");
    expect(source).toContain("ResizeObserver");
    expect(source).toContain("visibilitychange");
    expect(source).toContain("requestAnimationFrame");
    expect(source).toContain("cancelAnimationFrame");
    expect(source).toContain("dispose()");
    expect(source).toContain("forceContextLoss");
    expect(source).toContain("data-three-renderer=\"client-only\"");
    expect(source).not.toMatch(/from ["']three["']|@react-three|Math\.random|Date\.now|new Date|performance\.now/);
    expect(source).not.toMatch(/dangerouslySetInnerHTML|fetch|XMLHttpRequest|wallet|publicKey/i);
  });
});

function decodeSvgImageSource(markup: string): string {
  const src = markup.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? "";
  expect(src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  return decodeURIComponent(src.replace("data:image/svg+xml;charset=utf-8,", ""));
}
