// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatsDashboard } from "./StatsDashboard";
import type { CachedPublicStatsSnapshot } from "@/lib/publicStatsCache";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) =>
    React.createElement(
      "a",
      { "data-next-intl-link": "true", href, ...props },
      children,
    ),
}));

let currentLocale: "en" | "zh" = "en";

const localizedWarningMessages: Record<"en" | "zh", Record<string, string>> = {
  en: {
    "dust.warningMessages.outsideLiquidityScanUnavailable":
      "Outside-liquidity token-account scan is not available for this token yet.",
    "dust.warningMessages.outsideLiquidityVenueUnavailable":
      "Outside-liquidity venue discovery is unavailable for historical/deferred migration evidence.",
    "dust.warningMessages.activeLiquidityZero":
      "Active liquidity balance is zero, so liquidity dust ratio is unavailable.",
    "dust.warningMessages.raydiumVaultUnverified":
      "Raydium vault source could not be verified, so liquidity dust values are unavailable.",
    "dust.warningMessages.launchedTokenMetricsPartial":
      "Launched-token metrics are partially available from the current RPC source.",
    "dust.warningMessages.claimedSoulMetricsPartial":
      "Claimed Soul metrics are partially available from the current RPC source.",
    "dust.warningMessages.recentGenerationProvenancePartial":
      "Recent generation provenance is partially available from the current RPC source.",
    "dust.warningMessages.receiptLifecycleCountsPartial":
      "Receipt lifecycle counts are partially available from the current RPC source.",
    "dust.warningMessages.outsideLiquidityScanPartial":
      "Outside-liquidity token-account scanning is partially available from the current RPC source.",
    "dust.warningMessages.token2022IndexedGpaUnavailable":
      "Outside-liquidity coverage is a bounded top-account audit because Token-2022 indexed GPA is unavailable.",
    "dust.warningMessages.token2022SecondaryIndexExcluded":
      "The RPC source excludes Token-2022 from secondary indexes, so SolSoul is not claiming a complete scan.",
    "dust.warningMessages.tokenMethodsBoundedSample":
      "Outside-liquidity values come from token supply and largest-account methods with bounded sample limits.",
    "dust.warningMessages.outsideLiquiditySampleLimited":
      "Additional outside-liquidity accounts may exist outside the sampled top accounts.",
    "dust.warningMessages.outsideLiquidityUnknownWhenTopSampleEmpty":
      "The bounded top-account sample found no outside liquidity, so the outside amount remains unknown instead of zero.",
    "dust.warningMessages.outsideLiquidityTokenMethodsUnavailable":
      "Token-method fallback data is unavailable, so outside-liquidity completeness is unknown.",
    "dust.warningMessages.outsideLiquidityNoProbeTarget":
      "No Token-2022 mint was available for an outside-liquidity capability probe.",
    "dust.warningMessages.rpcFailoverUsed":
      "RPC failover was used; completeness follows the endpoint that supplied the bounded evidence.",
    "dust.warningMessages.postGraduationRaydiumReceiptPathsBounded":
      "Historical post-graduation Raydium CP-Swap liquidity and swap paths are bounded/deferred for receipt hard-binding; only wallet hook-aware direct transfers are presented as protected.",
    "dust.warningMessages.raydiumTransferHookMintsUnsupported":
      "Transfer Hook-enabled mints do not migrate to Raydium in the active curve-only product flow; retained Raydium references are historical/deferred.",
    "dust.warningMessages.statsSourceSlotPartial":
      "Stats source slot metadata is partially available from the current RPC source.",
    "dust.warningMessages.unknownPartial":
      "One dust stats source is partially available from the current RPC source.",
  },
  zh: {
    "dust.warningMessages.outsideLiquidityScanUnavailable":
      "该代币的流动性外 Token-2022 账户扫描暂不可用。",
    "dust.warningMessages.outsideLiquidityVenueUnavailable":
      "历史/延后迁移证据的流动性 venue 暂无法识别。",
    "dust.warningMessages.activeLiquidityZero":
      "Active liquidity 余额为零，因此 liquidity dust ratio 暂不可用。",
    "dust.warningMessages.raydiumVaultUnverified":
      "Raydium vault 来源未通过验证，因此 liquidity dust 数值暂不可用。",
    "dust.warningMessages.launchedTokenMetricsPartial":
      "当前 RPC 来源的已发射代币指标仅部分可用。",
    "dust.warningMessages.claimedSoulMetricsPartial":
      "当前 RPC 来源的已 claim Soul 指标仅部分可用。",
    "dust.warningMessages.recentGenerationProvenancePartial":
      "当前 RPC 来源的最近生成 provenance 仅部分可用。",
    "dust.warningMessages.receiptLifecycleCountsPartial":
      "当前 RPC 来源的收据生命周期计数仅部分可用。",
    "dust.warningMessages.outsideLiquidityScanPartial":
      "当前 RPC 来源的流动性外 Token-2022 账户扫描仅部分可用。",
    "dust.warningMessages.token2022IndexedGpaUnavailable":
      "由于 Token-2022 indexed GPA 不可用，流动性外覆盖仅为 top-account 有界审计。",
    "dust.warningMessages.token2022SecondaryIndexExcluded":
      "该 RPC 来源将 Token-2022 排除在 secondary indexes 之外，因此 SolSoul 不会声称完整扫描。",
    "dust.warningMessages.tokenMethodsBoundedSample":
      "流动性外数值来自 token supply 和 largest-account 方法，样本范围是有界的。",
    "dust.warningMessages.outsideLiquiditySampleLimited":
      "样本 top accounts 之外仍可能存在额外的流动性外账户。",
    "dust.warningMessages.outsideLiquidityUnknownWhenTopSampleEmpty":
      "有界 top-account 样本未发现流动性外账户，因此外部数量保持未知而不是报告为 0。",
    "dust.warningMessages.outsideLiquidityTokenMethodsUnavailable":
      "Token-method 回退数据不可用，因此流动性外完整性未知。",
    "dust.warningMessages.outsideLiquidityNoProbeTarget":
      "没有可用于流动性外能力探测的 Token-2022 mint。",
    "dust.warningMessages.rpcFailoverUsed":
      "已使用 RPC failover；完整性跟随提供有界证据的端点。",
    "dust.warningMessages.postGraduationRaydiumReceiptPathsBounded":
      "历史毕业后的 Raydium CP-Swap 流动性和 swap 路径对 receipt hard-binding 仍是 bounded/deferred；只有 wallet hook-aware 直接转账会显示为受保护。",
    "dust.warningMessages.raydiumTransferHookMintsUnsupported":
      "当前曲线-only 产品流程中，启用 Transfer Hook 的 mint 不迁移到 Raydium；保留的 Raydium 引用均为历史/延后语境。",
    "dust.warningMessages.statsSourceSlotPartial":
      "当前 RPC 来源的 stats slot 元数据仅部分可用。",
    "dust.warningMessages.unknownPartial":
      "当前 RPC 来源的某个 dust stats 来源仅部分可用。",
  },
};

