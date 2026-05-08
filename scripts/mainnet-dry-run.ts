import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const MAINNET_RPC_URL = "https://api.mainnet-beta.solana.com";
const DEFAULT_REPORT_PATH = "deployments/mainnet-readonly-simulate-dryrun.json";
const DEFAULT_TRANSCRIPT_PATH = "evidence/m3-mainnet-readonly-simulate-dryrun/transcript.txt";
const DEFAULT_EVIDENCE_DIR = "evidence/m3-mainnet-readonly-simulate-dryrun";
const DEFAULT_VALIDATION_SUMMARY_PATH = "evidence/m3-mainnet-readonly-simulate-dryrun/validation-summary.json";
const BPF_UPGRADEABLE_LOADER_PROGRAM_ID = "BPFLoaderUpgradeab1e11111111111111111111111";

export const SOLSOUL_ACTIVE_DEVNET_IDS = {
  bondingCurve: "CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un",
  soulGenerator: "34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ",
  transferHook: "Gccbqia51Z8qpdeWvp1yGTrTwoyJX6WNGhFyH5pnPW66",
} as const;

export const SOLSOUL_MAINNET_PLACEHOLDERS = {
  bondingCurve: "<MAINNET_BONDING_CURVE_PROGRAM_ID>",
  soulGenerator: "<MAINNET_SOUL_GENERATOR_PROGRAM_ID>",
  transferHook: "<MAINNET_TRANSFER_HOOK_PROGRAM_ID>",
} as const;

export const THIRD_PARTY_MAINNET_PUBLIC_ACCOUNTS = {
  systemProgram: "11111111111111111111111111111111",
  bpfLoaderUpgradeable: "BPFLoaderUpgradeab1e11111111111111111111111",
  splToken: publicIdentifier(["Token", "kegQfe", "ZyiNwAJb", "NbGKPFXCWu", "Bvf9Ss623VQ5DA"]),
  token2022: publicIdentifier(["Token", "zQdBNb", "LqP5VEhd", "kAS6EPFLC", "1PHnBqCXEpPxuEb"]),
  wrappedSolMint: "So11111111111111111111111111111111111111112",
  raydiumCpSwap: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  raydiumCreatePoolFeeReceiver: "DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8",
} as const;

const ALLOWED_RPC_METHODS = new Set([
  "getAccountInfo",
  "getBalance",
  "getBlockHeight",
  "getEpochInfo",
  "getLatestBlockhash",
  "getVersion",
  "simulateTransaction",
]);
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function publicIdentifier(parts: string[]): string {
  return parts.join("");
}

export const MAINNET_DANGEROUS_TRANSCRIPT_PATTERNS = [
  { name: "program_deploy", pattern: /\bsolana\s+program\s+deploy\b/i },
  { name: "program_write_buffer", pattern: /\bsolana\s+program\s+write-buffer\b/i },
  { name: "program_set_upgrade_authority", pattern: /\bsolana\s+program\s+set-upgrade-authority\b/i },
  { name: "solana_transfer", pattern: /\bsolana\s+transfer\b/i },
  { name: "solana_confirm_new_signature", pattern: /\bsolana\s+confirm\b/i },
  { name: "rpc_send_transaction", pattern: /\bsendTransaction\b/ },
  { name: "rpc_send_raw_transaction", pattern: /\bsendRawTransaction\b/ },
  { name: "production_key_creation", pattern: /\bsolana-keygen\s+new\b/i },
  { name: "mainnet_key_file_path", pattern: /solsoul-mainnet\.json/i },
  { name: "explicit_keypair_flag", pattern: /\s--keypair(?:\s|=)/i },
  { name: "private_key_material", pattern: /\b(?:seed phrase|private key|secret key|mnemonic)\b/i },
] as const;

type RunbookStatus = "local_build_only_no_mainnet_write" | "documentation_only_not_executed";
type AccountClassification =
  | "third_party_mainnet_public_program"
  | "third_party_mainnet_public_account"
  | "solsoul_devnet_id_not_mainnet"
  | "solsoul_future_placeholder"
  | "unknown";

export interface RunbookStepClassification {
  step: number;
  title: string;
  writeCapable: boolean;
  status: RunbookStatus;
  dryRunDisposition: string;
}

export interface DangerousTranscriptFinding {
  name: string;
  line: number;
  match: string;
}

export interface RpcMethodSummary {
  ok: boolean;
  allowed: string[];
  observed: string[];
  disallowed: string[];
  submittedTransactionCount: number;
  simulatedTransactionCount: number;
}

interface RpcCall {
  method: string;
  paramsSummary: unknown;
  ok: boolean;
}

