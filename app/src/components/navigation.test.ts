import { describe, expect, it } from "vitest";
import { buildProductNavItems } from "./navigationItems";

describe("buildProductNavItems", () => {
  it("returns five navigation items including docs", () => {
    const items = buildProductNavItems({
      explore: "Explore",
      market: "Market",
      souls: "Souls",
      docs: "Docs",
      launch: "Launch",
    });

    expect(items.map(({ href, label }) => ({ href, label }))).toEqual([
      { href: "/", label: "Explore" },
      { href: "/tokens", label: "Market" },
      { href: "/souls", label: "Souls" },
      { href: "/docs", label: "Docs" },
      { href: "/launch", label: "Launch" },
    ]);
    expect(items.find((item) => item.href === "/docs")?.key).toBe("docs");
  });
});
