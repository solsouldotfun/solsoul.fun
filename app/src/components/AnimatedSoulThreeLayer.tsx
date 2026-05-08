"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AnimatedSoulThreeProfile } from "@/lib/animatedSoulProfile";
import type { AnimatedSoulPreviewMotion } from "./AnimatedSoulPreview";
import { joinClasses } from "./uiPrimitives";

const MAX_THREE_DPR = 1.35;
const MIN_THREE_RENDER_SIZE_PX = 96;
const MAX_ACTIVE_THREE_RENDERERS = 2;
const THREE_RESIZE_DEBOUNCE_MS = 80;
const ORBIT_SEGMENTS = 160;

let activeThreeRenderers = 0;

type AnimatedSoulThreeLayerProps = {
  profile: AnimatedSoulThreeProfile;
  motion: AnimatedSoulPreviewMotion;
  className?: string;
  testId?: string;
};

type ThreeLayerState =
  | "client-pending"
  | "initializing"
  | "running"
  | "paused"
  | "fallback"
  | "context-lost";

type ThreeFallbackReason =
  | "surface-fallback"
  | "motion-off"
  | "motion-reduced"
  | "prefers-reduced-motion"
  | "webgl-unsupported"
  | "context-limited"
  | "context-lost"
  | "renderer-error"
  | null;

type LayerSize = {
  width: number;
  height: number;
};

type ThreeModule = typeof import("three");

export function AnimatedSoulThreeLayer({
  profile,
  motion,
  className,
  testId = "animated-soul-three-layer",
}: AnimatedSoulThreeLayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isIntersecting, setIsIntersecting] = useState(true);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [size, setSize] = useState<LayerSize>({ width: 0, height: 0 });
  const [layerState, setLayerState] = useState<ThreeLayerState>("client-pending");
  const [fallbackReason, setFallbackReason] = useState<ThreeFallbackReason>(null);
  const canUseWebglSurface =
    profile.surfaceIntent === "webgl" && profile.particleBudget > 0;
  const explicitMotionFallback =
    motion === "off" ? "motion-off" : motion === "reduced" ? "motion-reduced" : null;
  const preferenceFallback = prefersReducedMotion ? "prefers-reduced-motion" : null;
  const activeFallbackReason =
    !canUseWebglSurface
      ? "surface-fallback"
      : explicitMotionFallback ?? preferenceFallback ?? fallbackReason;
  const shouldAttemptWebgl = activeFallbackReason === null;
  const renderState = !shouldAttemptWebgl
    ? activeFallbackReason === "context-lost"
      ? "context-lost"
      : "fallback"
    : layerState === "running" && (!isIntersecting || !isPageVisible)
      ? "paused"
      : layerState;
  const style = useMemo(
    () => ({
      "--soul-three-layer-opacity": shouldAttemptWebgl ? "1" : "0",
    }) as React.CSSProperties,
    [shouldAttemptWebgl],
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener?.("change", updatePreference);
    return () => mediaQuery.removeEventListener?.("change", updatePreference);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    const updateVisibility = () => setIsPageVisible(document.visibilityState !== "hidden");

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof window === "undefined") {
      return undefined;
    }

    let resizeTimer: number | undefined;
    const updateSize = () => {
      if (resizeTimer !== undefined) {
        window.clearTimeout(resizeTimer);
      }
      resizeTimer = window.setTimeout(() => {
        const bounds = host.getBoundingClientRect();
        setSize({
          width: Math.max(0, Math.round(bounds.width)),
          height: Math.max(0, Math.round(bounds.height)),
        });
      }, THREE_RESIZE_DEBOUNCE_MS);
    };

    updateSize();
    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(host);
      return () => {
        resizeObserver.disconnect();
        if (resizeTimer !== undefined) {
          window.clearTimeout(resizeTimer);
        }
      };
    }
    window.addEventListener("resize", updateSize);
    return () => {
      window.removeEventListener("resize", updateSize);
      if (resizeTimer !== undefined) {
        window.clearTimeout(resizeTimer);
      }
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsIntersecting(entry?.isIntersecting ?? true),
      { threshold: 0.02 },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !shouldAttemptWebgl) {
      if (!shouldAttemptWebgl) {
        setLayerState(activeFallbackReason === "context-lost" ? "context-lost" : "fallback");
      }
      return undefined;
    }
    if (
      typeof window === "undefined" ||
      size.width < MIN_THREE_RENDER_SIZE_PX ||
      size.height < MIN_THREE_RENDER_SIZE_PX
    ) {
      return undefined;
    }
    if (!canCreateWebglContext()) {
      setFallbackReason("webgl-unsupported");
      setLayerState("fallback");
      return undefined;
    }
    if (activeThreeRenderers >= MAX_ACTIVE_THREE_RENDERERS) {
      setFallbackReason("context-limited");
      setLayerState("fallback");
      return undefined;
    }

    let cancelled = false;
    let cleanup: (() => void) | undefined;
    setLayerState("initializing");
    setFallbackReason(null);

    void import("three")
      .then((THREE) => {
        if (cancelled) {
          return;
        }
        cleanup = mountThreeScene({
          host,
          isPageVisible: () => isPageVisible,
          isIntersecting: () => isIntersecting,
          onContextLost: () => {
            setFallbackReason("context-lost");
            setLayerState("context-lost");
          },
          onFallback: (reason) => {
            setFallbackReason(reason);
            setLayerState("fallback");
          },
          onRunningState: (state) => setLayerState(state),
          profile,
          size,
          THREE,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setFallbackReason("renderer-error");
          setLayerState("fallback");
        }
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [activeFallbackReason, isIntersecting, isPageVisible, profile, shouldAttemptWebgl, size]);

  if (!canUseWebglSurface) {
    return null;
  }

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={joinClasses(
        "solsoul-animated-soul-preview__three-layer pointer-events-none absolute inset-[-8%] z-[16]",
        className,
      )}
      data-three-context-limit={MAX_ACTIVE_THREE_RENDERERS}
      data-three-fallback={activeFallbackReason ?? "none"}
      data-three-layer-state={renderState}
      data-three-motion={motion}
      data-three-particle-count={shouldAttemptWebgl ? profile.particleBudget : 0}
      data-three-renderer="client-only"
      data-testid={testId}
      style={style}
    />
  );
}

