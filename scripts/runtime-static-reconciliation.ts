import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ACTIVE_PROGRAM_IDS = {
  bondingCurve: "CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un",
  soulGenerator: "34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ",
  transferHook: "Gccbqia51Z8qpdeWvp1yGTrTwoyJX6WNGhFyH5pnPW66",
  raydiumCpSwap: "CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW",
} as const;

export const OLD_PUBLIC_DEVNET_PROGRAM_IDS = {
  bondingCurve: "HuSRC61oy9qyRDH21sHD8kmkuVsB5Jd9tdJMkbk4zNjQ",
  soulGenerator: "5wGUMWySAafwgTpGNgSaTMh1kiejnEGVTZj9x7wWJftk",
} as const;

type ActiveProgramKey = keyof typeof ACTIVE_PROGRAM_IDS;

interface CheckResult {
  name: string;
  ok: boolean;
  details?: Record<string, unknown>;
}

export interface OldIdOccurrence {
  file: string;
  oldId: string;
  line?: number;
  jsonPath?: string;
  classification: string;
  allowed: boolean;
}

interface AssetScanEntry {
  url: string;
  status: number;
  kind: "html" | "javascript";
  activeHitCounts: Record<string, number>;
  oldHitCounts: Record<string, number>;
}

interface RuntimeAssetScan {
  surface: "public" | "local";
  baseUrl: string;
  representativePaths: string[];
  assetsChecked: AssetScanEntry[];
  activeHitCounts: Record<string, number>;
  oldHitCounts: Record<string, number>;
  non2xxFetches: Array<{ url: string; status: number }>;
}

interface RuntimeStatsEndpoint {
  surface: "public" | "local";
  path: string;
  url: string;
  status: number;
  headers: Record<string, string>;
  body: unknown;
  activeMatches: Record<"bondingCurve" | "soulGenerator", boolean>;
  activeValues: Record<"bondingCurve" | "soulGenerator", unknown>;
  oldHitCounts: Record<string, number>;
}

interface RuntimeStatsComparison {
  path: string;
  ok: boolean;
  publicActiveValues: Record<"bondingCurve" | "soulGenerator", unknown>;
  localActiveValues?: Record<"bondingCurve" | "soulGenerator", unknown>;
}

interface RuntimeStatsReconciliation {
  endpoints: RuntimeStatsEndpoint[];
  comparisons: RuntimeStatsComparison[];
}

export interface RuntimeStaticReconciliationReport {
  ok: boolean;
  generatedAtIso: string;
  activeProgramIds: typeof ACTIVE_PROGRAM_IDS;
  oldPublicDevnetProgramIds: typeof OLD_PUBLIC_DEVNET_PROGRAM_IDS;
  checks: CheckResult[];
  oldIdOccurrences: OldIdOccurrence[];
  runtimeStatsReconciliation?: RuntimeStatsReconciliation;
  publicAssetScan?: RuntimeAssetScan;
  localAssetScan?: RuntimeAssetScan;
}

interface RuntimeStaticReconciliationOptions {
  repoRoot?: string;
  scanPublicAssets?: boolean;
  publicBaseUrl?: string;
  localBaseUrl?: string;
  writeReportPath?: string;
  fetchFn?: typeof fetch;
  generatedAt?: Date;
}

const DEFAULT_PUBLIC_BASE_URL = "https://solsoul-devnet.vercel.app";
const DEFAULT_REPRESENTATIVE_PUBLIC_PATHS = ["/en/launch", "/en/stats"];
const STATS_ROUTE_PATHS = ["/api/stats?precheck=1", "/api/stats"] as const;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(SCRIPT_DIR, "..");

const JSON_SOURCE_FILES = [
  "deployments/devnet.json",
  "deployments/public-devnet.json",
  "deployments/devnet-e2e-trace.json",
  "deployments/devnet-amm-e2e-trace.raydium.json",
];

const SOURCE_SCAN_ROOTS = [
  "deployments",
  "sdk/src",
  "app/src",
  "services/indexer/src",
  "scripts",
  "programs",
];

const SOURCE_SCAN_EXTRA_FILES = ["app/.env.example"];
const GENERATED_REPORT_RELATIVE_PATH = "deployments/runtime-static-reconciliation.json";
const SOURCE_SCAN_EXTENSIONS = new Set([".json", ".ts", ".tsx", ".rs", ".sh"]);
const SKIPPED_DIRS = new Set([".git", ".next", "node_modules", "target", "coverage", "out", "tmp"]);
const PUBLIC_IDENTIFIER_KEY_LABELS: Record<string, string> = {
  tokenMint: "token-mint",
  tokenAccount: "token-account",
};

export function activeIdMatches(value: unknown, expected: string): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return value === expected || value.startsWith(`<solana:${expected.slice(0, 8)}:sha256:`);
}

export function countProgramIdHits(text: string, ids: Record<string, string>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(ids).map(([key, id]) => [key, text.split(id).length - 1]),
  );
}

