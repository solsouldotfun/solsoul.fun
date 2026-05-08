import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GenerationRulesCard, buildGenerationRulesCopy } from "./GenerationRulesCard";

const messagesDir = join(process.cwd(), "messages");

function readMessages(locale: "en" | "zh") {
  return JSON.parse(readFileSync(join(messagesDir, `${locale}.json`), "utf8"));
}

describe("PD12 visible generation rules copy", () => {
  it("explains deterministic market-shaped Souls and collectible outcomes in both locales", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(en.generationRules.body).toContain("deterministic artworks");
    expect(en.generationRules.body).toContain("market activity");
    expect(en.generationRules.standardBody).toContain("collectible");
    expect(en.generationRules.standardBody).toContain("artwork and history");
    expect(en.generationRules.mvpScope).toContain("not promised");

    expect(zh.generationRules.body).toContain("确定性艺术");
    expect(zh.generationRules.body).toContain("市场活动");
    expect(zh.generationRules.standardBody).toContain("当前 Soul");
    expect(zh.generationRules.standardBody).toContain("艺术与历史");
    expect(zh.generationRules.mvpScope).toContain("不承诺");
  });

  it("renders the visible rules, inputs, standard, and MVP scope without promising Soul NFT trading", () => {
    const messages = readMessages("en").generationRules;
    const markup = renderToStaticMarkup(
      <GenerationRulesCard copy={buildGenerationRulesCopy((key) => {
        const parts = key.split(".");
        return parts.reduce<unknown>(
          (current, part) =>
            current && typeof current === "object"
              ? (current as Record<string, unknown>)[part]
              : undefined,
          messages,
        ) as string;
      })} />,
    );

    expect(markup).toContain('data-testid="generation-rules-card"');
    expect(markup).toContain("How Souls are born");
    expect(markup).toContain("deterministic artworks");
    expect(markup).toContain("trade side");
    expect(markup).toContain("recent chain signal");
    expect(markup).toContain("collectible");
    expect(markup).toContain("artwork and history");
    expect(markup).toContain("not promised");
    expect(markup).not.toContain("Soul NFT buy-now");
    expect(markup).not.toContain("oracle randomness");
  });
});