function mountThreeScene({
  host,
  isIntersecting,
  isPageVisible,
  onContextLost,
  onFallback,
  onRunningState,
  profile,
  size,
  THREE,
}: {
  host: HTMLDivElement;
  isIntersecting: () => boolean;
  isPageVisible: () => boolean;
  onContextLost: () => void;
  onFallback: (reason: Exclude<ThreeFallbackReason, null>) => void;
  onRunningState: (state: "running" | "paused") => void;
  profile: AnimatedSoulThreeProfile;
  size: LayerSize;
  THREE: ThreeModule;
}) {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: profile.qualityTier !== "mobile",
    powerPreference: profile.qualityTier === "hero" ? "high-performance" : "default",
    premultipliedAlpha: false,
  });
  activeThreeRenderers += 1;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_THREE_DPR));
  renderer.setSize(size.width, size.height, false);
  renderer.domElement.className = "solsoul-animated-soul-preview__three-canvas";
  renderer.domElement.dataset.threeCanvas = "true";
  host.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    profile.fovDeg,
    Math.max(0.1, size.width / Math.max(1, size.height)),
    0.1,
    20,
  );
  camera.position.z = profile.cameraZ;

  const disposables: Array<{ dispose: () => void }> = [];
  const lightField = buildLightField(THREE, profile);
  const orbitGroup = buildOrbitGroup(THREE, profile);
  scene.add(lightField.points);
  scene.add(orbitGroup.group);
  disposables.push(
    lightField.geometry,
    lightField.material,
    lightField.texture,
    ...orbitGroup.geometries,
    ...orbitGroup.materials,
  );

  let rafId = 0;
  let contextLost = false;
  let lastState: "running" | "paused" | null = null;
  const handleContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    onContextLost();
  };
  const handleContextRestored = () => {
    contextLost = true;
    onFallback("context-lost");
  };

  renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
  renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored);

  const render = (frameTime: number) => {
    if (contextLost) {
      return;
    }
    const running = isIntersecting() && isPageVisible();
    const nextState = running ? "running" : "paused";
    if (nextState !== lastState) {
      onRunningState(nextState);
      lastState = nextState;
    }

    if (running) {
      drawThreeFrame({
        camera,
        frameTime,
        lightField: lightField.points,
        orbitGroup: orbitGroup.group,
        profile,
        renderer,
        scene,
      });
    }
    rafId = window.requestAnimationFrame(render);
  };

  drawThreeFrame({
    camera,
    frameTime: 0,
    lightField: lightField.points,
    orbitGroup: orbitGroup.group,
    profile,
    renderer,
    scene,
  });
  rafId = window.requestAnimationFrame(render);

  return () => {
    window.cancelAnimationFrame(rafId);
    renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
    renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
    scene.remove(lightField.points);
    scene.remove(orbitGroup.group);
    for (const disposable of disposables) {
      disposable.dispose();
    }
    renderer.dispose();
    renderer.forceContextLoss();
    if (renderer.domElement.parentNode === host) {
      host.replaceChildren();
    }
    activeThreeRenderers = Math.max(0, activeThreeRenderers - 1);
  };
}

