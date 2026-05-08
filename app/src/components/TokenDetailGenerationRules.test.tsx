import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const tokenSoulPanelPath = join(process.cwd(), "src/components/TokenSoulPanel.tsx");
const launchPagePath = join(process.cwd(), "src/app/[locale]/launch/page.tsx");

describe("PD12 token detail generation rules visibility", () => {
  it("renders the generation-rules standard card on token detail and launch surfaces", () => {
    const tokenSource = readFileSync(tokenSoulPanelPath, "utf8");
    const launchSource = readFileSync(launchPagePath, "utf8");

    expect(tokenSource).toContain("GenerationRulesCard");
    expect(tokenSource).toContain('useTranslations("generationRules")');
    expect(launchSource).toContain("GenerationRulesCard");
    expect(launchSource).toContain('namespace: "generationRules"');
  });
});