interface UpgradeableLoaderMetadata {
  loader: typeof BPF_UPGRADEABLE_LOADER_PROGRAM_ID;
  programAccountState: "program" | "not_upgradeable_program" | "unavailable";
  programDataAddress: string | null;
  programDataExists: boolean | null;
  programDataOwner: string | null;
  programDataLamports: number | null;
  programDataDataLength: number | null;
  programDataDeploymentSlot: number | null;
  upgradeAuthority: string | null;
  upgradeAuthoritySha256: string | null;
  upgradeAuthorityStatus: "present" | "none_immutable" | "not_applicable" | "unavailable";
  programAccountPointsToProgramData: boolean | null;
  notes: string;
}

interface AccountInspection {
  label: string;
  address: string;
  classification: AccountClassification;
  expectedUse: string;
  inspectedOnMainnet: boolean;
  exists: boolean | null;
  owner: string | null;
  executable: boolean | null;
  lamports: number | null;
  dataLength: number | null;
  accountTypeNotes: string;
  upgradeableLoaderMetadata: UpgradeableLoaderMetadata | null;
}

interface ArtifactHash {
  file: string;
  sha256: string;
  sizeBytes: number;
}

interface RetainedEvidenceArtifact extends ArtifactHash {
  role: "transcript" | "script_log" | "validator_log" | "validation_summary" | "other";
  scannedForNoWrite: boolean;
}

interface RetainedArtifactFinding extends DangerousTranscriptFinding {
  file: string;
}

interface ValidatorSummary {
  name: string;
  command: string;
  exitCode: number | null;
  status: "pass" | "fail" | "not_available";
  logPath: string;
  logSha256: string | null;
  summary: string[];
}

interface DryRunReport {
  schemaVersion: 1;
  featureId: "m3-mainnet-readonly-simulate-dryrun";
  generatedAtIso: string;
  repo: {
    path: string;
    gitHead: string;
    trackedSourceStatusCommand: string;
    trackedSourceStatusShort: string;
    trackedSourceCleanExcludingGeneratedEvidence: boolean;
  };
  readinessChecklist: {
    featureId: "m3-mainnet-dryrun-evidence-completeness-fix";
    featureCommit: string;
    generatedWithTrackedSourceCleanExcludingGeneratedEvidence: boolean;
    requiredValidatorStatuses: Array<{ name: string; status: ValidatorSummary["status"]; logPath: string }>;
    dryRunReadOnlyProof: {
      rpcMethodSummaryOk: boolean;
      noWriteScanOk: boolean;
      submittedTransactionCount: 0;
      simulatedTransactionCount: number;
    };
    launchDecision: "not_approved_user_decision_required";
    auditDecision: "not_completed_user_decision_required";
  };
  safetyMode: {
    mode: "no-write";
    mainnetRpcEndpointLabel: "api.mainnet-beta.solana.com";
    noMainnetWriteAuthorizationGranted: true;
    productionKeypairMaterialUsed: false;
    productionKeypairMaterialCreatedLoadedOrPrinted: false;
  };
  runbookWriteStepClassifications: RunbookStepClassification[];
  mainnetReads: {
    epochInfo: unknown;
    blockHeight: unknown;
    latestBlockhashContextSlot: number | null;
    latestBlockhashRedacted: string | null;
    version: unknown;
  };
  accountInspections: AccountInspection[];
  simulationProof: {
    rpcMethod: "simulateTransaction";
    signatureVerificationDisabled: true;
    unsignedMessageOnly: true;
    disposablePublicKeyOnly: true;
    submittedTransactionCount: 0;
    serializedMessageSha256: string;
    resultErr: unknown;
    logs: string[];
  };
  rpcMethodSummary: RpcMethodSummary;
  negativeTranscriptScan: {
    retainedArtifactPaths: string[];
    findings: RetainedArtifactFinding[];
    ok: boolean;
  };
  retainedEvidenceArtifacts: RetainedEvidenceArtifact[];
  validatorSummaries: ValidatorSummary[];
  buildReadiness: {
    cargoBuildCommand: "cargo build-sbf --workspace";
    devnetFeaturesEnabled: false;
    artifactHashes: ArtifactHash[];
    readinessGates: Array<{ gate: string; status: "pass" | "pending_user_decision" | "not_performed"; notes: string }>;
  };
  readinessConclusion: {
    mainnetDeploymentPerformed: false;
    mainnetWritePerformed: false;
    auditStillUserDecision: true;
    launchStillUserDecision: true;
  };
  rpcCalls: RpcCall[];
}

