import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const launchPagePath = join(process.cwd(), "src/app/[locale]/launch/page.tsx");

describe("localized launch page structure", () => {
  it("renders the launch hero before the launch form in source order", () => {
    const source = readFileSync(launchPagePath, "utf8");

    const heroIndex = source.indexOf('data-testid="launch-page-hero"');
    const formIndex = source.indexOf("<LaunchForm />");

    expect(heroIndex).toBeGreaterThanOrEqual(0);
    expect(formIndex).toBeGreaterThanOrEqual(0);
    expect(heroIndex).toBeLessThan(formIndex);
  });
});