export function classifyOldIdOccurrence({
  file,
  jsonPath,
}: {
  file: string;
  jsonPath?: string;
}): { classification: string; allowed: boolean } {
  const normalized = file.replaceAll("\\", "/");
  const path = jsonPath ?? "";

  if (normalized.includes(".test.")) {
    return { classification: "test_fixture_or_override_coverage", allowed: true };
  }

  if (normalized === "scripts/runtime-static-reconciliation.ts") {
    return { classification: "static_validator_historical_id_allowlist", allowed: true };
  }

  if (
    normalized === "deployments/devnet-amm-e2e-trace.meteora.json" ||
    normalized === "deployments/local-pumpswap-trace.json"
  ) {
    return { classification: "deferred_or_historical_amm_trace", allowed: true };
  }

  if (normalized.startsWith("deployments/mainnet-readiness-")) {
    return { classification: "historical_mainnet_readiness_archive", allowed: true };
  }

  if (normalized === "deployments/devnet.json" || normalized === "deployments/public-devnet.json") {
    if (
      /old|previous|historical|programshowevidence|confirmevidence|programupgradeevidence|freshdeploymentevidence|lastprogramdeployment|lastprogramupgrade|mainnetwriteguardevidence|runtimeMetadataReconciliation/i.test(
        path,
      )
    ) {
      return { classification: "historical_or_provenance_metadata", allowed: true };
    }
  }

  return { classification: "active_or_unclassified_context", allowed: false };
}

export async function runRuntimeStaticReconciliation({
  repoRoot = DEFAULT_REPO_ROOT,
  scanPublicAssets = true,
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
  localBaseUrl,
  writeReportPath,
  fetchFn = fetch,
  generatedAt = new Date(),
}: RuntimeStaticReconciliationOptions = {}): Promise<RuntimeStaticReconciliationReport> {
  const root = resolve(repoRoot);
  const [devnet, publicDevnet, devnetTrace, raydiumTrace] = await Promise.all(
    JSON_SOURCE_FILES.map((file) => readJson(join(root, file))),
  );

  const sdkSource = await readUtf8(join(root, "sdk/src/index.ts"));
  const appEnvExample = await readUtf8(join(root, "app/.env.example"));
  const indexerSource = await readUtf8(join(root, "services/indexer/src/main.ts"));
  const ammSelectorSource = await readUtf8(join(root, "app/src/components/AmmSelector.tsx"));
  const launchFormSource = await readUtf8(join(root, "app/src/components/LaunchForm.tsx"));
  const launchSubmitSource = await readUtf8(join(root, "app/src/lib/launchSubmit.ts"));
  const devnetAmmScriptSource = await readUtf8(join(root, "scripts/devnet-amm-e2e.ts"));
  const localPumpScriptSource = await readUtf8(join(root, "scripts/local-pumpswap-e2e.ts"));

  const checks: CheckResult[] = [
    ...buildActiveMetadataChecks({ devnet, publicDevnet, devnetTrace, raydiumTrace }),
    ...buildSourceDefaultChecks({ sdkSource, appEnvExample, indexerSource }),
    ...buildRaydiumScopeChecks({
      publicDevnet,
      devnet,
      raydiumTrace,
      sdkSource,
      ammSelectorSource,
      launchFormSource,
      launchSubmitSource,
      devnetAmmScriptSource,
      localPumpScriptSource,
    }),
    ...buildProvenanceChecks({ publicDevnet, devnet }),
  ];

  const oldIdOccurrences = await collectOldIdOccurrences(root);
  checks.push({
    name: "old public devnet IDs appear only in historical/provenance/test/deferred contexts",
    ok: oldIdOccurrences.every((occurrence) => occurrence.allowed),
    details: {
      totalOccurrences: oldIdOccurrences.length,
      unclassifiedOccurrences: oldIdOccurrences.filter((occurrence) => !occurrence.allowed),
    },
  });

  const runtimeStatsReconciliation = await reconcileRuntimeStats({
    publicBaseUrl,
    localBaseUrl,
    fetchFn,
  });
  checks.push(
    ...buildRuntimeStatsChecks({
      runtimeStatsReconciliation,
      localBaseUrl,
    }),
  );

  let publicAssetScan: RuntimeAssetScan | undefined;
  let localAssetScan: RuntimeAssetScan | undefined;
  if (scanPublicAssets) {
    publicAssetScan = await scanRuntimeAssets({
      surface: "public",
      baseUrl: publicBaseUrl,
      representativePaths: DEFAULT_REPRESENTATIVE_PUBLIC_PATHS,
      fetchFn,
    });
    checks.push({
      name: "public representative pages and chunks return HTTP 2xx",
      ok: publicAssetScan.non2xxFetches.length === 0,
      details: {
        non2xxFetches: publicAssetScan.non2xxFetches,
      },
    });
    checks.push({
      name: "public executable assets contain active bonding/soul IDs and no old public-devnet IDs",
      ok:
        publicAssetScan.non2xxFetches.length === 0 &&
        publicAssetScan.activeHitCounts.bondingCurve > 0 &&
        publicAssetScan.activeHitCounts.soulGenerator > 0 &&
        Object.values(publicAssetScan.oldHitCounts).every((count) => count === 0),
      details: {
        baseUrl: publicAssetScan.baseUrl,
        representativePaths: publicAssetScan.representativePaths,
        assetsChecked: publicAssetScan.assetsChecked.length,
        activeHitCounts: publicAssetScan.activeHitCounts,
        oldHitCounts: publicAssetScan.oldHitCounts,
      },
    });

    if (localBaseUrl) {
      localAssetScan = await scanRuntimeAssets({
        surface: "local",
        baseUrl: localBaseUrl,
        representativePaths: DEFAULT_REPRESENTATIVE_PUBLIC_PATHS,
        fetchFn,
      });
      checks.push({
        name: "local representative pages and chunks return HTTP 2xx",
        ok: localAssetScan.non2xxFetches.length === 0,
        details: {
          non2xxFetches: localAssetScan.non2xxFetches,
        },
      });
      checks.push({
        name: "local executable assets contain active bonding/soul IDs and no old public-devnet IDs",
        ok:
          localAssetScan.non2xxFetches.length === 0 &&
          localAssetScan.activeHitCounts.bondingCurve > 0 &&
          localAssetScan.activeHitCounts.soulGenerator > 0 &&
          Object.values(localAssetScan.oldHitCounts).every((count) => count === 0),
        details: {
          baseUrl: localAssetScan.baseUrl,
          representativePaths: localAssetScan.representativePaths,
          assetsChecked: localAssetScan.assetsChecked.length,
          activeHitCounts: localAssetScan.activeHitCounts,
          oldHitCounts: localAssetScan.oldHitCounts,
        },
      });
    }
  }

  const report: RuntimeStaticReconciliationReport = {
    ok: checks.every((check) => check.ok),
    generatedAtIso: generatedAt.toISOString(),
    activeProgramIds: ACTIVE_PROGRAM_IDS,
    oldPublicDevnetProgramIds: OLD_PUBLIC_DEVNET_PROGRAM_IDS,
    checks,
    oldIdOccurrences,
    runtimeStatsReconciliation,
    ...(publicAssetScan ? { publicAssetScan } : {}),
    ...(localAssetScan ? { localAssetScan } : {}),
  };

  if (writeReportPath) {
    await writeFile(resolve(root, writeReportPath), `${JSON.stringify(report, null, 2)}\n`);
  }

  return report;
}

