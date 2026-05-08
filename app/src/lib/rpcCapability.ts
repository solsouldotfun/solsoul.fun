import { PublicKey, type ParsedAccountData } from "@solana/web3.js";
import { MIN_CLAIM_BALANCE, PROGRAM_IDS } from "sdk";
import {
  credentialSafeRpcLabel,
  describeRpcSource,
  type RpcSourceMetadata,
} from "./rpcSource";
import type { RpcFailoverEvent } from "./rpc";

export type OutsideLiquidityClassification =
  | "indexed_rpc_verified"
  | "bounded_top_accounts_audit"
  | "unavailable";

export type OutsideLiquidityWarningCode =
  | "token2022_indexed_gpa_unavailable"
  | "token2022_secondary_index_excluded"
  | "token2022_indexed_gpa_probe_failed"
  | "token_methods_bounded_sample"
  | "outside_liquidity_sample_limited"
  | "outside_liquidity_unknown_when_top_sample_empty"
  | "outside_liquidity_token_methods_unavailable"
  | "outside_liquidity_no_probe_target"
  | "rpc_failover_used";

export interface Token2022IndexedGpaFilter {
  memcmp: {
    offset: number;
    bytes: string;
  };
}

export interface RpcOutsideLiquidityCapability {
  classification: OutsideLiquidityClassification;
  indexedGpaSupported: boolean;
  programLabel: string;
  requestedFilters: Token2022IndexedGpaFilter[];
  endpointLabel: string;
  rpcProvider: string;
  rpcCluster: RpcSourceMetadata["rpcCluster"];
  rpcCredentialRedacted: boolean;
  warningCodes: OutsideLiquidityWarningCode[];
  boundedAudit?: BoundedTopAccountsAudit;
  failureReason?: string;
  failover?: {
    primaryEndpointLabel: string;
    fallbackEndpointLabel: string;
    usedEndpointLabel: string;
    reason: string;
    status?: number;
  };
}

export interface BoundedTopAccountsAudit {
  tokenSupplyBaseUnits?: string;
  accountLimit: number;
  sampledAccounts: number;
  inspectedAccounts: number;
  excludedAccounts: number;
  excludedVaults: string[];
  observedOutsideLiquidityBaseUnits: string;
  observedWholeUnitsOutsideLiquidity?: string;
  warningCodes: OutsideLiquidityWarningCode[];
}

export interface OutsideLiquidityAudit {
  classification?: OutsideLiquidityClassification;
  indexedGpaSupported?: boolean;
  warningCodes?: OutsideLiquidityWarningCode[];
  wholeUnitsOutsideLiquidity?: bigint | number | string;
  observedOutsideLiquidityBaseUnits?: bigint | number | string;
  scannedAccounts?: bigint | number | string;
  excludedAccounts?: bigint | number | string;
  accountLimit?: bigint | number | string;
  tokenSupplyBaseUnits?: bigint | number | string;
  excludedVaults?: string[];
  slot?: number;
}

export type OutsideLiquidityByMint = Record<string, OutsideLiquidityAudit>;

export interface RpcCapabilityConnection {
  getParsedProgramAccounts(
    programId: PublicKey,
    config: {
      commitment: "confirmed";
      filters: Token2022IndexedGpaFilter[];
    },
  ): Promise<
    {
      pubkey: PublicKey;
      account: {
        data: Buffer | ParsedAccountData;
        lamports: number;
      };
    }[]
  >;
  getTokenSupply?(
    mint: PublicKey,
    commitment?: "confirmed",
  ): Promise<{ value: { amount: string } }>;
  getTokenLargestAccounts?(
    mint: PublicKey,
    commitment?: "confirmed",
  ): Promise<{ value: { address: PublicKey; amount: string }[] }>;
}

const SPL_TOKEN_2022_PROGRAM_METADATA_LABEL = "spl-program-2022";

export function requiredToken2022OutsideLiquidityFilters(mint: PublicKey | string): Token2022IndexedGpaFilter[] {
  const mintString = typeof mint === "string" ? mint : mint.toBase58();
  return [{ memcmp: { offset: 0, bytes: mintString } }];
}

