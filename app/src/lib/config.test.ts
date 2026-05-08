import { describe, expect, it } from "vitest";
import {
  DEFAULT_RPC_URL,
  DEVNET_RPC_URL,
  getRpcEndpoints,
  getRpcEndpoint,
  getRpcFallbackEndpoint,
  isLoopbackRpcEndpoint,
  isDevnetSmokeEnabled,
} from "./config";

describe("getRpcEndpoint", () => {
  it("defaults to localnet when NEXT_PUBLIC_RPC_URL is absent", () => {
    expect(getRpcEndpoint()).toBe(DEFAULT_RPC_URL);
  });

  it("uses the provided public RPC endpoint", () => {
    expect(getRpcEndpoint("https://api.devnet.solana.com")).toBe(
      "https://api.devnet.solana.com",
    );
  });

  it("ignores blank endpoint values", () => {
    expect(getRpcEndpoint("   ")).toBe(DEFAULT_RPC_URL);
  });

  it("uses the first comma-separated endpoint as the primary RPC", () => {
    expect(getRpcEndpoint(" https://primary.example , https://secondary.example ")).toBe(
      "https://primary.example",
    );
  });
});

describe("getRpcEndpoints", () => {
  it("parses comma-separated primary and fallback RPC endpoints", () => {
    expect(getRpcEndpoints("https://primary.example, https://secondary.example")).toEqual([
      "https://primary.example",
      "https://secondary.example",
    ]);
  });
});

describe("getRpcFallbackEndpoint", () => {
  it("returns the second configured RPC endpoint when present", () => {
    expect(getRpcFallbackEndpoint("https://primary.example, https://secondary.example")).toBe(
      "https://secondary.example",
    );
  });

  it("returns undefined when no fallback endpoint is configured", () => {
    expect(getRpcFallbackEndpoint("https://primary.example")).toBeUndefined();
  });
});

describe("isDevnetSmokeEnabled", () => {
  it("requires both the smoke flag and devnet RPC", () => {
    expect(isDevnetSmokeEnabled("1", DEVNET_RPC_URL)).toBe(true);
    expect(isDevnetSmokeEnabled("0", DEVNET_RPC_URL)).toBe(false);
    expect(isDevnetSmokeEnabled("1", DEFAULT_RPC_URL)).toBe(false);
  });
});

describe("isLoopbackRpcEndpoint", () => {
  it("recognizes local RPC endpoints used by deterministic visual validation", () => {
    expect(isLoopbackRpcEndpoint("http://127.0.0.1:8899")).toBe(true);
    expect(isLoopbackRpcEndpoint("http://localhost:8899")).toBe(true);
    expect(isLoopbackRpcEndpoint("https://api.devnet.solana.com")).toBe(false);
  });
});
