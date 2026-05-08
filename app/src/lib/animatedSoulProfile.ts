import type { AppFinalCoreArtTraits, AppSoulTraitSet } from "./soulTraits";

export type AnimatedSoulBehaviorFamily =
  | "drift"
  | "shine"
  | "flow"
  | "pulse"
  | "sparkle"
  | "orbit"
  | "bloom";

export interface AnimatedSoulFinalizedTraits {
  core: AppFinalCoreArtTraits;
  generated?: Partial<Omit<AppSoulTraitSet, "animationBehavior">>;
}

export interface AnimatedSoulProfileInput {
  seed: string | Uint8Array;
  finalizedTraits: AnimatedSoulFinalizedTraits;
  animationBehavior: string;
  evolutionState?: AnimatedSoulEvolutionState;
  displayState?: AnimatedSoulDisplayState;
}

export type AnimatedSoulEvolutionScalar = string | number | bigint | boolean | null | undefined;

export interface AnimatedSoulEvolutionState {
  level?: AnimatedSoulEvolutionScalar;
  stage?: AnimatedSoulEvolutionScalar;
  energy?: AnimatedSoulEvolutionScalar;
  generation?: AnimatedSoulEvolutionScalar;
  rarityTier?: AnimatedSoulEvolutionScalar;
  rarityScore?: AnimatedSoulEvolutionScalar;
  provenanceSide?: AnimatedSoulEvolutionScalar;
  claimCount?: AnimatedSoulEvolutionScalar;
  receiptState?: AnimatedSoulEvolutionScalar;
}

export type AnimatedSoulDisplaySurface =
  | "launch"
  | "tokenDetail"
  | "feed"
  | "gallery"
  | "profile"
  | "tradeMoment"
  | "rarityCard";

export type AnimatedSoulDisplayDensity = "hero" | "detail" | "compactDetail" | "compact";

export type AnimatedSoulDisplayMotion = "auto" | "reduced" | "off";

export interface AnimatedSoulDisplayState {
  surface?: AnimatedSoulDisplaySurface;
  density?: AnimatedSoulDisplayDensity;
  motion?: AnimatedSoulDisplayMotion;
}

export type AnimatedSoulCssVariableName =
  | "--soul-preview-duration"
  | "--soul-preview-delay"
  | "--soul-preview-intensity"
  | "--soul-preview-drift-x"
  | "--soul-preview-drift-y"
  | "--soul-preview-scale"
  | "--soul-preview-rotation"
  | "--soul-preview-glow-opacity"
  | "--soul-preview-shimmer-opacity"
  | "--soul-preview-orbit-radius"
  | "--soul-preview-accent-hue"
  | "--soul-flow-particle-budget"
  | "--soul-flow-speed"
  | "--soul-flow-density"
  | "--soul-flow-swirl"
  | "--soul-flow-field-scale"
  | "--soul-flow-phase-a"
  | "--soul-flow-phase-b"
  | "--soul-flow-phase-c"
  | "--soul-flow-palette-primary"
  | "--soul-flow-palette-secondary"
  | "--soul-flow-palette-tertiary"
  | "--soul-flow-palette-accent"
  | "--soul-three-particle-budget"
  | "--soul-three-lightfield-layers"
  | "--soul-three-halo-radius"
  | "--soul-three-orbit-count"
  | "--soul-three-orbit-speed"
  | "--soul-three-orbit-tilt"
  | "--soul-three-parallax-depth"
  | "--soul-three-point-size"
  | "--soul-three-camera-z"
  | "--soul-three-fov"
  | "--soul-three-motion-intensity"
  | "--soul-three-shader-phase"
  | "--soul-three-bloom-strength"
  | "--soul-three-palette-primary"
  | "--soul-three-palette-secondary"
  | "--soul-three-palette-accent";

export type AnimatedSoulCssVariables = Readonly<Record<AnimatedSoulCssVariableName, string>>;

export type AnimatedSoulFlowFamily =
  | "laminar"
  | "curl"
  | "orbital"
  | "radial"
  | "spark"
  | "bloom";

export type AnimatedSoulFlowPalette = readonly [string, string, string, string];
export type AnimatedSoulFlowPhaseOffsets = readonly [number, number, number];
export type AnimatedSoulThreePalette = readonly [string, string, string];
export type AnimatedSoulThreeQualityTier = "hero" | "detail" | "mobile" | "fallback";
export type AnimatedSoulThreeSurfaceIntent = "webgl" | "canvas-fallback";

export interface AnimatedSoulFlowProfile {
  family: AnimatedSoulFlowFamily;
  particleBudget: number;
  palette: AnimatedSoulFlowPalette;
  speed: number;
  density: number;
  swirl: number;
  fieldScale: number;
  phaseOffsets: AnimatedSoulFlowPhaseOffsets;
}

