import { describe, expect, it } from "vitest";
import { classifyWalletActionError } from "./walletActionErrors";

describe("classifyWalletActionError", () => {
  it("treats wallet-cancelled prompts as rejected-wallet outcomes before raw SDK detail", () => {
    expect(
      classifyWalletActionError(
        new Error("User rejected the request: failed with custom program error: 0x1771"),
      ),
    ).toBe("walletRejected");
    expect(classifyWalletActionError("Phantom wallet request denied by user")).toBe(
      "walletRejected",
    );
  });

  it("classifies validation and settlement failures without exposing raw messages", () => {
    expect(classifyWalletActionError(new Error("Enter a SOL amount greater than 0."))).toBe(
      "validation",
    );
    expect(
      classifyWalletActionError(
        new Error("Source token account or selected receipt set changed before signing."),
      ),
    ).toBe("settlement");
  });

  it("classifies noisy RPC and preflight failures as user-readable network failures", () => {
    expect(classifyWalletActionError(new Error("HTTP 429 from devnet RPC"))).toBe(
      "rpcUnavailable",
    );
    expect(
      classifyWalletActionError(
        new Error("Transaction simulation failed: Error processing Instruction 0"),
      ),
    ).toBe("rpcUnavailable");
  });
});