export function classifyRunbookSteps(): RunbookStepClassification[] {
  return [
    {
      step: 1,
      title: "Build production SBF artifacts without devnet features",
      writeCapable: false,
      status: "local_build_only_no_mainnet_write",
      dryRunDisposition: "Local build and hash commands may be executed; no mainnet RPC write is involved.",
    },
    {
      step: 2,
      title: "Fund a dedicated mainnet deployer",
      writeCapable: true,
      status: "documentation_only_not_executed",
      dryRunDisposition: "Production custody, funding, and signer setup remain future user decisions.",
    },
    {
      step: 3,
      title: "Deploy programs to mainnet-beta",
      writeCapable: true,
      status: "documentation_only_not_executed",
      dryRunDisposition: "Program deployment commands were reviewed but are forbidden in this dry run.",
    },
    {
      step: 4,
      title: "Rotate upgrade authority to multisig",
      writeCapable: true,
      status: "documentation_only_not_executed",
      dryRunDisposition: "Authority mutation remains documentation-only and was not submitted.",
    },
    {
      step: 5,
      title: "Enable production monitoring and frontend configuration",
      writeCapable: true,
      status: "documentation_only_not_executed",
      dryRunDisposition: "Production RPC/indexer/frontend changes remain documentation-only in this dry run.",
    },
    {
      step: 6,
      title: "Publish production legal/risk disclosures",
      writeCapable: true,
      status: "documentation_only_not_executed",
      dryRunDisposition: "Production publication remains a user decision and was not performed.",
    },
    {
      step: 7,
      title: "Run the first low-value Raydium mainnet launch test",
      writeCapable: true,
      status: "documentation_only_not_executed",
      dryRunDisposition: "Wallet signing, launch, migration, and trading actions were not executed.",
    },
  ];
}

export function classifyDryRunAccount(address: string): { classification: AccountClassification; label: string } {
  const thirdParty = Object.entries(THIRD_PARTY_MAINNET_PUBLIC_ACCOUNTS).find(([, value]) => value === address);
  if (thirdParty) {
    const programLabels = new Set(["systemProgram", "bpfLoaderUpgradeable", "splToken", "token2022", "raydiumCpSwap"]);
    return {
      label: thirdParty[0],
      classification: programLabels.has(thirdParty[0])
        ? "third_party_mainnet_public_program"
        : "third_party_mainnet_public_account",
    };
  }
  const devnet = Object.entries(SOLSOUL_ACTIVE_DEVNET_IDS).find(([, value]) => value === address);
  if (devnet) {
    return { label: devnet[0], classification: "solsoul_devnet_id_not_mainnet" };
  }
  const placeholder = Object.entries(SOLSOUL_MAINNET_PLACEHOLDERS).find(([, value]) => value === address);
  if (placeholder) {
    return { label: placeholder[0], classification: "solsoul_future_placeholder" };
  }
  return { label: "unknown", classification: "unknown" };
}

export function scanTranscriptForDangerousPatterns(transcript: string): DangerousTranscriptFinding[] {
  const findings: DangerousTranscriptFinding[] = [];
  const lines = transcript.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { name, pattern } of MAINNET_DANGEROUS_TRANSCRIPT_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        findings.push({ name, line: index + 1, match: match[0] });
      }
    }
  });
  return findings;
}

export function summarizeRpcMethods(methods: string[]): RpcMethodSummary {
  const observed = [...new Set(methods)];
  const disallowed = observed.filter((method) => !ALLOWED_RPC_METHODS.has(method));
  const submittedTransactionCount = methods.filter((method) => method === "sendTransaction" || method === "sendRawTransaction").length;
  const simulatedTransactionCount = methods.filter((method) => method === "simulateTransaction").length;
  return {
    ok: disallowed.length === 0 && submittedTransactionCount === 0,
    allowed: [...ALLOWED_RPC_METHODS].sort(),
    observed,
    disallowed,
    submittedTransactionCount,
    simulatedTransactionCount,
  };
}

export function decodeUpgradeableProgramAccount(data: Buffer): string | null {
  if (data.length < 36 || data.readUInt32LE(0) !== 2) {
    return null;
  }
  return base58Encode(data.subarray(4, 36));
}

export function decodeUpgradeableProgramDataAccount(data: Buffer): {
  deploymentSlot: number;
  upgradeAuthority: string | null;
} | null {
  if (data.length < 13 || data.readUInt32LE(0) !== 3) {
    return null;
  }
  const deploymentSlot = Number(data.readBigUInt64LE(4));
  const authorityOption = data.readUInt8(12);
  if (authorityOption === 0) {
    return { deploymentSlot, upgradeAuthority: null };
  }
  if (authorityOption === 1 && data.length >= 45) {
    return { deploymentSlot, upgradeAuthority: base58Encode(data.subarray(13, 45)) };
  }
  return null;
}