const translate = (key: string, values?: Record<string, string>) => {
  if (key in localizedWarningMessages[currentLocale]) {
    return localizedWarningMessages[currentLocale][key];
  }
  if (key === "sourceValue") {
    return `Source: ${values?.provider ?? ""}`;
  }
  if (key === "fetchedAt") {
    return `Fetched: ${values?.timestamp ?? ""}`;
  }
  if (key === "cachedWarning") {
    return `Latest public snapshot: ${values?.message ?? ""}`;
  }
  if (key === "timeoutError") {
    return "Stats timed out";
  }
  if (key === "invalidData") {
    return currentLocale === "zh"
      ? "公开统计数据暂时不完整，部分指标会显示为不可用。"
      : "Stats response is incomplete; partial metrics are unavailable.";
  }
  if (key === "unavailable") {
    return currentLocale === "zh" ? "公开统计暂不可用" : "Public stats unavailable";
  }
  if (key === "activityTitles.launch") {
    return `Launched ${values?.token ?? "token"}`;
  }
  if (key === "activityTitles.tradeGeneration") {
    return `Generated Soul #${values?.generation ?? "0"} for ${values?.token ?? "token"}`;
  }
  if (key === "activityTitles.buy") {
    return `Buy flowed for ${values?.token ?? "token"}`;
  }
  if (key === "activityTitles.sell") {
    return `Sell flowed for ${values?.token ?? "token"}`;
  }
  if (key === "activityTitles.soulGenerated") {
    return `Soul generated #${values?.generation ?? "0"} for ${values?.token ?? "token"}`;
  }
  if (key === "activityTitles.soulClaimed") {
    return `Soul claimed #${values?.sequence ?? "0"} for ${values?.token ?? "token"}`;
  }
  if (key === "activityTitles.settlement") {
    return `Settlement completed for ${values?.token ?? "token"}`;
  }
  if (key === "activityDetails.side") {
    return `Side: ${values?.side ?? ""}`;
  }
  if (key === "activityDetails.amount") {
    return `Amount: ${values?.amount ?? ""}`;
  }
  if (key === "activityDetails.trader") {
    return `Trader: ${values?.trader ?? ""}`;
  }
  if (key === "activityDetails.seedHash") {
    return `Seed: ${values?.seedHash ?? ""}`;
  }
  if (key === "activityDetails.soul") {
    return `Soul PDA: ${values?.soul ?? ""}`;
  }
  if (key === "activityDetails.slot") {
    return `Slot: ${values?.slot ?? ""}`;
  }
  if (key === "activityDetails.theme") {
    return `Theme: ${values?.theme ?? ""}`;
  }
  if (key === "activityDetails.actor") {
    return `Actor: ${values?.actor ?? ""}`;
  }
  if (key === "activityDetails.value") {
    return `Value: ${values?.value ?? ""}`;
  }
  if (key === "activityDetails.context") {
    return `Context: ${values?.context ?? ""}`;
  }
  if (key === "activityDetails.protocolActor") {
    return "SolSoul protocol";
  }
  if (key === "activityDetails.collectorActor") {
    return "Collector wallet";
  }
  if (key === "activityDetails.fixtureActor" || key === "activityDetails.fixtureTime") {
    return "Deterministic fixture";
  }
  if (key === "activityDetails.fixture") {
    return "Fixture row shown because devnet evidence is sparse; it is not raw RPC data.";
  }
  if (key === "activityDetails.time") {
    return `Time: ${values?.time ?? ""}`;
  }
  if (key === "activityDetails.timePending") {
    return "Time pending";
  }
  if (key === "activityValues.amount") {
    return `Amount ${values?.amount ?? ""}`;
  }
  if (key === "activityValues.generation") {
    return `Generation #${values?.generation ?? ""}`;
  }
  if (key === "activityValues.sequence") {
    return `Claim #${values?.sequence ?? ""}`;
  }
  if (key === "activityValues.settlement") {
    return `Receipt settlement for claim #${values?.sequence ?? ""}`;
  }
  if (key === "activityValues.tokenSoul") {
    return `${values?.token ?? ""} · Soul ${values?.soul ?? ""}`;
  }
  if (key === "activityValues.seed") {
    return `Seed ${values?.seedHash ?? ""}`;
  }
  if (key === "activityValues.receiptContext") {
    return `Receipt boundary for Soul ${values?.soul ?? ""}`;
  }
  if (key === "activityValues.fixtureContext") {
    return `Fixture context for Soul ${values?.soul ?? ""}`;
  }
  if (key === "activityOpenToken") {
    return "Open token";
  }
  if (key === "activityTitles.claim") {
    return `Claimed Soul #${values?.sequence ?? "0"} for ${values?.token ?? "token"}`;
  }
  if (key.startsWith("leaderboards.")) {
    const labels: Record<string, string> = {
      "leaderboards.eyebrow": "Soul Flow leaderboards",
      "leaderboards.title": "Market flow leaders",
      "leaderboards.description": "Premium leaderboard modules",
      "leaderboards.modules.topFlowingTokens.eyebrow": "Flow",
      "leaderboards.modules.topFlowingTokens.title": "Top Flowing Tokens",
      "leaderboards.modules.topFlowingTokens.empty": "No token flow rows are available yet.",
      "leaderboards.modules.latestRareSouls.eyebrow": "Rare",
      "leaderboards.modules.latestRareSouls.title": "Latest Rare Souls",
      "leaderboards.modules.latestRareSouls.empty": "No generated or claimed Soul rows are available yet.",
      "leaderboards.modules.mostGenerated.eyebrow": "Generations",
      "leaderboards.modules.mostGenerated.title": "Most Generated",
      "leaderboards.modules.mostGenerated.empty": "No generation totals are available yet.",
      "leaderboards.modules.highestLocked.eyebrow": "Locked",
      "leaderboards.modules.highestLocked.title": "Highest Locked",
      "leaderboards.modules.highestLocked.empty": "No receipt-lock rows are available yet.",
      "leaderboards.modules.recentGenerations.eyebrow": "Recent",
      "leaderboards.modules.recentGenerations.title": "Recent Generations",
      "leaderboards.modules.recentGenerations.empty": "No recent generation rows are available yet.",
      "leaderboards.metrics.flowScore": "Flow score {score}",
      "leaderboards.metrics.generatedClaimed": "{generated} generated · {claimed} claimed",
      "leaderboards.metrics.rareGeneration": "Soul generation #{generation}",
      "leaderboards.metrics.rareClaim": "Claim sequence #{sequence}",
      "leaderboards.metrics.theme": "Theme {theme}",
      "leaderboards.metrics.soul": "Soul {soul}",
      "leaderboards.metrics.generated": "{count} generated",
      "leaderboards.metrics.claimed": "{count} claimed",
      "leaderboards.metrics.locked": "{count} locked MT units",
      "leaderboards.metrics.receipts": "{active} active · {inactive} inactive receipts",
    };
    return (labels[key] ?? key).replaceAll("{score}", values?.score ?? "")
      .replaceAll("{generated}", values?.generated ?? "")
      .replaceAll("{claimed}", values?.claimed ?? "")
      .replaceAll("{generation}", values?.generation ?? "")
      .replaceAll("{sequence}", values?.sequence ?? "")
      .replaceAll("{theme}", values?.theme ?? "")
      .replaceAll("{soul}", values?.soul ?? "")
      .replaceAll("{count}", values?.count ?? "")
      .replaceAll("{active}", values?.active ?? "")
      .replaceAll("{inactive}", values?.inactive ?? "");
  }
  if (key === "scopeLinks.allSouls") {
    return "All Souls";
  }
  if (key === "scopeLinks.tokenFeed") {
    return "Token feed";
  }
  if (key === "metricLinks.launchedTokens") {
    return "Open token feed";
  }
  if (key === "metricLinks.generatedSoulCandidates") {
    return "Open all Souls";
  }
  if (key === "metricLinks.claimedSouls") {
    return "Open claimed Souls";
  }
  if (key === "metricLinks.activeCurves") {
    return "Open live tokens";
  }
  if (key === "themesEyebrow") {
    return "Theme distribution";
  }
  if (key === "themesTitle") {
    return "Art engines across launches";
  }
  if (key === "themeTokens") {
    return `${values?.count ?? "0"} token launches`;
  }
  if (key === "themeGenerated") {
    return `${values?.count ?? "0"} generated`;
  }
  if (key === "themeClaimed") {
    return `${values?.count ?? "0"} claimed`;
  }
  if (key === "tokenTotalsEyebrow") {
    return "Per-token totals";
  }
  if (key === "tokenTotalsTitle") {
    return "Collection scopes";
  }
  if (key === "tokenTotalsGenerated") {
    return `${values?.count ?? "0"} generated Souls`;
  }
  if (key === "tokenTotalsClaimed") {
    return `${values?.count ?? "0"} claimed NFTs`;
  }
  if (key === "tokenTotalsTheme") {
    return `Theme: ${values?.theme ?? ""}`;
  }
  if (key === "tokenTotalsStatus") {
    return `${values?.status ?? ""} token`;
  }
  if (key === "tokenTotalsGalleryLink") {
    return "Token gallery";
  }
  if (key === "sourceCommitment") {
    return `Commitment: ${values?.commitment ?? ""}`;
  }
  if (key === "sourceSlot") {
    return `Slot: ${values?.slot ?? ""}`;
  }
  if (key === "dust.eyebrow") {
    return "Dust dominance raw metrics";
  }
  if (key === "dust.title") {
    return "Hard-binding-backed dust components";
  }
  if (key === "dust.description") {
    return "Raw decimal-string fields from reserves and receipt binding state.";
  }
  if (key === "dust.prototypeNotice") {
    return "Prototype limitation: transfer-hook enforcement is still marked as partial when source warnings are present.";
  }
  if (key === "dust.globalTitle") {
    return "Global raw sums";
  }
  if (key === "dust.perTokenTitle") {
    return "Per-token dust metrics";
  }
  if (key === "dust.limitationsTitle") {
    return "Limitations and source metadata";
  }
  if (key === "dust.tokenUnit") {
    return `Token unit: ${values?.unit ?? ""}`;
  }
  if (key === "dust.outsideLiquidityUnavailable") {
    return "Unavailable";
  }
  if (key === "dust.partialBadge") {
    return "Partial source";
  }
  if (key === "dust.staleBadge") {
    return "Stale fallback";
  }
  if (key === "dust.sourceWarnings") {
    return "Warnings";
  }
  if (key === "dust.noWarnings") {
    return "No dust limitations reported.";
  }
  if (key === "dust.liquiditySources.bonding_curve_reserves") {
    return "Liquidity: bonding-curve reserves";
  }
  if (key === "dust.liquiditySources.bonding_curve_reserve") {
    return "Liquidity: bonding-curve reserve";
  }
  if (key === "dust.liquiditySources.raydium_cp_swap_vault") {
    return "Liquidity: historical/deferred Raydium CP-Swap vault";
  }
  if (key === "dust.liquiditySources.unavailable") {
    return "Liquidity: unavailable";
  }
  if (key === "dust.liquiditySources.post_migration_unavailable") {
    return "Liquidity: historical post-migration unavailable";
  }
  if (key === "dust.receiptSource") {
    return "Receipts: receipt binding state";
  }
  if (key === "dust.outsideSources.token_account_scan") {
    return "Outside liquidity: token-account scan";
  }
  if (key === "dust.outsideSources.top_accounts_bounded_audit") {
    return currentLocale === "zh"
      ? "Outside liquidity：有界 top-account 审计（不是完整扫描）"
      : "Outside liquidity: bounded top-account audit (not a complete scan)";
  }
  if (key === "dust.outsideSources.unavailable") {
    return "Outside liquidity: unavailable";
  }
  if (key === "dust.burnedIncludes") {
    return `Burned includes: ${values?.states ?? ""}`;
  }
  if (key === "dust.raydiumSourceTitle") {
    return "Historical Raydium source metadata";
  }
  if (key.startsWith("dust.sourceMetadata.")) {
    const labels: Record<string, string> = {
      "dust.sourceMetadata.sourceVerified": "Source verified: {value}",
      "dust.sourceMetadata.activeLiquidityAccount": "Historical Raydium vault: {value}",
      "dust.sourceMetadata.activeLiquidityBaseUnits": "Active liquidity base units: {value}",
      "dust.sourceMetadata.raydiumProgramId": "Raydium program: {value}",
      "dust.sourceMetadata.raydiumPoolState": "Raydium pool state: {value}",
      "dust.sourceMetadata.raydiumToken0Vault": "Raydium token0 vault: {value}",
      "dust.sourceMetadata.raydiumToken1Vault": "Raydium token1 vault: {value}",
      "dust.sourceMetadata.raydiumToken0Mint": "Raydium token0 mint: {value}",
      "dust.sourceMetadata.raydiumToken1Mint": "Raydium token1 mint: {value}",
      "dust.sourceMetadata.raydiumNonSelectedVault": "Non-selected Raydium vault: {value}",
      "dust.sourceMetadata.tokenProgram": "Selected vault token program: {value}",
      "dust.sourceMetadata.fetchedSlot": "Raydium source slot: {value}",
      "dust.sourceMetadata.commitment": "Raydium commitment: {value}",
    };
    return (labels[key] ?? key).replace("{value}", values?.value ?? "");
  }
  if (key.startsWith("dust.fields.")) {
    const labels: Record<string, string> = {
      "dust.fields.whole_units_in_pool.label": "Whole units in pool",
      "dust.fields.whole_units_in_pool.help": "Floor of pool reserves divided by one MT quantum.",
      "dust.fields.fractional_remainder.label": "Fractional remainder",
      "dust.fields.fractional_remainder.help": "Base units below the next whole token.",
      "dust.fields.fractional_fill_ratio.label": "Fractional fill ratio",
      "dust.fields.fractional_fill_ratio.help": "Deterministic ratio derived from the raw remainder.",
      "dust.fields.liquidity_dust_ratio.label": "Liquidity dust ratio",
      "dust.fields.liquidity_dust_ratio.help": "Venue-local fraction from fractional dust over observed active liquidity; not an official scarcity signal.",
      "dust.fields.active_receipts.label": "Active receipts",
      "dust.fields.active_receipts.help": "Receipt bindings currently active.",
      "dust.fields.burned_receipts.label": "Burned / forfeited receipts",
      "dust.fields.burned_receipts.help": "Inactive receipt bindings counted from lifecycle state.",
      "dust.fields.forfeited_receipts.label": "Forfeited receipts",
      "dust.fields.forfeited_receipts.help": "Forfeited receipt binding bucket.",
      "dust.fields.inactive_receipts.label": "Inactive receipts",
      "dust.fields.inactive_receipts.help": "All inactive receipt buckets.",
      "dust.fields.whole_units_outside_liquidity.label": "Whole units outside liquidity",
      "dust.fields.whole_units_outside_liquidity.help": "Audited whole-token units outside the active liquidity vault.",
      "dust.fields.outside_liquidity_audited_tokens.label": "Audited outside-liquidity tokens",
      "dust.fields.outside_liquidity_audited_tokens.help": "Token rows with an outside-liquidity scan.",
    };
    return labels[key] ?? key;
  }
  if (key === "tokenStatus.active") {
    return "Active";
  }
  return key;
};

