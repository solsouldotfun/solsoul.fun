import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TRANSFER_HOOK_COMPATIBILITY_SCOPE } from "sdk";

function readMessages(locale: "en" | "zh") {
  const path = fileURLToPath(new URL(`../../../messages/${locale}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as {
    stats: { dust: { warningMessages: Record<string, string> } };
  };
}

describe("Raydium warning/copy", () => {
  it("keeps historical/deferred Raydium receipt protection warnings honest in app copy and SDK scope", () => {
    expect(TRANSFER_HOOK_COMPATIBILITY_SCOPE.activeAmm).toBe("none_current_curve_only");
    expect(TRANSFER_HOOK_COMPATIBILITY_SCOPE.legacyTargetAmm).toBe("raydium");
    expect(TRANSFER_HOOK_COMPATIBILITY_SCOPE.raydiumSwapPath.status).toBe("unsupported_bounded");
    expect(TRANSFER_HOOK_COMPATIBILITY_SCOPE.raydiumSwapPath.enforcement).toContain(
      "must not be presented as receipt-protected",
    );

    const enWarnings = readMessages("en").stats.dust.warningMessages;
    const zhWarnings = readMessages("zh").stats.dust.warningMessages;

    expect(enWarnings.postGraduationRaydiumReceiptPathsBounded).toContain(
      "Historical post-graduation Raydium CP-Swap liquidity and swap paths are bounded/deferred",
    );
    expect(enWarnings.raydiumTransferHookMintsUnsupported).toContain(
      "Transfer Hook-enabled mints do not migrate to Raydium",
    );
    expect(zhWarnings.postGraduationRaydiumReceiptPathsBounded).toContain("Raydium CP-Swap");
    expect(zhWarnings.raydiumTransferHookMintsUnsupported).toContain("Transfer Hook");
  });
});
