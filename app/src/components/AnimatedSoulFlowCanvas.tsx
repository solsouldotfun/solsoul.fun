"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AnimatedSoulFlowProfile } from "@/lib/animatedSoulProfile";
import type { AnimatedSoulPreviewMotion } from "./AnimatedSoulPreview";
import { joinClasses } from "./uiPrimitives";

const MAX_CANVAS_DPR = 1.5;
const MIN_RENDER_SIZE_PX = 48;
const PARTICLE_AREA_DIVISOR = 560;
const REDUCED_PARTICLE_CAP = 10;

type AnimatedSoulFlowCanvasProps = {
  profile: AnimatedSoulFlowProfile;
  motion: AnimatedSoulPreviewMotion;
  className?: string;
  testId?: string;
};

type CanvasSize = {
  width: number;
  height: number;
};

type FlowParticle = {
  x: number;
  y: number;
  phase: number;
  colorIndex: number;
  radius: number;
};

export function AnimatedSoulFlowCanvas({
  profile,
  motion,
  className,
  testId = "animated-soul-flow-canvas",
}: AnimatedSoulFlowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isIntersecting, setIsIntersecting] = useState(true);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const effectiveMotion =
    motion === "off" || profile.particleBudget <= 0
      ? "off"
      : motion === "reduced" || prefersReducedMotion
        ? "reduced"
        : "auto";
  const shouldRenderCanvas = effectiveMotion !== "off";
  const particleBudget = useMemo(
    () => budgetForSurface(profile.particleBudget, size, effectiveMotion),
    [effectiveMotion, profile.particleBudget, size],
  );
  const particles = useMemo(
    () => buildFlowParticles(profile, particleBudget),
    [particleBudget, profile],
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
    const canvas = canvasRef.current;
    if (!canvas || typeof window === "undefined") {
      return undefined;
    }

    const updateSize = () => {
      const bounds = canvas.getBoundingClientRect();
      setSize({
        width: Math.max(0, Math.round(bounds.width)),
        height: Math.max(0, Math.round(bounds.height)),
      });
    };

    updateSize();
    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(canvas);
      return () => resizeObserver.disconnect();
    }
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [shouldRenderCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsIntersecting(entry?.isIntersecting ?? true),
      { threshold: 0.02 },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [shouldRenderCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || effectiveMotion === "off") {
      return undefined;
    }
    if (isJsdomCanvas(canvas)) {
      return undefined;
    }

    const context = canvas.getContext("2d", { alpha: true });
    if (!context || size.width < MIN_RENDER_SIZE_PX || size.height < MIN_RENDER_SIZE_PX) {
      return undefined;
    }

    const devicePixelRatio =
      typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR);
    const canvasWidth = Math.max(1, Math.round(size.width * devicePixelRatio));
    const canvasHeight = Math.max(1, Math.round(size.height * devicePixelRatio));
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    const renderFrame = (frameTime: number) => {
      drawFlowFrame(context, {
        height: size.height,
        isReduced: effectiveMotion === "reduced",
        particles,
        profile,
        time: frameTime,
        width: size.width,
      });
    };

    renderFrame(0);

    if (effectiveMotion === "reduced" || !isIntersecting || particles.length === 0) {
      return undefined;
    }

    let rafId = window.requestAnimationFrame(function animate(frameTime) {
      renderFrame(frameTime);
      rafId = window.requestAnimationFrame(animate);
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [effectiveMotion, isIntersecting, particles, profile, size]);

  if (!shouldRenderCanvas) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={joinClasses(
        "solsoul-animated-soul-preview__flow-canvas pointer-events-none absolute inset-0 z-[18] h-full w-full",
        className,
      )}
      data-flow-dpr-max={MAX_CANVAS_DPR}
      data-flow-motion={effectiveMotion}
      data-flow-particle-count={particleBudget}
      data-flow-state={
        effectiveMotion === "reduced" ? "frozen" : isIntersecting ? "running" : "paused"
      }
      data-testid={testId}
    />
  );
}

function budgetForSurface(
  profileBudget: number,
  size: CanvasSize,
  motion: AnimatedSoulPreviewMotion,
) {
  if (motion === "off" || profileBudget <= 0) {
    return 0;
  }
  const area = size.width > 0 && size.height > 0 ? size.width * size.height : 128 * 128;
  const areaBudget = Math.max(6, Math.floor(area / PARTICLE_AREA_DIVISOR));
  const motionBudget = motion === "reduced" ? REDUCED_PARTICLE_CAP : profileBudget;
  return Math.max(0, Math.min(profileBudget, motionBudget, areaBudget));
}

