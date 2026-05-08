import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import {
  ACTIVE_PROGRAM_IDS,
  OLD_PUBLIC_DEVNET_PROGRAM_IDS,
  activeIdMatches,
  classifyOldIdOccurrence,
  countProgramIdHits,
  redactRuntimeEvidenceValue,
  runRuntimeStaticReconciliation,
} from "./runtime-static-reconciliation.ts";

describe("runtime static reconciliation helpers", () => {
  it("accepts exact and shield-redacted active program identifiers", () => {
    assert.equal(activeIdMatches(ACTIVE_PROGRAM_IDS.bondingCurve, ACTIVE_PROGRAM_IDS.bondingCurve), true);
    assert.equal(
      activeIdMatches("<solana:CoL4Sti1:sha256:a41e4888c489b4d0>", ACTIVE_PROGRAM_IDS.bondingCurve),
      true,
    );
    assert.equal(activeIdMatches(OLD_PUBLIC_DEVNET_PROGRAM_IDS.bondingCurve, ACTIVE_PROGRAM_IDS.bondingCurve), false);
  });

  it("classifies old public-devnet IDs as allowed only in historical, deferred, or test contexts", () => {
    assert.deepEqual(
      classifyOldIdOccurrence({
        file: "deployments/public-devnet.json",
        jsonPath: "programUpgradeEvidence.oldVsNewProgramIds.bondingCurve.oldProgramId",
      }),
      {
        classification: "historical_or_provenance_metadata",
        allowed: true,
      },
    );
    assert.deepEqual(
      classifyOldIdOccurrence({
        file: "deployments/devnet-amm-e2e-trace.meteora.json",
        jsonPath: "programs.bonding_curve",
      }),
      {
        classification: "deferred_or_historical_amm_trace",
        allowed: true,
      },
    );
    assert.deepEqual(
      classifyOldIdOccurrence({
        file: "scripts/runtime-static-reconciliation.ts",
      }),
      {
        classification: "static_validator_historical_id_allowlist",
        allowed: true,
      },
    );
    assert.deepEqual(
      classifyOldIdOccurrence({
        file: "sdk/src/index.ts",
      }),
      {
        classification: "active_or_unclassified_context",
        allowed: false,
      },
    );
  });

  it("counts active and old ID hits for executable asset scans", () => {
    const text = [
      ACTIVE_PROGRAM_IDS.bondingCurve,
      ACTIVE_PROGRAM_IDS.bondingCurve,
      ACTIVE_PROGRAM_IDS.soulGenerator,
      OLD_PUBLIC_DEVNET_PROGRAM_IDS.soulGenerator,
    ].join("\n");

    assert.deepEqual(countProgramIdHits(text, ACTIVE_PROGRAM_IDS), {
      bondingCurve: 2,
      soulGenerator: 1,
      transferHook: 0,
      raydiumCpSwap: 0,
    });
    assert.deepEqual(countProgramIdHits(text, OLD_PUBLIC_DEVNET_PROGRAM_IDS), {
      bondingCurve: 0,
      soulGenerator: 1,
    });
  });

  it("label-hashes tokenMint values in runtime evidence while preserving row semantics", () => {
    const rawMint = "11111111111111111111111111111112";
    const redacted = redactRuntimeEvidenceValue({
      perTokenSoulTotals: [
        {
          tokenMint: rawMint,
          tokenAccount: "********************************",
          tokenLabel: "TKNTEST",
          claimedSouls: "1",
        },
      ],
      source: {
        rpcEndpoint: "https://rpc.example.test/secret-token?api-key=hidden",
      },
    }) as {
      perTokenSoulTotals: Array<{ tokenMint: string; tokenAccount: string; tokenLabel: string; claimedSouls: string }>;
      source: { rpcEndpoint: string };
    };

    assert.match(redacted.perTokenSoulTotals[0].tokenMint, /^<public-devnet-token-mint:sha256:[0-9a-f]{16}>$/);
    assert.notEqual(redacted.perTokenSoulTotals[0].tokenMint, rawMint);
    assert.match(
      redacted.perTokenSoulTotals[0].tokenAccount,
      /^<public-devnet-token-account:sha256:[0-9a-f]{16}>$/,
    );
    assert.notEqual(redacted.perTokenSoulTotals[0].tokenAccount, "********************************");
    assert.equal(redacted.perTokenSoulTotals[0].tokenLabel, "TKNTEST");
    assert.equal(redacted.perTokenSoulTotals[0].claimedSouls, "1");
    assert.equal(redacted.source.rpcEndpoint, "rpc.example.test:<redacted>");
    assert.equal(
      redacted.perTokenSoulTotals[0].tokenMint,
      (redactRuntimeEvidenceValue({ tokenMint: rawMint }) as { tokenMint: string }).tokenMint,
    );
  });

  it("reconciles public and local stats routes and scans local executable assets", async () => {
    const repoRoot = await createRuntimeFixtureRepo();
    const fetchFn = async (url: string | URL | Request) => {
      const requested = String(url);
      if (requested.endsWith("/api/stats?precheck=1")) {
        return jsonResponse(statsPrecheckBody());
      }
      if (requested.endsWith("/api/stats")) {
        return jsonResponse(statsBody());
      }
      if (requested.endsWith("/en/launch") || requested.endsWith("/en/stats")) {
        return textResponse(`<html><script src="/_next/static/chunks/runtime.js"></script></html>`);
      }
      if (requested.endsWith("/_next/static/chunks/runtime.js")) {
        return textResponse(
          `${ACTIVE_PROGRAM_IDS.bondingCurve}\n${ACTIVE_PROGRAM_IDS.soulGenerator}\nconsole.log("raydium")`,
        );
      }
      throw new Error(`unexpected fetch ${requested}`);
    };

    const report = await runRuntimeStaticReconciliation({
      repoRoot,
      publicBaseUrl: "https://public.example",
      localBaseUrl: "http://127.0.0.1:3100",
      fetchFn: fetchFn as typeof fetch,
      generatedAt: new Date("2026-05-02T00:00:00.000Z"),
    });

    assert.equal(report.ok, true);
    assert.equal(report.runtimeStatsReconciliation?.endpoints.length, 4);
    assert.equal(report.runtimeStatsReconciliation?.comparisons.every((comparison) => comparison.ok), true);
    assert.equal(report.localAssetScan?.assetsChecked.length, 3);
    assert.equal(report.localAssetScan?.activeHitCounts.bondingCurve, 1);
    assert.equal(report.localAssetScan?.activeHitCounts.soulGenerator, 1);
    assert.equal(report.localAssetScan?.oldHitCounts.bondingCurve, 0);
  });

  it("fails reconciliation when representative page or chunk fetches return non-2xx", async () => {
    const repoRoot = await createRuntimeFixtureRepo();
    const fetchFn = async (url: string | URL | Request) => {
      const requested = String(url);
      if (requested.endsWith("/api/stats?precheck=1")) {
        return jsonResponse(statsPrecheckBody());
      }
      if (requested.endsWith("/api/stats")) {
        return jsonResponse(statsBody());
      }
      if (requested.endsWith("/en/launch")) {
        return textResponse("missing", { status: 404 });
      }
      if (requested.endsWith("/en/stats")) {
        return textResponse(`<html><script src="/_next/static/chunks/runtime.js"></script></html>`);
      }
      if (requested.endsWith("/_next/static/chunks/runtime.js")) {
        return textResponse(`${ACTIVE_PROGRAM_IDS.bondingCurve}\n${ACTIVE_PROGRAM_IDS.soulGenerator}`, { status: 503 });
      }
      throw new Error(`unexpected fetch ${requested}`);
    };

    const report = await runRuntimeStaticReconciliation({
      repoRoot,
      publicBaseUrl: "https://public.example",
      fetchFn: fetchFn as typeof fetch,
    });

    assert.equal(report.ok, false);
    assert.equal(
      report.checks.find((check) => check.name === "public representative pages and chunks return HTTP 2xx")?.ok,
      false,
    );
  });

  it("requires transfer-hook artifact hash, deploy signature, slot, and scoped provenance", async () => {
    const repoRoot = await createRuntimeFixtureRepo({ omitTransferHookProvenance: true });
    const fetchFn = async (url: string | URL | Request) => {
      const requested = String(url);
      if (requested.endsWith("/api/stats?precheck=1")) {
        return jsonResponse(statsPrecheckBody());
      }
      if (requested.endsWith("/api/stats")) {
        return jsonResponse(statsBody());
      }
      if (requested.endsWith("/en/launch") || requested.endsWith("/en/stats")) {
        return textResponse(`<html><script src="/_next/static/chunks/runtime.js"></script></html>`);
      }
      if (requested.endsWith("/_next/static/chunks/runtime.js")) {
        return textResponse(`${ACTIVE_PROGRAM_IDS.bondingCurve}\n${ACTIVE_PROGRAM_IDS.soulGenerator}`);
      }
      throw new Error(`unexpected fetch ${requested}`);
    };

    const report = await runRuntimeStaticReconciliation({
      repoRoot,
      publicBaseUrl: "https://public.example",
      fetchFn: fetchFn as typeof fetch,
    });

    assert.equal(report.ok, false);
    assert.equal(
      report.checks.find(
        (check) => check.name === "program provenance includes SBF hashes, deploy signatures, slots, and scoped source separation",
      )?.ok,
      false,
    );
  });
});

