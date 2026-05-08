import { describe, expect, it } from "vitest";
import { buildMobileNavItems, isMobileNavItemActive } from "./MobileBottomNav.logic";

describe("buildMobileNavItems", () => {
  it("links five mobile bottom tabs including docs", () => {
    expect(
      buildMobileNavItems({
        explore: "Explore",
        market: "Market",
        souls: "Souls",
        docs: "Docs",
        launch: "Launch",
      }),
    ).toMatchObject([
      { href: "/", label: "Explore" },
      { href: "/tokens", label: "Market" },
      { href: "/souls", label: "Souls" },
      { href: "/docs", label: "Docs" },
      { href: "/launch", label: "Launch" },
    ]);
  });
});

describe("isMobileNavItemActive", () => {
  it("marks exact routes and descendants active without matching every page to home", () => {
    expect(isMobileNavItemActive("/", "/")).toBe(true);
    expect(isMobileNavItemActive("/launch", "/launch")).toBe(true);
    expect(isMobileNavItemActive("/tokens/page", "/tokens")).toBe(true);
    expect(isMobileNavItemActive("/souls/page", "/souls")).toBe(true);
    expect(isMobileNavItemActive("/docs/whitepaper", "/docs")).toBe(true);
    expect(isMobileNavItemActive("/token/demo", "/")).toBe(false);
    expect(isMobileNavItemActive("/token/demo", "/tokens")).toBe(false);
    expect(isMobileNavItemActive("/token/demo", "/souls")).toBe(false);
    expect(isMobileNavItemActive("/token/demo", "/docs")).toBe(false);
  });
});
