import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAUNCH_ART_THEME_ID,
  LAUNCH_ART_THEMES,
  getLaunchArtTheme,
} from "./starterTemplates";
import { resolveSoulTheme } from "sdk";

describe("starterTemplates mathematical renderer launch catalog", () => {
  it("defaults launch art to Symphony while preserving all built-in math renderers and custom upload mode", () => {
    expect(DEFAULT_LAUNCH_ART_THEME_ID).toBe("symphony");
    expect(LAUNCH_ART_THEMES.map((theme) => theme.id)).toEqual([
      "fractal",
      "field",
      "lattice",
      "chaos",
      "harmonic",
      "pixel_fractal",
      "pixel_art",
      "symphony",
      "custom",
    ]);
    expect(getLaunchArtTheme("fractal")).toMatchObject({
      renderer: "built-in",
      styleParams: "theme=fractal",
    });
    expect(getLaunchArtTheme("field")).toMatchObject({
      renderer: "built-in",
      styleParams: "theme=field",
    });
    expect(getLaunchArtTheme("chaos").styleParams).toBe("theme=chaos");
    expect(getLaunchArtTheme("harmonic").styleParams).toBe("theme=harmonic");
    expect(getLaunchArtTheme("pixel_fractal").styleParams).toBe("theme=pixelfractal");
    expect(getLaunchArtTheme("pixel_art").styleParams).toBe("theme=pixelart");
    expect(getLaunchArtTheme("symphony").styleParams).toBe("theme=symphony");
    expect(getLaunchArtTheme("custom").renderer).toBe("custom-template");
  });

  it("maps every launch theme style param to the SDK token detail display path", () => {
    for (const theme of LAUNCH_ART_THEMES) {
      const resolved = resolveSoulTheme({
        templateLen: theme.renderer === "custom-template" ? 1 : 0,
        styleParams: theme.styleParams,
      });

      expect(resolved.id).toBe(theme.id);
      expect(resolved.renderer).toBe(theme.renderer);
      expect(resolved.label).not.toBe("Legacy / unknown art theme");
    }
  });

  it("uses inline safe mathematical preview art without external references", () => {
    const previewSvg = getLaunchArtTheme("fractal").previewSvg;

    expect(previewSvg).toContain('aria-label="Fractal Structure preview"');
    expect(previewSvg.toLowerCase()).not.toContain("http");
    expect(previewSvg.toLowerCase()).not.toContain("<script");
    expect(previewSvg.toLowerCase()).not.toContain("href=");
  });
});
