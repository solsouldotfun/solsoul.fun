import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAINNET_DANGEROUS_TRANSCRIPT_PATTERNS,
  SOLSOUL_ACTIVE_DEVNET_IDS,
  SOLSOUL_MAINNET_PLACEHOLDERS,
  THIRD_PARTY_MAINNET_PUBLIC_ACCOUNTS,
  classifyDryRunAccount,
  classifyRunbookSteps,
  decodeUpgradeableProgramAccount,
  decodeUpgradeableProgramDataAccount,
  scanTranscriptForDangerousPatterns,
  summarizeRpcMethods,
} from "./mainnet-dry-run.ts";

describe("mainnet dry-run safety helpers", () => {
  it("keeps every write-capable runbook step documentation-only", () => {
    const steps = classifyRunbookSteps();
    assert.equal(steps.length, 7);
    assert.deepEqual(
      steps.filter((step) => step.writeCapable).map((step) => step.status),
      Array.from({ length: 6 }, () => "documentation_only_not_executed"),
    );
    assert.equal(steps.find((step) => step.step === 1)?.status, "local_build_only_no_mainnet_write");
  });

  it("allows only read and simulation RPC methods in the dry-run method summary", () => {
    const summary = summarizeRpcMethods([
      "getEpochInfo",
      "getBlockHeight",
      "getLatestBlockhash",
      "getAccountInfo",
      "getBalance",
      "simulateTransaction",
    ]);
    assert.equal(summary.ok, true);
    assert.deepEqual(summary.disallowed, []);

    const rejected = summarizeRpcMethods(["getEpochInfo", "sendTransaction"]);
    assert.equal(rejected.ok, false);
    assert.deepEqual(rejected.disallowed, ["sendTransaction"]);
  });

  it("negative-scans executed transcripts for mainnet write and secret-material patterns", () => {
    const cleanTranscript = [
      "[dry-run] solana epoch-info --url https://api.mainnet-beta.solana.com",
      "[dry-run] rpc getEpochInfo",
      "[dry-run] rpc simulateTransaction",
      "[dry-run] no submitted signature count: 0",
    ].join("\n");
    assert.deepEqual(scanTranscriptForDangerousPatterns(cleanTranscript), []);

    const dirtyTranscript = [
      "solana program deploy target/deploy/bonding_curve.so --url mainnet-beta",
      "rpc sendRawTransaction",
      "solana-keygen new --outfile ~/.config/solana/solsoul-mainnet.json",
    ].join("\n");
    const findings = scanTranscriptForDangerousPatterns(dirtyTranscript);
    assert.equal(findings.length >= 3, true);
    assert.deepEqual(
      new Set(findings.map((finding) => finding.name)),
      new Set(["program_deploy", "rpc_send_raw_transaction", "production_key_creation", "mainnet_key_file_path"]),
    );
    assert.equal(
      findings.every((finding) => MAINNET_DANGEROUS_TRANSCRIPT_PATTERNS.some((pattern) => pattern.name === finding.name)),
      true,
    );
  });

  it("separates public third-party mainnet accounts from SolSoul placeholders and devnet IDs", () => {
    assert.equal(
      classifyDryRunAccount(THIRD_PARTY_MAINNET_PUBLIC_ACCOUNTS.token2022).classification,
      "third_party_mainnet_public_program",
    );
    assert.equal(
      classifyDryRunAccount(THIRD_PARTY_MAINNET_PUBLIC_ACCOUNTS.raydiumCpSwap).classification,
      "third_party_mainnet_public_program",
    );
    assert.equal(
      classifyDryRunAccount(SOLSOUL_ACTIVE_DEVNET_IDS.bondingCurve).classification,
      "solsoul_devnet_id_not_mainnet",
    );
    assert.equal(
      classifyDryRunAccount(SOLSOUL_MAINNET_PLACEHOLDERS.bondingCurve).classification,
      "solsoul_future_placeholder",
    );
  });

  it("decodes BPFUpgradeableLoader Program and ProgramData metadata", () => {
    const zeroPubkey = "11111111111111111111111111111111";
    const program = Buffer.alloc(36);
    program.writeUInt32LE(2, 0);
    assert.equal(decodeUpgradeableProgramAccount(program), zeroPubkey);

    const immutableProgramData = Buffer.alloc(13);
    immutableProgramData.writeUInt32LE(3, 0);
    immutableProgramData.writeBigUInt64LE(123456n, 4);
    immutableProgramData.writeUInt8(0, 12);
    assert.deepEqual(decodeUpgradeableProgramDataAccount(immutableProgramData), {
      deploymentSlot: 123456,
      upgradeAuthority: null,
    });

    const upgradeableProgramData = Buffer.alloc(45);
    upgradeableProgramData.writeUInt32LE(3, 0);
    upgradeableProgramData.writeBigUInt64LE(654321n, 4);
    upgradeableProgramData.writeUInt8(1, 12);
    assert.deepEqual(decodeUpgradeableProgramDataAccount(upgradeableProgramData), {
      deploymentSlot: 654321,
      upgradeAuthority: zeroPubkey,
    });

    assert.equal(decodeUpgradeableProgramAccount(Buffer.alloc(35)), null);
    assert.equal(decodeUpgradeableProgramDataAccount(Buffer.alloc(15)), null);
  });
});