function buildActiveMetadataChecks({
  devnet,
  publicDevnet,
  devnetTrace,
  raydiumTrace,
}: {
  devnet: unknown;
  publicDevnet: unknown;
  devnetTrace: unknown;
  raydiumTrace: unknown;
}): CheckResult[] {
  const expectations: Array<{ name: string; actual: unknown; expected: string }> = [
    {
      name: "deployments/public-devnet.json#programs.bondingCurve",
      actual: at(publicDevnet, "programs.bondingCurve"),
      expected: ACTIVE_PROGRAM_IDS.bondingCurve,
    },
    {
      name: "deployments/public-devnet.json#programs.soulGenerator",
      actual: at(publicDevnet, "programs.soulGenerator"),
      expected: ACTIVE_PROGRAM_IDS.soulGenerator,
    },
    {
      name: "deployments/public-devnet.json#programs.transferHook",
      actual: at(publicDevnet, "programs.transferHook"),
      expected: ACTIVE_PROGRAM_IDS.transferHook,
    },
    {
      name: "deployments/public-devnet.json#programs.raydiumCpSwap",
      actual: at(publicDevnet, "programs.raydiumCpSwap"),
      expected: ACTIVE_PROGRAM_IDS.raydiumCpSwap,
    },
    {
      name: "deployments/devnet.json#bondingCurveProgramId",
      actual: at(devnet, "bondingCurveProgramId"),
      expected: ACTIVE_PROGRAM_IDS.bondingCurve,
    },
    {
      name: "deployments/devnet.json#soulGeneratorProgramId",
      actual: at(devnet, "soulGeneratorProgramId"),
      expected: ACTIVE_PROGRAM_IDS.soulGenerator,
    },
    {
      name: "deployments/devnet.json#transferHookProgramId",
      actual: at(devnet, "transferHookProgramId"),
      expected: ACTIVE_PROGRAM_IDS.transferHook,
    },
    {
      name: "deployments/devnet.json#raydiumCpSwapProgramId",
      actual: at(devnet, "raydiumCpSwapProgramId"),
      expected: ACTIVE_PROGRAM_IDS.raydiumCpSwap,
    },
    {
      name: "deployments/devnet-e2e-trace.json#programs.bondingCurve",
      actual: at(devnetTrace, "programs.bondingCurve"),
      expected: ACTIVE_PROGRAM_IDS.bondingCurve,
    },
    {
      name: "deployments/devnet-e2e-trace.json#programs.soulGenerator",
      actual: at(devnetTrace, "programs.soulGenerator"),
      expected: ACTIVE_PROGRAM_IDS.soulGenerator,
    },
    {
      name: "deployments/devnet-e2e-trace.json#programs.transferHook",
      actual: at(devnetTrace, "programs.transferHook"),
      expected: ACTIVE_PROGRAM_IDS.transferHook,
    },
    {
      name: "deployments/devnet-amm-e2e-trace.raydium.json#programs.bonding_curve",
      actual: at(raydiumTrace, "programs.bonding_curve"),
      expected: ACTIVE_PROGRAM_IDS.bondingCurve,
    },
    {
      name: "deployments/devnet-amm-e2e-trace.raydium.json#programs.soul_generator",
      actual: at(raydiumTrace, "programs.soul_generator"),
      expected: ACTIVE_PROGRAM_IDS.soulGenerator,
    },
    {
      name: "deployments/devnet-amm-e2e-trace.raydium.json#programs.transfer_hook",
      actual: at(raydiumTrace, "programs.transfer_hook"),
      expected: ACTIVE_PROGRAM_IDS.transferHook,
    },
    {
      name: "deployments/devnet-amm-e2e-trace.raydium.json#programs.raydium_cp_swap",
      actual: at(raydiumTrace, "programs.raydium_cp_swap"),
      expected: ACTIVE_PROGRAM_IDS.raydiumCpSwap,
    },
  ];

  return [
    {
      name: "active program IDs reconcile across deployment metadata and traces",
      ok: expectations.every(({ actual, expected }) => activeIdMatches(actual, expected)),
      details: {
        expectations,
      },
    },
    {
      name: "Raydium trace verification block confirms metadata alignment",
      ok:
        at(raydiumTrace, "amm") === "raydium" &&
        at(raydiumTrace, "raydium_program_id") === ACTIVE_PROGRAM_IDS.raydiumCpSwap &&
        at(raydiumTrace, "curve_account.owner") === ACTIVE_PROGRAM_IDS.bondingCurve &&
        at(raydiumTrace, "pool_account.owner") === ACTIVE_PROGRAM_IDS.raydiumCpSwap &&
        at(raydiumTrace, "verification.metadata_programs_match_trace") === true &&
        at(raydiumTrace, "verification.raydium_only_scope") === true,
      details: {
        amm: at(raydiumTrace, "amm"),
        raydiumProgramId: at(raydiumTrace, "raydium_program_id"),
        curveOwner: at(raydiumTrace, "curve_account.owner"),
        poolOwner: at(raydiumTrace, "pool_account.owner"),
        verification: at(raydiumTrace, "verification"),
      },
    },
  ];
}

