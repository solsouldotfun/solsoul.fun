import { describe, expect, it } from "vitest";
import * as sdk from "./index.js";

describe("mathematical themes", () => {
  it("resolves every launch-supported mathematical theme", () => {
    const themes = [
      ["theme=fractal", "fractal", "Fractal Structure"],
      ["theme=field", "field", "Vector Field"],
      ["theme=lattice", "lattice", "Crystal Lattice"],
      ["theme=chaos", "chaos", "Strange Attractor"],
      ["theme=harmonic", "harmonic", "Harmonic Wave"],
      ["theme=pixelfractal", "pixel_fractal", "Pixel Fractal"],
      ["theme=pixelart", "pixel_art", "Pixel Art"],
      ["theme=symphony", "symphony", "Symphony"],
    ] as const;

    for (const [styleParams, id, label] of themes) {
      expect(sdk.resolveSoulTheme({ templateLen: 0, styleParams })).toEqual({
        id,
        label,
        renderer: "built-in",
      });
    }
  });

  it("uses the protocol default renderer for empty params and labels unknown params as legacy", () => {
    expect(sdk.resolveSoulTheme({ templateLen: 0, styleParams: "" })).toEqual({
      id: "fractal",
      label: "Fractal Structure",
      renderer: "built-in",
    });
    expect(sdk.resolveSoulTheme({ templateLen: 0, styleParams: "theme=unknown" })).toEqual({
      id: "legacy",
      label: "Legacy / unknown art theme",
      renderer: "built-in",
    });
    expect(sdk.resolveSoulTheme({ templateLen: 0, styleParams: "theme=pixel_fractal" })).toEqual({
      id: "legacy",
      label: "Legacy / unknown art theme",
      renderer: "built-in",
    });
  });

  it("allows mathematical theme uploads without custom SVG bytes", () => {
    for (const theme of [
      "fractal",
      "field",
      "lattice",
      "chaos",
      "harmonic",
      "pixelfractal",
      "pixelart",
      "symphony",
    ]) {
      expect(() =>
        sdk.validateTemplateUploadInput({
          template: "",
          styleParams: `theme=${theme}`,
        }),
      ).not.toThrow();
    }
  });

  it("encodes mathematical theme uploads for wallet-signed transactions", () => {
    const fractal = sdk.encodeTemplateUploadBytes({
      template: "",
      styleParams: "theme=fractal",
    });
    expect(fractal.data[0]).toBe(sdk.UPLOAD_TEMPLATE_DISCRIMINATOR);
    expect(fractal.data.readUInt16LE(1)).toBe(0);
    expect(fractal.data.readUInt16LE(3)).toBe("theme=fractal".length);
    expect(new TextDecoder().decode(fractal.data.subarray(5))).toBe("theme=fractal");
  });

  it("includes mathematical themes in ArtThemeId type", () => {
    const themes: sdk.ArtThemeId[] = [
      "fractal",
      "field",
      "lattice",
      "chaos",
      "harmonic",
      "pixel_fractal",
      "pixel_art",
      "symphony",
      "legacy",
      "custom",
    ];
    expect(themes.length).toBe(10);
  });
});