export interface AnimatedSoulThreeProfile {
  surfaceIntent: AnimatedSoulThreeSurfaceIntent;
  qualityTier: AnimatedSoulThreeQualityTier;
  particleBudget: number;
  lightfieldLayers: number;
  palette: AnimatedSoulThreePalette;
  haloRadius: number;
  orbitCount: number;
  orbitSpeed: number;
  orbitTiltDeg: number;
  parallaxDepth: number;
  pointSize: number;
  cameraZ: number;
  fovDeg: number;
  motionIntensity: number;
  shaderPhase: number;
  bloomStrength: number;
}

export interface AnimatedSoulProfile {
  sourceAnimationBehavior: string;
  behaviorFamily: AnimatedSoulBehaviorFamily;
  displayState?: AnimatedSoulDisplayState;
  intensity: number;
  durationMs: number;
  delayMs: number;
  driftX: number;
  driftY: number;
  scale: number;
  rotationDeg: number;
  glowOpacity: number;
  shimmerOpacity: number;
  orbitRadiusPx: number;
  accentHueDeg: number;
  flowProfile: AnimatedSoulFlowProfile;
  threeProfile: AnimatedSoulThreeProfile;
  cssVariables: AnimatedSoulCssVariables;
}

export const ANIMATED_SOUL_PROFILE_LIMITS = {
  intensity: { min: 0.14, max: 0.38 },
  durationMs: { min: 9_000, max: 26_000 },
  delayMs: { min: -26_000, max: 0 },
  driftPx: { min: 1.5, max: 9 },
  scale: { min: 1.004, max: 1.026 },
  rotationDeg: { min: 0.25, max: 2.4 },
  glowOpacity: { min: 0.08, max: 0.22 },
  shimmerOpacity: { min: 0.04, max: 0.18 },
  orbitRadiusPx: { min: 3, max: 13 },
  accentHueDeg: { min: 158, max: 288 },
} as const;

export const ANIMATED_SOUL_FLOW_PROFILE_LIMITS = {
  particleBudget: { min: 0, max: 128 },
  compactParticleBudget: { min: 12, max: 40 },
  reducedParticleBudget: { min: 6, max: 18 },
  speed: { min: 0, max: 1.18 },
  reducedSpeed: { min: 0, max: 0.28 },
  density: { min: 0, max: 0.92 },
  reducedDensity: { min: 0, max: 0.34 },
  swirl: { min: -0.88, max: 0.88 },
  fieldScale: { min: 0.64, max: 1.72 },
  phaseOffset: { min: 0, max: 6.2832 },
} as const;

export const ANIMATED_SOUL_THREE_PROFILE_LIMITS = {
  particleBudget: { min: 0, max: 4_200 },
  heroParticleBudget: { min: 2_200, max: 4_200 },
  detailParticleBudget: { min: 1_200, max: 2_600 },
  mobileParticleBudget: { min: 360, max: 980 },
  reducedParticleBudget: { min: 80, max: 720 },
  lightfieldLayers: { min: 0, max: 9 },
  haloRadius: { min: 0.82, max: 1.42 },
  orbitCount: { min: 0, max: 6 },
  orbitSpeed: { min: 0, max: 0.72 },
  orbitTiltDeg: { min: -28, max: 28 },
  parallaxDepth: { min: 0, max: 0.72 },
  pointSize: { min: 1.15, max: 3.8 },
  cameraZ: { min: 3.2, max: 6.8 },
  fovDeg: { min: 34, max: 52 },
  motionIntensity: { min: 0, max: 0.62 },
  shaderPhase: { min: 0, max: 6.2832 },
  bloomStrength: { min: 0, max: 0.58 },
} as const;

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const FNV_MASK_64 = 0xffffffffffffffffn;
const PROFILE_DOMAIN = new TextEncoder().encode("solsoul:animated_soul_profile:v1");
const TEXT_ENCODER = new TextEncoder();

const CORE_TRAIT_KEYS = ["palette", "mood", "form", "background"] as const;
const GENERATED_TRAIT_KEYS = [
  "characterArchetype",
  "gogglesEyes",
  "expression",
  "gasAuraCloud",
  "background",
  "outfit",
  "relic",
  "gasLevel",
] as const satisfies readonly (keyof Omit<AppSoulTraitSet, "animationBehavior">)[];

const FAMILY_BY_ANIMATION_BEHAVIOR: Readonly<Record<string, AnimatedSoulBehaviorFamily>> = {
  gentle_gas_drift: "drift",
  lens_shine: "shine",
  aura_flow: "flow",
  background_pulse: "pulse",
  sparkle_pop: "sparkle",
  rainbow_orbit: "orbit",
  mythic_prism_bloom: "bloom",
} as const;

const FAMILY_INTENSITY_CAPS = {
  drift: 0.27,
  shine: 0.3,
  flow: 0.32,
  pulse: 0.29,
  sparkle: 0.34,
  orbit: 0.36,
  bloom: 0.38,
} as const satisfies Readonly<Record<AnimatedSoulBehaviorFamily, number>>;

