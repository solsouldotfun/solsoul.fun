import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ANIMATED_SOUL_FLOW_PROFILE_LIMITS,
  ANIMATED_SOUL_PROFILE_LIMITS,
  ANIMATED_SOUL_THREE_PROFILE_LIMITS,
  deriveAnimatedSoulProfile,
  type AnimatedSoulFinalizedTraits,
  type AnimatedSoulProfileInput,
} from "./animatedSoulProfile";

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

const baseInput = {
  seed: "animated-soul-profile-fixture-alpha",
  finalizedTraits,
  animationBehavior: "aura_flow",
} satisfies AnimatedSoulProfileInput;

describe("deriveAnimatedSoulProfile", () => {
  it("repeats identical profile and CSS variable values for identical inputs", () => {
    const first = deriveAnimatedSoulProfile(baseInput);
    const repeat = deriveAnimatedSoulProfile({
      seed: "animated-soul-profile-fixture-alpha",
      finalizedTraits: {
        core: { ...finalizedTraits.core },
        generated: { ...finalizedTraits.generated },
      },
      animationBehavior: "aura_flow",
    });

    expect(first).toEqual(repeat);
    expect(first.cssVariables).toEqual(repeat.cssVariables);
    expect(first.flowProfile).toEqual(repeat.flowProfile);
  });

  it("varies within the same bounded premium language for different seeds", () => {
    const first = deriveAnimatedSoulProfile(baseInput);
    const second = deriveAnimatedSoulProfile({
      ...baseInput,
      seed: "animated-soul-profile-fixture-beta",
    });

    expect(second).not.toEqual(first);
    expect(second.behaviorFamily).toBe(first.behaviorFamily);
    expect(second.cssVariables).not.toEqual(first.cssVariables);
    expectProfileWithinLimits(second);
  });

  it("uses finalized trait differences as deterministic profile input", () => {
    const first = deriveAnimatedSoulProfile(baseInput);
    const traitShifted = deriveAnimatedSoulProfile({
      ...baseInput,
      finalizedTraits: {
        ...finalizedTraits,
        core: {
          ...finalizedTraits.core,
          palette: "ember",
        },
        generated: {
          ...finalizedTraits.generated,
          gasAuraCloud: "plasma_halo",
        },
      },
    });

    expect(traitShifted).not.toEqual(first);
    expect(traitShifted.cssVariables).not.toEqual(first.cssVariables);
    expectProfileWithinLimits(traitShifted);
  });

  it("maps materially different animationBehavior values to different bounded families", () => {
    const flow = deriveAnimatedSoulProfile(baseInput);
    const orbit = deriveAnimatedSoulProfile({
      ...baseInput,
      animationBehavior: "rainbow_orbit",
    });
    const shine = deriveAnimatedSoulProfile({
      ...baseInput,
      animationBehavior: "lens_shine",
    });

    expect(flow.behaviorFamily).toBe("flow");
    expect(orbit.behaviorFamily).toBe("orbit");
    expect(shine.behaviorFamily).toBe("shine");
    expect(orbit).not.toEqual(flow);
    expect(shine).not.toEqual(flow);
    expectProfileWithinLimits(orbit);
    expectProfileWithinLimits(shine);
  });

  it("derives bounded Processing-like flow fields from evolution display state", () => {
    const first = deriveAnimatedSoulProfile({
      ...baseInput,
      evolutionState: {
        level: 4,
        stage: "active",
        energy: 72,
        generation: 8n,
        rarityTier: "epic",
        rarityScore: 83,
        provenanceSide: "buy",
        claimCount: 2,
      },
      displayState: { surface: "tokenDetail", density: "detail", motion: "auto" },
    });
    const repeat = deriveAnimatedSoulProfile({
      ...baseInput,
      evolutionState: {
        level: "4",
        stage: "active",
        energy: "72",
        generation: "8",
        rarityTier: "epic",
        rarityScore: "83",
        provenanceSide: "buy",
        claimCount: "2",
      },
      displayState: { surface: "tokenDetail", density: "detail", motion: "auto" },
    });

    expect(first.flowProfile).toEqual(repeat.flowProfile);
    expect(first.flowProfile.family).toBe("curl");
    expect(first.flowProfile.palette).toHaveLength(4);
    expect(first.flowProfile.phaseOffsets).toHaveLength(3);
    expect(first.cssVariables["--soul-flow-particle-budget"]).toBe(
      String(first.flowProfile.particleBudget),
    );
    expect(first.cssVariables["--soul-flow-palette-accent"]).toBe(
      first.flowProfile.palette[3],
    );
    expectProfileWithinLimits(first);
  });

  it("changes flow identity when evolution state changes while staying bounded", () => {
    const young = deriveAnimatedSoulProfile({
      ...baseInput,
      evolutionState: { level: 1, stage: "genesis", energy: 18, generation: 1 },
      displayState: { surface: "tokenDetail", density: "hero", motion: "auto" },
    });
    const evolved = deriveAnimatedSoulProfile({
      ...baseInput,
      evolutionState: { level: 9, stage: "radiant", energy: 92, generation: 24 },
      displayState: { surface: "tokenDetail", density: "hero", motion: "auto" },
    });

    expect(evolved.flowProfile).not.toEqual(young.flowProfile);
    expect(evolved.cssVariables).not.toEqual(young.cssVariables);
    expectProfileWithinLimits(young);
    expectProfileWithinLimits(evolved);
  });

  it("derives deterministic bounded Three/WebGL scene profiles for hero, detail, and mobile surfaces", () => {
    const hero = deriveAnimatedSoulProfile({
      ...baseInput,
      evolutionState: { level: 7, stage: "flow", energy: 84, generation: 14 },
      displayState: { surface: "launch", density: "hero", motion: "auto" },
    });
    const heroRepeat = deriveAnimatedSoulProfile({
      ...baseInput,
      evolutionState: { level: "7", stage: "flow", energy: "84", generation: "14" },
      displayState: { surface: "launch", density: "hero", motion: "auto" },
    });
    const detail = deriveAnimatedSoulProfile({
      ...baseInput,
      evolutionState: { level: 7, stage: "flow", energy: 84, generation: 14 },
      displayState: { surface: "tokenDetail", density: "detail", motion: "auto" },
    });
    const mobile = deriveAnimatedSoulProfile({
      ...baseInput,
      evolutionState: { level: 7, stage: "flow", energy: 84, generation: 14 },
      displayState: { surface: "tokenDetail", density: "compactDetail", motion: "auto" },
    });
    const compactFallback = deriveAnimatedSoulProfile({
      ...baseInput,
      evolutionState: { level: 7, stage: "flow", energy: 84, generation: 14 },
      displayState: { surface: "feed", density: "compact", motion: "auto" },
    });
    const reduced = deriveAnimatedSoulProfile({
      ...baseInput,
      evolutionState: { level: 7, stage: "flow", energy: 84, generation: 14 },
      displayState: { surface: "launch", density: "hero", motion: "reduced" },
    });

    expect(hero.threeProfile).toEqual(heroRepeat.threeProfile);
    expect(hero.threeProfile.surfaceIntent).toBe("webgl");
    expect(hero.threeProfile.qualityTier).toBe("hero");
    expect(detail.threeProfile.qualityTier).toBe("detail");
    expect(mobile.threeProfile.qualityTier).toBe("mobile");
    expect(compactFallback.threeProfile.surfaceIntent).toBe("canvas-fallback");
    expect(compactFallback.threeProfile.particleBudget).toBe(0);
    expect(compactFallback.flowProfile.particleBudget).toBeGreaterThan(0);
    expect(hero.threeProfile.particleBudget).toBeGreaterThanOrEqual(
      ANIMATED_SOUL_THREE_PROFILE_LIMITS.heroParticleBudget.min,
    );
    expect(detail.threeProfile.particleBudget).toBeLessThanOrEqual(
      ANIMATED_SOUL_THREE_PROFILE_LIMITS.detailParticleBudget.max,
    );
    expect(detail.threeProfile.particleBudget).toBeGreaterThan(
      mobile.threeProfile.particleBudget,
    );
    expect(reduced.threeProfile.particleBudget).toBeLessThanOrEqual(
      ANIMATED_SOUL_THREE_PROFILE_LIMITS.reducedParticleBudget.max,
    );
    expect(hero.cssVariables["--soul-three-particle-budget"]).toBe(
      String(hero.threeProfile.particleBudget),
    );
    expect(hero.cssVariables["--soul-three-palette-accent"]).toBe(
      hero.threeProfile.palette[2],
    );
    expectProfileWithinLimits(hero);
    expectProfileWithinLimits(detail);
    expectProfileWithinLimits(mobile);
    expectProfileWithinLimits(compactFallback);
    expectProfileWithinLimits(reduced);
  });

  it("keeps compact and reduced display budgets below hero profile budgets", () => {
    const hero = deriveAnimatedSoulProfile({
      ...baseInput,
      displayState: { surface: "launch", density: "hero", motion: "auto" },
    });
    const compact = deriveAnimatedSoulProfile({
      ...baseInput,
      displayState: { surface: "feed", density: "compact", motion: "auto" },
    });
    const reduced = deriveAnimatedSoulProfile({
      ...baseInput,
      displayState: { surface: "gallery", density: "compact", motion: "reduced" },
    });
    const off = deriveAnimatedSoulProfile({
      ...baseInput,
      displayState: { surface: "gallery", density: "compact", motion: "off" },
    });

    expect(hero.flowProfile.particleBudget).toBeGreaterThan(
      ANIMATED_SOUL_FLOW_PROFILE_LIMITS.compactParticleBudget.max,
    );
    expect(compact.flowProfile.particleBudget).toBeLessThanOrEqual(
      ANIMATED_SOUL_FLOW_PROFILE_LIMITS.compactParticleBudget.max,
    );
    expect(reduced.flowProfile.particleBudget).toBeLessThanOrEqual(
      ANIMATED_SOUL_FLOW_PROFILE_LIMITS.reducedParticleBudget.max,
    );
    expect(reduced.flowProfile.speed).toBeLessThanOrEqual(
      ANIMATED_SOUL_FLOW_PROFILE_LIMITS.reducedSpeed.max,
    );
    expect(hero.displayState).toEqual({
      surface: "launch",
      density: "hero",
      motion: "auto",
    });
    expect(compact.displayState).toEqual({
      surface: "feed",
      density: "compact",
      motion: "auto",
    });
    expect(reduced.displayState).toEqual({
      surface: "gallery",
      density: "compact",
      motion: "reduced",
    });
    expect(off.flowProfile.particleBudget).toBe(0);
    expect(off.flowProfile.speed).toBe(0);
    expect(off.flowProfile.density).toBe(0);
  });

  it("keeps every numeric field inside subtle preview limits", () => {
    const cases = [
      baseInput,
      { ...baseInput, seed: Uint8Array.from({ length: 32 }, (_, index) => index) },
      { ...baseInput, animationBehavior: "gentle_gas_drift" },
      { ...baseInput, animationBehavior: "background_pulse" },
      { ...baseInput, animationBehavior: "sparkle_pop" },
      { ...baseInput, animationBehavior: "mythic_prism_bloom" },
    ];

    for (const input of cases) {
      expectProfileWithinLimits(deriveAnimatedSoulProfile(input));
    }
  });

  it("does not use runtime nondeterministic identity inputs or p5 dependencies", () => {
    const source = fs.readFileSync("src/lib/animatedSoulProfile.ts", "utf8");

    expect(source).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|\bp5\b/);
    expect(source).not.toMatch(/\bwindow\b|\bdocument\b|innerWidth|innerHeight|location/);
    expect(source).not.toMatch(/wallet|publicKey|rpc|fetch|XMLHttpRequest/i);
  });

  it("keeps Three dependency direct, lazy, client-only, and wrapper-free", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const loaderSource = fs.readFileSync("src/lib/animatedSoulThreeLoader.ts", "utf8");
    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ];
    const reactThreeScope = `@react-${"three"}`;
    const reactThreePackage = `react-${"three"}`;
    const helperPackage = `dr${"ei"}`;

    expect(packageJson.dependencies?.three).toBe("0.184.0");
    expect(dependencyNames).not.toContain(`${reactThreeScope}/fiber`);
    expect(dependencyNames).not.toContain(`${reactThreeScope}/${helperPackage}`);
    expect(dependencyNames).not.toContain(`${reactThreePackage}-fiber`);
    expect(loaderSource).toContain('typeof window === "undefined"');
    expect(loaderSource).toContain('import("three")');
    expect(loaderSource).not.toMatch(/from ["']three["']/);
    expect(loaderSource).not.toContain(reactThreeScope);
    expect(loaderSource).not.toContain(reactThreePackage);
    expect(loaderSource).not.toContain(helperPackage);
  });
});

