import { describe, expect, it } from "vitest";
import { normalizeSvgForBrowserImage, svgToDataUri } from "./svgPreview";

const freshPd9Svg =
  '<svg viewBox="0 0 256 256" data-soul="pd9-monochrome"><rect width="256" height="256" fill="#f7f7f2"/><path d="M64 200 C86 142 108 90 128 72 C148 90 170 142 192 200 Z" fill="#050505"/><circle cx="128" cy="110" r="32" stroke="#050505" stroke-width="6" fill="#f7f7f2"/></svg>';

describe("svg preview data URI helpers", () => {
  it("adds an SVG namespace to fresh PD9 on-chain SVGs before encoding for browser images", () => {
    const normalized = normalizeSvgForBrowserImage(freshPd9Svg);

    expect(normalized).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"');
    expect(normalized).toContain('data-soul="pd9-monochrome"');
  });

  it("preserves existing namespaces and percent-encodes fragile SVG characters", () => {
    const uri = svgToDataUri(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1 1 H15" stroke="#050505"/></svg>',
    );
    const decoded = decodeURIComponent(uri.replace("data:image/svg+xml;charset=utf-8,", ""));

    expect(uri).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decoded.match(/xmlns=/g)).toHaveLength(1);
    expect(uri).toContain("%23050505");
    expect(uri).not.toContain(";utf8,");
  });

  it("returns an empty image source for non-SVG input", () => {
    expect(svgToDataUri("<script>alert(1)</script>")).toBe("");
  });

  it("strips script/image/external-reference surfaces before producing preview data URIs", () => {
    const uri = svgToDataUri(
      '<svg viewBox="0 0 16 16" onload="steal()"><script>alert(1)</script><image href="https://example.invalid/x.svg"/><a href="javascript:alert(1)"><circle cx="8" cy="8" r="4" fill="#050505"/></a></svg>',
    );
    const decoded = decodeURIComponent(uri.replace("data:image/svg+xml;charset=utf-8,", ""));

    expect(decoded).toContain("<circle");
    expect(decoded).not.toContain("<script");
    expect(decoded).not.toContain("<image");
    expect(decoded).not.toContain("onload");
    expect(decoded).not.toContain("href=");
    expect(decoded).not.toContain("javascript:");
    expect(decoded).not.toContain("https://");
  });

  it("preserves safe local fragment references for old claimed/template Souls", () => {
    const uri = svgToDataUri(
      '<svg viewBox="0 0 16 16"><defs><linearGradient id="g"/></defs><rect width="16" height="16" fill="url(#g)"/><use href="#local"/></svg>',
    );
    const decoded = decodeURIComponent(uri.replace("data:image/svg+xml;charset=utf-8,", ""));

    expect(decoded).toContain('fill="url(#g)"');
    expect(decoded).toContain('href="#local"');
  });
});