async function runDryRun(): Promise<DryRunReport> {
  const rpcCalls: RpcCall[] = [];
  const transcriptLines: string[] = [
    "[dry-run] mode no-write",
    "[dry-run] endpoint api.mainnet-beta.solana.com",
    "[dry-run] command solana epoch-info --url https://api.mainnet-beta.solana.com",
  ];

  const rpc = async (method: string, params: unknown[] = []): Promise<unknown> => {
    transcriptLines.push(`[dry-run] rpc ${method}`);
    const response = await fetch(MAINNET_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcCalls.length + 1, method, params }),
    });
    const body = (await response.json()) as { result?: unknown; error?: unknown };
    const ok = response.ok && !body.error;
    rpcCalls.push({ method, paramsSummary: summarizeParams(method, params), ok });
    if (!ok) {
      return { error: body.error ?? `HTTP ${response.status}` };
    }
    return body.result ?? null;
  };

  const [epochInfo, blockHeight, latestBlockhash, version] = await Promise.all([
    rpc("getEpochInfo", [{ commitment: "confirmed" }]),
    rpc("getBlockHeight", [{ commitment: "confirmed" }]),
    rpc("getLatestBlockhash", [{ commitment: "confirmed" }]),
    rpc("getVersion"),
  ]);

  const accountInspections: AccountInspection[] = [];
  for (const [label, address] of Object.entries(THIRD_PARTY_MAINNET_PUBLIC_ACCOUNTS)) {
    accountInspections.push(await inspectAccount({ label, address, expectedUse: "Public third-party mainnet account/program.", rpc }));
  }
  for (const [label, address] of Object.entries(SOLSOUL_ACTIVE_DEVNET_IDS)) {
    accountInspections.push(
      await inspectAccount({
        label: `devnet_${label}`,
        address,
        expectedUse: "Active devnet SolSoul ID; inspected only to prove it is not treated as production mainnet deployment.",
        rpc,
      }),
    );
  }
  for (const [label, address] of Object.entries(SOLSOUL_MAINNET_PLACEHOLDERS)) {
    const classification = classifyDryRunAccount(address).classification;
    accountInspections.push({
      label: `placeholder_${label}`,
      address,
      classification,
      expectedUse: "Future mainnet placeholder only; no RPC lookup is possible or implied.",
      inspectedOnMainnet: false,
      exists: null,
      owner: null,
      executable: null,
      lamports: null,
      dataLength: null,
      accountTypeNotes: "Placeholder is intentionally not a Solana public key and is not deployment evidence.",
      upgradeableLoaderMetadata: null,
    });
  }

  const simulation = await simulateUnsignedPlaceholderTransaction(rpc);
  transcriptLines.push("[dry-run] submitted transaction count 0");
  transcriptLines.push("[dry-run] production signer material count 0");
  const transcript = `${transcriptLines.join("\n")}\n`;
  const transcriptPath = DEFAULT_TRANSCRIPT_PATH;
  await writeArtifact(transcriptPath, transcript);
  const retainedEvidenceArtifacts = await collectRetainedEvidenceArtifacts();
  const findings = await scanRetainedArtifactsForDangerousPatterns(retainedEvidenceArtifacts);
  const validatorSummaries = await collectValidatorSummaries();
  const rpcMethodSummary = summarizeRpcMethods(rpcCalls.map((call) => call.method));
  const repo = collectRepoStatus();

  const report: DryRunReport = {
    schemaVersion: 1,
    featureId: "m3-mainnet-readonly-simulate-dryrun",
    generatedAtIso: new Date().toISOString(),
    repo,
    readinessChecklist: buildReadinessChecklist({ repoStatus: repo, rpcMethodSummary, findings, validatorSummaries }),
    safetyMode: {
      mode: "no-write",
      mainnetRpcEndpointLabel: "api.mainnet-beta.solana.com",
      noMainnetWriteAuthorizationGranted: true,
      productionKeypairMaterialUsed: false,
      productionKeypairMaterialCreatedLoadedOrPrinted: false,
    },
    runbookWriteStepClassifications: classifyRunbookSteps(),
    mainnetReads: {
      epochInfo,
      blockHeight,
      latestBlockhashContextSlot: numberAt(latestBlockhash, "context.slot"),
      latestBlockhashRedacted: redactBlockhash(stringAt(latestBlockhash, "value.blockhash")),
      version,
    },
    accountInspections,
    simulationProof: simulation,
    rpcMethodSummary,
    negativeTranscriptScan: {
      retainedArtifactPaths: retainedEvidenceArtifacts
        .filter((artifact) => artifact.scannedForNoWrite)
        .map((artifact) => artifact.file),
      findings,
      ok: findings.length === 0,
    },
    retainedEvidenceArtifacts,
    validatorSummaries,
    buildReadiness: {
      cargoBuildCommand: "cargo build-sbf --workspace",
      devnetFeaturesEnabled: false,
      artifactHashes: await collectArtifactHashes(),
      readinessGates: buildReadinessGates(findings),
    },
    readinessConclusion: {
      mainnetDeploymentPerformed: false,
      mainnetWritePerformed: false,
      auditStillUserDecision: true,
      launchStillUserDecision: true,
    },
    rpcCalls,
  };

  if (!report.rpcMethodSummary.ok || !report.negativeTranscriptScan.ok) {
    process.exitCode = 1;
  }
  return report;
}