function expectProfileWithinLimits(profile: ReturnType<typeof deriveAnimatedSoulProfile>) {
  expect(profile.intensity).toBeGreaterThanOrEqual(ANIMATED_SOUL_PROFILE_LIMITS.intensity.min);
  expect(profile.intensity).toBeLessThanOrEqual(ANIMATED_SOUL_PROFILE_LIMITS.intensity.max);
  expect(profile.durationMs).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_PROFILE_LIMITS.durationMs.min,
  );
  expect(profile.durationMs).toBeLessThanOrEqual(ANIMATED_SOUL_PROFILE_LIMITS.durationMs.max);
  expect(profile.delayMs).toBeGreaterThanOrEqual(ANIMATED_SOUL_PROFILE_LIMITS.delayMs.min);
  expect(profile.delayMs).toBeLessThanOrEqual(ANIMATED_SOUL_PROFILE_LIMITS.delayMs.max);
  expect(Math.abs(profile.driftX)).toBeLessThanOrEqual(
    ANIMATED_SOUL_PROFILE_LIMITS.driftPx.max,
  );
  expect(Math.abs(profile.driftY)).toBeLessThanOrEqual(
    ANIMATED_SOUL_PROFILE_LIMITS.driftPx.max,
  );
  expect(Math.abs(profile.rotationDeg)).toBeLessThanOrEqual(
    ANIMATED_SOUL_PROFILE_LIMITS.rotationDeg.max,
  );
  expect(profile.scale).toBeGreaterThanOrEqual(ANIMATED_SOUL_PROFILE_LIMITS.scale.min);
  expect(profile.scale).toBeLessThanOrEqual(ANIMATED_SOUL_PROFILE_LIMITS.scale.max);
  expect(profile.glowOpacity).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_PROFILE_LIMITS.glowOpacity.min,
  );
  expect(profile.glowOpacity).toBeLessThanOrEqual(
    ANIMATED_SOUL_PROFILE_LIMITS.glowOpacity.max,
  );
  expect(profile.accentHueDeg).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_PROFILE_LIMITS.accentHueDeg.min,
  );
  expect(profile.accentHueDeg).toBeLessThanOrEqual(
    ANIMATED_SOUL_PROFILE_LIMITS.accentHueDeg.max,
  );
  expect(profile.flowProfile.particleBudget).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_FLOW_PROFILE_LIMITS.particleBudget.min,
  );
  expect(profile.flowProfile.particleBudget).toBeLessThanOrEqual(
    ANIMATED_SOUL_FLOW_PROFILE_LIMITS.particleBudget.max,
  );
  expect(profile.threeProfile.particleBudget).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.particleBudget.min,
  );
  expect(profile.threeProfile.particleBudget).toBeLessThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.particleBudget.max,
  );
  expect(profile.threeProfile.lightfieldLayers).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.lightfieldLayers.min,
  );
  expect(profile.threeProfile.lightfieldLayers).toBeLessThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.lightfieldLayers.max,
  );
  expect(profile.threeProfile.haloRadius).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.haloRadius.min,
  );
  expect(profile.threeProfile.haloRadius).toBeLessThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.haloRadius.max,
  );
  expect(profile.threeProfile.orbitCount).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.orbitCount.min,
  );
  expect(profile.threeProfile.orbitCount).toBeLessThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.orbitCount.max,
  );
  expect(profile.threeProfile.orbitSpeed).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.orbitSpeed.min,
  );
  expect(profile.threeProfile.orbitSpeed).toBeLessThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.orbitSpeed.max,
  );
  expect(profile.threeProfile.parallaxDepth).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.parallaxDepth.min,
  );
  expect(profile.threeProfile.parallaxDepth).toBeLessThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.parallaxDepth.max,
  );
  expect(profile.threeProfile.motionIntensity).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.motionIntensity.min,
  );
  expect(profile.threeProfile.motionIntensity).toBeLessThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.motionIntensity.max,
  );
  expect(profile.threeProfile.bloomStrength).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.bloomStrength.min,
  );
  expect(profile.threeProfile.bloomStrength).toBeLessThanOrEqual(
    ANIMATED_SOUL_THREE_PROFILE_LIMITS.bloomStrength.max,
  );
  expect(profile.flowProfile.speed).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_FLOW_PROFILE_LIMITS.speed.min,
  );
  expect(profile.flowProfile.speed).toBeLessThanOrEqual(
    ANIMATED_SOUL_FLOW_PROFILE_LIMITS.speed.max,
  );
  expect(profile.flowProfile.density).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_FLOW_PROFILE_LIMITS.density.min,
  );
  expect(profile.flowProfile.density).toBeLessThanOrEqual(
    ANIMATED_SOUL_FLOW_PROFILE_LIMITS.density.max,
  );
  expect(profile.flowProfile.swirl).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_FLOW_PROFILE_LIMITS.swirl.min,
  );
  expect(profile.flowProfile.swirl).toBeLessThanOrEqual(
    ANIMATED_SOUL_FLOW_PROFILE_LIMITS.swirl.max,
  );
  expect(profile.flowProfile.fieldScale).toBeGreaterThanOrEqual(
    ANIMATED_SOUL_FLOW_PROFILE_LIMITS.fieldScale.min,
  );
  expect(profile.flowProfile.fieldScale).toBeLessThanOrEqual(
    ANIMATED_SOUL_FLOW_PROFILE_LIMITS.fieldScale.max,
  );
  for (const phaseOffset of profile.flowProfile.phaseOffsets) {
    expect(phaseOffset).toBeGreaterThanOrEqual(
      ANIMATED_SOUL_FLOW_PROFILE_LIMITS.phaseOffset.min,
    );
    expect(phaseOffset).toBeLessThanOrEqual(
      ANIMATED_SOUL_FLOW_PROFILE_LIMITS.phaseOffset.max,
    );
  }
  expect(profile.cssVariables["--soul-preview-duration"]).toMatch(/ms$/);
  expect(profile.cssVariables["--soul-preview-drift-x"]).toMatch(/px$/);
  expect(profile.cssVariables["--soul-preview-rotation"]).toMatch(/deg$/);
  expect(profile.cssVariables["--soul-flow-speed"]).toBe(
    String(profile.flowProfile.speed),
  );
  expect(profile.cssVariables["--soul-flow-palette-primary"]).toMatch(/^#|^hsl\(/);
  expect(profile.cssVariables["--soul-three-particle-budget"]).toBe(
    String(profile.threeProfile.particleBudget),
  );
  expect(profile.cssVariables["--soul-three-palette-primary"]).toMatch(/^#|^hsl\(/);
}