function buildSourceDefaultChecks({
  sdkSource,
  appEnvExample,
  indexerSource,
}: {
  sdkSource: string;
  appEnvExample: string;
  indexerSource: string;
}): CheckResult[] {
  return [
    {
      name: "SDK defaults expose active devnet bonding/soul/hook/Raydium IDs",
      ok:
        sdkSource.includes(`bondingCurve: "${ACTIVE_PROGRAM_IDS.bondingCurve}"`) &&
        sdkSource.includes(`soulGenerator: "${ACTIVE_PROGRAM_IDS.soulGenerator}"`) &&
        sdkSource.includes(`transferHook: "${ACTIVE_PROGRAM_IDS.transferHook}"`) &&
        sdkSource.includes(`"${ACTIVE_PROGRAM_IDS.raydiumCpSwap}"`),
    },
    {
      name: "app env example defaults expose active devnet bonding/soul IDs",
      ok:
        appEnvExample.includes(`NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID=${ACTIVE_PROGRAM_IDS.bondingCurve}`) &&
        appEnvExample.includes(`NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID=${ACTIVE_PROGRAM_IDS.soulGenerator}`),
    },
    {
      name: "indexer defaults expose active devnet bonding/soul IDs",
      ok:
        indexerSource.includes(`"${ACTIVE_PROGRAM_IDS.bondingCurve}"`) &&
        indexerSource.includes(`"${ACTIVE_PROGRAM_IDS.soulGenerator}"`),
    },
  ];
}