function buildLightField(THREE: ThreeModule, profile: AnimatedSoulThreeProfile) {
  const particleCount = Math.max(0, profile.particleBudget);
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const palette = profile.palette.map((color) => new THREE.Color(color));
  const phase = profile.shaderPhase;

  for (let index = 0; index < particleCount; index += 1) {
    const ring = index % Math.max(1, profile.lightfieldLayers);
    const ringRatio = (ring + 1) / Math.max(1, profile.lightfieldLayers);
    const angle = seededUnit(index, phase + ringRatio) * Math.PI * 2;
    const radius =
      profile.haloRadius *
      (0.34 + ringRatio * 0.52 + seededUnit(index + 17, phase) * 0.18);
    const depth =
      (seededUnit(index + 41, phase + profile.parallaxDepth) - 0.5) *
      profile.parallaxDepth *
      2;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = Math.sin(angle) * radius * (0.78 + ringRatio * 0.18);
    positions[index * 3 + 2] = depth;

    const color = palette[(index + ring) % palette.length];
    const intensity = 0.58 + seededUnit(index + 73, phase) * 0.42;
    colors[index * 3] = color.r * intensity;
    colors[index * 3 + 1] = color.g * intensity;
    colors[index * 3 + 2] = color.b * intensity;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const texture = buildParticleTexture(THREE);
  const material = new THREE.PointsMaterial({
    blending: THREE.AdditiveBlending,
    color: 0xffffff,
    depthWrite: false,
    map: texture,
    opacity: 0.42 + profile.bloomStrength * 0.42,
    size: profile.pointSize,
    sizeAttenuation: false,
    transparent: true,
    vertexColors: true,
  });
  return {
    geometry,
    material,
    points: new THREE.Points(geometry, material),
    texture,
  };
}

function buildOrbitGroup(THREE: ThreeModule, profile: AnimatedSoulThreeProfile) {
  const group = new THREE.Group();
  const geometries: Array<{ dispose: () => void }> = [];
  const materials: Array<{ dispose: () => void }> = [];

  for (let orbitIndex = 0; orbitIndex < profile.orbitCount; orbitIndex += 1) {
    const radius = profile.haloRadius * (0.7 + orbitIndex * 0.08);
    const points = Array.from({ length: ORBIT_SEGMENTS }, (_, segmentIndex) => {
      const angle = (segmentIndex / ORBIT_SEGMENTS) * Math.PI * 2;
      return new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * (0.72 + orbitIndex * 0.03),
        Math.sin(angle + profile.shaderPhase) * profile.parallaxDepth * 0.16,
      );
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: profile.palette[orbitIndex % profile.palette.length],
      depthWrite: false,
      opacity: 0.1 + profile.bloomStrength * 0.18,
      transparent: true,
    });
    const line = new THREE.LineLoop(geometry, material);
    line.rotation.x = ((profile.orbitTiltDeg + orbitIndex * 7) * Math.PI) / 180;
    line.rotation.y = ((orbitIndex % 2 === 0 ? -1 : 1) * profile.orbitTiltDeg * Math.PI) / 360;
    group.add(line);
    geometries.push(geometry);
    materials.push(material);
  }

  return { geometries, group, materials };
}

function drawThreeFrame({
  camera,
  frameTime,
  lightField,
  orbitGroup,
  profile,
  renderer,
  scene,
}: {
  camera: import("three").PerspectiveCamera;
  frameTime: number;
  lightField: import("three").Points;
  orbitGroup: import("three").Group;
  profile: AnimatedSoulThreeProfile;
  renderer: import("three").WebGLRenderer;
  scene: import("three").Scene;
}) {
  const time = frameTime * 0.001;
  const spin = time * profile.orbitSpeed * profile.motionIntensity;
  lightField.rotation.z = profile.shaderPhase + spin * 0.26;
  lightField.rotation.x = Math.sin(profile.shaderPhase + spin * 0.42) * 0.08;
  orbitGroup.rotation.z = -spin * 0.42;
  orbitGroup.rotation.y = Math.sin(profile.shaderPhase + spin * 0.28) * profile.parallaxDepth * 0.14;
  camera.position.x = Math.sin(profile.shaderPhase + spin * 0.12) * profile.parallaxDepth * 0.08;
  camera.position.y = Math.cos(profile.shaderPhase + spin * 0.1) * profile.parallaxDepth * 0.06;
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
}

function buildParticleTexture(THREE: ThreeModule) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 30);
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.32, "rgba(255,255,255,0.42)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function canCreateWebglContext() {
  if (
    typeof window === "undefined" ||
    !("WebGLRenderingContext" in window) ||
    typeof document === "undefined"
  ) {
    return false;
  }
  const canvas = document.createElement("canvas");
  const context =
    canvas.getContext("webgl2", { alpha: true }) ??
    canvas.getContext("webgl", { alpha: true });
  if (!context) {
    return false;
  }
  context.getExtension("WEBGL_lose_context")?.loseContext();
  return true;
}

function seededUnit(index: number, phase: number) {
  return wrapUnit(Math.sin(index * 12.9898 + phase * 78.233) * 43758.5453);
}

function wrapUnit(value: number) {
  return value - Math.floor(value);
}
