import { describe, expect, it } from "vitest";

import * as sdk from "./index.js";

describe("theme resolver", () => {
  it("maps empty, Rust-supported built-in, legacy-labeled, and custom Soul styles", () => {
    expect(sdk.resolveSoulTheme({ templateLen: 0, styleParams: "" })).toEqual({
      id: "fractal",
      label: "Fractal Structure",
      renderer: "built-in",
    });
    expect(sdk.resolveSoulTheme({ templateLen: 0, styleParams: "theme=symphony" })).toEqual({
      id: "symphony",
      label: "Symphony",
      renderer: "built-in",
    });
    for (const styleParams of [
      "mode=hexagram",
      "theme=monochrome",
      "theme=neonpuff",
      "theme=soulpuff",
      "theme=hexagram",
      "theme=signal",
      "theme=unipeg",
      "theme=pixel_fractal",
      "theme=pixel_art",
      "theme=unknown",
    ]) {
      expect(sdk.resolveSoulTheme({ templateLen: 0, styleParams })).toEqual({
        id: "legacy",
        label: "Legacy / unknown art theme",
        renderer: "built-in",
      });
    }
    expect(sdk.resolveSoulTheme({ templateLen: 12, styleParams: "theme=hexagram" })).toEqual({
      id: "custom",
      label: "Custom Template",
      renderer: "custom-template",
    });
    expect(sdk.resolveSoulTheme({ templateLen: 0, styleParams: "theme=custom" })).toEqual({
      id: "custom",
      label: "Custom Template",
      renderer: "custom-template",
    });
  });

  it("allows built-in theme style uploads without custom SVG bytes", () => {
    expect(() =>
      sdk.validateTemplateUploadInput({
        template: "",
        styleParams: "theme=fractal",
      }),
    ).not.toThrow();
    expect(() =>
      sdk.validateTemplateUploadInput({
        template: "",
        styleParams: "theme=pixelfractal",
      }),
    ).not.toThrow();
    expect(() =>
      sdk.validateTemplateUploadInput({
        template: "",
        styleParams: "theme=pixelart",
      }),
    ).not.toThrow();
    expect(() =>
      sdk.validateTemplateUploadInput({
        template: "",
        styleParams: "theme=symphony",
      }),
    ).not.toThrow();
    expect(() =>
      sdk.validateTemplateUploadInput({
        template: "",
        styleParams: "theme=custom",
      }),
    ).toThrow("requires non-empty SVG template");
    for (const styleParams of [
      "theme=hexagram",
      "theme=neonpuff",
      "theme=soulpuff",
      "theme=monochrome",
      "theme=signal",
      "theme=unipeg",
      "theme=pixel_fractal",
      "theme=pixel_art",
      "theme=unknown",
      "mode=hexagram",
    ]) {
      expect(() =>
        sdk.validateTemplateUploadInput({
          template: "",
          styleParams,
        }),
      ).toThrow(/Unsupported/);
    }
  });

  it("encodes built-in and custom launch theme uploads for wallet-signed transactions", () => {
    const builtIn = sdk.encodeTemplateUploadBytes({
      template: "",
      styleParams: "theme=symphony",
    });
    expect(builtIn.data[0]).toBe(sdk.UPLOAD_TEMPLATE_DISCRIMINATOR);
    expect(builtIn.data.readUInt16LE(1)).toBe(0);
    expect(builtIn.data.readUInt16LE(3)).toBe("theme=symphony".length);
    expect(new TextDecoder().decode(builtIn.data.subarray(5))).toBe("theme=symphony");

    const custom = sdk.encodeTemplateUploadBytes({
      template: '<svg data-mode="custom"></svg>',
      styleParams: "theme=custom;mode=hsl;evolution=3",
    });
    expect(custom.templateBytes.length).toBeGreaterThan(0);
    expect(new TextDecoder().decode(custom.styleParamBytes)).toBe(
      "theme=custom;mode=hsl;evolution=3",
    );
    expect(() =>
      sdk.validateTemplateUploadInput({
        template: '<svg data-mode="custom"></svg>',
        styleParams: "theme=custom;mode=hsl;evolution=3;trait_palette=ember",
      }),
    ).toThrow(/does not support core trait/);
  });
});
