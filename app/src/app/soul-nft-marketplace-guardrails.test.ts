import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = join(process.cwd(), "src/app");
const componentRoot = join(process.cwd(), "src/components");

const bannedRouteSegments = [
  "marketplace",
  "orderbook",
  "buy-now",
  "buy_now",
  "list-nft",
  "list_nft",
  "sell-nft",
  "sell_nft",
  "tensor",
  "magic-eden",
  "magic_eden",
];

const bannedSoulNftControlCopy = [
  "buy now",
  "buy-now",
  "list nft",
  "sell nft",
  "sell soul nft",
  "orderbook",
  "tensor",
  "magic eden",
];

function walkFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return walkFiles(path);
    }
    return stat.isFile() ? [path] : [];
  });
}

function sourceFiles(root: string): string[] {
  return walkFiles(root).filter((path) => {
    if (!/\.(ts|tsx)$/.test(path)) {
      return false;
    }
    return !path.endsWith(".test.ts") && !path.endsWith(".test.tsx");
  });
}

describe("PD15 Soul NFT marketplace guardrails", () => {
  it("does not expose marketplace, listing, buy-now, orderbook, Tensor, or Magic Eden app/API routes", () => {
    const routeFiles = sourceFiles(appRoot).filter((path) =>
      path.endsWith("page.tsx") || path.endsWith("route.ts"),
    );

    expect(routeFiles.length).toBeGreaterThan(0);
    for (const routeFile of routeFiles) {
      const normalized = relative(appRoot, routeFile).toLowerCase();
      for (const bannedSegment of bannedRouteSegments) {
        expect(normalized).not.toContain(bannedSegment);
      }
    }
  });

  it("keeps Profile, public Souls, token detail, galleries, and cards free of Soul NFT trading controls", () => {
    const checkedFiles = [
      ...sourceFiles(appRoot),
      ...sourceFiles(componentRoot),
    ];

    expect(checkedFiles.length).toBeGreaterThan(0);
    for (const file of checkedFiles) {
      const source = readFileSync(file, "utf8").toLowerCase();
      for (const bannedCopy of bannedSoulNftControlCopy) {
        expect(source, relative(process.cwd(), file)).not.toContain(bannedCopy);
      }
    }
  });
});