const FLOW_FAMILY_BY_BEHAVIOR = {
  drift: "laminar",
  shine: "radial",
  flow: "curl",
  pulse: "radial",
  sparkle: "spark",
  orbit: "orbital",
  bloom: "bloom",
} as const satisfies Readonly<Record<AnimatedSoulBehaviorFamily, AnimatedSoulFlowFamily>>;

const FLOW_PALETTES = {
  solana: ["#14f195", "#9945ff", "#38d5ff"],
  aurora: ["#38d5ff", "#14f195", "#d7ff3f"],
  ember: ["#ff6b35", "#ff4f64", "#ffd166"],
  mono: ["#f8f8f2", "#a1a1aa", "#52525b"],
} as const satisfies Readonly<Record<AnimatedSoulFinalizedTraits["core"]["palette"], readonly [string, string, string]>>;

const EVOLUTION_STATE_KEYS = [
  "level",
  "stage",
  "energy",
  "generation",
  "rarityTier",
  "rarityScore",
  "provenanceSide",
  "claimCount",
  "receiptState",
] as const satisfies readonly (keyof AnimatedSoulEvolutionState)[];

const DISPLAY_STATE_KEYS = [
  "surface",
  "density",
  "motion",
] as const satisfies readonly (keyof AnimatedSoulDisplayState)[];

export function deriveAnimatedSoulProfile(input: AnimatedSoulProfileInput): AnimatedSoulProfile {
  const behaviorFamily = resolveBehaviorFamily(input.animationBehavior);
  const hash = baseProfileHash(input);
  const maxIntensity = FAMILY_INTENSITY_CAPS[behaviorFamily];
  const intensity = boundedDecimal(hash, "intensity", 0.14, maxIntensity, 3);
  const [minDurationMs, maxDurationMs] = durationRange(behaviorFamily);
  const durationMs = boundedInteger(hash, "duration", minDurationMs, maxDurationMs);
  const delayMs = -boundedInteger(hash, "phase", 0, durationMs);
  const driftX = signedBoundedDecimal(hash, "drift-x", 1.5, driftCap(behaviorFamily), 2);
  const driftY = signedBoundedDecimal(hash, "drift-y", 1.5, driftCap(behaviorFamily), 2);
  const rotationDeg = signedBoundedDecimal(hash, "rotation", 0.25, rotationCap(behaviorFamily), 2);
  const scale = boundedDecimal(hash, "scale", 1.004, scaleCap(behaviorFamily), 4);
  const glowOpacity = boundedDecimal(hash, "glow", 0.08, glowCap(behaviorFamily), 3);
  const shimmerOpacity = boundedDecimal(hash, "shimmer", 0.04, shimmerCap(behaviorFamily), 3);
  const orbitRadiusPx = boundedDecimal(hash, "orbit", 3, orbitCap(behaviorFamily), 2);
  const accentHueDeg = boundedInteger(
    hash,
    "accent-hue",
    ANIMATED_SOUL_PROFILE_LIMITS.accentHueDeg.min,
    ANIMATED_SOUL_PROFILE_LIMITS.accentHueDeg.max,
  );
  const flowProfile = deriveAnimatedSoulFlowProfile({
    input,
    hash,
    behaviorFamily,
    accentHueDeg,
  });
  const threeProfile = deriveAnimatedSoulThreeProfile({
    input,
    hash,
    behaviorFamily,
    accentHueDeg,
  });
  const [flowPrimary, flowSecondary, flowTertiary, flowAccent] = flowProfile.palette;
  const [phaseA, phaseB, phaseC] = flowProfile.phaseOffsets;
  const [threePrimary, threeSecondary, threeAccent] = threeProfile.palette;

  return {
    sourceAnimationBehavior: input.animationBehavior,
    behaviorFamily,
    displayState: input.displayState,
    intensity,
    durationMs,
    delayMs,
    driftX,
    driftY,
    scale,
    rotationDeg,
    glowOpacity,
    shimmerOpacity,
    orbitRadiusPx,
    accentHueDeg,
    flowProfile,
    threeProfile,
    cssVariables: {
      "--soul-preview-duration": `${durationMs}ms`,
      "--soul-preview-delay": `${delayMs}ms`,
      "--soul-preview-intensity": formatUnitless(intensity),
      "--soul-preview-drift-x": `${formatUnitless(driftX)}px`,
      "--soul-preview-drift-y": `${formatUnitless(driftY)}px`,
      "--soul-preview-scale": formatUnitless(scale),
      "--soul-preview-rotation": `${formatUnitless(rotationDeg)}deg`,
      "--soul-preview-glow-opacity": formatUnitless(glowOpacity),
      "--soul-preview-shimmer-opacity": formatUnitless(shimmerOpacity),
      "--soul-preview-orbit-radius": `${formatUnitless(orbitRadiusPx)}px`,
      "--soul-preview-accent-hue": `${accentHueDeg}deg`,
      "--soul-flow-particle-budget": `${flowProfile.particleBudget}`,
      "--soul-flow-speed": formatUnitless(flowProfile.speed),
      "--soul-flow-density": formatUnitless(flowProfile.density),
      "--soul-flow-swirl": formatUnitless(flowProfile.swirl),
      "--soul-flow-field-scale": formatUnitless(flowProfile.fieldScale),
      "--soul-flow-phase-a": formatUnitless(phaseA),
      "--soul-flow-phase-b": formatUnitless(phaseB),
      "--soul-flow-phase-c": formatUnitless(phaseC),
      "--soul-flow-palette-primary": flowPrimary,
      "--soul-flow-palette-secondary": flowSecondary,
      "--soul-flow-palette-tertiary": flowTertiary,
      "--soul-flow-palette-accent": flowAccent,
      "--soul-three-particle-budget": `${threeProfile.particleBudget}`,
      "--soul-three-lightfield-layers": `${threeProfile.lightfieldLayers}`,
      "--soul-three-halo-radius": formatUnitless(threeProfile.haloRadius),
      "--soul-three-orbit-count": `${threeProfile.orbitCount}`,
      "--soul-three-orbit-speed": formatUnitless(threeProfile.orbitSpeed),
      "--soul-three-orbit-tilt": `${formatUnitless(threeProfile.orbitTiltDeg)}deg`,
      "--soul-three-parallax-depth": formatUnitless(threeProfile.parallaxDepth),
      "--soul-three-point-size": `${formatUnitless(threeProfile.pointSize)}px`,
      "--soul-three-camera-z": formatUnitless(threeProfile.cameraZ),
      "--soul-three-fov": `${threeProfile.fovDeg}deg`,
      "--soul-three-motion-intensity": formatUnitless(threeProfile.motionIntensity),
      "--soul-three-shader-phase": formatUnitless(threeProfile.shaderPhase),
      "--soul-three-bloom-strength": formatUnitless(threeProfile.bloomStrength),
      "--soul-three-palette-primary": threePrimary,
      "--soul-three-palette-secondary": threeSecondary,
      "--soul-three-palette-accent": threeAccent,
    },
  };
}

