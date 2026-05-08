import { describe, expect, it } from "vitest";

import {
  formatCompactAddress,
  formatSolAmount,
  formatTokenAmount,
  formatTokenDisplayAmount,
} from "./tokenFormatting";

describe("shared token formatting", () => {
  it("formats token and SOL base units consistently for launch and token detail surfaces", () => {
    expect(formatTokenAmount(1_500_000n)).toBe("1.500000");
    expect(formatTokenAmount(1n)).toBe("0.000001");
    expect(formatSolAmount(1_250_000_000n)).toBe("1.250000000");
    expect(formatSolAmount(1n)).toBe("0.000000001");
  });

  it("formats MT holder gates as user-readable token amounts", () => {
    expect(formatTokenDisplayAmount(10_000_000_000n)).toBe("10,000");
    expect(formatTokenDisplayAmount(10_000_500_000n)).toBe("10,000.5");
  });

  it("compacts token and wallet addresses with the shared middle ellipsis style", () => {
    expect(formatCompactAddress("123456789ABCDEFG")).toBe("1234…DEFG");
  });
});