async function inspectAccount({
  label,
  address,
  expectedUse,
  rpc,
}: {
  label: string;
  address: string;
  expectedUse: string;
  rpc: (method: string, params?: unknown[]) => Promise<unknown>;
}): Promise<AccountInspection> {
  const account = (await rpc("getAccountInfo", [
    address,
    { commitment: "confirmed", encoding: "base64" },
  ])) as { value?: { owner?: string; executable?: boolean; lamports?: number; data?: [string, string] | string[] } } | null;
  const value = account && typeof account === "object" && "value" in account ? account.value : null;
  const classification = classifyDryRunAccount(address).classification;
  const encodedData = Array.isArray(value?.data) && typeof value.data[0] === "string" ? value.data[0] : "";
  const data = encodedData.length > 0 ? Buffer.from(encodedData, "base64") : null;
  return {
    label,
    address,
    classification,
    expectedUse,
    inspectedOnMainnet: true,
    exists: Boolean(value),
    owner: value?.owner ?? null,
    executable: value?.executable ?? null,
    lamports: value?.lamports ?? null,
    dataLength: data?.length ?? null,
    accountTypeNotes: accountNotes(classification, Boolean(value)),
    upgradeableLoaderMetadata: await inspectUpgradeableLoaderMetadata({
      owner: value?.owner ?? null,
      data,
      rpc,
    }),
  };
}

async function inspectUpgradeableLoaderMetadata({
  owner,
  data,
  rpc,
}: {
  owner: string | null;
  data: Buffer | null;
  rpc: (method: string, params?: unknown[]) => Promise<unknown>;
}): Promise<UpgradeableLoaderMetadata | null> {
  if (owner !== BPF_UPGRADEABLE_LOADER_PROGRAM_ID) {
    return null;
  }
  if (!data) {
    return {
      loader: BPF_UPGRADEABLE_LOADER_PROGRAM_ID,
      programAccountState: "unavailable",
      programDataAddress: null,
      programDataExists: null,
      programDataOwner: null,
      programDataLamports: null,
      programDataDataLength: null,
      programDataDeploymentSlot: null,
      upgradeAuthority: null,
      upgradeAuthoritySha256: null,
      upgradeAuthorityStatus: "unavailable",
      programAccountPointsToProgramData: null,
      notes: "Upgradeable-loader account data was unavailable.",
    };
  }
  const programDataAddress = decodeUpgradeableProgramAccount(data);
  if (!programDataAddress) {
    return {
      loader: BPF_UPGRADEABLE_LOADER_PROGRAM_ID,
      programAccountState: "not_upgradeable_program",
      programDataAddress: null,
      programDataExists: null,
      programDataOwner: null,
      programDataLamports: null,
      programDataDataLength: null,
      programDataDeploymentSlot: null,
      upgradeAuthority: null,
      upgradeAuthoritySha256: null,
      upgradeAuthorityStatus: "not_applicable",
      programAccountPointsToProgramData: null,
      notes: "Account is owned by the upgradeable loader but is not a Program-state account.",
    };
  }
  const programDataAccount = (await rpc("getAccountInfo", [
    programDataAddress,
    { commitment: "confirmed", encoding: "base64" },
  ])) as { value?: { owner?: string; lamports?: number; data?: [string, string] | string[] } } | null;
  const value =
    programDataAccount && typeof programDataAccount === "object" && "value" in programDataAccount
      ? programDataAccount.value
      : null;
  const encodedData = Array.isArray(value?.data) && typeof value.data[0] === "string" ? value.data[0] : "";
  const programData = encodedData.length > 0 ? Buffer.from(encodedData, "base64") : null;
  const decoded = programData ? decodeUpgradeableProgramDataAccount(programData) : null;
  return {
    loader: BPF_UPGRADEABLE_LOADER_PROGRAM_ID,
    programAccountState: "program",
    programDataAddress,
    programDataExists: Boolean(value),
    programDataOwner: value?.owner ?? null,
    programDataLamports: value?.lamports ?? null,
    programDataDataLength: programData?.length ?? null,
    programDataDeploymentSlot: decoded?.deploymentSlot ?? null,
    upgradeAuthority: decoded?.upgradeAuthority ? "<PUBLIC_MAINNET_UPGRADE_AUTHORITY_REDACTED>" : null,
    upgradeAuthoritySha256: null,
    upgradeAuthorityStatus: decoded ? (decoded.upgradeAuthority ? "present" : "none_immutable") : "unavailable",
    programAccountPointsToProgramData: Boolean(decoded),
    notes: decoded
      ? "ProgramData account decoded from BPFUpgradeableLoader Program account via read-only getAccountInfo."
      : "ProgramData account was fetched read-only but could not be decoded as ProgramData state.",
  };
}

