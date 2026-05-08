/**
 * PD17.A3 characterization tests — Scope guardrail preservation after full-site premium redesign.
 *
 * After PD17.F1/F2 applied the premium visual system to the full site,
 * these tests verify that:
 *   1. AMM selection remains hidden (legacy target_amm metadata only)
 *   2. No Soul NFT marketplace/list/sell/buy-now/orderbook/Tensor/Magic Eden controls
 *   3. Public write flows remain wallet-signed only (no server signer fallback)
 *   4. /api/devnet-smoke remains retired at 410
 *   5. Premium-themed components and pages do not reintroduce scope violations
 */
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

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
    if (!/\.(ts|tsx)$/.test(path)) return false;
    return !path.endsWith(".test.ts") && !path.endsWith(".test.tsx");
  });
}

const componentRoot = join(process.cwd(), "src/components");
const appRoot = join(process.cwd(), "src/app");
const libRoot = join(process.cwd(), "src/lib");

describe("PD17.A3 — AMM selector remains hidden after premium redesign", () => {
  it("AmmSelector AMM_OPTIONS contains only Raydium", () => {
    const src = source("src/components/AmmSelector.tsx");
    expect(src).toContain('"raydium"');
    expect(src).not.toMatch(/id:\s*"pump"/);
    expect(src).not.toMatch(/id:\s*"meteora"/);
  });

  it("AmmSelectorView renders null (no visible AMM chooser UI)", () => {
    const src = source("src/components/AmmSelector.tsx");
    expect(src).toMatch(/return\s+null/);
  });

  it("LaunchForm uses ACTIVE_LAUNCH_TARGET_AMM without AMM selector UI", () => {
    const src = source("src/components/LaunchForm.tsx");
    expect(src).toContain("ACTIVE_LAUNCH_TARGET_AMM");
    expect(src).not.toMatch(/AmmSelector/);
  });

  it("premium-themed pages (landing, launch, stats, tokens, souls) contain no AMM selector references", () => {
    const premiumPages = [
      "src/app/[locale]/page.tsx",
      "src/app/[locale]/launch/page.tsx",
      "src/app/[locale]/stats/page.tsx",
      "src/app/[locale]/tokens/page.tsx",
      "src/app/[locale]/souls/page.tsx",
    ];
    for (const page of premiumPages) {
      const text = source(page);
      expect(text, `${page} should not contain AmmSelector`).not.toMatch(/AmmSelector/);
      expect(text, `${page} should not contain AMM radio/selection UI`).not.toMatch(
        /amm.*radio|amm.*select|amm.*chooser/i,
      );
    }
  });

  it("premium uiPrimitives do not expose AMM-related tokens", () => {
    const src = source("src/components/uiPrimitives.ts");
    expect(src).not.toMatch(/amm|AMM|pump|PumpSwap|meteora|Meteora/i);
  });
});

describe("PD17.A3 — No Soul NFT marketplace controls after premium redesign", () => {
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

  it("no marketplace/orderbook/Tensor/Magic Eden route segments exist", () => {
    const routeFiles = sourceFiles(appRoot).filter(
      (path) => path.endsWith("page.tsx") || path.endsWith("route.ts"),
    );
    expect(routeFiles.length).toBeGreaterThan(0);
    for (const routeFile of routeFiles) {
      const normalized = relative(appRoot, routeFile).toLowerCase();
      for (const bannedSegment of bannedRouteSegments) {
        expect(normalized, `route ${normalized} should not contain ${bannedSegment}`).not.toContain(
          bannedSegment,
        );
      }
    }
  });

  it("premium-changed components and pages contain no Soul NFT trading controls", () => {
    const premiumFiles = [
      ...sourceFiles(componentRoot),
      ...sourceFiles(appRoot),
    ];
    expect(premiumFiles.length).toBeGreaterThan(0);
    for (const file of premiumFiles) {
      const src = readFileSync(file, "utf8").toLowerCase();
      for (const bannedCopy of bannedSoulNftControlCopy) {
        expect(src, relative(process.cwd(), file)).not.toContain(bannedCopy);
      }
    }
  });
});

describe("PD17.A3 — Public write flows remain wallet-signed only", () => {
  it("LaunchForm uses sendTransaction from useWallet (no server signer)", () => {
    const src = source("src/components/LaunchForm.tsx");
    expect(src).toContain("useWallet");
    expect(src).toContain("sendTransaction");
    expect(src).not.toMatch(/server.*signer|serverSigner|private.*key|privateKey/i);
  });

  it("TokenSoulPanel uses sendTransaction from useWallet for buy/sell", () => {
    const src = source("src/components/TokenSoulPanel.tsx");
    expect(src).toContain("useWallet");
    expect(src).toContain("sendTransaction");
    expect(src).not.toMatch(/server.*signer|serverSigner|private.*key|privateKey/i);
  });

  it("ClaimButton uses wallet signing path", () => {
    const src = source("src/components/ClaimButton.tsx");
    expect(src).toContain("useWallet");
    expect(src).not.toMatch(/server.*signer|serverSigner|private.*key|privateKey/i);
  });

  it("GenerateAgainButton uses wallet signing path", () => {
    const src = source("src/components/GenerateAgainButton.tsx");
    expect(src).toContain("useWallet");
    expect(src).not.toMatch(/server.*signer|serverSigner|private.*key|privateKey/i);
  });

  it("no lib/app source files contain server signer or private key fallback references", () => {
    const allSource = [...sourceFiles(libRoot), ...sourceFiles(appRoot)];
    for (const file of allSource) {
      const src = readFileSync(file, "utf8");
      // Allow references in test files and comments about wallet-only
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      expect(src, relative(process.cwd(), file)).not.toMatch(
        /serverSigner|server_signer|new Uint8Array\(\[.*\]\).*private|import.*private.*key/i,
      );
    }
  });
});

describe("PD17.A3 — /api/devnet-smoke remains retired at 410", () => {
  it("devnet-smoke route handler returns 410 with retirement message", () => {
    const src = source("src/app/api/devnet-smoke/route.ts");
    expect(src).toContain("410");
    expect(src).toContain("RETIRED_STATUS");
    expect(src).toContain("wallet-signed only");
  });

  it("no active public routes reference devnet-smoke as a write path", () => {
    const pages = sourceFiles(appRoot).filter((f) =>
      f.endsWith("page.tsx") || (f.endsWith("route.ts") && !f.includes("devnet-smoke")),
    );
    for (const page of pages) {
      const src = readFileSync(page, "utf8");
      expect(src, relative(process.cwd(), page)).not.toMatch(/fetch.*devnet.smoke|\/api\/devnet-smoke/i);
    }
  });
});

describe("PD17.A3 — AMM language remains historical/deferred after premium redesign", () => {
  it("curveEconomics presents AMM adapters as historical/deferred", () => {
    const src = source("src/lib/curveEconomics.ts");
    expect(src).toContain("no graduation, no migration");
    expect(src).toContain("historical/deferred");
    expect(src).toContain("active launches stay on the curve");
  });

  it("launchSubmit keeps target_amm as fixed legacy metadata", () => {
    const src = source("src/lib/launchSubmit.ts");
    expect(src).toContain("ACTIVE_LAUNCH_TARGET_AMM");
    expect(src).toContain("Raydium");
    expect(src).toContain("legacy");
    expect(src).toContain("historical/deferred");
  });
});
