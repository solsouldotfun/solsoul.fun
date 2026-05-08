import { describe, expect, it } from "vitest";
import { MAX_TEMPLATE_BYTES, validateTemplateSvg } from "./TemplateEditor";
import { LAUNCH_ART_THEMES, STARTER_TEMPLATES } from "../lib/starterTemplates";

class ValidXmlParser {
  parseFromString() {
    return {
      getElementsByTagName: () => [],
    } as unknown as Document;
  }
}

class InvalidXmlParser {
  parseFromString() {
    return {
      getElementsByTagName: (tagName: string) =>
        tagName === "parsererror" ? ([{}] as unknown as HTMLCollectionOf<Element>) : [],
    } as unknown as Document;
  }
}

describe("validateTemplateSvg", () => {
  it("accepts SVG templates within the on-chain budget that parse as XML", () => {
    const result = validateTemplateSvg("<svg><circle cx=\"5\" cy=\"5\" r=\"4\" /></svg>", ValidXmlParser);

    expect(result).toEqual({
      sizeOk: true,
      startsWithSvg: true,
      parseableXml: true,
      externalRefsOk: true,
      isValid: true,
    });
  });

  it("rejects templates larger than on-chain capacity", () => {
    const result = validateTemplateSvg(`<svg>${"x".repeat(MAX_TEMPLATE_BYTES)}</svg>`, ValidXmlParser);

    expect(result.sizeOk).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it("rejects templates that do not start with <svg", () => {
    const result = validateTemplateSvg("<html><svg></svg></html>", ValidXmlParser);

    expect(result.startsWithSvg).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it("rejects templates that DOMParser reports as XML parse errors", () => {
    const result = validateTemplateSvg("<svg><g></svg>", InvalidXmlParser);

    expect(result.parseableXml).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it("rejects external references before wallet upload", () => {
    const result = validateTemplateSvg(
      '<svg><image href="https://example.invalid/soul.png" /></svg>',
      ValidXmlParser,
    );

    expect(result.externalRefsOk).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it.each([
    "<svg><ScRiPt>alert(1)</ScRiPt></svg>",
    "<svg><IMAGE\nHREF = 'https://example.invalid/soul.png' /></svg>",
    "<svg><use\nxlink:href = '#local-symbol' /></svg>",
    "<svg><a\tHREF=https://example.invalid>bad</a></svg>",
    "<svg><rect fill=\"url(  ' ipfs://bafybad'  )\" /></svg>",
    "<svg><rect stroke=\"url(\n\tHTTPS://example.invalid/paint )\" /></svg>",
    "<svg><text>https://example.invalid/raw</text></svg>",
    "<svg><text>data:text/plain,remote</text></svg>",
    "<svg><text>ar://remote-id</text></svg>",
  ])("rejects normalized external-reference variant %#", (template) => {
    const result = validateTemplateSvg(template, ValidXmlParser);

    expect(result.externalRefsOk).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it.each([
    "<svg><rect fill=\"url( //example.invalid/pattern.svg#p)\" /></svg>",
    "<svg><rect fill=\"URL(//example.invalid/pattern.svg#p)\" /></svg>",
    "<svg><rect fill=\"url(  '//example.invalid/pattern.svg#p'  )\" /></svg>",
    "<svg><rect fill='url(\n\t\"//example.invalid/pattern.svg#p\" )' /></svg>",
  ])("rejects protocol-relative external CSS url(...) variant %#", (template) => {
    const result = validateTemplateSvg(template, ValidXmlParser);

    expect(result.externalRefsOk).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it.each([
    "<svg><defs><linearGradient id=\"p\" /></defs><rect fill=\"url(#p)\" /></svg>",
    "<svg><defs><linearGradient id=\"p\" /></defs><rect fill=\"url( '#p' )\" /></svg>",
  ])("allows local fragment CSS url(...) variant %#", (template) => {
    const result = validateTemplateSvg(template, ValidXmlParser);

    expect(result.externalRefsOk).toBe(true);
    expect(result.isValid).toBe(true);
  });
});

describe("starter SVG templates", () => {
  it("registers mathematical public starter template paths", () => {
    expect(STARTER_TEMPLATES.map((template) => template.path)).toEqual([
      "/templates/fractal-structure.svg",
      "/templates/vector-field.svg",
      "/templates/crystal-lattice.svg",
    ]);
  });

  it("registers built-in mathematical launch art themes and custom template mode", () => {
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
    expect(LAUNCH_ART_THEMES.map((theme) => theme.styleParams)).toEqual([
      "theme=fractal",
      "theme=field",
      "theme=lattice",
      "theme=chaos",
      "theme=harmonic",
      "theme=pixelfractal",
      "theme=pixelart",
      "theme=symphony",
      "theme=custom;mode=hsl;evolution=3",
    ]);
    expect(LAUNCH_ART_THEMES.filter((theme) => theme.renderer === "built-in")).toHaveLength(8);
    expect(LAUNCH_ART_THEMES[0]?.previewSvg).toContain('aria-label="Fractal Structure preview"');
    expect(LAUNCH_ART_THEMES.find((theme) => theme.id === "custom")?.renderer).toBe(
      "custom-template",
    );
    for (const theme of LAUNCH_ART_THEMES) {
      expect(theme.previewSvg).toContain("<svg");
      expect(theme.previewSvg).not.toContain("http");
      expect(theme.previewSvg).not.toContain("href=");
    }
  });
});
