export type AnimatedSoulThreeModule = typeof import("three");

export async function loadAnimatedSoulThree(): Promise<AnimatedSoulThreeModule | null> {
  if (typeof window === "undefined") {
    return null;
  }

  return import("three");
}