export async function probeToken2022OutsideLiquidityCapability({
  connection,
  endpoint,
  mint,
  excludedVaults = [],
  failoverEvents = [],
}: {
  connection: RpcCapabilityConnection;
  endpoint: string | undefined;
  mint: PublicKey;
  excludedVaults?: string[];
  failoverEvents?: RpcFailoverEvent[];
}): Promise<RpcOutsideLiquidityCapability> {
  const requestedFilters = requiredToken2022OutsideLiquidityFilters(mint);
  const source = describeRpcSource(endpoint);
  const failover = lastFailoverEvent(failoverEvents);
  const endpointLabel = failover?.usedEndpointLabel ?? source.rpcEndpointLabel;
  const base = {
    programLabel: SPL_TOKEN_2022_PROGRAM_METADATA_LABEL,
    requestedFilters,
    endpointLabel,
    rpcProvider: source.rpcProvider,
    rpcCluster: source.rpcCluster,
    rpcCredentialRedacted: source.rpcCredentialRedacted,
    ...(failover
      ? {
          failover: {
            primaryEndpointLabel: failover.primaryEndpointLabel,
            fallbackEndpointLabel: failover.fallbackEndpointLabel,
            usedEndpointLabel: failover.usedEndpointLabel,
            reason: failover.reason,
            ...(failover.status !== undefined ? { status: failover.status } : {}),
          },
        }
      : {}),
  };

  try {
    await connection.getParsedProgramAccounts(new PublicKey(PROGRAM_IDS.token2022), {
      commitment: "confirmed",
      filters: requestedFilters,
    });
    return {
      ...base,
      classification: "indexed_rpc_verified",
      indexedGpaSupported: true,
      warningCodes: failover ? ["rpc_failover_used"] : [],
    };
  } catch (error) {
    const failureReason = redactedFailureReason(error);
    const gpaWarning = isSecondaryIndexExclusion(failureReason)
      ? "token2022_secondary_index_excluded"
      : "token2022_indexed_gpa_probe_failed";
    const boundedAudit = await boundedTopAccountsAudit({
      connection,
      mint,
      excludedVaults,
    });
    if (boundedAudit) {
      return {
        ...base,
        classification: "bounded_top_accounts_audit",
        indexedGpaSupported: false,
        warningCodes: uniqueWarningCodes([
          "token2022_indexed_gpa_unavailable",
          gpaWarning,
          ...boundedAudit.warningCodes,
          ...(failover ? ["rpc_failover_used" as const] : []),
        ]),
        boundedAudit,
        failureReason,
      };
    }

    return {
      ...base,
      classification: "unavailable",
      indexedGpaSupported: false,
      warningCodes: uniqueWarningCodes([
        "token2022_indexed_gpa_unavailable",
        gpaWarning,
        "outside_liquidity_token_methods_unavailable",
        ...(failover ? ["rpc_failover_used" as const] : []),
      ]),
      failureReason,
    };
  }
}

export async function boundedTopAccountsAudit({
  connection,
  mint,
  excludedVaults,
}: {
  connection: RpcCapabilityConnection;
  mint: PublicKey;
  excludedVaults: string[];
}): Promise<BoundedTopAccountsAudit | undefined> {
  if (!connection.getTokenSupply || !connection.getTokenLargestAccounts) {
    return undefined;
  }

  try {
    const [supply, largestAccounts] = await Promise.all([
      connection.getTokenSupply(mint, "confirmed"),
      connection.getTokenLargestAccounts(mint, "confirmed"),
    ]);
    const excludedVaultSet = new Set(excludedVaults);
    let observedOutsideLiquidityBaseUnits = 0n;
    let inspectedAccounts = 0;
    let excludedAccounts = 0;

    for (const account of largestAccounts.value) {
      const amount = BigInt(account.amount);
      if (amount === 0n || excludedVaultSet.has(account.address.toBase58())) {
        excludedAccounts += 1;
        continue;
      }
      inspectedAccounts += 1;
      observedOutsideLiquidityBaseUnits += amount;
    }

    const warningCodes = uniqueWarningCodes([
      "token_methods_bounded_sample",
      "outside_liquidity_sample_limited",
      ...(observedOutsideLiquidityBaseUnits === 0n
        ? ["outside_liquidity_unknown_when_top_sample_empty" as const]
        : []),
    ]);
    const observedWholeUnitsOutsideLiquidity =
      observedOutsideLiquidityBaseUnits > 0n
        ? (observedOutsideLiquidityBaseUnits / MIN_CLAIM_BALANCE).toString()
        : undefined;

    return {
      tokenSupplyBaseUnits: supply.value.amount,
      accountLimit: largestAccounts.value.length,
      sampledAccounts: largestAccounts.value.length,
      inspectedAccounts,
      excludedAccounts,
      excludedVaults,
      observedOutsideLiquidityBaseUnits: observedOutsideLiquidityBaseUnits.toString(),
      ...(observedWholeUnitsOutsideLiquidity !== undefined
        ? { observedWholeUnitsOutsideLiquidity }
        : {}),
      warningCodes,
    };
  } catch {
    return undefined;
  }
}