function deriveAnimatedSoulFlowProfile({
  input,
  hash,
  behaviorFamily,
  accentHueDeg,
}: {
  input: AnimatedSoulProfileInput;
  hash: bigint;
  behaviorFamily: AnimatedSoulBehaviorFamily;
  accentHueDeg: number;
}): AnimatedSoulFlowProfile {
  const family = FLOW_FAMILY_BY_BEHAVIOR[behaviorFamily];
  const motion = input.displayState?.motion ?? "auto";
  const [minParticles, maxParticles] = particleBudgetRange(input.displayState);
  const evolutionEnergy = normalizedEvolutionEnergy(input.evolutionState);
  const baseParticleBudget = boundedInteger(
    hash,
    "flow.particle-budget",
    minParticles,
    maxParticles,
  );
  const particleBudget =
    motion === "off"
      ? 0
      : clampInteger(
          Math.round(baseParticleBudget + evolutionEnergy * (maxParticles - minParticles) * 0.16),
          minParticles,
          maxParticles,
        );
  const maxSpeed =
    motion === "reduced"
      ? ANIMATED_SOUL_FLOW_PROFILE_LIMITS.reducedSpeed.max
      : motion === "off"
        ? 0
        : speedCap(behaviorFamily);
  const baseSpeed = boundedDecimal(
    hash,
    "flow.speed",
    motion === "off" ? 0 : ANIMATED_SOUL_FLOW_PROFILE_LIMITS.speed.min + 0.18,
    maxSpeed,
    3,
  );
  const speed = motion === "off" ? 0 : roundTo(clamp(baseSpeed * (0.88 + evolutionEnergy * 0.22), 0, maxSpeed), 3);
  const maxDensity =
    motion === "reduced"
      ? ANIMATED_SOUL_FLOW_PROFILE_LIMITS.reducedDensity.max
      : motion === "off"
        ? 0
        : densityCap(input.displayState);
  const density =
    motion === "off"
      ? 0
      : roundTo(
          clamp(
            boundedDecimal(hash, "flow.density", 0.22, maxDensity, 3) +
              evolutionEnergy * 0.07,
            ANIMATED_SOUL_FLOW_PROFILE_LIMITS.density.min,
            maxDensity,
          ),
          3,
        );
  const swirlMagnitude = boundedDecimal(
    hash,
    "flow.swirl",
    0.08,
    swirlCap(behaviorFamily),
    3,
  );
  const swirlDirection = flowDirectionForProvenance(input.evolutionState?.provenanceSide);
  const swirl =
    motion === "off"
      ? 0
      : roundTo(
          clamp(
            swirlMagnitude * swirlDirection + signedBoundedDecimal(hash, "flow.swirl-bias", 0.02, 0.12, 3),
            ANIMATED_SOUL_FLOW_PROFILE_LIMITS.swirl.min,
            ANIMATED_SOUL_FLOW_PROFILE_LIMITS.swirl.max,
          ),
          3,
        );
  const fieldScale = boundedDecimal(
    hash,
    "flow.field-scale",
    ANIMATED_SOUL_FLOW_PROFILE_LIMITS.fieldScale.min,
    ANIMATED_SOUL_FLOW_PROFILE_LIMITS.fieldScale.max,
    3,
  );
  const palette = flowPaletteForCore(input.finalizedTraits.core.palette, accentHueDeg);
  const phaseOffsets = [
    boundedDecimal(hash, "flow.phase.0", 0, ANIMATED_SOUL_FLOW_PROFILE_LIMITS.phaseOffset.max, 4),
    boundedDecimal(hash, "flow.phase.1", 0, ANIMATED_SOUL_FLOW_PROFILE_LIMITS.phaseOffset.max, 4),
    boundedDecimal(hash, "flow.phase.2", 0, ANIMATED_SOUL_FLOW_PROFILE_LIMITS.phaseOffset.max, 4),
  ] as const;

  return {
    family,
    particleBudget,
    palette,
    speed,
    density,
    swirl,
    fieldScale,
    phaseOffsets,
  };
}