function buildRaydiumScopeChecks({
  publicDevnet,
  devnet,
  raydiumTrace,
  sdkSource,
  ammSelectorSource,
  launchFormSource,
  launchSubmitSource,
  devnetAmmScriptSource,
  localPumpScriptSource,
}: {
  publicDevnet: unknown;
  devnet: unknown;
  raydiumTrace: unknown;
  sdkSource: string;
  ammSelectorSource: string;
  launchFormSource: string;
  launchSubmitSource: string;
  devnetAmmScriptSource: string;
  localPumpScriptSource: string;
}): CheckResult[] {
  const deferredAmmTargets = [
    at(publicDevnet, "m0RaydiumReadiness.deferredAmmTargets.meteora"),
    at(publicDevnet, "m0RaydiumReadiness.deferredAmmTargets.pumpSwap"),
    at(devnet, "m0RaydiumReadiness.deferredAmmTargets.meteora"),
    at(devnet, "m0RaydiumReadiness.deferredAmmTargets.pumpSwap"),
  ];

  return [
    {
      name: "runtime metadata and trace keep Raydium as the only active AMM",
      ok:
        at(publicDevnet, "m0RaydiumReadiness.activeAmm") === "raydium" &&
        at(devnet, "m0RaydiumReadiness.activeAmm") === "raydium" &&
        at(raydiumTrace, "amm") === "raydium" &&
        deferredAmmTargets.every((value) => typeof value === "string" && /deferred|historical/i.test(value)),
      details: {
        publicActiveAmm: at(publicDevnet, "m0RaydiumReadiness.activeAmm"),
        devnetActiveAmm: at(devnet, "m0RaydiumReadiness.activeAmm"),
        traceAmm: at(raydiumTrace, "amm"),
        deferredAmmTargets,
      },
    },
    {
      name: "app launch surface keeps active AMM selection fixed to Raydium",
      ok:
        /AMM_OPTIONS[\s\S]*id:\s*"raydium"[\s\S]*value:\s*TARGET_AMM\.Raydium/.test(ammSelectorSource) &&
        !/AMM_OPTIONS[\s\S]*value:\s*TARGET_AMM\.(Pump|Meteora)/.test(ammSelectorSource) &&
        /const targetAmm = ACTIVE_LAUNCH_TARGET_AMM;/.test(launchFormSource) &&
        /export const ACTIVE_LAUNCH_TARGET_AMM = TARGET_AMM\.Raydium;/.test(launchSubmitSource) &&
        /Only Raydium target_amm is active/.test(launchSubmitSource),
    },
    {
      name: "SDK launch/init builders guard active target_amm to Raydium",
      ok:
        /export const ACTIVE_TARGET_AMM = TARGET_AMM\.Raydium;/.test(sdkSource) &&
        /const targetAmm = assertActiveTargetAmm\([\s\S]*params\.targetAmm \?\? TARGET_AMM\.Raydium[\s\S]*"launchToken"/.test(sdkSource) &&
        /params\.targetAmm === undefined[\s\S]*assertActiveTargetAmm\(params\.targetAmm, "initializeSoul"\)/.test(sdkSource) &&
        /Only Raydium target_amm is active/.test(sdkSource),
    },
    {
      name: "devnet/local AMM scripts cannot execute non-Raydium flows by default",
      ok:
        /Active devnet AMM execution is Raydium-only/.test(devnetAmmScriptSource) &&
        /may only be used with --schema-check or --verify-trace/.test(devnetAmmScriptSource) &&
        /SOLSOUL_ENABLE_DEFERRED_PUMPSWAP_RESEARCH/.test(localPumpScriptSource) &&
        /active AMM scope is Raydium-only/.test(localPumpScriptSource),
    },
  ];
}

function buildProvenanceChecks({
  publicDevnet,
  devnet,
}: {
  publicDevnet: unknown;
  devnet: unknown;
}): CheckResult[] {
  return [
    {
      name: "public deployment metadata ties runtime to Vercel/git provenance",
      ok:
        typeof at(publicDevnet, "vercel.deploymentId") === "string" &&
        typeof at(publicDevnet, "vercel.deploymentUrl") === "string" &&
        typeof at(publicDevnet, "vercel.productionUrl") === "string" &&
        typeof at(publicDevnet, "vercel.gitRef") === "string" &&
        typeof at(publicDevnet, "vercel.deployedAt") === "string",
      details: {
        deploymentId: at(publicDevnet, "vercel.deploymentId"),
        deploymentUrl: at(publicDevnet, "vercel.deploymentUrl"),
        productionUrl: at(publicDevnet, "vercel.productionUrl"),
        gitRef: at(publicDevnet, "vercel.gitRef"),
        deployedAt: at(publicDevnet, "vercel.deployedAt"),
      },
    },
    {
      name: "program provenance includes SBF hashes, deploy signatures, slots, and scoped source separation",
      ok:
        hasScopedProgramDeploymentEvidence(publicDevnet, "programUpgradeEvidence.bondingCurve") &&
        hasScopedProgramDeploymentEvidence(publicDevnet, "programUpgradeEvidence.soulGenerator") &&
        hasScopedProgramDeploymentEvidence(publicDevnet, "programUpgradeEvidence.transferHook") &&
        typeof at(publicDevnet, "sourceProvenance.statement") === "string" &&
        typeof at(publicDevnet, "sourceProvenance.m5EvidenceProvenance.statement") === "string" &&
        hasScopedProgramDeploymentEvidence(devnet, "pd13F1FreshDeploymentEvidence.bondingCurve") &&
        hasScopedProgramDeploymentEvidence(devnet, "pd13F1FreshDeploymentEvidence.soulGenerator") &&
        hasScopedProgramDeploymentEvidence(devnet, "pd13F1FreshDeploymentEvidence.transferHook"),
      details: {
        publicSourceScope: at(publicDevnet, "sourceProvenance.scope"),
        publicLaterEvidenceStatement: at(publicDevnet, "sourceProvenance.m5EvidenceProvenance.statement"),
        devnetSourceScope: at(devnet, "sourceProvenance.scope"),
        publicProgramEvidence: {
          bondingCurve: summarizeProgramDeploymentEvidence(publicDevnet, "programUpgradeEvidence.bondingCurve"),
          soulGenerator: summarizeProgramDeploymentEvidence(publicDevnet, "programUpgradeEvidence.soulGenerator"),
          transferHook: summarizeProgramDeploymentEvidence(publicDevnet, "programUpgradeEvidence.transferHook"),
        },
        devnetProgramEvidence: {
          bondingCurve: summarizeProgramDeploymentEvidence(devnet, "pd13F1FreshDeploymentEvidence.bondingCurve"),
          soulGenerator: summarizeProgramDeploymentEvidence(devnet, "pd13F1FreshDeploymentEvidence.soulGenerator"),
          transferHook: summarizeProgramDeploymentEvidence(devnet, "pd13F1FreshDeploymentEvidence.transferHook"),
        },
      },
    },
  ];
}

function hasScopedProgramDeploymentEvidence(json: unknown, basePath: string): boolean {
  return (
    hasProgramDeploymentEvidence(json, basePath) &&
    (typeof at(json, `${basePath}.sourceProvenance.scope`) === "string" ||
      typeof at(json, "sourceProvenance.scope") === "string" ||
      typeof at(json, "programUpgradeEvidence.sourceProvenance.scope") === "string" ||
      typeof at(json, "pd13F1FreshDeploymentEvidence.sourceProvenance.scope") === "string")
  );
}

function hasProgramDeploymentEvidence(json: unknown, basePath: string): boolean {
  return (
    typeof at(json, `${basePath}.programId`) === "string" &&
    typeof at(json, `${basePath}.programSoSha256`) === "string" &&
    typeof at(json, `${basePath}.artifact`) === "string" &&
    typeof at(json, `${basePath}.deployTxSig`) === "string" &&
    (typeof at(json, `${basePath}.deploySlot`) === "number" ||
      typeof at(json, `${basePath}.deploySlot`) === "string")
  );
}

function summarizeProgramDeploymentEvidence(json: unknown, basePath: string): Record<string, unknown> {
  return {
    programId: at(json, `${basePath}.programId`),
    artifact: at(json, `${basePath}.artifact`),
    programSoSha256: at(json, `${basePath}.programSoSha256`),
    deployTxSig: at(json, `${basePath}.deployTxSig`),
    deploySlot: at(json, `${basePath}.deploySlot`),
    sourceScope:
      at(json, `${basePath}.sourceProvenance.scope`) ??
      at(json, "sourceProvenance.scope") ??
      at(json, "programUpgradeEvidence.sourceProvenance.scope") ??
      at(json, "pd13F1FreshDeploymentEvidence.sourceProvenance.scope"),
  };
}

function buildRuntimeStatsChecks({
  runtimeStatsReconciliation,
  localBaseUrl,
}: {
  runtimeStatsReconciliation: RuntimeStatsReconciliation;
  localBaseUrl?: string;
}): CheckResult[] {
  const endpoints = runtimeStatsReconciliation.endpoints;
  const checks: CheckResult[] = [
    {
      name: "public/local stats and precheck routes return HTTP 2xx",
      ok: endpoints.every((endpoint) => endpoint.status >= 200 && endpoint.status < 300),
      details: {
        endpoints: endpoints.map(({ surface, path, url, status, headers }) => ({
          surface,
          path,
          url,
          status,
          cacheControl: headers["cache-control"],
          contentType: headers["content-type"],
        })),
      },
    },
    {
      name: "runtime stats/precheck deployment metadata matches active IDs",
      ok:
        endpoints.every(
          (endpoint) => endpoint.activeMatches.bondingCurve && endpoint.activeMatches.soulGenerator,
        ) &&
        endpoints.every((endpoint) => Object.values(endpoint.oldHitCounts).every((count) => count === 0)),
      details: {
        endpoints: endpoints.map(({ surface, path, activeValues, activeMatches, oldHitCounts }) => ({
          surface,
          path,
          activeValues,
          activeMatches,
          oldHitCounts,
        })),
      },
    },
  ];

  if (localBaseUrl) {
    checks.push({
      name: "local stats/precheck deployment metadata matches public runtime metadata",
      ok: runtimeStatsReconciliation.comparisons.every((comparison) => comparison.ok),
      details: {
        comparisons: runtimeStatsReconciliation.comparisons,
      },
    });
  }

  return checks;
}

async function reconcileRuntimeStats({
  publicBaseUrl,
  localBaseUrl,
  fetchFn,
}: {
  publicBaseUrl: string;
  localBaseUrl?: string;
  fetchFn: typeof fetch;
}): Promise<RuntimeStatsReconciliation> {
  const endpoints: RuntimeStatsEndpoint[] = [];
  for (const path of STATS_ROUTE_PATHS) {
    endpoints.push(await fetchRuntimeStatsEndpoint({ surface: "public", baseUrl: publicBaseUrl, path, fetchFn }));
    if (localBaseUrl) {
      endpoints.push(await fetchRuntimeStatsEndpoint({ surface: "local", baseUrl: localBaseUrl, path, fetchFn }));
    }
  }

  const comparisons: RuntimeStatsComparison[] = [];
  for (const path of STATS_ROUTE_PATHS) {
    const publicEndpoint = endpoints.find((endpoint) => endpoint.surface === "public" && endpoint.path === path);
    const localEndpoint = endpoints.find((endpoint) => endpoint.surface === "local" && endpoint.path === path);
    if (!publicEndpoint) {
      continue;
    }
    comparisons.push({
      path,
      ok:
        publicEndpoint.activeMatches.bondingCurve &&
        publicEndpoint.activeMatches.soulGenerator &&
        (!localEndpoint ||
          (localEndpoint.activeMatches.bondingCurve &&
            localEndpoint.activeMatches.soulGenerator &&
            localEndpoint.activeValues.bondingCurve === publicEndpoint.activeValues.bondingCurve &&
            localEndpoint.activeValues.soulGenerator === publicEndpoint.activeValues.soulGenerator)),
      publicActiveValues: publicEndpoint.activeValues,
      ...(localEndpoint ? { localActiveValues: localEndpoint.activeValues } : {}),
    });
  }

  return { endpoints, comparisons };
}

async function fetchRuntimeStatsEndpoint({
  surface,
  baseUrl,
  path,
  fetchFn,
}: {
  surface: "public" | "local";
  baseUrl: string;
  path: string;
  fetchFn: typeof fetch;
}): Promise<RuntimeStatsEndpoint> {
  const url = new URL(path, baseUrl).toString();
  const response = await fetchFn(url);
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { parseError: "response was not valid JSON", textSnippet: text.slice(0, 500) };
  }
  const activeValues = {
    bondingCurve: at(body, "source.deployment.bondingCurveProgramId"),
    soulGenerator: at(body, "source.deployment.soulGeneratorProgramId"),
  };
  return {
    surface,
    path,
    url,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: redactRuntimeEvidenceValue(body),
    activeValues,
    activeMatches: {
      bondingCurve: activeIdMatches(activeValues.bondingCurve, ACTIVE_PROGRAM_IDS.bondingCurve),
      soulGenerator: activeIdMatches(activeValues.soulGenerator, ACTIVE_PROGRAM_IDS.soulGenerator),
    },
    oldHitCounts: countProgramIdHits(text, OLD_PUBLIC_DEVNET_PROGRAM_IDS),
  };
}