vi.mock("next-intl", () => ({
  useTranslations: () => translate,
}));

const liveStats: CachedPublicStatsSnapshot = {
  ok: true,
  metrics: [
    { id: "launchedTokens", value: "23" },
    { id: "generatedSoulCandidates", value: "57" },
    { id: "claimedSouls", value: "4" },
    { id: "activeCurves", value: "8" },
  ],
  dustTotals: {
    whole_units_in_pool: "12",
    fractional_remainder: "345678",
    active_receipts: "2",
    burned_receipts: "1",
    forfeited_receipts: "0",
    inactive_receipts: "1",
    whole_units_outside_liquidity: "3",
    outside_liquidity_audited_tokens: "1",
    source_coverage: {
      bonding_curve_reserve_tokens: "1",
      raydium_cp_swap_vault_tokens: "0",
      unavailable_tokens: "0",
      source_verified_tokens: "1",
      source_unverified_tokens: "0",
      warning_tokens: "0",
    },
  },
  themeDistribution: [
    {
      id: "soulpuff",
      label: "SoulPuff",
      renderer: "built-in",
      tokenCount: "23",
      generatedSoulCandidates: "57",
      claimedSouls: "4",
    },
  ],
  perTokenSoulTotals: [
    {
      tokenMint: "live-token-for-dashboard-test",
      tokenLabel: "LIVE",
      soul: "Soul111111111111111111111111111111111111",
      theme: {
        id: "soulpuff",
        label: "SoulPuff",
        renderer: "built-in",
      },
      generatedSoulCandidates: "57",
      claimedSouls: "4",
      active: true,
      active_liquidity_base_units: "120000345678",
      whole_units_in_pool: "12",
      fractional_remainder: "345678",
      fractional_fill_ratio: "0.000034",
      liquidity_dust_ratio: "0.000002880641701879",
      active_receipts: "2",
      burned_receipts: "1",
      forfeited_receipts: "0",
      inactive_receipts: "1",
      whole_units_outside_liquidity: "3",
      dustSource: {
        token_unit: "10000000000",
        liquidity: "bonding_curve_reserve",
        source_verified: true,
        receipts: "receipt_binding_state",
        outside_liquidity: "token_account_scan",
        burned_receipts_includes: ["burned", "forfeited"],
      },
      launchedAt: "1",
      primaryLink: {
        label: "LIVE",
        href: "/token/live-token-for-dashboard-test",
      },
      galleryLink: {
        label: "token-gallery",
        href: "/token/live-token-for-dashboard-test/gallery",
      },
    },
  ],
  recentActivity: [
    {
      id: "generation:live-token-for-dashboard-test:57",
      kind: "tradeGeneration",
      tokenMint: "live-token-for-dashboard-test",
      tokenLabel: "LIVE",
      theme: {
        id: "soulpuff",
        label: "SoulPuff",
        renderer: "built-in",
      },
      generation: "57",
      side: "buy",
      amount: "990000",
      trader: "Trader1111111111111111111111111111111111",
      tokenAccount: "TraderToken11111111111111111111111111111",
      seedHash: "c613e02aa48460b1",
      signature: "GenerationSig111111111111111111111111111111111",
      slot: 458769366,
      soul: "Soul111111111111111111111111111111111111",
      sortKey: 57,
      primaryLink: {
        label: "LIVE",
        href: "/token/live-token-for-dashboard-test",
      },
      secondaryLink: {
        label: "Explorer tx",
        href: "https://explorer.solana.com/tx/GenerationSig111111111111111111111111111111111?cluster=devnet",
        external: true,
      },
      extraLinks: [
        {
          label: "Soul PDA",
          href: "https://explorer.solana.com/address/Soul111111111111111111111111111111111111?cluster=devnet",
          external: true,
        },
      ],
    },
    {
      id: "claim:claim-account-for-dashboard-test",
      kind: "claim",
      tokenMint: "live-token-for-dashboard-test",
      tokenLabel: "LIVE",
      theme: {
        id: "soulpuff",
        label: "SoulPuff",
        renderer: "built-in",
      },
      generation: "57",
      sequence: "4",
      soul: "claimed-soul-pda-for-dashboard-test",
      sortKey: 56,
      primaryLink: {
        label: "LIVE",
        href: "/token/live-token-for-dashboard-test/gallery",
      },
      secondaryLink: {
        label: "NFT explorer",
        href: "https://explorer.solana.com/address/nft-mint-for-dashboard-test?cluster=devnet",
        external: true,
      },
      extraLinks: [
        {
          label: "Soul PDA",
          href: "https://explorer.solana.com/address/claimed-soul-pda-for-dashboard-test?cluster=devnet",
          external: true,
        },
      ],
    },
  ],
  source: {
    fetchedAt: "2026-04-29T00:00:00.000Z",
    rpcEndpoint: "https://api.devnet.solana.com",
    commitment: "confirmed",
    slot: 459177356,
    deployment: {
      bondingCurveProgramId: "CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un",
      soulGeneratorProgramId: "34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ",
    },
  },
};