function deriveAnimatedSoulThreeProfile({
  input,
  hash,
  behaviorFamily,
  accentHueDeg,
}: {
  input: AnimatedSoulProfileInput;
  hash: bigint;
  behaviorFamily: AnimatedSoulBehaviorFamily;
  accentHueDeg: number;
}): AnimatedSoulThreeProfile {
  const motion = input.displayState?.motion ?? "auto";
  const qualityTier = threeQualityTierForDisplay(input.displayState);
  const surfaceIntent =
    qualityTier === "fallback" || motion === "off" ? "canvas-fallback" : "webgl";
  const [minParticles, maxParticles] = threeParticleBudgetRange(qualityTier, motion);
  const evolutionEnergy = normalizedEvolutionEnergy(input.evolutionState);
  const baseParticleBudget = boundedInteger(
    hash,
    "three.particle-budget",
    minParticles,
    maxParticles,
  );
  const particleBudget =
    surfaceIntent === "canvas-fallback"
      ? 0
      : clampInteger(
          Math.round(baseParticleBudget + evolutionEnergy * (maxParticles - minParticles) * 0.12),
          minParticles,
          maxParticles,
        );
  const layerRange = threeLightfieldLayerRange(qualityTier);
  const lightfieldLayers =
    surfaceIntent === "canvas-fallback"
      ? 0
      : boundedInteger(hash, "three.lightfield-layers", layerRange[0], layerRange[1]);
  const motionCap =
    motion === "reduced" ? 0.2 : motion === "off" ? 0 : threeMotionCap(behaviorFamily);
  const motionIntensity =
    surfaceIntent === "canvas-fallback"
      ? 0
      : roundTo(
          clamp(
            boundedDecimal(hash, "three.motion-intensity", 0.12, motionCap, 3) +
              evolutionEnergy * 0.06,
            ANIMATED_SOUL_THREE_PROFILE_LIMITS.motionIntensity.min,
            motionCap,
          ),
          3,
        );
  const orbitSpeed =
    surfaceIntent === "canvas-fallback"
      ? 0
      : roundTo(
          clamp(
            boundedDecimal(hash, "three.orbit-speed", 0.08, threeOrbitSpeedCap(behaviorFamily), 3) *
              (motion === "reduced" ? 0.34 : 0.82 + evolutionEnergy * 0.2),
            ANIMATED_SOUL_THREE_PROFILE_LIMITS.orbitSpeed.min,
            motion === "reduced" ? 0.22 : ANIMATED_SOUL_THREE_PROFILE_LIMITS.orbitSpeed.max,
          ),
          3,
        );
  const orbitCount =
    surfaceIntent === "canvas-fallback"
      ? 0
      : boundedInteger(hash, "three.orbit-count", qualityTier === "mobile" ? 2 : 3, threeOrbitCountCap(qualityTier));
  const parallaxDepth =
    surfaceIntent === "canvas-fallback"
      ? 0
      : boundedDecimal(hash, "three.parallax-depth", 0.12, threeParallaxCap(qualityTier), 3);

  return {
    surfaceIntent,
    qualityTier,
    particleBudget,
    lightfieldLayers,
    palette: threePaletteForCore(input.finalizedTraits.core.palette, accentHueDeg),
    haloRadius: boundedDecimal(
      hash,
      "three.halo-radius",
      threeHaloMin(qualityTier),
      threeHaloMax(qualityTier),
      3,
    ),
    orbitCount,
    orbitSpeed,
    orbitTiltDeg:
      surfaceIntent === "canvas-fallback"
        ? 0
        : signedBoundedDecimal(hash, "three.orbit-tilt", 8, 28, 2),
    parallaxDepth,
    pointSize: boundedDecimal(
      hash,
      "three.point-size",
      qualityTier === "mobile" ? 1.15 : 1.45,
      qualityTier === "hero" ? 3.8 : 2.9,
      2,
    ),
    cameraZ: boundedDecimal(hash, "three.camera-z", 3.2, qualityTier === "hero" ? 6.8 : 5.4, 2),
    fovDeg: boundedInteger(hash, "three.fov", 34, qualityTier === "mobile" ? 46 : 52),
    motionIntensity,
    shaderPhase: boundedDecimal(hash, "three.shader-phase", 0, ANIMATED_SOUL_THREE_PROFILE_LIMITS.shaderPhase.max, 4),
    bloomStrength:
      surfaceIntent === "canvas-fallback"
        ? 0
        : boundedDecimal(hash, "three.bloom-strength", 0.16, threeBloomCap(qualityTier, behaviorFamily), 3),
  };
}