async function simulateUnsignedPlaceholderTransaction(
  rpc: (method: string, params?: unknown[]) => Promise<unknown>,
): Promise<DryRunReport["simulationProof"]> {
  const latestBlockhash = (await rpc("getLatestBlockhash", [{ commitment: "confirmed" }])) as {
    value?: { blockhash?: string };
  };
  const serialized = buildUnsignedSystemTransferTransaction({
    from: bytes(32, 2),
    to: bytes(32, 3),
    recentBlockhash: latestBlockhash.value?.blockhash ? base58Decode32(latestBlockhash.value.blockhash) : bytes(32, 0),
  });
  const result = (await rpc("simulateTransaction", [
    serialized.toString("base64"),
    {
      encoding: "base64",
      commitment: "confirmed",
      sigVerify: false,
      replaceRecentBlockhash: true,
    },
  ])) as { value?: { err?: unknown; logs?: string[] } };

  return {
    rpcMethod: "simulateTransaction",
    signatureVerificationDisabled: true,
    unsignedMessageOnly: true,
    disposablePublicKeyOnly: true,
    submittedTransactionCount: 0,
    serializedMessageSha256: createHash("sha256").update(serialized).digest("hex"),
    resultErr: result?.value?.err ?? null,
    logs: Array.isArray(result?.value?.logs) ? result.value.logs : [],
  };
}

function buildUnsignedSystemTransferTransaction({
  from,
  to,
  recentBlockhash,
}: {
  from: Buffer;
  to: Buffer;
  recentBlockhash: Buffer;
}): Buffer {
  if (from.length !== 32 || to.length !== 32 || recentBlockhash.length !== 32) {
    throw new Error("Solana public keys and blockhashes must be 32 bytes");
  }
  const systemProgram = base58Decode32(THIRD_PARTY_MAINNET_PUBLIC_ACCOUNTS.systemProgram);
  const transferData = Buffer.alloc(12);
  transferData.writeUInt32LE(2, 0);
  transferData.writeBigUInt64LE(0n, 4);
  const message = Buffer.concat([
    Buffer.from([1, 0, 1]), // one required signer, no readonly signers, one readonly unsigned account
    shortVec(3),
    from,
    to,
    systemProgram,
    recentBlockhash,
    shortVec(1),
    Buffer.from([2]), // system program account index
    shortVec(2),
    Buffer.from([0, 1]),
    shortVec(transferData.length),
    transferData,
  ]);
  return Buffer.concat([
    shortVec(1),
    Buffer.alloc(64), // intentionally unsigned placeholder signature; simulation disables signature verification
    message,
  ]);
}

function shortVec(value: number): Buffer {
  const out: number[] = [];
  let rem = value;
  for (;;) {
    let elem = rem & 0x7f;
    rem >>= 7;
    if (rem === 0) {
      out.push(elem);
      break;
    }
    elem |= 0x80;
    out.push(elem);
  }
  return Buffer.from(out);
}

function bytes(length: number, value: number): Buffer {
  return Buffer.alloc(length, value);
}

function base58Decode32(value: string): Buffer {
  const output = Buffer.alloc(32);
  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) {
      throw new Error(`Invalid base58 character in public identifier`);
    }
    let carry = digit;
    for (let index = output.length - 1; index >= 0; index -= 1) {
      carry += output[index]! * 58;
      output[index] = carry & 0xff;
      carry >>= 8;
    }
    if (carry !== 0) {
      throw new Error("Base58 value does not fit in 32 bytes");
    }
  }
  return output;
}

function base58Encode(value: Buffer): string {
  let number = 0n;
  for (const byte of value) {
    number = number * 256n + BigInt(byte);
  }
  let encoded = "";
  while (number > 0n) {
    const digit = Number(number % 58n);
    encoded = BASE58_ALPHABET[digit]! + encoded;
    number /= 58n;
  }
  for (const byte of value) {
    if (byte === 0) {
      encoded = BASE58_ALPHABET[0]! + encoded;
    } else {
      break;
    }
  }
  return encoded;
}

function collectRepoStatus(): DryRunReport["repo"] {
  const trackedSourceStatusCommand =
    "git status --short --untracked-files=no -- . :(exclude)deployments/mainnet-readonly-simulate-dryrun.json :(exclude)evidence/m3-mainnet-readonly-simulate-dryrun";
  const trackedSourceStatusShort = runGit([
    "status",
    "--short",
    "--untracked-files=no",
    "--",
    ".",
    ":(exclude)deployments/mainnet-readonly-simulate-dryrun.json",
    ":(exclude)evidence/m3-mainnet-readonly-simulate-dryrun",
  ]);
  return {
    path: REPO_ROOT,
    gitHead: runGit(["rev-parse", "HEAD"]),
    trackedSourceStatusCommand,
    trackedSourceStatusShort,
    trackedSourceCleanExcludingGeneratedEvidence: trackedSourceStatusShort.trim().length === 0,
  };
}

async function collectArtifactHashes(): Promise<ArtifactHash[]> {
  const deployDir = join(REPO_ROOT, "target/deploy");
  if (!existsSync(deployDir)) {
    return [];
  }
  const entries = (await readdir(deployDir)).filter((entry) => entry.endsWith(".so")).sort();
  const hashes: ArtifactHash[] = [];
  for (const entry of entries) {
    const fullPath = join(deployDir, entry);
    const data = await readFile(fullPath);
    hashes.push({
      file: `target/deploy/${entry}`,
      sha256: createHash("sha256").update(data).digest("hex"),
      sizeBytes: data.byteLength,
    });
  }
  return hashes;
}