export function summarizeRpcCapability({
  endpoint,
  audits,
  failoverEvents = [],
  probeMint,
}: {
  endpoint: string | undefined;
  audits: OutsideLiquidityByMint;
  failoverEvents?: RpcFailoverEvent[];
  probeMint?: PublicKey | string;
}): RpcOutsideLiquidityCapability {
  const source = describeRpcSource(endpoint);
  const failover = lastFailoverEvent(failoverEvents);
  const values = Object.values(audits);
  const selectedClassification = leastCompleteAuditClassification(values);
  const requestedFilters = probeMint ? requiredToken2022OutsideLiquidityFilters(probeMint) : [];
  const warningCodes = values.length > 0
    ? uniqueWarningCodes([
        ...values.flatMap((audit) => auditWarningCodes(audit, auditClassification(audit))),
        ...(failover ? ["rpc_failover_used" as const] : []),
      ])
    : uniqueWarningCodes([
        "outside_liquidity_no_probe_target",
        ...(failover ? ["rpc_failover_used" as const] : []),
      ]);

  return {
    classification: selectedClassification,
    indexedGpaSupported:
      selectedClassification === "indexed_rpc_verified" &&
      values.length > 0 &&
      values.every((audit) => audit.indexedGpaSupported === true),
    programLabel: SPL_TOKEN_2022_PROGRAM_METADATA_LABEL,
    requestedFilters,
    endpointLabel: failover?.usedEndpointLabel ?? source.rpcEndpointLabel,
    rpcProvider: source.rpcProvider,
    rpcCluster: source.rpcCluster,
    rpcCredentialRedacted: source.rpcCredentialRedacted,
    warningCodes,
    ...(failover
      ? {
          failover: {
            primaryEndpointLabel: failover.primaryEndpointLabel,
            fallbackEndpointLabel: failover.fallbackEndpointLabel,
            usedEndpointLabel: failover.usedEndpointLabel,
            reason: failover.reason,
            ...(failover.status !== undefined ? { status: failover.status } : {}),
          },
        }
      : {}),
  };
}

export function redactedRpcCapabilityJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (typeof nested === "string") {
      return credentialSafeRpcLabel({ rpcEndpointLabel: nested, rpcEndpoint: nested });
    }
    return nested;
  });
}

function lastFailoverEvent(events: RpcFailoverEvent[]): RpcFailoverEvent | undefined {
  return events[events.length - 1];
}

function auditClassification(audit: OutsideLiquidityAudit): OutsideLiquidityClassification {
  if (audit.classification === "indexed_rpc_verified") {
    return audit.indexedGpaSupported === true
      ? "indexed_rpc_verified"
      : hasOutsideLiquidityAuditEvidence(audit)
        ? "bounded_top_accounts_audit"
        : "unavailable";
  }
  if (audit.classification === "bounded_top_accounts_audit") {
    return "bounded_top_accounts_audit";
  }
  if (audit.classification === "unavailable") {
    return "unavailable";
  }
  return hasOutsideLiquidityAuditEvidence(audit) ? "bounded_top_accounts_audit" : "unavailable";
}

function auditWarningCodes(
  audit: OutsideLiquidityAudit,
  classification: OutsideLiquidityClassification,
): OutsideLiquidityWarningCode[] {
  if (audit.warningCodes && audit.warningCodes.length > 0) {
    return audit.warningCodes;
  }
  if (classification === "indexed_rpc_verified") {
    return [];
  }
  if (classification === "unavailable") {
    return uniqueWarningCodes([
      "token2022_indexed_gpa_unavailable",
      "outside_liquidity_token_methods_unavailable",
    ]);
  }
  return uniqueWarningCodes([
    "token2022_indexed_gpa_unavailable",
    "token_methods_bounded_sample",
    ...(audit.accountLimit !== undefined ? ["outside_liquidity_sample_limited" as const] : []),
    ...(audit.wholeUnitsOutsideLiquidity === undefined
      ? ["outside_liquidity_unknown_when_top_sample_empty" as const]
      : []),
  ]);
}

function leastCompleteAuditClassification(
  audits: OutsideLiquidityAudit[],
): OutsideLiquidityClassification {
  if (audits.length === 0) {
    return "unavailable";
  }
  const classifications = audits.map(auditClassification);
  if (classifications.includes("unavailable")) {
    return "unavailable";
  }
  if (classifications.includes("bounded_top_accounts_audit")) {
    return "bounded_top_accounts_audit";
  }
  return "indexed_rpc_verified";
}

function hasOutsideLiquidityAuditEvidence(audit: OutsideLiquidityAudit): boolean {
  return (
    audit.wholeUnitsOutsideLiquidity !== undefined ||
    audit.observedOutsideLiquidityBaseUnits !== undefined ||
    audit.scannedAccounts !== undefined ||
    audit.excludedAccounts !== undefined ||
    audit.accountLimit !== undefined ||
    audit.tokenSupplyBaseUnits !== undefined
  );
}

function isSecondaryIndexExclusion(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("secondary index") ||
    normalized.includes("excluded from account indexes") ||
    normalized.includes("excluded from account secondary indexes")
  );
}

function redactedFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/g, (value) =>
    credentialSafeRpcLabel({ rpcEndpoint: value }),
  );
}

function uniqueWarningCodes(codes: OutsideLiquidityWarningCode[]): OutsideLiquidityWarningCode[] {
  return Array.from(new Set(codes));
}