async function createRuntimeFixtureRepo({
  omitTransferHookProvenance = false,
}: {
  omitTransferHookProvenance?: boolean;
} = {}): Promise<string> {
  const repoRoot = await mkdtemp(join(tmpdir(), "runtime-static-reconciliation-"));
  await Promise.all([
    mkdir(join(repoRoot, "deployments"), { recursive: true }),
    mkdir(join(repoRoot, "sdk/src"), { recursive: true }),
    mkdir(join(repoRoot, "app/src/components"), { recursive: true }),
    mkdir(join(repoRoot, "services/indexer/src"), { recursive: true }),
    mkdir(join(repoRoot, "scripts"), { recursive: true }),
    mkdir(join(repoRoot, "programs"), { recursive: true }),
  ]);

  const programEvidence = {
    bondingCurve: deploymentEvidence("bonding_curve.so", ACTIVE_PROGRAM_IDS.bondingCurve),
    soulGenerator: deploymentEvidence("soul_generator.so", ACTIVE_PROGRAM_IDS.soulGenerator),
    ...(omitTransferHookProvenance
      ? {}
      : { transferHook: deploymentEvidence("transfer_hook.so", ACTIVE_PROGRAM_IDS.transferHook) }),
  };
  const sourceProvenance = {
    scope: "PD13.F1 fresh program deployment source tree only",
    statement: "Scoped program deployment provenance is separate from later lifecycle evidence.",
    m5EvidenceProvenance: {
      statement: "Later lifecycle evidence is intentionally scoped separately from deployment provenance.",
    },
  };

  await writeJson(join(repoRoot, "deployments/public-devnet.json"), {
    vercel: {
      deploymentId: "dpl_test",
      deploymentUrl: "https://deployment.example",
      productionUrl: "https://public.example",
      gitRef: "abc123",
      deployedAt: "2026-05-02T00:00:00.000Z",
    },
    programs: {
      bondingCurve: ACTIVE_PROGRAM_IDS.bondingCurve,
      soulGenerator: ACTIVE_PROGRAM_IDS.soulGenerator,
      transferHook: ACTIVE_PROGRAM_IDS.transferHook,
      raydiumCpSwap: ACTIVE_PROGRAM_IDS.raydiumCpSwap,
    },
    m0RaydiumReadiness: deferredRaydiumScope(),
    programUpgradeEvidence: programEvidence,
    sourceProvenance,
  });
  await writeJson(join(repoRoot, "deployments/devnet.json"), {
    bondingCurveProgramId: ACTIVE_PROGRAM_IDS.bondingCurve,
    soulGeneratorProgramId: ACTIVE_PROGRAM_IDS.soulGenerator,
    transferHookProgramId: ACTIVE_PROGRAM_IDS.transferHook,
    raydiumCpSwapProgramId: ACTIVE_PROGRAM_IDS.raydiumCpSwap,
    programs: {
      transferHook: omitTransferHookProvenance
        ? {
            programId: ACTIVE_PROGRAM_IDS.transferHook,
            artifact: "target/deploy/transfer_hook.so",
            verifiedWith: "solana program show",
          }
        : deploymentEvidence("transfer_hook.so", ACTIVE_PROGRAM_IDS.transferHook),
    },
    m0RaydiumReadiness: deferredRaydiumScope(),
    pd13F1FreshDeploymentEvidence: programEvidence,
    sourceProvenance,
  });
  await writeJson(join(repoRoot, "deployments/devnet-e2e-trace.json"), {
    programs: {
      bondingCurve: ACTIVE_PROGRAM_IDS.bondingCurve,
      soulGenerator: ACTIVE_PROGRAM_IDS.soulGenerator,
      transferHook: ACTIVE_PROGRAM_IDS.transferHook,
    },
  });
  await writeJson(join(repoRoot, "deployments/devnet-amm-e2e-trace.raydium.json"), {
    amm: "raydium",
    raydium_program_id: ACTIVE_PROGRAM_IDS.raydiumCpSwap,
    curve_account: { owner: ACTIVE_PROGRAM_IDS.bondingCurve },
    pool_account: { owner: ACTIVE_PROGRAM_IDS.raydiumCpSwap },
    programs: {
      bonding_curve: ACTIVE_PROGRAM_IDS.bondingCurve,
      soul_generator: ACTIVE_PROGRAM_IDS.soulGenerator,
      transfer_hook: ACTIVE_PROGRAM_IDS.transferHook,
      raydium_cp_swap: ACTIVE_PROGRAM_IDS.raydiumCpSwap,
    },
    verification: {
      metadata_programs_match_trace: true,
      raydium_only_scope: true,
    },
  });
  await writeFile(
    join(repoRoot, "sdk/src/index.ts"),
    `export const TARGET_AMM = { Raydium: 0, Pump: 1, Meteora: 2 };
export const ACTIVE_TARGET_AMM = TARGET_AMM.Raydium;
export const DEVNET_PROGRAM_IDS = { bondingCurve: "${ACTIVE_PROGRAM_IDS.bondingCurve}", soulGenerator: "${ACTIVE_PROGRAM_IDS.soulGenerator}", transferHook: "${ACTIVE_PROGRAM_IDS.transferHook}", raydiumCpSwap: "${ACTIVE_PROGRAM_IDS.raydiumCpSwap}" };
const targetAmm = assertActiveTargetAmm(params.targetAmm ?? TARGET_AMM.Raydium, "launchToken");
const initializeTarget = params.targetAmm === undefined ? undefined : assertActiveTargetAmm(params.targetAmm, "initializeSoul");
throw new Error("Only Raydium target_amm is active");`,
  );
  await writeFile(
    join(repoRoot, "app/.env.example"),
    `NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID=${ACTIVE_PROGRAM_IDS.bondingCurve}\nNEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID=${ACTIVE_PROGRAM_IDS.soulGenerator}\n`,
  );
  await writeFile(
    join(repoRoot, "services/indexer/src/main.ts"),
    `"${ACTIVE_PROGRAM_IDS.bondingCurve}"; "${ACTIVE_PROGRAM_IDS.soulGenerator}";`,
  );
  await writeFile(
    join(repoRoot, "app/src/components/AmmSelector.tsx"),
    `const AMM_OPTIONS = [{ id: "raydium", value: TARGET_AMM.Raydium }];`,
  );
  await writeFile(
    join(repoRoot, "app/src/components/LaunchForm.tsx"),
    `const targetAmm = ACTIVE_LAUNCH_TARGET_AMM;`,
  );
  await mkdir(join(repoRoot, "app/src/lib"), { recursive: true });
  await writeFile(
    join(repoRoot, "app/src/lib/launchSubmit.ts"),
    `import { TARGET_AMM } from "sdk";
export const ACTIVE_LAUNCH_TARGET_AMM = TARGET_AMM.Raydium;
throw new Error("Only Raydium target_amm is active");`,
  );
  await writeFile(
    join(repoRoot, "scripts/devnet-amm-e2e.ts"),
    `throw new Error("Active devnet AMM execution is Raydium-only; may only be used with --schema-check or --verify-trace");`,
  );
  await writeFile(
    join(repoRoot, "scripts/local-pumpswap-e2e.ts"),
    `if (process.env.SOLSOUL_ENABLE_DEFERRED_PUMPSWAP_RESEARCH !== "1") throw new Error("active AMM scope is Raydium-only");`,
  );

  return repoRoot;
}

