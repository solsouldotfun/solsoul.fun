#!/usr/bin/env tsx
import { Connection, PublicKey } from "@solana/web3.js";
import {
  probeToken2022OutsideLiquidityCapability,
  redactedRpcCapabilityJson,
  requiredToken2022OutsideLiquidityFilters,
  type RpcCapabilityConnection,
} from "../app/src/lib/rpcCapability";
import { redactedEndpointLabel } from "../app/src/lib/rpc";

const DEFAULT_FIXTURE_MINT = new PublicKey("So11111111111111111111111111111111111111112");

type FixtureName = "triton-secondary-index" | "indexed" | "empty-bounded";

async function main() {
  const fixture = valueAfter("--fixture") as FixtureName | undefined;
  const endpoint = valueAfter("--rpc") ?? process.env.SOLSOUL_RPC_CAPABILITY_RPC;
  const mint = new PublicKey(
    valueAfter("--mint") ?? process.env.SOLSOUL_RPC_CAPABILITY_MINT ?? DEFAULT_FIXTURE_MINT.toBase58(),
  );

  if (fixture) {
    const capability = await probeToken2022OutsideLiquidityCapability({
      connection: fixtureConnection(fixture, mint),
      endpoint:
        fixture === "triton-secondary-index"
          ? "https://triton-devnet.example.com/redacted-path-fixture?redacted=redacted-query-fixture"
          : "https://api.devnet.solana.com",
      mint,
      excludedVaults: [PublicKey.default.toBase58()],
    });
    console.log(
      redactedRpcCapabilityJson({
        fixture,
        endpointLabel: capability.endpointLabel,
        classification: capability.classification,
        indexedGpaSupported: capability.indexedGpaSupported,
        programLabel: capability.programLabel,
        requestedFilters: capability.requestedFilters,
        warningCodes: capability.warningCodes,
        boundedAudit: capability.boundedAudit,
      }),
    );
    return;
  }

  if (!endpoint) {
    throw new Error(
      "Usage: pnpm exec tsx scripts/rpc-capability.ts --fixture triton-secondary-index|indexed|empty-bounded OR --rpc <url> --mint <token-mint>",
    );
  }

  const connection = new Connection(endpoint, "confirmed");
  const capability = await probeToken2022OutsideLiquidityCapability({
    connection: connection as unknown as RpcCapabilityConnection,
    endpoint,
    mint,
  });
  console.log(
    redactedRpcCapabilityJson({
      endpointLabel: redactedEndpointLabel(endpoint),
      classification: capability.classification,
      indexedGpaSupported: capability.indexedGpaSupported,
      programLabel: capability.programLabel,
      requestedFilters: requiredToken2022OutsideLiquidityFilters(mint),
      warningCodes: capability.warningCodes,
      boundedAudit: capability.boundedAudit,
      failureReason: capability.failureReason,
    }),
  );
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fixtureConnection(fixture: FixtureName, mint: PublicKey): RpcCapabilityConnection {
  if (fixture === "indexed") {
    return {
      async getParsedProgramAccounts() {
        return [];
      },
    };
  }

  return {
    async getParsedProgramAccounts() {
      throw new Error(
        fixture === "triton-secondary-index"
          ? "Token-2022 excluded from account secondary indexes"
          : "Token-2022 indexed GPA unavailable",
      );
    },
    async getTokenSupply() {
      return { value: { amount: "100000000" } };
    },
    async getTokenLargestAccounts() {
      return {
        value:
          fixture === "empty-bounded"
            ? []
            : [{ address: PublicKey.findProgramAddressSync([Buffer.from("fixture"), mint.toBuffer()], mint)[0], amount: "2500000" }],
      };
    },
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
