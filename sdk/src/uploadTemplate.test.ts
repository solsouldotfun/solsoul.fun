import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";

import * as sdk from "./index.js";

describe("uploadTemplate launch theme helpers", () => {
  it("encodes built-in launch theme selection as style_params without SVG bytes", () => {
    const ix = sdk.uploadTemplateIx({
      mint: sdk.findMintWithNoBumpPdas().mint,
      authority: PublicKey.unique(),
      template: "",
      styleParams: "theme=symphony",
    });

    expect(ix.data[0]).toBe(sdk.UPLOAD_TEMPLATE_DISCRIMINATOR);
    expect(ix.data.readUInt16LE(1)).toBe(0);
    expect(ix.data.readUInt16LE(3)).toBe("theme=symphony".length);
    expect(new TextDecoder().decode(ix.data.subarray(5))).toBe("theme=symphony");
  });

  it("rejects unsupported legacy launch themes as active uploads", () => {
    expect(() =>
      sdk.uploadTemplateIx({
        mint: sdk.findMintWithNoBumpPdas().mint,
        authority: PublicKey.unique(),
        template: "",
        styleParams: "theme=hexagram",
      }),
    ).toThrow(/Unsupported art theme/);
  });

  it("requires Custom Template mode to include the edited SVG bytes", () => {
    expect(() =>
      sdk.uploadTemplateIx({
        mint: sdk.findMintWithNoBumpPdas().mint,
        authority: PublicKey.unique(),
        template: "",
        styleParams: "theme=custom",
      }),
    ).toThrow("requires non-empty SVG template");

    const encoded = sdk.encodeTemplateUploadBytes({
      template: '<svg data-mode="custom"><rect width="1" height="1"/></svg>',
      styleParams: "theme=custom;mode=hsl;evolution=3",
    });
    expect(encoded.templateBytes.length).toBeGreaterThan(0);
    expect(new TextDecoder().decode(encoded.styleParamBytes)).toBe(
      "theme=custom;mode=hsl;evolution=3",
    );
  });
});
