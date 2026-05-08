import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  deriveSolSoulTokenPdas,
  isUnsupportedSolSoulMintError,
  safeTokenLoadErrorMessage,
} from "./tokenPdaValidation";

describe("token PDA validation", () => {
  it("classifies system-program mint PDA failures without leaking raw seed errors", () => {
    const systemMint = new PublicKey("11111111111111111111111111111111");

    expect(() => deriveSolSoulTokenPdas(systemMint)).toThrow(
      "This token mint is not a SolSoul launch mint.",
    );

    let error: unknown;
    try {
      deriveSolSoulTokenPdas(systemMint);
    } catch (caught) {
      error = caught;
    }

    expect(isUnsupportedSolSoulMintError(error)).toBe(true);
    expect(safeTokenLoadErrorMessage(error, "fallback")).toBe(
      "This token mint is not a SolSoul launch mint.",
    );
    expect(safeTokenLoadErrorMessage(error, "fallback")).not.toMatch(
      /Invalid seeds|fall off the curve/i,
    );
  });

  it("sanitizes unrelated loader errors to the localized fallback", () => {
    const raw = "HTTP 429 from devnet RPC: failed to get account info";

    expect(safeTokenLoadErrorMessage(new Error(raw), "fallback")).toBe("fallback");
    expect(safeTokenLoadErrorMessage(new Error(raw), "fallback")).not.toContain(raw);
  });
});
