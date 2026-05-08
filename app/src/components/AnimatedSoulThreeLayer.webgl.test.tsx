// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deriveAnimatedSoulProfile,
  type AnimatedSoulFinalizedTraits,
} from "@/lib/animatedSoulProfile";
import { AnimatedSoulPreview } from "./AnimatedSoulPreview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const threeFixtureMetrics = vi.hoisted(() => ({
  contextLosses: 0,
  disposals: 0,
  renders: 0,
}));

vi.mock("three", () => {
  class Color {
    r = 0.08;
    g = 0.95;
    b = 0.58;

    constructor(color: string) {
      if (color.includes("9945ff")) {
        this.r = 0.6;
        this.g = 0.27;
        this.b = 1;
      }
      if (color.startsWith("hsl")) {
        this.r = 0.85;
        this.g = 0.4;
        this.b = 1;
      }
    }
  }

  class BufferAttribute {
    constructor(
      public array: Float32Array,
      public itemSize: number,
    ) {}
  }

  class BufferGeometry {
    attributes = new Map<string, BufferAttribute>();
    points: Vector3[] = [];

    setAttribute(name: string, attribute: BufferAttribute) {
      this.attributes.set(name, attribute);
    }

    setFromPoints(points: Vector3[]) {
      this.points = points;
      return this;
    }

    dispose() {}
  }

  class CanvasTexture {
    needsUpdate = false;

    constructor(public canvas: HTMLCanvasElement) {}

    dispose() {}
  }

  class PointsMaterial {
    constructor(public options: unknown) {}

    dispose() {}
  }

  class LineBasicMaterial {
    constructor(public options: unknown) {}

    dispose() {}
  }

  class Points {
    rotation = { x: 0, y: 0, z: 0 };

    constructor(
      public geometry: BufferGeometry,
      public material: PointsMaterial,
    ) {}
  }

  class Group {
    children: unknown[] = [];
    rotation = { x: 0, y: 0, z: 0 };

    add(child: unknown) {
      this.children.push(child);
    }
  }

  class Vector3 {
    constructor(
      public x: number,
      public y: number,
      public z: number,
    ) {}
  }

  class LineLoop {
    rotation = { x: 0, y: 0, z: 0 };

    constructor(
      public geometry: BufferGeometry,
      public material: LineBasicMaterial,
    ) {}
  }

  class Scene {
    children: unknown[] = [];

    add(child: unknown) {
      this.children.push(child);
    }

    remove(child: unknown) {
      this.children = this.children.filter((entry) => entry !== child);
    }
  }

  class PerspectiveCamera {
    position = { x: 0, y: 0, z: 0 };

    constructor(
      public fov: number,
      public aspect: number,
      public near: number,
      public far: number,
    ) {}

    lookAt() {}
  }

  class WebGLRenderer {
    domElement = document.createElement("canvas");

    constructor(public options: unknown) {}

    setClearColor() {}

    setPixelRatio() {}

    setSize(width: number, height: number) {
      this.domElement.width = width;
      this.domElement.height = height;
    }

    render() {
      threeFixtureMetrics.renders += 1;
    }

    dispose() {
      threeFixtureMetrics.disposals += 1;
    }

    forceContextLoss() {
      threeFixtureMetrics.contextLosses += 1;
    }
  }

  return {
    AdditiveBlending: 2,
    BufferAttribute,
    BufferGeometry,
    CanvasTexture,
    Color,
    Group,
    LineBasicMaterial,
    LineLoop,
    PerspectiveCamera,
    Points,
    PointsMaterial,
    Scene,
    Vector3,
    WebGLRenderer,
  };
});

const staticSoulSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><rect width="256" height="256" fill="#050505"/><circle cx="128" cy="128" r="64" fill="none" stroke="#14f195" stroke-width="5"/></svg>';