function threeQualityTierForDisplay(
  displayState: AnimatedSoulDisplayState | undefined,
): AnimatedSoulThreeQualityTier {
  if (displayState?.motion === "off") {
    return "fallback";
  }
  switch (displayState?.density) {
    case "compact":
      return "fallback";
    case "compactDetail":
      return "mobile";
    case "detail":
      return "detail";
    case "hero":
    case undefined:
      return "hero";
  }
}

function threeParticleBudgetRange(
  qualityTier: AnimatedSoulThreeQualityTier,
  motion: AnimatedSoulDisplayMotion,
): readonly [number, number] {
  if (qualityTier === "fallback" || motion === "off") {
    return [0, 0];
  }
  if (motion === "reduced") {
    const max =
      qualityTier === "hero"
        ? ANIMATED_SOUL_THREE_PROFILE_LIMITS.reducedParticleBudget.max
        : qualityTier === "detail"
          ? 540
          : 240;
    const min =
      qualityTier === "hero"
        ? 240
        : qualityTier === "detail"
          ? 160
          : ANIMATED_SOUL_THREE_PROFILE_LIMITS.reducedParticleBudget.min;
    return [min, max];
  }
  switch (qualityTier) {
    case "hero":
      return [
        ANIMATED_SOUL_THREE_PROFILE_LIMITS.heroParticleBudget.min,
        ANIMATED_SOUL_THREE_PROFILE_LIMITS.heroParticleBudget.max,
      ];
    case "detail":
      return [
        ANIMATED_SOUL_THREE_PROFILE_LIMITS.detailParticleBudget.min,
        ANIMATED_SOUL_THREE_PROFILE_LIMITS.detailParticleBudget.max,
      ];
    case "mobile":
      return [
        ANIMATED_SOUL_THREE_PROFILE_LIMITS.mobileParticleBudget.min,
        ANIMATED_SOUL_THREE_PROFILE_LIMITS.mobileParticleBudget.max,
      ];
  }
}

function threeLightfieldLayerRange(
  qualityTier: AnimatedSoulThreeQualityTier,
): readonly [number, number] {
  switch (qualityTier) {
    case "hero":
      return [6, 9];
    case "detail":
      return [4, 7];
    case "mobile":
      return [3, 5];
    case "fallback":
      return [0, 0];
  }
}

function threeMotionCap(family: AnimatedSoulBehaviorFamily): number {
  switch (family) {
    case "sparkle":
    case "orbit":
      return 0.62;
    case "bloom":
    case "flow":
      return 0.56;
    case "shine":
    case "pulse":
      return 0.48;
    case "drift":
      return 0.38;
  }
}

function threeOrbitSpeedCap(family: AnimatedSoulBehaviorFamily): number {
  switch (family) {
    case "sparkle":
    case "orbit":
      return 0.72;
    case "bloom":
    case "flow":
      return 0.64;
    case "shine":
    case "pulse":
      return 0.52;
    case "drift":
      return 0.38;
  }
}

function threeOrbitCountCap(qualityTier: AnimatedSoulThreeQualityTier): number {
  switch (qualityTier) {
    case "hero":
      return 6;
    case "detail":
      return 5;
    case "mobile":
      return 3;
    case "fallback":
      return 0;
  }
}

function threeParallaxCap(qualityTier: AnimatedSoulThreeQualityTier): number {
  switch (qualityTier) {
    case "hero":
      return 0.72;
    case "detail":
      return 0.52;
    case "mobile":
      return 0.28;
    case "fallback":
      return 0;
  }
}

function threeHaloMin(qualityTier: AnimatedSoulThreeQualityTier): number {
  return qualityTier === "mobile" ? 0.82 : 0.94;
}

