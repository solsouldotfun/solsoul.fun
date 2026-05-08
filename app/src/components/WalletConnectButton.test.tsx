import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import {
  buildWalletConnectButtonLabels,
  WALLET_CONNECT_BUTTON_CLASS,
} from "./WalletConnectButton";

describe("WalletConnectButton responsive classes", () => {
  it("keeps the header wallet trigger constrained on 320px mobile widths", () => {
    expect(WALLET_CONNECT_BUTTON_CLASS).toContain("!min-w-0");
    expect(WALLET_CONNECT_BUTTON_CLASS).toContain("!max-w-[8.5rem]");
    expect(WALLET_CONNECT_BUTTON_CLASS).toContain("!overflow-hidden");
    expect(WALLET_CONNECT_BUTTON_CLASS).toContain("!text-ellipsis");
    expect(WALLET_CONNECT_BUTTON_CLASS).toContain("sm:!max-w-full");
  });

  it("builds localized wallet adapter labels for English and Chinese", () => {
    const enLabels = buildWalletConnectButtonLabels((key) => en.shared.walletButton[key]);
    const zhLabels = buildWalletConnectButtonLabels((key) => zh.shared.walletButton[key]);

    expect(enLabels["no-wallet"]).toBe("Select wallet");
    expect(enLabels["has-wallet"]).toBe("Connect");
    expect(zhLabels["no-wallet"]).toBe("选择钱包");
    expect(zhLabels["change-wallet"]).toBe("切换钱包");
    expect(Object.values(zhLabels).join(" ")).not.toContain("Select Wallet");
  });
});
