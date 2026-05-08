import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AmbientSoulBackground } from "./AmbientSoulBackground";

describe("AmbientSoulBackground", () => {
  it("renders a restrained mathematical fallback layer for launch and home surfaces", () => {
    const markup = renderToStaticMarkup(<AmbientSoulBackground variant="launch" />);

    expect(markup).toContain('data-testid="ambient-soul-background-launch"');
    expect(markup).toContain('data-current-soul="false"');
    expect(markup).toContain("<svg");
    expect(markup).toContain("pointer-events-none");
    expect(markup).toContain("overflow-hidden");
  });

  it("uses a sanitized current Soul SVG as a blurred token detail image when available", () => {
    const markup = renderToStaticMarkup(
      <AmbientSoulBackground
        variant="token"
        soulSvg={'<svg onload="alert(1)" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>'}
      />,
    );

    expect(markup).toContain('data-testid="ambient-soul-background-token"');
    expect(markup).toContain('data-current-soul="true"');
    expect(markup).toContain("<img");
    expect(markup).toContain("data:image/svg+xml");
    expect(markup).not.toContain("onload");
  });
});