function threeHaloMax(qualityTier: AnimatedSoulThreeQualityTier): number {
  switch (qualityTier) {
    case "hero":
      return 1.42;
    case "detail":
      return 1.26;
    case "mobile":
      return 1.08;
    case "fallback":
      return 1;
  }
}

function threeBloomCap(
  qualityTier: AnimatedSoulThreeQualityTier,
  family: AnimatedSoulBehaviorFamily,
): number {
  const tierCap =
    qualityTier === "hero" ? 0.58 : qualityTier === "detail" ? 0.44 : 0.26;
  const familyCap = family === "bloom" || family === "sparkle" ? 0.58 : 0.46;
  return Math.min(tierCap, familyCap);
}

function threePaletteForCore(
  palette: AnimatedSoulFinalizedTraits["core"]["palette"],
  accentHueDeg: number,
): AnimatedSoulThreePalette {
  const [primary, secondary] = FLOW_PALETTES[palette];
  return [primary, secondary, `hsl(${accentHueDeg} 96% 64%)`];
}

function resolveBehaviorFamily(animationBehavior: string): AnimatedSoulBehaviorFamily {
  return FAMILY_BY_ANIMATION_BEHAVIOR[animationBehavior] ?? "drift";
}

function durationRange(family: AnimatedSoulBehaviorFamily): readonly [number, number] {
  switch (family) {
    case "sparkle":
      return [9_000, 15_000];
    case "shine":
      return [12_000, 18_000];
    case "pulse":
      return [14_000, 22_000];
    case "orbit":
    case "bloom":
      return [16_000, 26_000];
    case "flow":
      return [15_000, 24_000];
    case "drift":
      return [18_000, 26_000];
  }
}

function driftCap(family: AnimatedSoulBehaviorFamily): number {
  return family === "orbit" ? 9 : family === "sparkle" ? 4.5 : 7;
}

function rotationCap(family: AnimatedSoulBehaviorFamily): number {
  return family === "orbit" || family === "bloom" ? 2.4 : 1.45;
}

function scaleCap(family: AnimatedSoulBehaviorFamily): number {
  return family === "pulse" || family === "bloom" ? 1.026 : 1.016;
}

function glowCap(family: AnimatedSoulBehaviorFamily): number {
  return family === "bloom" ? 0.22 : family === "sparkle" ? 0.2 : 0.17;
}

function shimmerCap(family: AnimatedSoulBehaviorFamily): number {
  return family === "shine" || family === "sparkle" ? 0.18 : 0.12;
}

function orbitCap(family: AnimatedSoulBehaviorFamily): number {
  return family === "orbit" ? 13 : 7;
}

function speedCap(family: AnimatedSoulBehaviorFamily): number {
  switch (family) {
    case "sparkle":
      return 1.18;
    case "orbit":
    case "bloom":
      return 1.04;
    case "flow":
      return 0.96;
    case "shine":
    case "pulse":
      return 0.82;
    case "drift":
      return 0.64;
  }
}

function swirlCap(family: AnimatedSoulBehaviorFamily): number {
  switch (family) {
    case "orbit":
    case "flow":
      return 0.88;
    case "bloom":
    case "sparkle":
      return 0.68;
    case "pulse":
    case "shine":
      return 0.48;
    case "drift":
      return 0.38;
  }
}

function densityCap(displayState: AnimatedSoulDisplayState | undefined): number {
  switch (displayState?.density) {
    case "compact":
      return 0.5;
    case "compactDetail":
      return 0.68;
    case "detail":
      return 0.82;
    case "hero":
    case undefined:
      return ANIMATED_SOUL_FLOW_PROFILE_LIMITS.density.max;
  }
}

function particleBudgetRange(
  displayState: AnimatedSoulDisplayState | undefined,
): readonly [number, number] {
  if (displayState?.motion === "off") {
    return [0, 0];
  }
  if (displayState?.motion === "reduced") {
    return [
      ANIMATED_SOUL_FLOW_PROFILE_LIMITS.reducedParticleBudget.min,
      ANIMATED_SOUL_FLOW_PROFILE_LIMITS.reducedParticleBudget.max,
    ];
  }
  switch (displayState?.density) {
    case "compact":
      return [
        ANIMATED_SOUL_FLOW_PROFILE_LIMITS.compactParticleBudget.min,
        ANIMATED_SOUL_FLOW_PROFILE_LIMITS.compactParticleBudget.max,
      ];
    case "compactDetail":
      return [24, 56];
    case "detail":
      return [42, 88];
    case "hero":
    case undefined:
      return [64, ANIMATED_SOUL_FLOW_PROFILE_LIMITS.particleBudget.max];
  }
}