function deferredRaydiumScope() {
  return {
    activeAmm: "raydium",
    deferredAmmTargets: {
      meteora: "deferred/historical; not required for active validation",
      pumpSwap: "deferred/historical; not required for active validation",
    },
  };
}

function deploymentEvidence(artifactName: string, programId: string) {
  return {
    programId,
    artifact: `target/deploy/${artifactName}`,
    programSoSha256: "a".repeat(64),
    deployTxSig: "deploy-signature",
    deploySlot: 459_269_179,
    sourceProvenance: {
      scope: "PD13.F1 fresh program deployment source tree only",
    },
  };
}

function statsPrecheckBody() {
  return {
    ok: true,
    route: "/api/stats",
    status: "ready",
    bounded: true,
    gracefulPartialFallback: true,
    source: {
      commitment: "confirmed",
      deployment: {
        bondingCurveProgramId: ACTIVE_PROGRAM_IDS.bondingCurve,
        soulGeneratorProgramId: ACTIVE_PROGRAM_IDS.soulGenerator,
      },
    },
  };
}

function statsBody() {
  return {
    ok: true,
    metrics: {
      launchedTokens: "1",
    },
    source: {
      commitment: "confirmed",
      bounded: true,
      deployment: {
        bondingCurveProgramId: ACTIVE_PROGRAM_IDS.bondingCurve,
        soulGeneratorProgramId: ACTIVE_PROGRAM_IDS.soulGenerator,
      },
    },
  };
}

function jsonResponse(body: unknown, { status = 200 } = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function textResponse(body: string, { status = 200 } = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html",
    },
  });
}

async function writeJson(path: string, body: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`);
}