const largeDustStats: CachedPublicStatsSnapshot = {
  ...liveStats,
  dustTotals: {
    ...liveStats.dustTotals,
    whole_units_in_pool: "900719925474099312345",
    fractional_remainder: "420000",
    active_receipts: "12345678901234567890",
    burned_receipts: "98765432109876543210",
    whole_units_outside_liquidity: "11111111111111111111",
    source_coverage: {
      ...liveStats.dustTotals.source_coverage,
      warning_tokens: "1",
      warnings: ["outside-liquidity token account scan unavailable"],
    },
  },
  perTokenSoulTotals: [
    {
      ...liveStats.perTokenSoulTotals[0],
      active_liquidity_base_units: "9007199254740993123450000420000",
      whole_units_in_pool: "900719925474099312345",
      fractional_remainder: "420000",
      fractional_fill_ratio: "0.000042",
      liquidity_dust_ratio: "0.000000000000000000",
      active_receipts: "12345678901234567890",
      burned_receipts: "98765432109876543210",
      forfeited_receipts: "44444444444444444444",
      inactive_receipts: "98765432109876543210",
      whole_units_outside_liquidity: "11111111111111111111",
      dustSource: {
        ...liveStats.perTokenSoulTotals[0].dustSource,
        warnings: ["outside-liquidity token account scan unavailable"],
      },
    },
  ],
  source: {
    ...liveStats.source,
    partial: true,
    warnings: ["receipt lifecycle counts: devnet RPC 429"],
  },
};