const finalizedTraits = {
  core: {
    palette: "solana",
    mood: "radiant",
    form: "orb",
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

describe("AnimatedSoulThreeLayer active WebGL fixture", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
  let originalMatchMedia: typeof window.matchMedia | undefined;
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;
  let originalCancelAnimationFrame: typeof window.cancelAnimationFrame;
  let originalResizeObserver: typeof window.ResizeObserver | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    threeFixtureMetrics.contextLosses = 0;
    threeFixtureMetrics.disposals = 0;
    threeFixtureMetrics.renders = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    originalGetContext = HTMLCanvasElement.prototype.getContext;
    originalMatchMedia = window.matchMedia;
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    originalResizeObserver = window.ResizeObserver;

    Object.defineProperty(window, "WebGLRenderingContext", {
      configurable: true,
      value: function WebGLRenderingContext() {},
    });
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 1.25,
    });
    window.matchMedia = vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    });

    let frameCount = 0;
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCount += 1;
      if (frameCount <= 3) {
        window.setTimeout(() => callback(frameCount * 16), 0);
      }
      return frameCount;
    });
    window.cancelAnimationFrame = vi.fn();
    window.ResizeObserver = class ResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}

      observe() {
        this.callback([], this);
      }

      disconnect() {}

      unobserve() {}
    };

    Element.prototype.getBoundingClientRect = vi.fn(
      () =>
        ({
          bottom: 256,
          height: 256,
          left: 0,
          right: 256,
          toJSON: () => ({}),
          top: 0,
          width: 256,
          x: 0,
          y: 0,
        }) satisfies DOMRect,
    );
    HTMLCanvasElement.prototype.getContext = vi.fn((contextId: string) => {
      if (contextId === "webgl" || contextId === "webgl2") {
        return {
          getExtension: (name: string) =>
            name === "WEBGL_lose_context"
              ? {
                  loseContext: vi.fn(),
                }
              : null,
        } as unknown as RenderingContext;
      }
      if (contextId === "2d") {
        return {
          createRadialGradient: () => ({
            addColorStop: vi.fn(),
          }),
          fillRect: vi.fn(),
          fillStyle: "",
        } as unknown as RenderingContext;
      }
      return null;
    }) as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    window.matchMedia = originalMatchMedia as typeof window.matchMedia;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    if (originalResizeObserver) {
      window.ResizeObserver = originalResizeObserver;
    } else {
      Reflect.deleteProperty(window, "ResizeObserver");
    }
    Reflect.deleteProperty(window, "WebGLRenderingContext");
    vi.useRealTimers();
  });

  it("mounts a deterministic Three canvas for launch hero profiles when WebGL is available", async () => {
    await expectActiveWebglPreview("launch", "active-webgl-launch-hero-fixture");
  });

  it("mounts a deterministic Three canvas for token detail hero profiles when WebGL is available", async () => {
    await expectActiveWebglPreview("tokenDetail", "active-webgl-token-detail-fixture");
  });

  async function expectActiveWebglPreview(surface: "launch" | "tokenDetail", seed: string) {
    const profile = deriveAnimatedSoulProfile({
      seed,
      finalizedTraits,
      animationBehavior: "rainbow_orbit",
      evolutionState: {
        energy: 88,
        generation: 12,
        level: 7,
        rarityTier: "legendary",
        stage: "radiant",
      },
      displayState: { surface, density: "hero", motion: "auto" },
    });

    await act(async () => {
      root.render(
        <AnimatedSoulPreview
          alt={`Active WebGL deterministic ${surface} Soul`}
          profile={profile}
          staticSvg={staticSoulSvg}
          testId="active-webgl-preview"
        />,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
      await Promise.resolve();
    });

    const layer = container.querySelector('[data-testid="active-webgl-preview-three-layer"]');
    const threeCanvas = layer?.querySelector('canvas[data-three-canvas="true"]');

    expect(profile.threeProfile.surfaceIntent).toBe("webgl");
    expect(profile.threeProfile.qualityTier).toBe("hero");
    expect(profile.threeProfile.particleBudget).toBeGreaterThan(0);
    expect(layer?.getAttribute("data-three-renderer")).toBe("client-only");
    expect(layer?.getAttribute("data-three-fallback")).toBe("none");
    expect(layer?.getAttribute("data-three-layer-state")).toBe("running");
    expect(layer?.getAttribute("data-three-particle-count")).toBe(
      String(profile.threeProfile.particleBudget),
    );
    expect(threeCanvas).not.toBeNull();
    expect(threeCanvas?.getAttribute("class")).toBe(
      "solsoul-animated-soul-preview__three-canvas",
    );
    expect(threeFixtureMetrics.renders).toBeGreaterThan(0);
    expect(container.querySelector("img")?.getAttribute("alt")).toBe(
      `Active WebGL deterministic ${surface} Soul`,
    );
  }
});