export async function scanRuntimeAssets({
  surface,
  baseUrl,
  representativePaths,
  fetchFn = fetch,
}: {
  surface: "public" | "local";
  baseUrl: string;
  representativePaths: string[];
  fetchFn?: typeof fetch;
}): Promise<RuntimeAssetScan> {
  const assetsChecked: AssetScanEntry[] = [];
  const seenUrls = new Set<string>();

  for (const path of representativePaths) {
    const pageUrl = new URL(path, baseUrl).toString();
    const html = await fetchText(fetchFn, pageUrl);
    assetsChecked.push(buildAssetEntry(pageUrl, html.status, "html", html.text));
    for (const assetUrl of extractScriptAssetUrls(html.text, pageUrl)) {
      if (seenUrls.has(assetUrl)) {
        continue;
      }
      seenUrls.add(assetUrl);
      const asset = await fetchText(fetchFn, assetUrl);
      assetsChecked.push(buildAssetEntry(assetUrl, asset.status, "javascript", asset.text));
    }
  }

  return {
    surface,
    baseUrl,
    representativePaths,
    assetsChecked,
    activeHitCounts: sumHitCounts(assetsChecked.map((entry) => entry.activeHitCounts)),
    oldHitCounts: sumHitCounts(assetsChecked.map((entry) => entry.oldHitCounts)),
    non2xxFetches: assetsChecked
      .filter((entry) => entry.status < 200 || entry.status >= 300)
      .map(({ url, status }) => ({ url, status })),
  };
}

