import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GalleryStatusCard } from "./GalleryStatusCard";

describe("GalleryStatusCard", () => {
  it("renders loading or empty gallery states as status messages", () => {
    const markup = renderToStaticMarkup(
      <GalleryStatusCard>No claimed Soul NFTs found yet.</GalleryStatusCard>,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('data-surface-state="neutral"');
    expect(markup).toContain("rounded-2xl");
    expect(markup).toContain("No claimed Soul NFTs found yet.");
  });

  it("renders gallery errors as alert messages", () => {
    const markup = renderToStaticMarkup(
      <GalleryStatusCard tone="error">Unable to load public Soul NFTs.</GalleryStatusCard>,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('data-surface-state="error"');
    expect(markup).toContain("border-rose-400/25");
    expect(markup).toContain("Unable to load public Soul NFTs.");
  });
});
