import type { BondingCurveAccount } from "sdk";
import {
  CURVE_K_BASE_UNITS,
  CURVE_S_LAMPORTS,
  LAUNCH_FEE_LAMPORTS,
  LOCK_FEE_BPS,
  quoteBuyTokenOut,
  formatTokenUnits,
  formatSolUnits,
  formatPercent,
  LAMPORTS_PER_SOL,
} from "./curveMath";

export const PROTOCOL_ECONOMICS = {
  decimals: 6,
  curveSupplyBaseUnits: CURVE_K_BASE_UNITS,
  scaleLamports: CURVE_S_LAMPORTS,
  launchFeeLamports: LAUNCH_FEE_LAMPORTS,
  lockFeeBps: Number(LOCK_FEE_BPS),
} as const;

export type FixedEconomicsCopyLabels = {
  protocolFixedEconomics: string;
  decimalUnit: string;
  curve: string;
  supplyCap: string;
  tokenUnit: string;
  launchFee: string;
  buyLockFee: string;
  buyLockFeeSuffix: string;
  noGraduation: string;
  ammReferences: string;
  supplyNotConfigurable: string;
};

const DEFAULT_FIXED_ECONOMICS_COPY_LABELS: FixedEconomicsCopyLabels = {
  protocolFixedEconomics: "Protocol-fixed economics",
  decimalUnit: "decimals",
  curve: "exponential bonding curve",
  supplyCap: "asymptotic supply cap",
  tokenUnit: "tokens",
  launchFee: "launch fee",
  buyLockFee: "buy lock fee",
  buyLockFeeSuffix: "permanently locked in curve",
  noGraduation: "no graduation, no migration, no liquidity extraction",
  ammReferences:
    "AMM adapter references are historical/deferred; active launches stay on the curve",
  supplyNotConfigurable:
    "supply is fixed by the protocol and is not creator-configurable.",
};

export type CurveEconomicsViewLabels = {
  tokenUnit: string;
  baseUnit: string;
  solPerToken: string;
  launchFee: string;
  buyLockFee: string;
  selfDeprecatedYes: string;
  selfDeprecatedNo: string;
  supplyNotConfigurable: string;
};

const DEFAULT_CURVE_ECONOMICS_VIEW_LABELS: CurveEconomicsViewLabels = {
  tokenUnit: "tokens",
  baseUnit: "base units",
  solPerToken: "SOL/token",
  launchFee: "launch",
  buyLockFee: "buy lock",
  selfDeprecatedYes: "Yes",
  selfDeprecatedNo: "No",
  supplyNotConfigurable:
    "Supply is fixed by the protocol and is not configurable by the creator.",
};

export function formatFixedEconomicsCopy(
  labels: FixedEconomicsCopyLabels = DEFAULT_FIXED_ECONOMICS_COPY_LABELS,
): string {
  return [
    `${labels.protocolFixedEconomics}: ${PROTOCOL_ECONOMICS.decimals} ${labels.decimalUnit}`,
    `${labels.curve}: S = ${formatSolUnits(CURVE_S_LAMPORTS)} SOL`,
    `${labels.supplyCap} K = ${formatTokenUnits(CURVE_K_BASE_UNITS)} ${labels.tokenUnit}`,
    `${labels.launchFee} = ${formatSolUnits(LAUNCH_FEE_LAMPORTS)} SOL`,
    `${labels.buyLockFee} = ${Number(LOCK_FEE_BPS) / 100}% (${labels.buyLockFeeSuffix})`,
    labels.noGraduation,
    labels.ammReferences,
    labels.supplyNotConfigurable,
  ].join("; ");
}

export function buildCurveEconomicsView(
  curve: BondingCurveAccount,
  labels: CurveEconomicsViewLabels = DEFAULT_CURVE_ECONOMICS_VIEW_LABELS,
) {
  const percentMinted =
    curve.totalMinted > 0n
      ? formatPercent(curve.totalMinted, CURVE_K_BASE_UNITS, 2)
      : "0%";
  const percentToDeprecated =
    curve.totalMinted > 0n
      ? formatPercent(curve.totalMinted, (CURVE_K_BASE_UNITS * 99n) / 100n, 2)
      : "0%";

  return {
    decimals: String(PROTOCOL_ECONOMICS.decimals),
    fixedSupply: `${formatTokenUnits(CURVE_K_BASE_UNITS)} ${labels.tokenUnit}`,
    fixedSupplyBaseUnits: `${formatUnderscored(CURVE_K_BASE_UNITS)} ${labels.baseUnit}`,
    protocolCurveParams: `S = ${formatSolUnits(CURVE_S_LAMPORTS)} SOL; K = ${formatTokenUnits(CURVE_K_BASE_UNITS)} ${labels.tokenUnit}`,
    protocolFees: `${labels.launchFee} ${formatSolUnits(LAUNCH_FEE_LAMPORTS)} SOL; ${labels.buyLockFee} ${Number(LOCK_FEE_BPS) / 100}%`,
    currentPrice: `${formatSolPerToken(curve)} ${labels.solPerToken}`,
    oneSolQuote: `1 SOL → ${formatTokenUnits(quoteBuyTokenOut(curve.cumulativeSol, curve.totalMinted, LAMPORTS_PER_SOL))} ${labels.tokenUnit}`,
    cumulativeSol: `${formatSolUnits(curve.cumulativeSol)} SOL`,
    totalMinted: `${formatTokenUnits(curve.totalMinted)} ${labels.tokenUnit}`,
    percentMinted,
    percentToDeprecated,
    selfDeprecated: curve.selfDeprecated
      ? labels.selfDeprecatedYes
      : labels.selfDeprecatedNo,
    supplyNotConfigurable: labels.supplyNotConfigurable,
  };
}

function formatSolPerToken(curve: BondingCurveAccount): string {
  if (curve.totalMinted <= 0n) {
    return "0";
  }
  const sol = Number(curve.cumulativeSol) / Number(LAMPORTS_PER_SOL);
  const tokens = Number(curve.totalMinted) / 1_000_000;
  const price = sol / tokens;
  return price.toLocaleString("en-US", { maximumFractionDigits: 12 });
}

function formatUnderscored(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "_");
}