async function collectOldIdOccurrences(repoRoot: string): Promise<OldIdOccurrence[]> {
  const files = [
    ...(await collectSourceFiles(repoRoot)),
    ...SOURCE_SCAN_EXTRA_FILES.filter((file) => existsSync(join(repoRoot, file))),
  ].sort();
  const occurrences: OldIdOccurrence[] = [];

  for (const file of files) {
    const fullPath = join(repoRoot, file);
    if (file.endsWith(".json")) {
      const json = await readJson(fullPath);
      collectJsonOldIdOccurrences(json, file, [], occurrences);
      continue;
    }

    const text = await readUtf8(fullPath);
    text.split(/\r?\n/).forEach((line, index) => {
      for (const oldId of Object.values(OLD_PUBLIC_DEVNET_PROGRAM_IDS)) {
        if (line.includes(oldId)) {
          const classification = classifyOldIdOccurrence({ file });
          occurrences.push({
            file,
            oldId,
            line: index + 1,
            classification: classification.classification,
            allowed: classification.allowed,
          });
        }
      }
    });
  }

  return occurrences;
}

function collectJsonOldIdOccurrences(
  value: unknown,
  file: string,
  path: string[],
  output: OldIdOccurrence[],
): void {
  if (typeof value === "string") {
    for (const oldId of Object.values(OLD_PUBLIC_DEVNET_PROGRAM_IDS)) {
      if (value.includes(oldId)) {
        const jsonPath = path.join(".");
        const classification = classifyOldIdOccurrence({ file, jsonPath });
        output.push({
          file,
          oldId,
          jsonPath,
          classification: classification.classification,
          allowed: classification.allowed,
        });
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectJsonOldIdOccurrences(item, file, [...path, String(index)], output));
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => collectJsonOldIdOccurrences(item, file, [...path, key], output));
  }
}