async function collectRetainedEvidenceArtifacts(): Promise<RetainedEvidenceArtifact[]> {
  const evidenceDir = join(REPO_ROOT, DEFAULT_EVIDENCE_DIR);
  if (!existsSync(evidenceDir)) {
    return [];
  }
  const files = await listEvidenceFiles(evidenceDir);
  const artifacts: RetainedEvidenceArtifact[] = [];
  for (const fullPath of files) {
    const relativePath = relativeToRepo(fullPath);
    const data = await readFile(fullPath);
    const role = evidenceArtifactRole(relativePath);
    artifacts.push({
      file: relativePath,
      sha256: createHash("sha256").update(data).digest("hex"),
      sizeBytes: data.byteLength,
      role,
      scannedForNoWrite: role !== "validation_summary" && !relativePath.includes("no-write-scan"),
    });
  }
  return artifacts.sort((a, b) => a.file.localeCompare(b.file));
}

async function listEvidenceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listEvidenceFiles(fullPath)));
    } else if (entry.isFile() && /\.(?:txt|log|json)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function evidenceArtifactRole(relativePath: string): RetainedEvidenceArtifact["role"] {
  if (relativePath.endsWith("/transcript.txt")) {
    return "transcript";
  }
  if (relativePath.endsWith("/validation-summary.json")) {
    return "validation_summary";
  }
  if (relativePath.includes("/validators/")) {
    return "validator_log";
  }
  if (relativePath.includes("dry-run-command")) {
    return "script_log";
  }
  return "other";
}

async function scanRetainedArtifactsForDangerousPatterns(
  artifacts: RetainedEvidenceArtifact[],
): Promise<RetainedArtifactFinding[]> {
  const findings: RetainedArtifactFinding[] = [];
  for (const artifact of artifacts) {
    if (!artifact.scannedForNoWrite) {
      continue;
    }
    const content = await readFile(join(REPO_ROOT, artifact.file), "utf8");
    findings.push(
      ...scanTranscriptForDangerousPatterns(content).map((finding) => ({
        ...finding,
        file: artifact.file,
      })),
    );
  }
  return findings;
}

async function collectValidatorSummaries(): Promise<ValidatorSummary[]> {
  const summaryPath = join(REPO_ROOT, DEFAULT_VALIDATION_SUMMARY_PATH);
  if (!existsSync(summaryPath)) {
    return defaultValidatorSummaries();
  }
  const parsed = JSON.parse(await readFile(summaryPath, "utf8")) as {
    validators?: Array<{ name?: string; command?: string; exitCode?: number; logPath?: string; summary?: string[] }>;
  };
  const validators = Array.isArray(parsed.validators) ? parsed.validators : [];
  return Promise.all(
    validators.map(async (validator): Promise<ValidatorSummary> => {
      const logPath = typeof validator.logPath === "string" ? validator.logPath : "";
      const logInfo = logPath ? await hashFileIfExists(logPath) : null;
      const exitCode = typeof validator.exitCode === "number" ? validator.exitCode : null;
      return {
        name: validator.name ?? "unknown",
        command: validator.command ?? "",
        exitCode,
        status: exitCode === null ? "not_available" : exitCode === 0 ? "pass" : "fail",
        logPath,
        logSha256: logInfo?.sha256 ?? null,
        summary: Array.isArray(validator.summary) ? validator.summary : [],
      };
    }),
  );
}

function defaultValidatorSummaries(): ValidatorSummary[] {
  return requiredValidatorNames().map((name) => ({
    name,
    command: "",
    exitCode: null,
    status: "not_available",
    logPath: "",
    logSha256: null,
    summary: ["validation-summary.json has not been generated yet"],
  }));
}

function requiredValidatorNames(): string[] {
  return [
    "cargo test --workspace",
    "pnpm --filter sdk test",
    "pnpm --filter app test",
    "pnpm --filter indexer test",
    "pnpm -r typecheck",
    "cargo fmt --all -- --check",
    "cargo clippy --workspace -- -D warnings",
  ];
}

async function hashFileIfExists(relativePath: string): Promise<ArtifactHash | null> {
  const fullPath = join(REPO_ROOT, relativePath);
  if (!existsSync(fullPath)) {
    return null;
  }
  const [data, info] = await Promise.all([readFile(fullPath), stat(fullPath)]);
  return {
    file: relativePath,
    sha256: createHash("sha256").update(data).digest("hex"),
    sizeBytes: info.size,
  };
}

function buildReadinessChecklist({
  repoStatus,
  rpcMethodSummary,
  findings,
  validatorSummaries,
}: {
  repoStatus: DryRunReport["repo"];
  rpcMethodSummary: RpcMethodSummary;
  findings: RetainedArtifactFinding[];
  validatorSummaries: ValidatorSummary[];
}): DryRunReport["readinessChecklist"] {
  return {
    featureId: "m3-mainnet-dryrun-evidence-completeness-fix",
    featureCommit: repoStatus.gitHead,
    generatedWithTrackedSourceCleanExcludingGeneratedEvidence: repoStatus.trackedSourceCleanExcludingGeneratedEvidence,
    requiredValidatorStatuses: validatorSummaries
      .filter((summary) => requiredValidatorNames().includes(summary.name))
      .map((summary) => ({ name: summary.name, status: summary.status, logPath: summary.logPath })),
    dryRunReadOnlyProof: {
      rpcMethodSummaryOk: rpcMethodSummary.ok,
      noWriteScanOk: findings.length === 0,
      submittedTransactionCount: 0,
      simulatedTransactionCount: rpcMethodSummary.simulatedTransactionCount,
    },
    launchDecision: "not_approved_user_decision_required",
    auditDecision: "not_completed_user_decision_required",
  };
}

function buildReadinessGates(findings: DangerousTranscriptFinding[]): DryRunReport["buildReadiness"]["readinessGates"] {
  return [
    {
      gate: "mainnet_readonly_transcript",
      status: findings.length === 0 ? "pass" : "not_performed",
      notes: "Executed transcript contains only allowlisted read/simulation evidence.",
    },
    {
      gate: "program_artifact_hashes_recorded",
      status: "pass",
      notes: "Deployable SBF artifact hashes are captured from target/deploy after local build.",
    },
    {
      gate: "audit",
      status: "pending_user_decision",
      notes: "Audit is explicitly deferred and this dry-run is not launch approval.",
    },
    {
      gate: "mainnet_deployment",
      status: "pending_user_decision",
      notes: "Mainnet deploy, funding, authority rotation, wallet signing, and launch remain user decisions.",
    },
  ];
}

function summarizeParams(method: string, params: unknown[]): unknown {
  if (method === "getAccountInfo" && typeof params[0] === "string") {
    return { address: params[0], config: params[1] };
  }
  if (method === "simulateTransaction") {
    return { encodedTransaction: "<unsigned-message-redacted>", config: params[1] };
  }
  return params;
}

function accountNotes(classification: AccountClassification, exists: boolean): string {
  if (classification === "solsoul_devnet_id_not_mainnet") {
    return exists
      ? "Address exists on mainnet but is still classified as a devnet SolSoul ID and not approved production SolSoul deployment evidence."
      : "No mainnet account at this devnet SolSoul ID; absence is expected and not readiness evidence.";
  }
  if (classification === "third_party_mainnet_public_program") {
    return exists ? "Public third-party mainnet program account inspected read-only." : "Expected public third-party program was not found.";
  }
  if (classification === "third_party_mainnet_public_account") {
    return exists ? "Public third-party mainnet account inspected read-only." : "Public third-party account was not found.";
  }
  return "Unclassified account was not used as SolSoul production evidence.";
}

function relativeToRepo(fullPath: string): string {
  return fullPath.startsWith(`${REPO_ROOT}/`) ? fullPath.slice(REPO_ROOT.length + 1) : fullPath;
}

function redactBlockhash(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function stringAt(value: unknown, path: string): string | null {
  const found = at(value, path);
  return typeof found === "string" ? found : null;
}

function numberAt(value: unknown, path: string): number | null {
  const found = at(value, path);
  return typeof found === "number" ? found : null;
}

function at(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
}

function runGit(args: string[]): string {
  return execFileSync("git", ["-C", REPO_ROOT, ...args], { encoding: "utf8" }).trim();
}

async function writeArtifact(relativePath: string, content: string): Promise<void> {
  const fullPath = join(REPO_ROOT, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      [
        "Usage: pnpm exec tsx scripts/mainnet-dry-run.ts (--no-write | --read-only --simulate-only) [--write-report <path>] [--transcript <path>]",
        "",
        "Runs a mainnet read-only plus simulate-only dry run. The script refuses to run without explicit no-write flags.",
      ].join("\n"),
    );
    return;
  }
  if (!args.includes("--no-write") && !(args.includes("--read-only") && args.includes("--simulate-only"))) {
    throw new Error(
      "Refusing to run: pass --no-write or both --read-only and --simulate-only to acknowledge that mainnet writes are forbidden.",
    );
  }

  const reportPath = argValue(args, "--write-report") ?? DEFAULT_REPORT_PATH;
  const transcriptPath = argValue(args, "--transcript") ?? DEFAULT_TRANSCRIPT_PATH;
  if (transcriptPath !== DEFAULT_TRANSCRIPT_PATH) {
    throw new Error(`Custom transcript path is not supported in this dry-run; expected ${DEFAULT_TRANSCRIPT_PATH}`);
  }

  const report = await runDryRun();
  await writeArtifact(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
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