const raydiumDustStats: CachedPublicStatsSnapshot = {
  ...liveStats,
  dustTotals: {
    ...liveStats.dustTotals,
    source_coverage: {
      bonding_curve_reserve_tokens: "0",
      raydium_cp_swap_vault_tokens: "1",
      unavailable_tokens: "0",
      source_verified_tokens: "1",
      source_unverified_tokens: "0",
      warning_tokens: "1",
      warnings: [
        "post_graduation_raydium_receipt_paths_bounded",
        "raydium_transfer_hook_mints_unsupported",
      ],
    },
  },
  perTokenSoulTotals: [
    {
      ...liveStats.perTokenSoulTotals[0],
      tokenMint: "raydium-token-for-dashboard-test",
      tokenLabel: "RAY",
      active: false,
      active_liquidity_base_units: "450000678901",
      whole_units_in_pool: "45",
      fractional_remainder: "678901",
      fractional_fill_ratio: "0.000067",
      liquidity_dust_ratio: "0.000001508666612810",
      whole_units_outside_liquidity: "5",
      dustSource: {
        ...liveStats.perTokenSoulTotals[0].dustSource,
        liquidity: "raydium_cp_swap_vault",
        source_verified: true,
        active_liquidity_account: "raydium-launched-token-vault-dashboard-test",
        active_liquidity_base_units: "450000678901",
        raydium_program_id: "raydium-program-dashboard-test",
        raydium_pool_state: "raydium-pool-dashboard-test",
        raydium_token0_vault: "raydium-launched-token-vault-dashboard-test",
        raydium_token1_vault: "raydium-wsol-vault-dashboard-test",
        raydium_token0_mint: "raydium-token-for-dashboard-test",
        raydium_token1_mint: "*******************************************",
        raydium_non_selected_vault: "raydium-wsol-vault-dashboard-test",
        token_program: "*****************************************",
        fetched_slot: "459177356",
        commitment: "confirmed",
        warnings: [
          "post_graduation_raydium_receipt_paths_bounded",
          "raydium_transfer_hook_mints_unsupported",
        ],
      },
      primaryLink: {
        label: "RAY",
        href: "/token/raydium-token-for-dashboard-test",
      },
      galleryLink: {
        label: "token-gallery",
        href: "/token/raydium-token-for-dashboard-test/gallery",
      },
    },
  ],
};

const boundedCapabilityStats: CachedPublicStatsSnapshot = {
  ...liveStats,
  dustTotals: {
    ...liveStats.dustTotals,
    whole_units_outside_liquidity: "2",
    source_coverage: {
      ...liveStats.dustTotals.source_coverage,
      warning_tokens: "1",
      warnings: [
        "token2022_indexed_gpa_unavailable",
        "token2022_secondary_index_excluded",
        "token_methods_bounded_sample",
        "outside_liquidity_sample_limited",
      ],
    },
  },
  perTokenSoulTotals: [
    {
      ...liveStats.perTokenSoulTotals[0],
      whole_units_outside_liquidity: "2",
      dustSource: {
        ...liveStats.perTokenSoulTotals[0].dustSource,
        outside_liquidity: "top_accounts_bounded_audit",
        outside_liquidity_completeness: "bounded_top_accounts_audit",
        token2022_indexed_gpa_supported: false,
        outside_liquidity_warning_codes: [
          "token2022_indexed_gpa_unavailable",
          "token2022_secondary_index_excluded",
          "token_methods_bounded_sample",
          "outside_liquidity_sample_limited",
        ],
        outside_liquidity_account_limit: "20",
        outside_liquidity_sampled_accounts: "2",
        outside_liquidity_observed_base_units: "20000000000",
        outside_liquidity_observed_whole_units: "2",
        outside_liquidity_token_supply_base_units: "21000000000000",
        warnings: [
          "token2022_indexed_gpa_unavailable",
          "token2022_secondary_index_excluded",
          "token_methods_bounded_sample",
          "outside_liquidity_sample_limited",
        ],
      },
    },
  ],
  source: {
    ...liveStats.source,
    rpcEndpoint: "triton-devnet:<redacted>",
    rpcEndpointLabel: "triton-devnet:<redacted>",
    rpcProvider: "triton-devnet",
    rpcCluster: "devnet",
    rpcCredentialRedacted: true,
    rpcCapability: {
      outsideLiquidity: {
        classification: "bounded_top_accounts_audit",
        indexedGpaSupported: false,
        programLabel: "spl-program-2022",
        requestedFilters: [{ memcmp: { offset: 0, bytes: "live-token-for-dashboard-test" } }],
        endpointLabel: "triton-devnet:<redacted>",
        rpcProvider: "triton-devnet",
        rpcCluster: "devnet",
        rpcCredentialRedacted: true,
        warningCodes: [
          "token2022_indexed_gpa_unavailable",
          "token2022_secondary_index_excluded",
          "token_methods_bounded_sample",
          "outside_liquidity_sample_limited",
        ],
      },
    },
  },
};

