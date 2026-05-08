import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { PlatformBadgeView } from "./PlatformBadge";

describe("PlatformBadge", () => {
  it("renders the localized English SolSoul platform badge copy", () => {
    const markup = renderToStaticMarkup(
      <PlatformBadgeView messages={en.shared.platformBadge} />,
    );

    expect(markup).toContain("Badge-branded by SolSoul");
    expect(markup).toContain("platform metadata");
  });

  it("renders Chinese badge copy without the reported English leak", () => {
    const markup = renderToStaticMarkup(
      <PlatformBadgeView messages={zh.shared.platformBadge} />,
    );

    expect(markup).toContain("SolSoul 平台徽章");
    expect(markup).not.toContain("Badge-branded by SolSoul");
    expect(markup).not.toContain("platform metadata");
  });
});