function buildFlowParticles(
  profile: AnimatedSoulFlowProfile,
  particleBudget: number,
): FlowParticle[] {
  return Array.from({ length: particleBudget }, (_, index) => {
    const phaseSeed = profile.phaseOffsets[index % profile.phaseOffsets.length] + index * 0.618033;
    return {
      x: seededUnit(index, phaseSeed + profile.fieldScale),
      y: seededUnit(index + 19, phaseSeed + profile.swirl),
      phase: phaseSeed,
      colorIndex: index % profile.palette.length,
      radius: 0.7 + seededUnit(index + 43, phaseSeed) * 1.6,
    };
  });
}

function drawFlowFrame(
  context: CanvasRenderingContext2D,
  {
    height,
    isReduced,
    particles,
    profile,
    time,
    width,
  }: {
    height: number;
    isReduced: boolean;
    particles: FlowParticle[];
    profile: AnimatedSoulFlowProfile;
    time: number;
    width: number;
  },
) {
  context.clearRect(0, 0, width, height);
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.lineJoin = "round";

  const flowTime = (isReduced ? 0 : time) * 0.00013 * profile.speed;
  const centerX = width / 2;
  const centerY = height / 2;
  const scale = profile.fieldScale;
  const maxDimension = Math.max(width, height);
  const flowLength = Math.max(5, Math.min(maxDimension * 0.095, 10 + profile.density * 18));

  for (const particle of particles) {
    const drift = isReduced ? 0 : Math.sin(flowTime + particle.phase) * 0.055;
    const x = wrapUnit(particle.x + drift + Math.cos(particle.phase + flowTime) * 0.018) * width;
    const y = wrapUnit(particle.y - drift + Math.sin(particle.phase * 1.7 - flowTime) * 0.018) * height;
    const dx = (x - centerX) / maxDimension;
    const dy = (y - centerY) / maxDimension;
    const angle = flowAngleForFamily(profile.family, {
      dx,
      dy,
      flowTime,
      phase: particle.phase,
      scale,
      swirl: profile.swirl,
      x,
      y,
    });
    const halfLength = flowLength * (0.42 + particle.radius * 0.2);
    const startX = x - Math.cos(angle) * halfLength;
    const startY = y - Math.sin(angle) * halfLength;
    const endX = x + Math.cos(angle) * halfLength;
    const endY = y + Math.sin(angle) * halfLength;

    context.strokeStyle = colorWithAlpha(
      profile.palette[particle.colorIndex],
      isReduced ? 0.1 : 0.12 + profile.density * 0.16,
    );
    context.lineWidth = particle.radius;
    context.beginPath();
    context.moveTo(startX, startY);
    context.quadraticCurveTo(
      x + Math.cos(angle + profile.swirl) * halfLength * 0.42,
      y + Math.sin(angle - profile.swirl) * halfLength * 0.42,
      endX,
      endY,
    );
    context.stroke();
  }

  context.restore();
}

function flowAngleForFamily(
  family: AnimatedSoulFlowProfile["family"],
  {
    dx,
    dy,
    flowTime,
    phase,
    scale,
    swirl,
    x,
    y,
  }: {
    dx: number;
    dy: number;
    flowTime: number;
    phase: number;
    scale: number;
    swirl: number;
    x: number;
    y: number;
  },
) {
  const radial = Math.atan2(dy, dx);
  const field =
    Math.sin(x * 0.016 * scale + phase + flowTime) +
    Math.cos(y * 0.014 * scale + phase * 0.7 - flowTime);

  switch (family) {
    case "curl":
      return field + radial * swirl;
    case "orbital":
      return radial + Math.PI / 2 + field * 0.36 + swirl;
    case "radial":
      return radial + field * 0.42 + swirl * 0.5;
    case "spark":
      return phase + Math.sin((x + y) * 0.012 * scale + flowTime) * 0.75;
    case "bloom":
      return radial + Math.sin(phase + flowTime) * 0.68 + field * 0.24;
    case "laminar":
      return phase * 0.18 + Math.sin(y * 0.02 * scale + flowTime) * 0.48 + swirl * 0.4;
  }
}

function seededUnit(index: number, phase: number) {
  return wrapUnit(Math.sin(index * 12.9898 + phase * 78.233) * 43758.5453);
}

function wrapUnit(value: number) {
  return value - Math.floor(value);
}

function colorWithAlpha(color: string, alpha: number) {
  if (color.startsWith("#") && color.length === 7) {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
  }
  return color;
}

function isJsdomCanvas(canvas: HTMLCanvasElement) {
  return canvas.ownerDocument.defaultView?.navigator.userAgent
    .toLowerCase()
    .includes("jsdom") ?? false;
}