function baseProfileHash(input: AnimatedSoulProfileInput): bigint {
  let hash = FNV_OFFSET_64;
  hash = mixBytes(hash, PROFILE_DOMAIN);
  hash = mixSegment(hash, "seed", normalizeSeed(input.seed));
  hash = mixSegment(hash, "animationBehavior", TEXT_ENCODER.encode(input.animationBehavior));

  for (const key of CORE_TRAIT_KEYS) {
    hash = mixSegment(
      hash,
      `core.${key}`,
      TEXT_ENCODER.encode(input.finalizedTraits.core[key]),
    );
  }
  for (const key of GENERATED_TRAIT_KEYS) {
    hash = mixSegment(
      hash,
      `generated.${key}`,
      TEXT_ENCODER.encode(input.finalizedTraits.generated?.[key] ?? ""),
    );
  }
  for (const key of EVOLUTION_STATE_KEYS) {
    hash = mixSegment(
      hash,
      `evolution.${key}`,
      TEXT_ENCODER.encode(normalizeProfileScalar(input.evolutionState?.[key])),
    );
  }
  for (const key of DISPLAY_STATE_KEYS) {
    hash = mixSegment(
      hash,
      `display.${key}`,
      TEXT_ENCODER.encode(normalizeProfileScalar(input.displayState?.[key])),
    );
  }
  return hash;
}

function boundedInteger(hash: bigint, label: string, min: number, max: number): number {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  const span = upper - lower + 1;
  return lower + Number(hashForLabel(hash, label) % BigInt(span));
}

function boundedDecimal(
  hash: bigint,
  label: string,
  min: number,
  max: number,
  precision: number,
): number {
  const fraction = Number(hashForLabel(hash, label) % 1_000_000n) / 999_999;
  return roundTo(min + (max - min) * fraction, precision);
}

function signedBoundedDecimal(
  hash: bigint,
  label: string,
  minMagnitude: number,
  maxMagnitude: number,
  precision: number,
): number {
  const magnitude = boundedDecimal(
    hash,
    `${label}:magnitude`,
    minMagnitude,
    maxMagnitude,
    precision,
  );
  return hashForLabel(hash, `${label}:sign`) % 2n === 0n ? magnitude : -magnitude;
}

function hashForLabel(hash: bigint, label: string): bigint {
  return mixBytes(mixBytes(hash, Uint8Array.of(0xfd)), TEXT_ENCODER.encode(label));
}

function mixSegment(hash: bigint, label: string, bytes: Uint8Array): bigint {
  let mixed = mixBytes(hash, Uint8Array.of(0xfe));
  mixed = mixBytes(mixed, TEXT_ENCODER.encode(label));
  mixed = mixBytes(mixed, Uint8Array.of(0xff));
  mixed = mixBytes(mixed, bytes);
  return mixed;
}

function mixBytes(hash: bigint, bytes: Uint8Array): bigint {
  let mixed = hash;
  for (const byte of bytes) {
    mixed ^= BigInt(byte);
    mixed = (mixed * FNV_PRIME_64) & FNV_MASK_64;
  }
  return mixed;
}

function normalizeSeed(seed: string | Uint8Array): Uint8Array {
  return typeof seed === "string" ? TEXT_ENCODER.encode(seed) : seed;
}

function normalizeProfileScalar(value: AnimatedSoulEvolutionScalar): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? `${value}` : "";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return value;
}

function normalizedEvolutionEnergy(state: AnimatedSoulEvolutionState | undefined): number {
  const explicitEnergy = normalizedNumericScalar(state?.energy, 100);
  if (explicitEnergy != null) {
    return explicitEnergy;
  }
  const rarityScore = normalizedNumericScalar(state?.rarityScore, 100);
  const level = normalizedNumericScalar(state?.level, 100);
  const generation = normalizedNumericScalar(state?.generation, 64);
  const claimCount = normalizedNumericScalar(state?.claimCount, 32);
  const values = [rarityScore, level, generation, claimCount].filter(
    (value): value is number => value != null,
  );
  if (values.length === 0) {
    return 0.28;
  }
  return roundTo(values.reduce((sum, value) => sum + value, 0) / values.length, 3);
}

function normalizedNumericScalar(
  value: AnimatedSoulEvolutionScalar,
  divisor: number,
): number | null {
  const normalized = normalizeProfileScalar(value);
  if (normalized.length === 0) {
    return null;
  }
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return clamp(Math.abs(numeric) / divisor, 0, 1);
}

function flowDirectionForProvenance(value: AnimatedSoulEvolutionScalar): 1 | -1 {
  const normalized = normalizeProfileScalar(value).toLowerCase();
  return normalized === "sell" || normalized === "2" ? -1 : 1;
}

function flowPaletteForCore(
  palette: AnimatedSoulFinalizedTraits["core"]["palette"],
  accentHueDeg: number,
): AnimatedSoulFlowPalette {
  const [primary, secondary, tertiary] = FLOW_PALETTES[palette];
  return [primary, secondary, tertiary, `hsl(${accentHueDeg} 96% 64%)`];
}

function roundTo(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

function formatUnitless(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${value}`;
}
