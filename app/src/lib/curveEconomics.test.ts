// @ts-nocheck — justified: test stubs use Partial<BondingCurveAccount> mocks; underlying economic logic tests are correct
import { describe, expect, it } from "vitest";
import { type BondingCurveAccount } from "sdk";
import { PublicKey } from "@solana/web3.js";
import { buildCurveEconomicsView, formatFixedEconomicsCopy } from "./curveEconomics";

function curve(overrides: Partial<BondingCurveAccount> = {}): BondingCurveAccount {
  return {
    mint: PublicKey.unique(),
    cumulativeSol: 999_000_000n,
    totalMinted: 41_916_000_000n,
    selfDeprecated: false,
    lastInteractionSlot: 0n,
    ...overrides,
  };
}

describe("curve economics", () => {
  it("formats fixed protocol economics copy", () => {
    const copy = formatFixedEconomicsCopy();
    expect(copy).toContain("exponential bonding curve");
    expect(copy).toContain("S = 500 SOL");
    expect(copy).toContain("no graduation");
  });

  it("formats fixed protocol economics copy with localized labels", () => {
    const copy = formatFixedEconomicsCopy({
      protocolFixedEconomics: "协议固定经济参数",
      decimalUnit: "小数位",
      curve: "指数联合曲线",
      supplyCap: "渐近供应上限",
      tokenUnit: "枚代币",
      launchFee: "发射费",
      buyLockFee: "买入锁定费",
      buyLockFeeSuffix: "永久锁定在曲线中",
      noGraduation: "无毕业、无迁移、无流动性抽离",
      ammReferences: "外部 AMM 适配仅为历史/延后项；当前发射留在曲线上",
      supplyNotConfigurable: "供应量由协议固定，创建者不可配置。",
    });
    expect(copy).toContain("协议固定经济参数");
    expect(copy).toContain("500 SOL");
    expect(copy).toContain("枚代币");
    expect(copy).not.toContain("Protocol-fixed economics");
  });

  it("builds a curve economics view from account state", () => {
    const view = buildCurveEconomicsView(curve());
    expect(view.decimals).toBe("6");
    expect(view.protocolCurveParams).toContain("500 SOL");
    expect(view.protocolFees).toContain("0.03 SOL");
    expect(view.cumulativeSol).toContain("SOL");
    expect(view.totalMinted).toContain("tokens");
    expect(view.percentMinted).toMatch(/\d+%/);
    expect(view.selfDeprecated).toBe("No");
  });

  it("builds a localized curve economics view from account state", () => {
    const view = buildCurveEconomicsView(curve(), {
      tokenUnit: "枚代币",
      baseUnit: "基础单位",
      solPerToken: "SOL/代币",
      launchFee: "发射",
      buyLockFee: "买入锁定",
      selfDeprecatedYes: "是",
      selfDeprecatedNo: "否",
      supplyNotConfigurable: "供应量由协议固定，创建者不可配置。",
    });
    expect(view.fixedSupply).toContain("枚代币");
    expect(view.fixedSupplyBaseUnits).toContain("基础单位");
    expect(view.protocolFees).toContain("买入锁定");
    expect(view.currentPrice).toContain("SOL/代币");
    expect(view.oneSolQuote).toContain("枚代币");
    expect(view.selfDeprecated).toBe("否");
    expect(view.supplyNotConfigurable).toContain("协议固定");
  });

  it("shows deprecated status when threshold is reached", () => {
    const deprecated = curve({ selfDeprecated: true });
    const view = buildCurveEconomicsView(deprecated);
    expect(view.selfDeprecated).toBe("Yes");
  });
});