const cachedStats: CachedPublicStatsSnapshot = {
  ...liveStats,
  metrics: [
    { id: "launchedTokens", value: "7" },
    { id: "generatedSoulCandidates", value: "11" },
    { id: "claimedSouls", value: "1" },
    { id: "activeCurves", value: "3" },
  ],
  source: {
    ...liveStats.source,
    fetchedAt: "2026-04-28T00:00:00.000Z",
    rpcEndpoint: "cached devnet RPC",
  },
};

const tritonCredentialStats: CachedPublicStatsSnapshot = {
  ...liveStats,
  source: {
    ...liveStats.source,
    rpcEndpoint: "https://triton-devnet.example.com/tenant/YOUR_API_KEY_HERE?api-key=YOUR_QUERY_TOKEN",
  },
};

const fallbackStats: CachedPublicStatsSnapshot = {
  ...liveStats,
  recentActivity: [
    {
      id: "generation:FallbackMint111111111111111111111111111:Soul111111111111111111111111111111111111:2:timeline-fallback",
      kind: "tradeGeneration",
      tokenMint: "FallbackMint111111111111111111111111111",
      tokenLabel: "FALL",
      generation: "2",
      side: "sell",
      amount: "1250000",
      trader: "Owner1111111111111111111111111111111111",
      seedHash: "abc123ef45678900",
      soul: "Soul111111111111111111111111111111111111",
      sortKey: 58.3,
      primaryLink: {
        label: "FALL",
        href: "/token/FallbackMint111111111111111111111111111",
      },
      secondaryLink: {
        label: "Token timeline",
        href: "/token/FallbackMint111111111111111111111111111#token-timeline",
      },
      extraLinks: [
        {
          label: "Soul PDA",
          href: "https://explorer.solana.com/address/Soul111111111111111111111111111111111111?cluster=devnet",
          external: true,
        },
      ],
    },
  ],
};

const originalFetch = globalThis.fetch;
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);

beforeEach(() => {
  currentLocale = "en";
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(
      window,
      "localStorage",
      originalLocalStorageDescriptor,
    );
  }
});