async function collectSourceFiles(repoRoot: string): Promise<string[]> {
  const files: string[] = [];
  for (const root of SOURCE_SCAN_ROOTS) {
    const fullRoot = join(repoRoot, root);
    if (existsSync(fullRoot)) {
      await walkSourceFiles(repoRoot, fullRoot, files);
    }
  }
  return files;
}

async function walkSourceFiles(repoRoot: string, directory: string, files: string[]): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) {
        await walkSourceFiles(repoRoot, join(directory, entry.name), files);
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fullPath = join(directory, entry.name);
    const relativePath = relative(repoRoot, fullPath);
    if (relativePath === GENERATED_REPORT_RELATIVE_PATH) {
      continue;
    }
    if (SOURCE_SCAN_EXTENSIONS.has(extensionFor(entry.name))) {
      files.push(relativePath);
    }
  }
}

function buildAssetEntry(url: string, status: number, kind: "html" | "javascript", text: string): AssetScanEntry {
  return {
    url,
    status,
    kind,
    activeHitCounts: countProgramIdHits(text, ACTIVE_PROGRAM_IDS),
    oldHitCounts: countProgramIdHits(text, OLD_PUBLIC_DEVNET_PROGRAM_IDS),
  };
}

function extractScriptAssetUrls(html: string, pageUrl: string): string[] {
  const urls = new Set<string>();
  const scriptPattern = /<(?:script|link)\b[^>]+(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptPattern.exec(html))) {
    urls.add(new URL(match[1], pageUrl).toString());
  }
  return [...urls].filter((url) => new URL(url).pathname.startsWith("/_next/static/"));
}

async function fetchText(fetchFn: typeof fetch, url: string): Promise<{ status: number; text: string }> {
  const response = await fetchFn(url);
  return {
    status: response.status,
    text: await response.text(),
  };
}

export function redactRuntimeEvidenceValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactRuntimeString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactRuntimeEvidenceValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const publicIdentifierLabel = PUBLIC_IDENTIFIER_KEY_LABELS[key];
        return [
          key,
          publicIdentifierLabel && typeof item === "string"
            ? stablePublicIdentifierLabel(item, publicIdentifierLabel)
            : /rpcEndpoint|rpcUrl|rpc_url|url/i.test(key)
              ? redactRuntimeString(String(item))
              : redactRuntimeEvidenceValue(item),
        ];
      }),
    );
  }
  return value;
}

function stablePublicIdentifierLabel(value: string, label: string): string {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 16);
  return `<public-devnet-${label}:sha256:${digest}>`;
}

function redactRuntimeString(value: string): string {
  if (/^\*{16,}$/.test(value)) {
    return stablePublicIdentifierLabel(value, "redacted-public-id");
  }
  if (!/^https?:\/\//i.test(value)) {
    return value;
  }
  try {
    const url = new URL(value);
    const host = url.hostname;
    const hasCredentials =
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      /(?:api|rpc|token|key|secret)/i.test(url.pathname);
    if (!hasCredentials) {
      return `${url.protocol}//${host}`;
    }
    return `${host}:<redacted>`;
  } catch {
    return "<redacted-url>";
  }
}

function sumHitCounts(hitCounts: Array<Record<string, number>>): Record<string, number> {
  const keys = new Set(hitCounts.flatMap((counts) => Object.keys(counts)));
  return Object.fromEntries(
    [...keys].map((key) => [key, hitCounts.reduce((sum, counts) => sum + (counts[key] ?? 0), 0)]),
  );
}

function extensionFor(fileName: string): string {
  if (fileName === ".env.example") {
    return ".env.example";
  }
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot) : "";
}

function at(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readUtf8(path)) as unknown;
}

async function readUtf8(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let scanPublicAssets = true;
  let publicBaseUrl = DEFAULT_PUBLIC_BASE_URL;
  let localBaseUrl: string | undefined;
  let writeReportPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--skip-public-assets") {
      scanPublicAssets = false;
    } else if (arg === "--public-base-url") {
      publicBaseUrl = requireArgValue(args, (index += 1), arg);
    } else if (arg === "--local-base-url") {
      localBaseUrl = requireArgValue(args, (index += 1), arg);
    } else if (arg === "--write-report") {
      writeReportPath = requireArgValue(args, (index += 1), arg);
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: pnpm exec tsx scripts/runtime-static-reconciliation.ts [options]",
          "",
          "Options:",
          "  --skip-public-assets       Do not fetch public Vercel HTML/JS assets",
          "  --public-base-url <url>    Public app base URL to scan",
          "  --local-base-url <url>     Local app base URL to scan and compare with public runtime",
          "  --write-report <path>      Write the full JSON report relative to the repo root",
        ].join("\n"),
      );
      return;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const report = await runRuntimeStaticReconciliation({
    scanPublicAssets,
    publicBaseUrl,
    localBaseUrl,
    writeReportPath,
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

function requireArgValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
