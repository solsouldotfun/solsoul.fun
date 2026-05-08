import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { MIN_CLAIM_BALANCE, SOUL_PROVENANCE_SIDE, type SoulAccount } from "sdk";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { isLoopbackRpcEndpoint } from "@/lib/config";
import { getClaimDisabledReason } from "./ClaimButton";
import { getGenerateAgainDisabledReason } from "./GenerateAgainButton";
import {
  fetchPauseState,
  isLaunchSubmitDisabled,
  isTokenWriteActionDisabled,
  parseGlobalConfigPaused,
  PauseBannerView,
  resolvePauseStateOverride,
} from "./PauseBanner";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string; className?: string }>) =>
    React.createElement("a", { href, ...props }, children),
}));

const connectedWallet = PublicKey.unique();
const claimableSoul = {
  lastSvgLen: 1,
  claimCount: 0n,
  generationCount: 1n,
  provenanceGeneration: 1n,
  provenanceSide: SOUL_PROVENANCE_SIDE.Buy,
  provenanceAmount: 1_000_000n,
  provenanceTokenAmount: MIN_CLAIM_BALANCE,
  provenanceTrader: connectedWallet,
} as SoulAccount;

function globalConfigData(paused: boolean) {
  const data = new Uint8Array(128);
  data[32] = paused ? 1 : 0;
  return data;
}

describe("PauseBannerView", () => {
  it.each([
    ["en", en.pause.banner],
    ["zh", zh.pause.banner],
  ])("renders the localized high-contrast premium pause banner when paused in %s", (_locale, message) => {
    const html = renderToStaticMarkup(
      <PauseBannerView isPaused={true} message={message} />,
    );

    expect(html).toContain(message);
    expect(html).toContain("role=\"status\"");
    expect(html).toContain("border-soul-mint/20");
    expect(html).toContain("bg-[linear-gradient");
    expect(html).toContain("text-white/85");
    expect(html).not.toContain("red-");
  });

  it.each([
    ["en", en.pause.banner],
    ["zh", zh.pause.banner],
  ])("hides the pause banner when unpaused in %s", (_locale, message) => {
    expect(
      renderToStaticMarkup(<PauseBannerView isPaused={false} message={message} />),
    ).toBe("");
  });
});

describe("pause PDA decoding", () => {
  it("decodes the GlobalConfig paused flag at byte offset 32", () => {
    expect(parseGlobalConfigPaused(globalConfigData(true))).toBe(true);
    expect(parseGlobalConfigPaused(globalConfigData(false))).toBe(false);
  });

  it("fetches soul-generator config PDA and pauses if it is paused", async () => {
    const getMultipleAccountsInfo = vi.fn(async (pdas: unknown[]) => {
      expect(pdas).toHaveLength(1);
      return [
        { data: globalConfigData(true) },
      ];
    });

    await expect(
      fetchPauseState({ getMultipleAccountsInfo } as never),
    ).resolves.toMatchObject({
      isPaused: true,
      pausedPrograms: ["soulGenerator"],
    });
  });

  it("treats missing soul-generator config PDA as unpaused before admin initialization", async () => {
    const getMultipleAccountsInfo = vi.fn(async () => [null]);

    await expect(
      fetchPauseState({ getMultipleAccountsInfo } as never),
    ).resolves.toMatchObject({
      isPaused: false,
      pausedPrograms: [],
    });
  });
});

describe("pause-state browser validation overrides", () => {
  it("recognizes local RPC endpoints that should not be polled during visual validation", () => {
    expect(isLoopbackRpcEndpoint("http://127.0.0.1:8899")).toBe(true);
    expect(isLoopbackRpcEndpoint("http://localhost:8899")).toBe(true);
    expect(isLoopbackRpcEndpoint("https://api.devnet.solana.com")).toBe(false);
  });

  it("uses a deterministic unpaused state for local RPC unless polling is explicitly enabled", () => {
    expect(
      resolvePauseStateOverride({ endpoint: "http://127.0.0.1:8899" }),
    ).toMatchObject({
      isPaused: false,
      isLoading: false,
      pausedPrograms: [],
    });

    expect(
      resolvePauseStateOverride({
        endpoint: "http://127.0.0.1:8899",
        enableLocalPausePolling: "1",
      }),
    ).toBeNull();
  });

  it("supports explicit deterministic pause-state fixtures for browser tests", () => {
    expect(
      resolvePauseStateOverride({
        endpoint: "https://api.devnet.solana.com",
        pauseState: "paused",
      }),
    ).toMatchObject({
      isPaused: true,
      isLoading: false,
      pausedPrograms: ["soulGenerator"],
    });

    expect(
      resolvePauseStateOverride({
        endpoint: "https://api.devnet.solana.com",
        pauseState: "unpaused",
      }),
    ).toMatchObject({
      isPaused: false,
      isLoading: false,
      pausedPrograms: [],
    });
  });
});

describe("pause-disabled write actions", () => {
  it("disables launch, buy, sell, claim, and generate while paused", () => {
    expect(
      isLaunchSubmitDisabled({ canCreate: true, isLaunching: false, isPaused: true }),
    ).toBe(true);
    expect(isTokenWriteActionDisabled({ isPaused: true })).toBe(true);
    expect(
      getClaimDisabledReason({
        connected: true,
        hasPublicKey: true,
        soul: claimableSoul,
        isPaused: true,
      }),
    ).toBe("paused");
    expect(
      getGenerateAgainDisabledReason({
        connected: true,
        hasPublicKey: true,
        selfDeprecated: true,
    isPaused: true,
      }),
    ).toBe("paused");
  });

  it("keeps launch, buy, sell, claim, and generate enabled when unpaused", () => {
    expect(
      isLaunchSubmitDisabled({ canCreate: true, isLaunching: false, isPaused: false }),
    ).toBe(false);
    expect(isTokenWriteActionDisabled({ isPaused: false })).toBe(false);
    expect(
      getClaimDisabledReason({
        connected: true,
        hasPublicKey: true,
        walletPublicKey: connectedWallet,
        soul: claimableSoul,
        walletTokenBalanceBaseUnits: MIN_CLAIM_BALANCE,
        isPaused: false,
      }),
    ).toBeNull();
    expect(
      getGenerateAgainDisabledReason({
        connected: true,
        hasPublicKey: true,
        selfDeprecated: true,
    isPaused: false,
      }),
    ).toBeNull();
  });
});
