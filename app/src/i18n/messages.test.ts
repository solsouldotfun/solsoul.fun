import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const messagesDir = fileURLToPath(new URL("../../messages/", import.meta.url));
const requiredNamespaces = [
  "navigation",
  "shared",
  "amm",
  "preSignReview",
  "riskDisclaimer",
  "landing",
  "privacy",
  "launch",
  "token",
  "generationRules",
  "gallery",
  "profile",
  "soulRarity",
  "soulTraits",
  "publicGallery",
  "tokens",
  "stats",
  "tokenGallery",
];

function readMessages(locale: "en" | "zh") {
  const path = `${messagesDir}${locale}.json`;
  expect(existsSync(path)).toBe(true);
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function flattenMessageKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    flattenMessageKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

function flattenStringEntries(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") {
    return [[prefix, value]];
  }
  if (Array.isArray(value)) {
    return value.flatMap((nested, index) => flattenStringEntries(nested, `${prefix}.${index}`));
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    flattenStringEntries(nested, prefix ? `${prefix}.${key}` : key),
  );
}

function extractPlaceholders(message: string): string[] {
  return Array.from(message.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g))
    .map((match) => match[1])
    .sort();
}

function getMessage(messages: Record<string, unknown>, path: string): string {
  const value = path
    .split(".")
    .reduce<unknown>(
      (current, part) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[part]
          : undefined,
      messages,
    );
  expect(typeof value).toBe("string");
  return value as string;
}