describe("StatsDashboard storage recovery", () => {
  it("renders a successful live stats response even when cache writes throw", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => liveStats,
    })) as unknown as typeof fetch;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => {
          throw new Error("quota exceeded");
        }),
      },
      configurable: true,
    });

    const { container, unmount } = renderStatsDashboard();
    try {
      await waitForText(container, "23");

      expect(
        container.querySelector('[data-proof-metric="launchedTokens"]')
          ?.textContent,
      ).toContain("23");
      expect(
        container.querySelector('[data-proof-metric="generatedSoulCandidates"]')
          ?.textContent,
      ).toContain("57");
      expect(
        container.querySelector('[data-proof-row="buy"]')
          ?.textContent,
      ).toContain("Buy flowed for LIVE");
      expect(
        container.querySelector('[data-proof-row="soulGenerated"]')?.textContent,
      ).toContain("Soul generated #57 for LIVE");
      expect(
        container.querySelector('[data-proof-row="soulClaimed"]')?.textContent,
      ).toContain("Soul claimed #4 for LIVE");
      expect(
        container.querySelector('[data-proof-row="settlement"]')?.textContent,
      ).toContain("Settlement completed for LIVE");
      expect(
        container.querySelector('[data-leaderboard-module="topFlowingTokens"]')
          ?.textContent,
      ).toContain("Top Flowing Tokens");
      expect(
        container.querySelector('[data-leaderboard-module="latestRareSouls"]')
          ?.textContent,
      ).toContain("Latest Rare Souls");
      expect(
        container.querySelector('[data-leaderboard-module="mostGenerated"]')
          ?.textContent,
      ).toContain("Most Generated");
      expect(
        container.querySelector('[data-leaderboard-module="highestLocked"]')
          ?.textContent,
      ).toContain("Highest Locked");
      expect(
        container.querySelector('[data-leaderboard-module="recentGenerations"]')
          ?.textContent,
      ).toContain("Recent Generations");
      expect(
        container.querySelector('a[href="/tokens"]')?.textContent,
      ).toContain("Token feed");
      expect(
        container.querySelector('a[href="/souls"]')?.textContent,
      ).toContain("All Souls");
      expect(
        container.querySelector('[data-theme-distribution="soulpuff"]')
          ?.textContent,
      ).toContain("SoulPuff");
      expect(
        container.querySelector('[data-theme-distribution="soulpuff"]')
          ?.textContent,
      ).toContain("57 generated");
      expect(
        container.querySelector("[data-token-total]")?.textContent,
      ).toContain("Theme: SoulPuff");
      expect(
        Array.from(
          container.querySelectorAll(
            'a[href="/token/live-token-for-dashboard-test/gallery"]',
          ),
        ).some((link) => link.textContent?.includes("Token gallery")),
      ).toBe(true);
      expect(
        container.querySelector('[data-proof-row="soulGenerated"]')
          ?.textContent,
      ).toContain("Theme: SoulPuff");
      const statsThumb = container.querySelector<HTMLImageElement>(
        '[data-stats-pd9-thumb="soulGenerated"]',
      );
      expect(statsThumb).not.toBeNull();
      expect(statsThumb?.src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
      expect(
        decodeURIComponent(
          (statsThumb?.src ?? "").replace(
            "data:image/svg+xml;charset=utf-8,",
            "",
          ),
        ),
      ).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(
        container.querySelector(
          '[aria-label="PD9 monochrome Soul activity thumbnail"]',
        ),
      ).not.toBeNull();
      expect(container.textContent).toContain("57");
      expect(container.textContent).toContain("Soul generated #57 for LIVE");
      expect(container.textContent).toContain("Value: Amount 990000");
      expect(container.textContent).toContain(
        "Actor: Trader1111111111111111111111111111111111",
      );
      expect(container.textContent).toContain("Slot: 458769366");
      expect(container.textContent).toContain(
        "Soul claimed #4 for LIVE",
      );
      expect(
        Array.from(
          container.querySelectorAll(
            'a[href="/token/live-token-for-dashboard-test/gallery"]',
          ),
        ).some((link) => link.textContent?.includes("LIVE")),
      ).toBe(true);
      expect(container.textContent).not.toContain("quota exceeded");
    } finally {
      unmount();
    }
  });

  it("renders raw dust dominance metrics and limitation metadata without precision loss", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => largeDustStats,
    })) as unknown as typeof fetch;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
      configurable: true,
    });

    const { container, unmount } = renderStatsDashboard();
    try {
      await waitForText(container, "Dust dominance raw metrics");

      expect(container.textContent).toContain("900719925474099312345");
      expect(container.textContent).toContain("12345678901234567890");
      expect(container.textContent).toContain("98765432109876543210");
      expect(container.textContent).toContain("0.000042");
      expect(container.textContent).toContain("Whole units in pool");
      expect(container.textContent).toContain("Fractional remainder");
      expect(container.textContent).toContain("Fractional fill ratio");
      expect(container.textContent).toContain("Active receipts");
      expect(container.textContent).toContain("Burned / forfeited receipts");
      expect(container.textContent).toContain("Whole units outside liquidity");
      expect(container.textContent).toContain("Partial source");
      expect(container.textContent).toContain(
        "Receipt lifecycle counts are partially available from the current RPC source.",
      );
      expect(container.textContent).toContain(
        "Outside-liquidity token-account scan is not available for this token yet.",
      );
      expect(container.textContent).toContain("Prototype limitation");
      expect(container.querySelector("[data-dust-global]")?.textContent).toContain(
        "900719925474099312345",
      );
      expect(
        container.querySelector('[data-token-dust="live-token-for-dashboard-test"]')?.textContent,
      ).toContain("0.000042");
    } finally {
      unmount();
    }
  });

  it("renders historical/deferred Raydium warning copy, liquidity dust ratio, and auditable vault source metadata without scarcity overclaim", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => raydiumDustStats,
    })) as unknown as typeof fetch;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
      configurable: true,
    });

    const { container, unmount } = renderStatsDashboard();
    try {
      await waitForText(container, "Liquidity dust ratio");

      expect(container.textContent).toContain("0.000001508666612810");
      expect(container.textContent).toContain("Liquidity: historical/deferred Raydium CP-Swap vault");
      expect(container.textContent).toContain("Historical Raydium source metadata");
      expect(container.textContent).toContain(
        "Historical Raydium vault: raydium-launched-token-vault-dashboard-test",
      );
      expect(container.textContent).toContain("Active liquidity base units: 450000678901");
      expect(container.textContent).toContain("Raydium pool state: raydium-pool-dashboard-test");
      expect(container.textContent).toContain("Raydium source slot: 459177356");
      expect(container.textContent).toContain("Raydium commitment: confirmed");
      expect(container.textContent).toContain(
        "Historical post-graduation Raydium CP-Swap liquidity and swap paths are bounded/deferred",
      );
      expect(container.textContent).toContain(
        "Transfer Hook-enabled mints do not migrate to Raydium in the active curve-only product flow",
      );
      expect(container.textContent).toContain("not an official scarcity signal");
      expect(container.textContent?.toLowerCase()).not.toContain("official scarcity ratio");
      expect(container.textContent?.toLowerCase()).not.toContain("scarcity score");
      expect(container.textContent?.toLowerCase()).not.toContain("receipt dominance");
    } finally {
      unmount();
    }
  });

  it("renders English localized dust/source warnings instead of API warning strings", async () => {
    currentLocale = "en";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => largeDustStats,
    })) as unknown as typeof fetch;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
      configurable: true,
    });

    const { container, unmount } = renderStatsDashboard();
    try {
      await waitForText(container, "Receipt lifecycle counts are partially available");

      expect(container.textContent).toContain(
        "Receipt lifecycle counts are partially available from the current RPC source.",
      );
      expect(container.textContent).toContain(
        "Outside-liquidity token-account scan is not available for this token yet.",
      );
      expect(container.textContent).not.toContain("receipt lifecycle counts: devnet RPC 429");
      expect(container.textContent).not.toContain("outside-liquidity token account scan unavailable");
    } finally {
      unmount();
    }
  });

  it("renders Chinese localized dust/source warnings instead of English API warning strings", async () => {
    currentLocale = "zh";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => largeDustStats,
    })) as unknown as typeof fetch;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
      configurable: true,
    });

    const { container, unmount } = renderStatsDashboard();
    try {
      await waitForText(container, "收据生命周期计数仅部分可用");

      expect(container.textContent).toContain("当前 RPC 来源的收据生命周期计数仅部分可用。");
      expect(container.textContent).toContain("该代币的流动性外 Token-2022 账户扫描暂不可用。");
      expect(container.textContent).not.toContain("receipt lifecycle counts: devnet RPC 429");
      expect(container.textContent).not.toContain("outside-liquidity token account scan unavailable");
    } finally {
      unmount();
    }
  });

  it("renders bounded coverage warnings and avoids complete-scan claims for English and Chinese", async () => {
    for (const [locale, expected] of [
      [
        "en",
        [
          "Outside liquidity: bounded top-account audit (not a complete scan)",
          "Outside-liquidity coverage is a bounded top-account audit because Token-2022 indexed GPA is unavailable.",
          "The RPC source excludes Token-2022 from secondary indexes, so SolSoul is not claiming a complete scan.",
          "Outside-liquidity values come from token supply and largest-account methods with bounded sample limits.",
        ],
      ],
      [
        "zh",
        [
          "Outside liquidity：有界 top-account 审计（不是完整扫描）",
          "由于 Token-2022 indexed GPA 不可用，流动性外覆盖仅为 top-account 有界审计。",
          "该 RPC 来源将 Token-2022 排除在 secondary indexes 之外，因此 SolSoul 不会声称完整扫描。",
          "流动性外数值来自 token supply 和 largest-account 方法，样本范围是有界的。",
        ],
      ],
    ] as const) {
      currentLocale = locale;
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => boundedCapabilityStats,
      })) as unknown as typeof fetch;
      Object.defineProperty(window, "localStorage", {
        value: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
        },
        configurable: true,
      });

      const { container, unmount } = renderStatsDashboard();
      try {
        await waitForText(container, expected[0]);

        for (const text of expected) {
          expect(container.textContent).toContain(text);
        }
        expect(container.textContent?.toLowerCase()).not.toContain("complete outside-liquidity scan");
        expect(container.textContent?.toLowerCase()).not.toContain("fully scanned");
        expect(container.textContent?.toLowerCase()).not.toContain("exhaustive");
        expect(container.textContent).not.toContain("token2022_indexed_gpa_unavailable");
        expect(container.textContent).not.toContain("token2022_secondary_index_excluded");
      } finally {
        unmount();
      }
    }
  });

  it("renders a redacted RPC provider label instead of credential-bearing endpoint strings", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => tritonCredentialStats,
    })) as unknown as typeof fetch;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
      configurable: true,
    });

    const { container, unmount } = renderStatsDashboard();
    try {
      await waitForText(container, "triton-devnet:<redacted>");

      expect(container.textContent).toContain("Source: triton-devnet:<redacted>");
      expect(container.textContent).not.toContain("YOUR_API_KEY_HERE");
      expect(container.textContent).not.toContain("YOUR_QUERY_TOKEN");
      expect(container.textContent).not.toContain("https://triton-devnet.example.com");
    } finally {
      unmount();
    }
  });

  it("populates the dashboard from a readable cached snapshot while refreshing", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({
        ok: false,
        error: "public stats refresh unavailable",
      }),
    })) as unknown as typeof fetch;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn(() => JSON.stringify(cachedStats)),
        setItem: vi.fn(),
      },
      configurable: true,
    });

    const { container, unmount } = renderStatsDashboard();
    try {
      await waitForText(container, "cached devnet RPC");

      expect(container.textContent).toContain("7");
      expect(container.textContent).toContain("11");
    } finally {
      unmount();
    }
  });

  it("keeps a valid v2 cache visible and exits loading when the stats request times out", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          signal?.addEventListener("abort", () => reject(abortError()));
        }),
    ) as unknown as typeof fetch;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn(() => JSON.stringify(cachedStats)),
        setItem: vi.fn(),
      },
      configurable: true,
    });

    const { container, unmount } = renderStatsDashboard();
    try {
      expect(container.textContent).toContain("cached devnet RPC");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      expect(container.textContent).toContain(
        "Latest public snapshot: Stats timed out",
      );
      expect(container.textContent).toContain("cached devnet RPC");
      expect(container.textContent).not.toContain("loading");
    } finally {
      unmount();
    }
  });

  it("waits long enough for bounded /api/stats aggregation to render fallback rows", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => fallbackStats,
            } as Response);
          }, 16_000);
        }),
    ) as unknown as typeof fetch;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
      configurable: true,
    });

    const { container, unmount } = renderStatsDashboard();
    try {
      expect(container.textContent).toContain("loading");

      await act(async () => {
        vi.advanceTimersByTime(16_000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(container.textContent).toContain("Soul generated #2 for FALL");
      expect(container.textContent).not.toContain("Stats timed out");
      expect(container.textContent).not.toContain("Stats response incomplete");
    } finally {
      unmount();
    }
  });

  it("rejects malformed live stats responses and falls back to a valid cached snapshot", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        metrics: cachedStats.metrics,
        recentActivity: [
          {
            id: "generation:heuristic:1",
            kind: "tradeGeneration",
            tokenMint: "****************************************",
            generation: "1",
            sortKey: 1,
            primaryLink: {
              label: "OLD",
              href: "/token/OldMint1111111111111111111111111111111",
            },
          },
        ],
        source: cachedStats.source,
      }),
    })) as unknown as typeof fetch;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn(() => JSON.stringify(cachedStats)),
        setItem: vi.fn(),
      },
      configurable: true,
    });

    const { container, unmount } = renderStatsDashboard();
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(container.textContent).toContain(
        "Latest public snapshot: Stats response is incomplete; partial metrics are unavailable.",
      );
      expect(container.textContent).toContain("cached devnet RPC");
      expect(container.textContent).toContain("7");
      expect(container.textContent).toContain("11");
      expect(container.textContent).not.toContain("heuristic");
    } finally {
      unmount();
    }
  });

  it("shows one localized unavailable state for incomplete stats without raw cache wording or duplicate loading", async () => {
    currentLocale = "zh";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        metrics: cachedStats.metrics,
        recentActivity: [],
        source: cachedStats.source,
      }),
    })) as unknown as typeof fetch;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
      configurable: true,
    });

    const { container, unmount } = renderStatsDashboard();
    try {
      await waitForText(container, "公开统计数据暂时不完整");

      expect(container.textContent).toContain("公开统计数据暂时不完整，部分指标会显示为不可用。");
      expect(container.textContent).not.toContain("Stats 响应不完整，未写入缓存。");
      expect(container.textContent).not.toContain("cache");
      expect(container.textContent).not.toContain("缓存");
      expect(container.textContent).not.toContain("正在从公开 devnet RPC 加载数据");
    } finally {
      unmount();
    }
  });

  it("renders signature-less fallback rows as localized flow activity without raw external anchors", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => fallbackStats,
    })) as unknown as typeof fetch;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
      configurable: true,
    });

    const { container, unmount } = renderStatsDashboard();
    try {
      await waitForText(container, "Soul generated #2 for FALL");

      expect(container.textContent).toContain("Sell flowed for FALL");
      expect(container.textContent).toContain("Value: Amount 1250000");
      expect(container.textContent).toContain("Seed abc1…8900");
      const tokenLink = container.querySelector(
        'a[data-next-intl-link="true"][href="/token/FallbackMint111111111111111111111111111"]',
      );
      expect(tokenLink).not.toBeNull();
      expect(container.textContent).toContain("Open token");
      expect(container.querySelector('a[href*="explorer.solana.com/"]')).toBeNull();
    } finally {
      unmount();
    }
  });
});

function renderStatsDashboard(): {
  container: HTMLDivElement;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(<StatsDashboard />);
  });

  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function waitForText(
  container: HTMLElement,
  text: string,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 1_000) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    if (container.textContent?.includes(text)) {
      return;
    }
  }
  expect(container.textContent).toContain(text);
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}