describe("localized message bundles", () => {
  it("provides the required English and Chinese page namespaces", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    for (const namespace of requiredNamespaces) {
      expect(en).toHaveProperty(namespace);
      expect(zh).toHaveProperty(namespace);
    }
  });

  it("provides labels for the mobile bottom navigation", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    for (const messages of [en, zh]) {
      expect(messages).toHaveProperty("navigation.explore");
      expect(messages).toHaveProperty("navigation.market");
      expect(messages).toHaveProperty("navigation.souls");
      expect(messages).toHaveProperty("navigation.launch");
    }
  });

  it("publishes the PD5 soul-first IA and landing thesis in both locales", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "navigation.explore")).toBe("Explore");
    expect(getMessage(en, "navigation.market")).toBe("Market");
    expect(getMessage(en, "navigation.souls")).toBe("Souls");
    expect(getMessage(en, "landing.headline")).toContain("Market activity creates living on-chain Soul objects");
    expect(getMessage(en, "landing.body")).toContain("launch starts a living token");
    expect(getMessage(en, "landing.body")).toContain("trade can awaken a new Soul");
    expect(getMessage(en, "landing.body")).toContain("holders bring those Souls");

    expect(getMessage(zh, "navigation.explore")).toBe("探索");
    expect(getMessage(zh, "navigation.market")).toBe("市场");
    expect(getMessage(zh, "navigation.souls")).toBe("灵魂");
    expect(getMessage(zh, "landing.headline")).toContain("市场活动创造有生命的链上 Soul 对象");
    expect(getMessage(zh, "landing.body")).toContain("发射会开启一个有生命的代币");
    expect(getMessage(zh, "landing.body")).toContain("每次交易都可能唤醒新的 Soul");
    expect(getMessage(zh, "landing.body")).toContain("持有人可以把它收入自己的收藏");
  });

  it("keeps English and Chinese top-level namespaces in sync", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });

  it("keeps every English and Chinese message key in sync", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(flattenMessageKeys(zh).sort()).toEqual(flattenMessageKeys(en).sort());
  });

  it("keeps English and Chinese interpolation variables in sync", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    for (const [path, enMessage] of flattenStringEntries(en)) {
      expect(extractPlaceholders(getMessage(zh, path))).toEqual(extractPlaceholders(enMessage));
    }
  });

  it("localizes shared launch chrome reported by live Chinese smoke checks", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "shared.walletButton.selectWallet")).toContain("wallet");
    expect(getMessage(en, "shared.platformBadge.label")).toContain("Badge-branded");
    expect(getMessage(en, "shared.devnetBanner.label")).toContain("DEVNET TESTNET");

    const zhSharedCopy = [
      getMessage(zh, "shared.walletButton.selectWallet"),
      getMessage(zh, "shared.platformBadge.label"),
      getMessage(zh, "shared.platformBadge.assistiveText"),
      getMessage(zh, "shared.devnetBanner.label"),
    ].join(" ");

    expect(zhSharedCopy).toContain("选择钱包");
    expect(zhSharedCopy).toContain("SolSoul 平台徽章");
    expect(zhSharedCopy).toContain("DEVNET 测试网");
    expect(zhSharedCopy).not.toMatch(/Select Wallet|Badge-branded|DEVNET TESTNET|funds are not real/i);
  });

  it("keeps ordinary launch and token copy free of default-view engineering terms", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");
    const ordinaryCopyPaths = [
      "launch.page.eyebrow",
      "launch.page.title",
      "launch.page.description",
      "launch.form.tickerHelp",
      "launch.form.artThemeHelp",
      "launch.form.coreTraitHelp",
      "launch.form.commandCenterEyebrow",
      "launch.form.commandCenterBody",
      "launch.form.submitted",
      "launch.form.successTitle",
      "launch.form.successBody",
      "launch.form.recentLaunchesDescription",
      "generationRules.title",
      "generationRules.body",
      "generationRules.inputsTitle",
      "generationRules.standardTitle",
      "generationRules.standardBody",
      "token.surfaceHeader.eyebrow",
      "token.surfaceHeader.title",
      "token.surfaceHeader.identity",
      "token.surfaceHeader.trade",
      "token.surfaceHeader.claim",
      "token.surfaceHeader.progress",
      "token.surfaceHeader.provenance",
      "token.marketOverview.title",
      "token.marketOverview.body",
      "token.quote.buyRoute",
      "token.quote.sellRoute",
      "token.soulPreview.body",
      "token.tradePanelTitle",
      "token.tradePanelBody",
      "token.tradeReady.buy",
      "token.tradeReady.sell",
      "token.autoIssue.title",
      "token.autoIssue.body",
      "token.autoIssue.routeOnly",
      "token.autoIssue.noPreview",
      "token.lifecycleMachine.eyebrow",
      "token.lifecycleMachine.title",
      "token.lifecycleMachine.body",
      "token.timeline.title",
      "token.timeline.body",
      "token.timeline.empty",
    ];
    const bannedDefaultTerms =
      /\b(PDA|RPC|AMM|TLV|TransferHook|signature|style_params|BondingCurveAccount|Token account|seed hash|finalized)\b|bonding[- ]curve|migration/i;

    for (const path of ordinaryCopyPaths) {
      expect(getMessage(en, path), path).not.toMatch(bannedDefaultTerms);
      expect(getMessage(zh, path), path).not.toMatch(bannedDefaultTerms);
    }
  });

  it("distinguishes sell-generated visual Souls from buy-backed claimable MT/Soul NFTs in both locales", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    const enSellCopy = [
      getMessage(en, "token.tradeReady.sell"),
      getMessage(en, "token.tradeControls.sellClaimWarningBody"),
      getMessage(en, "token.tradeControls.sellCompleteBody"),
      getMessage(en, "token.tradeGeneration.sellVisualOnly"),
      getMessage(en, "claim.disabled.provenanceSellGenerated"),
    ].join(" ");
    const zhSellCopy = [
      getMessage(zh, "token.tradeReady.sell"),
      getMessage(zh, "token.tradeControls.sellClaimWarningBody"),
      getMessage(zh, "token.tradeControls.sellCompleteBody"),
      getMessage(zh, "token.tradeGeneration.sellVisualOnly"),
      getMessage(zh, "claim.disabled.provenanceSellGenerated"),
    ].join(" ");

    expect(enSellCopy).toContain("visual");
    expect(enSellCopy).toContain("not a claimable MT/Soul NFT");
    expect(enSellCopy).toContain("latest unclaimed buy-backed");
    expect(enSellCopy).toContain("latest qualifying buy");
    expect(zhSellCopy).toContain("视觉市场瞬间");
    expect(zhSellCopy).toContain("不是可领取的 MT/Soul NFT");
    expect(zhSellCopy).toContain("最新未领取的买入溯源");
    expect(zhSellCopy).toContain("最新的合格买入");
  });

  it("publishes localized wallet pre-sign review labels and accessible names", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    for (const key of [
      "ariaLabel",
      "title",
      "summary",
      "pending",
      "programIds",
      "instructionTitle",
      "accounts",
      "receiptIntentTitle",
      "receiptIntentBody",
      "unknownSource",
      "unknown",
      "receiptCapacity",
      "selectedReceipts",
      "none",
      "receiptSettlementStates.burned",
      "receiptSettlementStates.forfeited",
      "flags.signer",
      "flags.nonSigner",
      "flags.writable",
      "flags.readonly",
    ]) {
      expect(getMessage(en, `preSignReview.${key}`)).toBeTruthy();
      expect(getMessage(zh, `preSignReview.${key}`)).toBeTruthy();
    }

    expect(getMessage(en, "preSignReview.ariaLabel")).toContain("Pre-sign");
    expect(getMessage(en, "preSignReview.summary")).toContain("{cluster}");
    expect(getMessage(en, "preSignReview.receiptCapacity")).toContain("{activeReceiptCount}");
    expect(getMessage(en, "preSignReview.receiptSettlementStates.burned")).toContain("Burn");
    expect(getMessage(en, "preSignReview.receiptSettlementStates.forfeited")).toContain("Forfeit");
    expect(getMessage(zh, "preSignReview.ariaLabel")).toContain("签名前");
    expect(getMessage(zh, "preSignReview.summary")).toContain("{cluster}");
    expect(getMessage(zh, "preSignReview.receiptCapacity")).toContain("{activeReceiptCount}");
    expect(getMessage(zh, "preSignReview.receiptSettlementStates.burned")).not.toContain("burned");
    expect(getMessage(zh, "preSignReview.receiptSettlementStates.forfeited")).not.toContain(
      "forfeited",
    );
    expect(getMessage(en, "token.settlement.boundary")).toBe("boundary");
    expect(getMessage(zh, "token.settlement.boundary")).toContain("边界");
  });

  it("publishes PD12 Soul seed generation-rules and Token-2022 NFT-standard copy", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "generationRules.title")).toContain("How Souls are born");
    expect(getMessage(en, "generationRules.body")).toContain("deterministic artworks");
    expect(getMessage(en, "generationRules.body")).toContain("market activity");
    expect(getMessage(en, "generationRules.inputs.side")).toContain("trade side");
    expect(getMessage(en, "generationRules.inputs.amount")).toContain("amount");
    expect(getMessage(en, "generationRules.inputs.wallet")).toContain("wallet");
    expect(getMessage(en, "generationRules.inputs.tokenSoul")).toContain("token and Soul");
    expect(getMessage(en, "generationRules.inputs.generation")).toContain("generation");
    expect(getMessage(en, "generationRules.inputs.chainEntropy")).toContain("recent chain signal");
    expect(getMessage(en, "generationRules.standardBody")).toContain("collectible");
    expect(getMessage(en, "generationRules.standardBody")).toContain("artwork and history");
    expect(getMessage(en, "generationRules.mvpScope")).toContain("not promised");
    expect(getMessage(en, "generationRules.mvpScope")).toContain("External NFT marketplace trading");

    expect(getMessage(zh, "generationRules.title")).toContain("Soul 如何诞生");
    expect(getMessage(zh, "generationRules.body")).toContain("确定性艺术");
    expect(getMessage(zh, "generationRules.body")).toContain("市场活动");
    expect(getMessage(zh, "generationRules.inputs.side")).toContain("买入/卖出方向");
    expect(getMessage(zh, "generationRules.inputs.amount")).toContain("数量");
    expect(getMessage(zh, "generationRules.inputs.wallet")).toContain("钱包");
    expect(getMessage(zh, "generationRules.inputs.tokenSoul")).toContain("代币与 Soul");
    expect(getMessage(zh, "generationRules.inputs.generation")).toContain("生成编号");
    expect(getMessage(zh, "generationRules.inputs.chainEntropy")).toContain("近期链上信号");
    expect(getMessage(zh, "generationRules.standardBody")).toContain("当前 Soul");
    expect(getMessage(zh, "generationRules.standardBody")).toContain("艺术与历史");
    expect(getMessage(zh, "generationRules.mvpScope")).toContain("不承诺");
    expect(getMessage(zh, "generationRules.mvpScope")).toContain("外部 NFT 市场交易");
  });

  it("publishes the PD4 lifecycle model copy in both locales", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "launch.page.lifecycleModelBody")).toContain(
      "21,000,000 fungible tokens",
    );
    expect(getMessage(en, "launch.form.tokenMtSoulExplainer.steps.token.value")).toContain(
      "21,000,000 fungible tokens",
    );
    expect(getMessage(en, "launch.form.tokenMtSoulExplainer.steps.mt.value")).toContain(
      "10,000 tokens per MT",
    );
    expect(getMessage(en, "launch.form.tokenMtSoulExplainer.steps.soul.value")).toContain(
      "2,100 MT/Soul cap",
    );
    expect(getMessage(en, "launch.form.samplePreviewCaveat")).toContain(
      "Website motion preview only",
    );
    expect(getMessage(en, "token.soulPreview.motionCaveat")).toContain(
      "on-chain Soul SVG and metadata stay static",
    );
    expect(getMessage(en, "tokens.previewMotionCaveat")).toContain("marketplace metadata");
    expect(getMessage(en, "gallery.previewMotionCaveat")).toContain("NFT metadata remains static");
    expect(getMessage(en, "publicGallery.previewMotionCaveat")).toContain("NFT metadata remains static");
    expect(getMessage(en, "tokenGallery.previewMotionCaveat")).toContain("NFT metadata remains static");
    expect(getMessage(en, "launch.page.lifecycleModelBody")).toContain(
      "2,100 MT/Soul NFTs",
    );
    expect(getMessage(en, "token.modelNotice")).toContain(
      "10,000 tokens qualify one MT",
    );
    expect(getMessage(en, "token.marketOverview.body")).toContain("live price");
    expect(getMessage(en, "token.quote.buyRoute")).toContain("SolSoul market");
    expect(getMessage(en, "token.soulPreview.body")).toContain("Soul seed");
    expect(getMessage(en, "token.autoIssue.body")).toContain("10,000 fungible tokens");
    expect(getMessage(en, "token.autoIssue.routeOnly")).toContain("Only the official SolSoul buy flow");
    expect(getMessage(en, "gallery.description")).toContain(
      "not a standalone NFT drop",
    );
    expect(getMessage(en, "gallery.description")).toContain(
      "21,000,000 fungible tokens",
    );

    expect(getMessage(zh, "launch.page.lifecycleModelBody")).toContain("2,100 万枚同质化代币");
    expect(getMessage(zh, "launch.form.tokenMtSoulExplainer.steps.token.value")).toContain(
      "2,100 万枚同质化代币",
    );
    expect(getMessage(zh, "launch.form.tokenMtSoulExplainer.steps.mt.value")).toContain(
      "每 10,000 枚代币对应 1 个 MT",
    );
    expect(getMessage(zh, "launch.form.tokenMtSoulExplainer.steps.soul.value")).toContain(
      "2,100 个 MT/Soul 上限",
    );
    expect(getMessage(zh, "launch.form.samplePreviewCaveat")).toContain(
      "仅为网站动态预览",
    );
    expect(getMessage(zh, "token.soulPreview.motionCaveat")).toContain(
      "链上 Soul SVG 与元数据保持静态",
    );
    expect(getMessage(zh, "tokens.previewMotionCaveat")).toContain("市场元数据保留静态 SVG");
    expect(getMessage(zh, "gallery.previewMotionCaveat")).toContain("NFT 元数据仍是静态");
    expect(getMessage(zh, "publicGallery.previewMotionCaveat")).toContain("NFT 元数据仍是静态");
    expect(getMessage(zh, "tokenGallery.previewMotionCaveat")).toContain("NFT 元数据仍是静态");
    expect(getMessage(zh, "launch.page.lifecycleModelBody")).toContain("2,100 个 MT/Soul NFT");
    expect(getMessage(zh, "token.modelNotice")).toContain("每 10,000 枚代币对应 1 个 MT");
    expect(getMessage(zh, "token.marketOverview.body")).toContain("实时价格");
    expect(getMessage(zh, "token.quote.buyRoute")).toContain("SolSoul 市场");
    expect(getMessage(zh, "token.soulPreview.body")).toContain("Soul 种子");
    expect(getMessage(zh, "token.autoIssue.body")).toContain("10,000 枚同质化代币");
    expect(getMessage(zh, "token.autoIssue.routeOnly")).toContain("官方 SolSoul 买入流程");
    expect(getMessage(zh, "gallery.description")).toContain("不是独立 NFT drop");
    expect(getMessage(zh, "gallery.description")).toContain("10,000 枚代币门槛");
  });

  it("publishes localized Soul evolution display-state copy without metadata upgrade claims", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    const evolutionCopyPaths = [
      "token.soulPreview.body",
      "token.soulPreview.motionCaveat",
      "tokens.previewMotionCaveat",
      "gallery.previewMotionCaveat",
      "publicGallery.previewMotionCaveat",
      "tokenGallery.previewMotionCaveat",
      "token.soulEvolution.badge",
      "token.soulEvolution.title",
      "token.soulEvolution.body",
      "token.soulEvolution.level",
      "token.soulEvolution.stage",
      "token.soulEvolution.energy",
      "token.soulEvolution.generation",
      "token.soulEvolution.rarity",
      "token.soulEvolution.provenance",
      "token.soulEvolution.staticLayerTitle",
      "token.soulEvolution.staticLayerBody",
      "token.soulEvolution.dynamicLayerTitle",
      "token.soulEvolution.dynamicLayerBody",
      "token.soulEvolution.stages.seed",
      "token.soulEvolution.stages.awakening",
      "token.soulEvolution.stages.flow",
      "token.soulEvolution.stages.radiant",
      "token.soulEvolution.stages.archival",
      "token.soulEvolution.provenanceValues.buy",
      "token.soulEvolution.provenanceValues.sell",
      "token.soulEvolution.provenanceValues.unknown",
    ];

    for (const path of evolutionCopyPaths) {
      expect(getMessage(en, path).length, path).toBeGreaterThan(0);
      expect(getMessage(zh, path).length, path).toBeGreaterThan(0);
      expect(extractPlaceholders(getMessage(zh, path))).toEqual(
        extractPlaceholders(getMessage(en, path)),
      );
    }

    expect(getMessage(en, "token.soulEvolution.body")).toContain("does not write upgrades");
    expect(getMessage(en, "token.soulEvolution.body")).toContain("deterministically derives");
    expect(getMessage(en, "token.soulEvolution.staticLayerBody")).toContain("Static SVG");
    expect(getMessage(en, "token.soulEvolution.dynamicLayerBody")).toContain("local canvas motion");
    expect(getMessage(en, "token.soulPreview.motionCaveat")).toContain("not animation_url");
    expect(getMessage(en, "tokens.previewMotionCaveat")).toContain("executable formulas");
    expect(getMessage(en, "tokens.previewMotionCaveat")).toContain("remote media");
    expect(getMessage(zh, "token.soulEvolution.body")).toContain("不把升级写进 NFT");
    expect(getMessage(zh, "token.soulEvolution.body")).toContain("确定性派生");
    expect(getMessage(zh, "token.soulEvolution.staticLayerBody")).toContain("静态 SVG");
    expect(getMessage(zh, "token.soulEvolution.dynamicLayerBody")).toContain("本地 canvas 动效");
    expect(getMessage(zh, "token.soulPreview.motionCaveat")).toContain("不保存 animation_url");
    expect(getMessage(zh, "tokens.previewMotionCaveat")).toContain("可执行公式");
    expect(getMessage(zh, "tokens.previewMotionCaveat")).toContain("远程媒体");
  });

  it("publishes PD11 Profile/My Souls wallet-owned collection copy in both locales", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "profile.eyebrow")).toBe("My collection");
    expect(getMessage(en, "profile.title")).toContain("My Souls");
    expect(getMessage(en, "profile.description")).toContain("claimed MT/Soul NFTs");
    expect(getMessage(en, "profile.description")).toContain("10,000 tokens");
    expect(getMessage(en, "profile.connectPrompt")).toContain("Connect Phantom");
    expect(getMessage(en, "profile.empty")).toContain("trade to generate");

    expect(getMessage(zh, "profile.eyebrow")).toBe("我的收藏");
    expect(getMessage(zh, "profile.title")).toContain("我的灵魂");
    expect(getMessage(zh, "profile.description")).toContain("已领取");
    expect(getMessage(zh, "profile.description")).toContain("交易");
    expect(getMessage(zh, "profile.connectPrompt")).toContain("连接 Phantom");
    expect(getMessage(zh, "profile.empty")).toContain("交易生成");
  });

  it("publishes PD11 Profile/My Souls navigation and claim success CTA copy", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "claim.viewInMySouls")).toBe("View in My Souls");
    expect(getMessage(en, "claim.signature")).toContain("{signature}");

    expect(getMessage(zh, "claim.viewInMySouls")).toBe("在我的 Soul 中查看");
    expect(getMessage(zh, "claim.signature")).toContain("{signature}");
  });

  it("publishes localized PD11 Soul rarity, score, generation, and trait labels", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "soulRarity.title")).toBe("Soul rarity");
    expect(getMessage(en, "soulRarity.score")).toContain("{score}");
    expect(getMessage(en, "soulRarity.generation")).toBe("Generation");
    expect(getMessage(en, "soulRarity.traits")).toBe("Key traits");
    expect(getMessage(en, "soulRarity.tiers.mythic")).toBe("Mythic");
    expect(getMessage(en, "soulRarity.traitValues.seedSource.metadataFallback")).toContain("fallback");
    expect(getMessage(en, "soulRarity.traitKinds.artTheme")).toBe("Art theme");
    expect(getMessage(en, "soulRarity.traitValues.artTheme.fractal")).toContain("Fractal");
    expect(getMessage(en, "soulRarity.traitValues.artTheme.chaos")).toContain("Strange Attractor");
    expect(getMessage(en, "soulRarity.traitValues.artTheme.harmonic")).toContain("Harmonic");

    expect(getMessage(zh, "soulRarity.title")).toContain("稀有度");
    expect(getMessage(zh, "soulRarity.score")).toContain("{score}");
    expect(getMessage(zh, "soulRarity.generation")).toBe("生成编号");
    expect(getMessage(zh, "soulRarity.traits")).toContain("traits");
    expect(getMessage(zh, "soulRarity.tiers.mythic")).toBe("神话");
    expect(getMessage(zh, "soulRarity.traitValues.seedSource.metadataFallback")).toContain("回退");
    expect(getMessage(zh, "soulRarity.traitKinds.artTheme")).toContain("主题");
    expect(getMessage(zh, "soulRarity.traitValues.artTheme.fractal")).toContain("Fractal");
    expect(getMessage(zh, "soulRarity.traitValues.artTheme.chaos")).toContain("Strange Attractor");
  });

  it("publishes localized PD16 generated trait category and stable ID labels", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "soulTraits.title")).toBe("Generated traits");
    expect(getMessage(en, "soulTraits.launchGuidedTitle")).toBe("Launch-guided core traits");
    expect(getMessage(en, "soulTraits.systemTitle")).toBe("System-generated traits");
    expect(getMessage(en, "soulTraits.launchGuidedEmpty")).toContain("No launch-guided");
    expect(getMessage(en, "soulTraits.coreCategories.palette")).toBe("Palette");
    expect(getMessage(en, "soulTraits.coreCategories.background")).toBe("Background");
    expect(getMessage(en, "soulTraits.coreValues.palette.ember")).toBe("Ember");
    expect(getMessage(en, "soulTraits.coreValues.background.eclipse")).toBe("Eclipse");
    expect(getMessage(en, "soulTraits.categories.character_archetype")).toBe("Character");
    expect(getMessage(en, "soulTraits.categories.goggles_eyes")).toBe("Goggles/Eyes");
    expect(getMessage(en, "soulTraits.values.character_archetype.fractal_structure")).toContain("Fractal");
    expect(getMessage(en, "soulTraits.values.gas_level.level_8")).toContain("Level 8");

    expect(getMessage(zh, "soulTraits.title")).toContain("生成");
    expect(getMessage(zh, "soulTraits.launchGuidedTitle")).toContain("发射引导");
    expect(getMessage(zh, "soulTraits.systemTitle")).toContain("系统生成");
    expect(getMessage(zh, "soulTraits.launchGuidedEmpty")).toContain("未选择");
    expect(getMessage(zh, "soulTraits.coreCategories.palette")).toContain("色彩");
    expect(getMessage(zh, "soulTraits.coreCategories.background")).toContain("背景");
    expect(getMessage(zh, "soulTraits.coreValues.palette.ember")).toContain("余烬");
    expect(getMessage(zh, "soulTraits.coreValues.background.eclipse")).toContain("日蚀");
    expect(getMessage(zh, "soulTraits.categories.character_archetype")).toContain("角色");
    expect(getMessage(zh, "soulTraits.categories.goggles_eyes")).toContain("护目镜");
    expect(getMessage(zh, "soulTraits.values.character_archetype.fractal_structure")).toContain("Fractal");
    expect(getMessage(zh, "soulTraits.values.gas_level.level_8")).toContain("8");
  });

  it("localizes Chinese public lifecycle action copy", () => {
    const zh = readMessages("zh");

    expect(getMessage(zh, "tokens.viewToken")).toBe("查看代币");
    expect(getMessage(zh, "launch.form.viewTokenTradeNow")).toBe("开始首次交易");
  });

  it("publishes PD11 bonding-curve Market framing without External NFT marketplace trading promises", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "navigation.market")).toBe("Market");
    expect(getMessage(en, "landing.primaryCta")).toBe("Explore token market");
    expect(getMessage(en, "tokens.eyebrow")).toBe("Token market");
    expect(getMessage(en, "tokens.title")).toBe("Market");
    expect(getMessage(en, "tokens.description")).toContain("Browse and trade tokens");
    expect(getMessage(en, "tokens.marketNotice")).toContain("Soul NFTs are not tradable here");
    expect(getMessage(en, "tokens.viewToken")).toBe("View token");
    expect(getMessage(en, "tokens.discovery.tabs.fresh-souls")).toBe("Fresh Souls");
    expect(getMessage(en, "tokens.discovery.tabs.hot-flow")).toBe("Hot Flow");
    expect(getMessage(en, "tokens.discovery.tabs.most-generated")).toBe("Most Generated");
    expect(getMessage(en, "tokens.discovery.tabs.rare-energy")).toBe("Rare Energy");
    expect(getMessage(en, "tokens.discovery.tabs.top-volume")).toBe("Top Volume");
    expect(getMessage(en, "tokens.discovery.tabs.new-launches")).toBe("New Launches");
    expect(getMessage(en, "tokens.stats.energyValue")).toContain("{tier}");
    expect(getMessage(en, "tokens.stats.energyValue")).toContain("{score}");
    expect(getMessage(en, "token.tradePanelTitle")).toContain("awaken");
    expect(getMessage(en, "token.tradePanelBody")).toContain("viewing and collecting");

    expect(getMessage(zh, "navigation.market")).toBe("市场");
    expect(getMessage(zh, "landing.primaryCta")).toBe("探索代币市场");
    expect(getMessage(zh, "tokens.eyebrow")).toBe("代币市场");
    expect(getMessage(zh, "tokens.title")).toBe("市场");
    expect(getMessage(zh, "tokens.description")).toContain("浏览和交易代币");
    expect(getMessage(zh, "tokens.marketNotice")).toContain("Soul NFT 不能在此交易");
    expect(getMessage(zh, "tokens.viewToken")).toBe("查看代币");
    expect(getMessage(zh, "tokens.discovery.tabs.fresh-souls")).toBe("新鲜 Soul");
    expect(getMessage(zh, "tokens.discovery.tabs.hot-flow")).toBe("热流");
    expect(getMessage(zh, "tokens.discovery.tabs.most-generated")).toBe("生成最多");
    expect(getMessage(zh, "tokens.discovery.tabs.rare-energy")).toBe("稀有能量");
    expect(getMessage(zh, "tokens.discovery.tabs.top-volume")).toBe("最高成交量");
    expect(getMessage(zh, "tokens.discovery.tabs.new-launches")).toBe("新发射");
    expect(getMessage(zh, "tokens.stats.energyValue")).toContain("{tier}");
    expect(getMessage(zh, "tokens.stats.energyValue")).toContain("{score}");
    expect(getMessage(zh, "token.tradePanelTitle")).toContain("唤醒");
    expect(getMessage(zh, "token.tradePanelBody")).toContain("查看和收藏");

    const tokenMarketCopy = `${JSON.stringify(en.tokens)} ${JSON.stringify(zh.tokens)}`.toLowerCase();
    expect(tokenMarketCopy).not.toContain("orderbook");
    expect(tokenMarketCopy).not.toContain("buy-now");
    expect(tokenMarketCopy).not.toContain("buy now");
    expect(tokenMarketCopy).not.toContain("list nft");
  });

  it("publishes PD15 Soul NFT marketplace guardrail copy as claim/view/Profile/rarity only", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "generationRules.mvpScope")).toContain("not promised");
    expect(getMessage(en, "generationRules.mvpScope")).toContain("claim, view");
    expect(getMessage(en, "generationRules.mvpScope")).toContain("Profile/gallery");
    expect(getMessage(en, "generationRules.mvpScope")).toContain("rarity");
    expect(getMessage(zh, "generationRules.mvpScope")).toContain("不承诺");
    expect(getMessage(zh, "generationRules.mvpScope")).toContain("领取、查看");
    expect(getMessage(zh, "generationRules.mvpScope")).toContain("Profile/画廊");
    expect(getMessage(zh, "generationRules.mvpScope")).toContain("稀有度");

    const soulNftScopeCopy = [
      en.generationRules,
      en.profile,
      en.gallery,
      en.publicGallery,
      en.tokenGallery,
      en.tokens,
      zh.generationRules,
      zh.profile,
      zh.gallery,
      zh.publicGallery,
      zh.tokenGallery,
      zh.tokens,
    ]
      .map((namespace) => JSON.stringify(namespace))
      .join(" ")
      .toLowerCase();

    for (const bannedCurrentScopePromise of [
      "buy now",
      "buy-now",
      "list nft",
      "sell nft",
      "orderbook",
      "tensor",
      "magic eden",
    ]) {
      expect(soulNftScopeCopy).not.toContain(bannedCurrentScopePromise);
    }
  });

  it("keeps Soul Flow board, chart, proof, activity, and leaderboard copy localized in Chinese", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "tokens.discovery.tabs.fresh-souls")).toBe("Fresh Souls");
    expect(getMessage(en, "tokens.discovery.tabs.hot-flow")).toBe("Hot Flow");
    expect(getMessage(en, "token.proofRail.tradeSoul")).toBe("Trade Soul");
    expect(getMessage(en, "stats.activityKinds.soulGenerated")).toBe("Soul Generated");
    expect(getMessage(en, "stats.activityKinds.settlement")).toBe("Settlement");

    expect(getMessage(zh, "tokens.discovery.eyebrow")).toBe("Soul 流动看板");
    expect(getMessage(zh, "tokens.discovery.tabs.fresh-souls")).toBe("新鲜 Soul");
    expect(getMessage(zh, "tokens.discovery.tabs.hot-flow")).toBe("热流");
    expect(getMessage(zh, "tokens.discovery.tabs.top-volume")).toBe("最高成交量");
    expect(getMessage(zh, "token.tradeSoulCard.title")).toBe("交易 Soul");
    expect(getMessage(zh, "token.proofRail.tradeSoul")).toBe("交易 Soul");
    expect(getMessage(zh, "token.bondingCurveChart.eyebrow")).toBe("Soul 流动图表");
    expect(getMessage(zh, "stats.activityKinds.soulGenerated")).toBe("Soul 生成");
    expect(getMessage(zh, "stats.activityKinds.settlement")).toBe("结算");
    expect(getMessage(zh, "stats.activityEyebrow")).toBe("实时流动");
    expect(getMessage(zh, "stats.leaderboards.title")).toBe("市场流动领跑者");
    expect(getMessage(zh, "stats.leaderboards.metrics.flowScore")).toContain("流动分数");

    const zhSoulFlowCopy = [
      "tokens.marketNotice",
      "tokens.empty",
      "tokens.discovery.ariaLabel",
      "tokens.discovery.eyebrow",
      "tokens.discovery.description",
      "tokens.discovery.tabs.fresh-souls",
      "tokens.discovery.tabs.hot-flow",
      "tokens.discovery.tabs.top-volume",
      "token.tradeSoulCard.title",
      "token.proofRail.tradeSoul",
      "token.proofRail.title",
      "token.bondingCurveChart.eyebrow",
      "token.bondingCurveChart.title",
      "token.bondingCurveChart.summary",
      "token.bondingCurveChart.soulFlow.fixture",
      "token.bondingCurveChart.soulFlow.noMarkers",
      "stats.description",
      "stats.activityEyebrow",
      "stats.emptyActivity",
      "stats.activityKinds.soulGenerated",
      "stats.activityKinds.soulClaimed",
      "stats.activityKinds.settlement",
      "stats.activityTitles.claim",
      "stats.activityTitles.soulGenerated",
      "stats.activityTitles.settlement",
      "stats.leaderboards.eyebrow",
      "stats.leaderboards.title",
      "stats.leaderboards.description",
      "stats.leaderboards.modules.topFlowingTokens.title",
      "stats.leaderboards.modules.topFlowingTokens.empty",
      "stats.leaderboards.modules.recentGenerations.title",
      "stats.leaderboards.metrics.flowScore",
    ]
      .map((path) => getMessage(zh, path))
      .join(" ");

    for (const leakedLabel of [
      "Fresh Souls",
      "Hot Flow",
      "Trade Soul",
      "Soul Generated",
      "Top Volume",
      "Settlement",
      " claim",
      "Flow",
      "stats",
      "indexer",
    ]) {
      expect(zhSoulFlowCopy).not.toContain(leakedLabel);
    }
  });

  it("publishes PD5 trade-to-generate buy and sell moment copy", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "token.tradePanelBody")).toContain("Every buy or sell can awaken");
    expect(getMessage(en, "token.tradeGeneration.generated")).toBe(
      "Generated Soul #{generation}",
    );
    expect(getMessage(en, "token.tradeGeneration.sellEyebrow")).toContain(
      "Sell complete",
    );
    expect(getMessage(zh, "token.tradePanelBody")).toContain("买入或卖出都可能唤醒");
    expect(getMessage(zh, "token.tradeGeneration.generated")).toBe(
      "已生成 Soul #{generation}",
    );
    expect(getMessage(zh, "token.tradeGeneration.sellEyebrow")).toContain(
      "卖出完成",
    );
  });

  it("publishes PD5 visible Soul lifecycle state machine copy", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "token.lifecycleMachine.title")).toContain(
      "Soul journey",
    );
    expect(getMessage(en, "token.lifecycleMachine.steps.noSoulYet.label")).toBe(
      "No Soul yet",
    );
    expect(getMessage(en, "token.lifecycleMachine.steps.generatedUnclaimed.label")).toBe(
      "Awakened / uncollected",
    );
    expect(getMessage(en, "token.lifecycleMachine.steps.claimable.label")).toBe(
      "Claimable",
    );
    expect(getMessage(en, "token.lifecycleMachine.steps.ineligible.label")).toBe(
      "Ineligible",
    );
    expect(getMessage(en, "token.lifecycleMachine.steps.claimedInCollection.label")).toBe(
      "Collected",
    );
    expect(getMessage(en, "token.lifecycleMachine.actions.tradeToGenerate")).toContain(
      "Trade",
    );
    expect(getMessage(en, "token.lifecycleMachine.actions.connectWallet")).toBe(
      "Connect wallet to check eligibility",
    );
    expect(getMessage(en, "token.lifecycleMachine.actions.claimSoul")).toBe("Collect Soul");
    expect(getMessage(en, "token.lifecycleMachine.technicalDetails")).toContain("Advanced technical details");

    expect(getMessage(zh, "token.lifecycleMachine.title")).toContain(
      "Soul 旅程",
    );
    expect(getMessage(zh, "token.lifecycleMachine.steps.noSoulYet.label")).toBe(
      "还没有 Soul",
    );
    expect(getMessage(zh, "token.lifecycleMachine.steps.generatedUnclaimed.label")).toBe(
      "已唤醒 / 未领取",
    );
    expect(getMessage(zh, "token.lifecycleMachine.actions.connectWallet")).toBe(
      "连接钱包检查资格",
    );
    expect(getMessage(zh, "token.lifecycleMachine.actions.tradeToGenerate")).toContain(
      "交易",
    );
    expect(getMessage(zh, "token.lifecycleMachine.actions.buyOrHold")).toContain(
      "10,000 枚",
    );
    expect(getMessage(zh, "token.lifecycleMachine.technicalDetails")).toContain("高级技术细节");
  });

  it("publishes minimal Trade Soul preset and MT gate estimate copy in both locales", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");
    const tradeCopyPaths = [
      "token.quote.buyTitle",
      "token.quote.sellTitle",
      "token.quote.youReceive",
      "token.quote.minReceived",
      "token.quote.lockFee",
      "token.quote.priceImpact",
      "token.quote.balance",
      "token.quote.route",
      "token.quote.buyRoute",
      "token.quote.sellRoute",
      "token.tradeSoulCard.eyebrow",
      "token.tradeSoulCard.title",
      "token.tradeSoulCard.body",
      "token.tradeReady.buy",
      "token.tradeReady.sell",
      "token.tradeControls.solAmount",
      "token.tradeControls.slippagePercent",
      "token.tradeControls.sellTokenAmount",
      "token.tradeControls.sellSlippagePercent",
      "token.tradeControls.quickBuyLabel",
      "token.tradeControls.quickSellLabel",
      "token.tradeControls.buyPresetMtGate",
      "token.tradeControls.sellPresetMax",
      "token.tradeControls.mtGateEstimateReady",
      "token.tradeControls.mtGateEstimateMet",
      "token.tradeControls.mtGateEstimateUnavailable.connectWallet",
      "token.tradeControls.mtGateEstimateUnavailable.balanceLoading",
      "token.tradeControls.mtGateEstimateUnavailable.balanceUnavailable",
      "token.tradeControls.mtGateEstimateUnavailable.curveLoading",
      "token.tradeControls.mtGateEstimateUnavailable.curveUnavailable",
      "token.tradeControls.mtGateEstimateUnavailable.tooLarge",
      "token.tradeControls.sellPresetUnavailable.connectWallet",
      "token.tradeControls.sellPresetUnavailable.loading",
      "token.tradeControls.sellPresetUnavailable.empty",
      "token.tradeControls.sellPresetUnavailable.unavailable",
      "token.tradeControls.estimatedTokenOut",
      "token.tradeControls.buyPreviewPrompt",
      "token.tradeControls.estimatedSolOut",
      "token.tradeControls.sellPreviewPrompt",
      "token.tradeControls.advanced",
      "token.tradeControls.sellClaimWarningBody",
      "token.tradeControls.sellBeforeClaimWarningBody",
      "token.bondingCurveChart.unavailableTitle",
      "token.bondingCurveChart.unavailableBody",
      "launch.form.submitted",
      "launch.form.successBody",
      "launch.form.viewTokenTradeNow",
    ];

    expect(getMessage(en, "token.tradeControls.quickBuyLabel")).toBe("Quick buy");
    expect(getMessage(en, "token.tradeControls.buyPresetMtGate")).toContain("MT gate");
    expect(getMessage(en, "token.tradeControls.mtGateEstimateReady")).toContain("Estimate");
    expect(getMessage(en, "token.tradeControls.mtGateEstimateReady")).toContain(
      "wallet/RPC confirmation",
    );
    expect(getMessage(en, "token.tradeControls.sellPresetUnavailable.connectWallet")).toContain(
      "confirmed balance",
    );

    expect(getMessage(zh, "token.tradeControls.quickBuyLabel")).toBe("快速买入");
    expect(getMessage(zh, "token.tradeControls.buyPresetMtGate")).toContain("MT 门槛");
    expect(getMessage(zh, "token.tradeControls.mtGateEstimateReady")).toContain("预估");
    expect(getMessage(zh, "token.tradeControls.mtGateEstimateReady")).toContain(
      "钱包 / RPC 确认",
    );
    expect(getMessage(zh, "token.tradeControls.sellPresetUnavailable.connectWallet")).toContain(
      "已确认余额",
    );
    expect(getMessage(zh, "token.tradeSoulCard.title")).toBe("交易 Soul");
    expect(getMessage(zh, "token.tradeSoulCard.title")).not.toBe("Trade Soul");

    for (const path of tradeCopyPaths) {
      expect(getMessage(en, path).length, path).toBeGreaterThan(0);
      expect(getMessage(zh, path).length, path).toBeGreaterThan(0);
      expect(extractPlaceholders(getMessage(zh, path))).toEqual(
        extractPlaceholders(getMessage(en, path)),
      );
    }

    expect(getMessage(en, "launch.form.submitted")).toContain("Trade Soul card");
    expect(getMessage(en, "launch.form.submitted")).toContain("first buy");
    expect(getMessage(en, "launch.form.successBody")).toContain("Trade Soul card");
    expect(getMessage(en, "launch.form.viewTokenTradeNow")).toContain("first trade");
    expect(getMessage(zh, "launch.form.submitted")).toContain("交易 Soul 卡片");
    expect(getMessage(zh, "launch.form.submitted")).toContain("首次买入");
    expect(getMessage(zh, "launch.form.successBody")).toContain("交易 Soul 卡片");
    expect(getMessage(zh, "launch.form.viewTokenTradeNow")).toContain("首次交易");

    for (const path of [
      "token.tradeControls.mtGateEstimateUnavailable.connectWallet",
      "token.tradeControls.mtGateEstimateUnavailable.balanceLoading",
      "token.tradeControls.mtGateEstimateUnavailable.balanceUnavailable",
      "token.tradeControls.mtGateEstimateUnavailable.curveLoading",
      "token.tradeControls.mtGateEstimateUnavailable.curveUnavailable",
      "token.tradeControls.sellPresetUnavailable.connectWallet",
      "token.tradeControls.sellPresetUnavailable.loading",
      "token.tradeControls.sellPresetUnavailable.empty",
      "token.tradeControls.sellPresetUnavailable.unavailable",
      "token.tradeControls.buyPreviewPrompt",
      "token.tradeControls.sellPreviewPrompt",
      "token.bondingCurveChart.unavailableBody",
    ]) {
      const fallbackCopy = `${getMessage(en, path)} ${getMessage(zh, path)}`;
      expect(fallbackCopy, path).not.toMatch(/\b\d+\.\d+\s*(?:SOL|tokens|代币)\b/);
      expect(fallbackCopy, path).not.toMatch(/10,000 tokens \/ MT|2,100 MT cap/);
    }
  });

  it("publishes PD5 token timeline labels in both locales", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "token.timeline.title")).toBe("Story timeline");
    expect(getMessage(en, "token.timeline.body")).toContain("Launches, trades");
    expect(getMessage(en, "token.timeline.events.generation.title")).toBe("Soul generation");
    expect(getMessage(en, "token.timeline.signature")).toBe("Transaction");
    expect(getMessage(en, "token.timeline.unavailableTitle")).toContain("temporarily unavailable");
    expect(getMessage(en, "token.timeline.retryHint")).toContain("retry");
    expect(getMessage(en, "token.timeline.timeoutError")).toContain("timed out");
    expect(getMessage(en, "token.timeline.invalidData")).toContain("incomplete");
    expect(getMessage(en, "token.timeline.links.transaction")).toBe("Explorer");

    expect(getMessage(zh, "token.timeline.title")).toBe("故事时间线");
    expect(getMessage(zh, "token.timeline.body")).toContain("发射、交易");
    expect(getMessage(zh, "token.timeline.events.generation.title")).toBe("Soul 生成");
    expect(getMessage(zh, "token.timeline.signature")).toBe("交易");
    expect(getMessage(zh, "token.timeline.unavailableTitle")).toBe("故事暂时不可用");
    expect(getMessage(zh, "token.timeline.retryHint")).toContain("重新获取故事时间线");
    expect(getMessage(zh, "token.timeline.timeoutError")).toContain("超时");
    expect(getMessage(zh, "token.timeline.invalidData")).toContain("不完整");
    expect(getMessage(zh, "token.timeline.links.transaction")).toBe("Explorer");
  });

  it("publishes PD7 market-created card provenance labels and state guidance in both locales", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    for (const namespace of ["tokens", "gallery", "publicGallery", "tokenGallery"]) {
      expect(getMessage(en, `${namespace}.provenance.title`).toLowerCase()).toContain("market-created");
      expect(getMessage(en, `${namespace}.provenance.generation`)).toBe("Generation");
      expect(getMessage(en, `${namespace}.provenance.side`)).toBe("Trade side");
      expect(getMessage(en, `${namespace}.provenance.amount`)).toBe("Trade amount");
      expect(getMessage(en, `${namespace}.provenance.trader`)).toContain("Trader");
      expect(getMessage(en, `${namespace}.provenance.seedHash`)).toBe("Seed hash");
      expect(getMessage(en, `${namespace}.provenance.transaction`)).toContain("Explorer");
      expect(getMessage(en, `${namespace}.provenance.transactionPending`)).toContain("pending");
      expect(getMessage(en, `${namespace}.provenance.unavailableTitle`).toLowerCase()).toContain("pending");
      expect(getMessage(en, `${namespace}.provenance.unavailableBody`)).toContain("market-created");

      expect(getMessage(zh, `${namespace}.provenance.title`)).toContain("市场");
      expect(getMessage(zh, `${namespace}.provenance.generation`)).toBe("生成编号");
      expect(getMessage(zh, `${namespace}.provenance.side`)).toBe("交易方向");
      expect(getMessage(zh, `${namespace}.provenance.amount`)).toBe("交易数量");
      expect(getMessage(zh, `${namespace}.provenance.trader`)).toContain("交易者");
      expect(getMessage(zh, `${namespace}.provenance.seedHash`)).toBe("Seed hash");
      expect(getMessage(zh, `${namespace}.provenance.transaction`)).toContain("Explorer");
      expect(getMessage(zh, `${namespace}.provenance.transactionPending`)).toContain("待确认");
      expect(getMessage(zh, `${namespace}.provenance.unavailableTitle`)).toContain("等待");
      expect(getMessage(zh, `${namespace}.provenance.unavailableBody`)).toContain("市场交易创造");
    }

    expect(getMessage(en, "tokens.loading")).toContain("bonding-curve");
    expect(getMessage(en, "tokens.loadError")).toContain("trade-generated Soul state");
    expect(getMessage(en, "tokens.empty")).toContain("trade to generate Souls");
    expect(getMessage(en, "gallery.loadError")).toContain("trade-generated Soul NFTs");
    expect(getMessage(en, "publicGallery.loadError")).toContain("trade-generated Soul NFTs");
    expect(getMessage(en, "publicGallery.timeoutError")).toContain("timed out");
    expect(getMessage(en, "publicGallery.retryGuidance")).toContain("without inventing missing provenance");
    expect(getMessage(en, "tokenGallery.loadError")).toContain("trade-generated Soul NFTs");
    expect(getMessage(en, "tokenGallery.timeoutError")).toContain("timed out");
    expect(getMessage(en, "tokenGallery.retryGuidance")).toContain("without fabricating missing evidence");
    expect(getMessage(en, "publicGallery.empty")).toContain("trade to generate");
    expect(getMessage(en, "tokenGallery.empty")).toContain("Trade this token to generate");
    expect(getMessage(zh, "tokens.loading")).toContain("bonding-curve");
    expect(getMessage(zh, "tokens.loadError")).toContain("交易生成的 Soul 状态");
    expect(getMessage(zh, "tokens.empty")).toContain("交易生成 Soul");
    expect(getMessage(zh, "gallery.loadError")).toContain("交易生成的 Soul NFT");
    expect(getMessage(zh, "publicGallery.loadError")).toContain("交易生成 Soul NFT");
    expect(getMessage(zh, "publicGallery.timeoutError")).toContain("超时");
    expect(getMessage(zh, "publicGallery.retryGuidance")).toContain("不会编造缺失的 provenance");
    expect(getMessage(zh, "tokenGallery.loadError")).toContain("交易生成 Soul NFT");
    expect(getMessage(zh, "tokenGallery.timeoutError")).toContain("超时");
    expect(getMessage(zh, "tokenGallery.retryGuidance")).toContain("不会编造缺失证据");
    expect(getMessage(zh, "publicGallery.empty")).toContain("交易生成");
    expect(getMessage(zh, "tokenGallery.empty")).toContain("交易该代币");
  });

  it("uses PD9 monochrome art and real wallet-upload copy without old toy defaults", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "launch.form.namePlaceholder")).toContain("Symphony");
    expect(getMessage(zh, "launch.form.namePlaceholder")).toContain("交响");
    expect(getMessage(en, "launch.form.starterTemplateHelp")).toContain("wallet uploads");
    expect(getMessage(zh, "launch.form.starterTemplateHelp")).toContain("钱包会上传");
    expect(getMessage(en, "launch.form.artThemeLabel")).toContain("Art style");
    expect(getMessage(zh, "launch.form.artThemeLabel")).toContain("艺术风格");
    expect(getMessage(en, "launch.form.coreTraitTitle")).toContain("Guide");
    expect(getMessage(zh, "launch.form.coreTraitTitle")).toContain("引导");
    expect(getMessage(en, "launch.form.coreTraitHelp")).toContain("{max}");
    expect(getMessage(zh, "launch.form.coreTraitHelp")).toContain("{max}");
    expect(getMessage(en, "launch.form.coreTraitLimit")).toContain("{count}");
    expect(getMessage(zh, "launch.form.coreTraitLimit")).toContain("{count}");
    expect(getMessage(en, "launch.form.coreArtTraits.categories.palette.label")).toBe("Palette");
    expect(getMessage(zh, "launch.form.coreArtTraits.categories.palette.label")).toContain("色彩");
    expect(getMessage(en, "launch.form.coreArtTraits.options.palette.aurora")).toBe("Aurora");
    expect(getMessage(zh, "launch.form.coreArtTraits.options.palette.aurora")).toContain("极光");
    expect(getMessage(en, "launch.form.coreArtTraits.options.background.eclipse")).toBe("Eclipse");
    expect(getMessage(zh, "launch.form.coreArtTraits.options.background.eclipse")).toContain("日蚀");
    expect(getMessage(en, "launch.form.artThemes.fractal.label")).toBe("Fractal Structure");
    expect(getMessage(zh, "launch.form.artThemes.fractal.label")).toBe("Fractal Structure");
    expect(getMessage(en, "launch.form.artThemes.fractal.description")).toContain(
      "repeating",
    );
    expect(getMessage(zh, "launch.form.artThemes.fractal.description")).toContain(
      "分形",
    );
    expect(getMessage(en, "launch.form.artThemes.chaos.label")).toBe("Strange Attractor");
    expect(getMessage(zh, "launch.form.artThemes.chaos.label")).toBe("Strange Attractor");
    expect(getMessage(en, "launch.form.artThemes.chaos.description")).toContain(
      "strange-attractor",
    );
    expect(getMessage(zh, "launch.form.artThemes.chaos.description")).toContain(
      "奇异吸引子",
    );
    expect(getMessage(en, "launch.form.artThemes.harmonic.label")).toBe("Harmonic Wave");
    expect(getMessage(zh, "launch.form.artThemes.harmonic.label")).toBe("Harmonic Wave");
    expect(getMessage(en, "launch.form.artThemes.symphony.label")).toBe("Symphony");
    expect(getMessage(zh, "launch.form.artThemes.symphony.description")).toContain("像素");
    expect(getMessage(en, "launch.form.artThemes.custom.label")).toBe("Custom Template");
    expect(getMessage(zh, "launch.form.artThemes.custom.label")).toBe("Custom Template");
    expect(getMessage(en, "launch.form.artThemes.harmonic.description").toLowerCase()).toContain("wave");
    expect(getMessage(zh, "launch.form.artThemes.harmonic.description")).toContain("波");
    expect(getMessage(en, "launch.form.templateUploadFinalized")).toContain("Art upload transaction");
    expect(getMessage(zh, "launch.form.templateUploadFinalized")).toContain("艺术上传交易");
    expect(getMessage(en, "launch.templateEditor.title").toLowerCase()).toContain("fractal");
    expect(getMessage(zh, "launch.templateEditor.title")).toContain("分形");
    expect(getMessage(en, "token.previewEmpty")).toContain("Fractal");
    expect(getMessage(zh, "token.previewEmpty")).toContain("分形");
    expect(getMessage(en, "tokens.noGenerationBody")).toContain("Fractal");
    expect(getMessage(zh, "tokens.noGenerationBody")).toContain("分形");
    expect(getMessage(en, "stats.activityDescription")).toContain("Fractal");
    expect(getMessage(en, "stats.sourceValue")).toContain("{provider}");
    expect(getMessage(en, "stats.sourceValue").toLowerCase()).not.toContain("endpoint");
    expect(getMessage(zh, "stats.activityDescription")).toContain("分形");
    expect(getMessage(zh, "stats.sourceValue")).toContain("{provider}");
    expect(getMessage(en, "stats.tokenTotalsGalleryLink")).toBe("Token gallery");
    expect(getMessage(zh, "stats.tokenTotalsGalleryLink")).toBe("代币画廊");

    const allMessages = `${JSON.stringify(en)} ${JSON.stringify(zh)}`.toLowerCase();
    expect(allMessages).not.toContain("rainbow unicorn");
    expect(allMessages).not.toContain("pixel cat");
    expect(allMessages).not.toContain("彩虹独角兽");
    expect(allMessages).not.toContain("像素猫");
    expect(allMessages).not.toContain("preview-only");
  });

  it("localizes dust stats raw fields, receipt buckets, and prototype limitations", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");
    const dustFieldKeys = [
      "whole_units_in_pool",
      "fractional_remainder",
      "fractional_fill_ratio",
      "liquidity_dust_ratio",
      "active_receipts",
      "burned_receipts",
      "forfeited_receipts",
      "inactive_receipts",
      "whole_units_outside_liquidity",
      "outside_liquidity_audited_tokens",
    ];

    for (const key of dustFieldKeys) {
      expect(getMessage(en, `stats.dust.fields.${key}.label`).length).toBeGreaterThan(0);
      expect(getMessage(en, `stats.dust.fields.${key}.help`).length).toBeGreaterThan(0);
      expect(getMessage(zh, `stats.dust.fields.${key}.label`).length).toBeGreaterThan(0);
      expect(getMessage(zh, `stats.dust.fields.${key}.help`).length).toBeGreaterThan(0);
    }

    expect(getMessage(en, "stats.dust.prototypeNotice")).toContain("Transfer Hook prototype");
    expect(getMessage(en, "stats.dust.prototypeNotice")).toContain("historical Raydium swap-path evidence remains bounded/deferred");
    expect(getMessage(en, "stats.dust.partialBadge")).toContain("Partial");
    expect(getMessage(en, "stats.dust.staleBadge")).toContain("Stale");
    expect(getMessage(en, "stats.dust.burnedIncludes")).toContain("{states}");
    expect(getMessage(en, "stats.dust.liquiditySources.post_migration_unavailable")).toContain("unavailable");
    expect(getMessage(en, "stats.dust.outsideSources.top_accounts_bounded_audit")).toContain("bounded");
    expect(getMessage(en, "stats.dust.outsideSources.top_accounts_bounded_audit").toLowerCase()).toContain("not a complete scan");
    expect(getMessage(en, "stats.dust.fields.liquidity_dust_ratio.label")).toContain("Liquidity dust ratio");
    expect(getMessage(en, "stats.dust.fields.liquidity_dust_ratio.help")).toContain("observed active liquidity");
    expect(getMessage(en, "stats.dust.fields.liquidity_dust_ratio.help")).toContain("not an official scarcity signal");
    expect(getMessage(en, "stats.dust.raydiumSourceTitle")).toContain("Historical Raydium source");
    expect(getMessage(en, "stats.dust.sourceMetadata.activeLiquidityAccount")).toContain("{value}");
    expect(getMessage(en, "stats.dust.sourceMetadata.raydiumPoolState")).toContain("{value}");
    expect(getMessage(en, "stats.dust.sourceMetadata.tokenProgram")).toContain("{value}");
    expect(getMessage(en, "stats.dust.sourceCoverageTitle")).toContain("source coverage");
    expect(getMessage(zh, "stats.dust.prototypeNotice")).toContain("Transfer Hook prototype");
    expect(getMessage(zh, "stats.dust.prototypeNotice")).toContain("历史 Raydium swap-path");
    expect(getMessage(zh, "stats.dust.partialBadge")).toContain("部分");
    expect(getMessage(zh, "stats.dust.staleBadge")).toContain("陈旧");
    expect(getMessage(zh, "stats.dust.burnedIncludes")).toContain("{states}");
    expect(getMessage(zh, "stats.dust.liquiditySources.post_migration_unavailable")).toContain("不可用");
    expect(getMessage(zh, "stats.dust.outsideSources.top_accounts_bounded_audit")).toContain("有界");
    expect(getMessage(zh, "stats.dust.outsideSources.top_accounts_bounded_audit")).toContain("不是完整扫描");
    expect(getMessage(zh, "stats.dust.fields.liquidity_dust_ratio.label")).toContain("Liquidity dust ratio");
    expect(getMessage(zh, "stats.dust.fields.liquidity_dust_ratio.help")).toContain("observed active liquidity");
    expect(getMessage(zh, "stats.dust.fields.liquidity_dust_ratio.help")).toContain("不是官方稀缺性信号");
    expect(getMessage(zh, "stats.dust.raydiumSourceTitle")).toContain("历史 Raydium 来源");
    expect(getMessage(zh, "stats.dust.sourceMetadata.activeLiquidityAccount")).toContain("{value}");
    expect(getMessage(zh, "stats.dust.sourceMetadata.raydiumPoolState")).toContain("{value}");
    expect(getMessage(zh, "stats.dust.sourceMetadata.tokenProgram")).toContain("{value}");
    expect(getMessage(zh, "stats.dust.sourceCoverageTitle")).toContain("来源覆盖");

    for (const key of [
      "bonding_curve_reserve_tokens",
      "raydium_cp_swap_vault_tokens",
      "unavailable_tokens",
      "source_verified_tokens",
      "source_unverified_tokens",
      "warning_tokens",
    ]) {
      expect(getMessage(en, `stats.dust.sourceCoverage.${key}.label`).length).toBeGreaterThan(0);
      expect(getMessage(en, `stats.dust.sourceCoverage.${key}.help`).length).toBeGreaterThan(0);
      expect(getMessage(zh, `stats.dust.sourceCoverage.${key}.label`).length).toBeGreaterThan(0);
      expect(getMessage(zh, `stats.dust.sourceCoverage.${key}.help`).length).toBeGreaterThan(0);
    }

    const unsupportedScarcityCopy = `${JSON.stringify(en.stats)} ${JSON.stringify(zh.stats)}`.toLowerCase();
    expect(unsupportedScarcityCopy).not.toContain("scarcity score");
    expect(unsupportedScarcityCopy).not.toContain("receipt dominance");
    expect(unsupportedScarcityCopy).not.toContain("guaranteed rarity");
  });

  it("localizes stable dust/source warning message keys in English and Chinese", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");
    const warningKeys = [
      "outsideLiquidityScanUnavailable",
      "outsideLiquidityVenueUnavailable",
      "activeLiquidityZero",
      "raydiumVaultUnverified",
      "launchedTokenMetricsPartial",
      "claimedSoulMetricsPartial",
      "recentGenerationProvenancePartial",
      "receiptLifecycleCountsPartial",
      "outsideLiquidityScanPartial",
      "token2022IndexedGpaUnavailable",
      "token2022SecondaryIndexExcluded",
      "token2022IndexedGpaProbeFailed",
      "tokenMethodsBoundedSample",
      "outsideLiquiditySampleLimited",
      "outsideLiquidityUnknownWhenTopSampleEmpty",
      "outsideLiquidityTokenMethodsUnavailable",
      "outsideLiquidityNoProbeTarget",
      "rpcFailoverUsed",
      "postGraduationRaydiumReceiptPathsBounded",
      "raydiumTransferHookMintsUnsupported",
      "statsSourceSlotPartial",
      "unknownPartial",
    ];

    for (const key of warningKeys) {
      expect(getMessage(en, `stats.dust.warningMessages.${key}`).length).toBeGreaterThan(0);
      expect(getMessage(zh, `stats.dust.warningMessages.${key}`).length).toBeGreaterThan(0);
    }

    const zhWarnings = JSON.stringify(
      (zh.stats as { dust: { warningMessages: Record<string, string> } }).dust.warningMessages,
    );
    expect(zhWarnings).not.toContain("outside-liquidity token account scan unavailable");
    expect(zhWarnings).not.toContain("receipt lifecycle counts");
    expect(getMessage(en, "stats.dust.warningMessages.postGraduationRaydiumReceiptPathsBounded")).toContain("Historical post-graduation Raydium");
    expect(getMessage(en, "stats.dust.warningMessages.postGraduationRaydiumReceiptPathsBounded")).toContain("only wallet hook-aware direct transfers");
    expect(getMessage(en, "stats.dust.warningMessages.raydiumTransferHookMintsUnsupported")).toContain("Transfer Hook-enabled mints do not migrate");
    expect(getMessage(zh, "stats.dust.warningMessages.postGraduationRaydiumReceiptPathsBounded")).toContain("Raydium CP-Swap");
    expect(getMessage(zh, "stats.dust.warningMessages.raydiumTransferHookMintsUnsupported")).toContain("Transfer Hook");
  });

  it("publishes all token detail curve labels used by the client renderer", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");
    const tokenLabelKeys = ["selfDeprecated"];
    const lifecycleLabelKeys = ["percentMinted"];
    const tradeControlLabelKeys = ["selfDeprecated"];
    const bondingCurveChartKeys = [
      "title",
      "eyebrow",
      "body",
      "summary",
      "unavailableTitle",
      "unavailableBody",
      "currentPoint",
      "mintedProgress",
      "priceAxis",
      "tokenAxis",
      "firstMtMarker",
      "capMarker",
      "capHelper",
    ];
    const bondingCurveChartStatKeys = ["currentPrice", "totalMinted", "percentMinted"];
    const economicsLabelKeys = [
      "protocolCurveParams",
      "protocolFees",
      "cumulativeSol",
      "totalMinted",
      "percentMinted",
      "percentToDeprecated",
      "selfDeprecated",
    ];

    for (const key of tokenLabelKeys) {
      expect(getMessage(en, `token.labels.${key}`).length).toBeGreaterThan(0);
      expect(getMessage(zh, `token.labels.${key}`).length).toBeGreaterThan(0);
    }
    for (const key of lifecycleLabelKeys) {
      expect(getMessage(en, `token.lifecycle.${key}`).length).toBeGreaterThan(0);
      expect(getMessage(zh, `token.lifecycle.${key}`).length).toBeGreaterThan(0);
    }
    for (const key of tradeControlLabelKeys) {
      expect(getMessage(en, `token.tradeControls.${key}`).length).toBeGreaterThan(0);
      expect(getMessage(zh, `token.tradeControls.${key}`).length).toBeGreaterThan(0);
    }
    for (const key of bondingCurveChartKeys) {
      expect(getMessage(en, `token.bondingCurveChart.${key}`).length).toBeGreaterThan(0);
      expect(getMessage(zh, `token.bondingCurveChart.${key}`).length).toBeGreaterThan(0);
    }
    for (const key of bondingCurveChartStatKeys) {
      expect(getMessage(en, `token.bondingCurveChart.stats.${key}`).length).toBeGreaterThan(0);
      expect(getMessage(zh, `token.bondingCurveChart.stats.${key}`).length).toBeGreaterThan(0);
    }
    for (const key of economicsLabelKeys) {
      expect(getMessage(en, `token.economics.labels.${key}`).length).toBeGreaterThan(0);
      expect(getMessage(zh, `token.economics.labels.${key}`).length).toBeGreaterThan(0);
    }
    expect(getMessage(en, "token.bondingCurveChart.summary")).toContain("{currentPrice}");
    expect(getMessage(zh, "token.bondingCurveChart.summary")).toContain("{currentPrice}");
    expect(getMessage(en, "token.curveDeprecated")).toContain("deprecated");
    expect(getMessage(zh, "token.curveDeprecated")).toContain("弃用");
  });

  it("localizes hook-aware direct transfer success and rejection warning keys", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");
    const warningKeys = [
      "directTransferBoundaryRejected",
      "directTransferHookMetasMissing",
      "directTransferRegistryMissing",
      "directTransferUnsupportedHook",
      "directTransferPreflightFailed",
    ];

    expect(getMessage(en, "token.directTransfer.title")).toContain("Hook-aware");
    expect(getMessage(en, "token.directTransfer.success")).toContain("{signature}");
    expect(getMessage(zh, "token.directTransfer.title")).toContain("Hook");
    expect(getMessage(zh, "token.directTransfer.success")).toContain("{signature}");

    for (const key of warningKeys) {
      expect(getMessage(en, `token.directTransfer.warnings.${key}`).length).toBeGreaterThan(0);
      expect(getMessage(zh, `token.directTransfer.warnings.${key}`).length).toBeGreaterThan(0);
    }
  });

  it("localizes boundary settlement mode and selected receipt-set copy", () => {
    const en = readMessages("en");
    const zh = readMessages("zh");

    expect(getMessage(en, "token.settlement.title")).toContain("Boundary settlement");
    expect(getMessage(en, "token.settlement.body")).toContain("{mode}");
    expect(getMessage(en, "token.settlement.body")).toContain("before this boundary move");
    expect(getMessage(en, "token.settlement.selectedReceipts")).toContain("receipt set");
    expect(getMessage(en, "token.directTransfer.body")).toContain("blocks transfers");
    expect(getMessage(en, "token.directTransfer.warnings.directTransferBoundaryRejected")).toContain(
      "settle receipts before crossing",
    );
    expect(getMessage(en, "token.settlement.sourceSelectionNotice")).toContain(
      "source token account",
    );
    expect(getMessage(en, "token.settlement.sourceMismatch")).toContain("Refresh");
    expect(getMessage(zh, "token.settlement.title")).toContain("结算");
    expect(getMessage(zh, "token.settlement.body")).toContain("{mode}");
    expect(getMessage(zh, "token.directTransfer.body")).toContain("阻止");
    expect(getMessage(zh, "token.directTransfer.warnings.directTransferBoundaryRejected")).toContain(
      "结算收据",
    );
    expect(getMessage(zh, "token.settlement.selectedReceipts")).toContain("收据");
    expect(getMessage(zh, "token.settlement.sourceSelectionNotice")).toContain(
      "源代币账户",
    );
    expect(getMessage(zh, "token.settlement.sourceMismatch")).toContain("重新提交");

    const settlementCopy = [
      "token.directTransfer.body",
      "token.directTransfer.warnings.directTransferBoundaryRejected",
      "token.settlement.body",
      "token.settlement.blocked",
      "token.settlement.sourceSelectionNotice",
      "token.settlement.sourceMismatch",
    ]
      .flatMap((key) => [getMessage(en, key), getMessage(zh, key)])
      .join(" ")
      .toLowerCase();
    expect(settlementCopy).not.toContain("automatic burn");
    expect(settlementCopy).not.toContain("automatic forfeit");
    expect(settlementCopy).not.toContain("hook-internal burn");
    expect(settlementCopy).not.toContain("hook-internal forfeit");
  });

  it("keeps Chinese token and Souls routes free of reported English leaks", () => {
    const zh = readMessages("zh");
    const reportedLeaks = [
      "Trade Soul",
      "Protocol-fixed economics",
      "Settlement 预览",
      "Claimer 钱包",
      "Generated Soul",
    ];
    const tokenCopy = [
      "token.tradeSoulCard.eyebrow",
      "token.tradeSoulCard.title",
      "token.tradeSoulCard.body",
      "token.tradeControls.minimumTokenOut",
      "token.tradeControls.sold",
      "token.settlement.title",
      "token.settlement.modeLabel",
      "token.settlement.body",
      "token.settlement.selectedReceipts",
      "token.settlement.blocked",
      "token.settlement.sourceSelectionNotice",
      "token.settlement.sourceAccount",
      "token.settlement.sourceMismatch",
      "token.tradeGeneration.generated",
      "token.economics.fixedCopy.protocolFixedEconomics",
      "token.economics.fixedCopy.noGraduation",
      "token.economics.supplyNotConfigurable",
      "token.economics.units.tokenUnit",
    ]
      .map((path) => getMessage(zh, path))
      .join(" ");
    const soulsCopy = [
      "navigation.souls",
      "navigation.mySouls",
      "publicGallery.title",
      "publicGallery.description",
      "publicGallery.empty",
      "publicGallery.summary",
      "publicGallery.claimer",
      "tokenGallery.title",
      "tokenGallery.description",
      "tokenGallery.empty",
      "tokenGallery.summary",
      "tokenGallery.claimer",
      "gallery.claimer",
      "soulRarity.tiers.common",
      "soulRarity.tiers.epic",
    ]
      .map((path) => getMessage(zh, path))
      .join(" ");

    for (const leak of reportedLeaks) {
      expect(`${tokenCopy} ${soulsCopy}`).not.toContain(leak);
    }
    expect(soulsCopy).not.toMatch(/\bSouls\b/);
    expect(soulsCopy).not.toMatch(/\b(common|epic)\b/);
    expect(tokenCopy).not.toMatch(/\bNo\b/);
    expect(getMessage(zh, "token.tradeSoulCard.title")).toBe("交易 Soul");
    expect(getMessage(zh, "publicGallery.title")).toBe("Soul 收藏");
    expect(getMessage(zh, "soulRarity.tiers.common")).toBe("普通");
    expect(getMessage(zh, "soulRarity.tiers.epic")).toBe("史诗");
  });
});
