import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import { MINT_SIZE, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

import {
  createToken,
  fetchSoul,
  findMintWithNoBumpPdas,
  initializeSoulIx,
  PROGRAM_IDS,
  buy,
} from "../sdk/src/index.ts";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const RPC_URL = "http://127.0.0.1:8899";
const VALIDATOR_TIMEOUT_MS = 60_000;
const PAYER_AIRDROP_LAMPORTS = 5 * LAMPORTS_PER_SOL;
const BUY_LAMPORTS = 100_000_000n;

interface AccountDumpOptions {
  pubkey: PublicKey;
  owner: PublicKey | string;
  lamports: number;
  dataLength: number;
}

async function main(): Promise<void> {
  console.log("[sdk] building SBF programs");
  run("cargo", ["build-sbf", "--workspace"]);

  const bondingSo = join(ROOT, "target/deploy/bonding_curve.so");
  const soulSo = join(ROOT, "target/deploy/soul_generator.so");
  assertExists(bondingSo);
  assertExists(soulSo);

  const launch = findMintWithNoBumpPdas();
  const workDir = mkdtempSync(join(tmpdir(), "solsoul-e2e-"));
  const ledgerDir = join(workDir, "ledger");
  const accountDir = join(workDir, "accounts");
  mkdirSync(accountDir, { recursive: true });

  const mintDump = join(accountDir, "mint.json");
  writeAccountDump(mintDump, {
    pubkey: launch.mint,
    owner: TOKEN_2022_PROGRAM_ID,
    lamports: 1_000_000_000,
    dataLength: MINT_SIZE,
  });

  const validator = startValidator({
    ledgerDir,
    bondingSo,
    soulSo,
    mintDump,
  });
  let connection: Connection | undefined;

  try {
    connection = new Connection(RPC_URL, "confirmed");
    await waitForValidator(connection, validator);
    console.log("[sdk] local validator ready");

    const payer = Keypair.generate();
    const airdropSignature = await connection.requestAirdrop(
      payer.publicKey,
      PAYER_AIRDROP_LAMPORTS,
    );
    await confirm(connection, airdropSignature);
    console.log(`[sdk] airdropped ${PAYER_AIRDROP_LAMPORTS} lamports to ${payer.publicKey}`);

    const createSignature = await createToken({
      connection,
      payer,
      mint: launch.mint,
      feeRecipient: payer.publicKey,
    });
    console.log(`[sdk] createToken signature ${createSignature}`);

    const initializeTx = new Transaction().add(
      initializeSoulIx({
        mint: launch.mint,
        authority: payer.publicKey,
        createdAt: BigInt(Math.floor(Date.now() / 1_000)),
      }),
    );
    const initializeSignature = await sendAndConfirmTransaction(
      connection,
      initializeTx,
      [payer],
      { commitment: "confirmed" },
    );
    console.log(`[sdk] initializeSoul signature ${initializeSignature}`);

    const buySignature = await buy({
      connection,
      payer,
      mint: launch.mint,
      solIn: BUY_LAMPORTS,
      minAmountOut: 1n,
    });
    console.log(`[sdk] buy signature ${buySignature}`);

    const soul = await fetchSoul(connection, launch.mint);
    if (!soul.lastSvg.startsWith("<svg")) {
      throw new Error("Fetched SoulAccount SVG does not start with '<svg'");
    }

    const outDir = join(ROOT, "out");
    mkdirSync(outDir, { recursive: true });
    const svgPath = join(outDir, "skeleton.svg");
    writeFileSync(svgPath, soul.lastSvg);
    console.log(
      `[sdk] wrote ${svgPath} (${soul.lastSvg.length} bytes, generation_count=${soul.generationCount})`,
    );
  } finally {
    closeConnection(connection);
    await stopValidator(validator);
    rmSync(workDir, { recursive: true, force: true });
  }
}

function run(command: string, args: string[]): void {
  const env = {
    ...process.env,
    PATH: `${join(homedir(), ".cargo/bin")}:${process.env.PATH ?? ""}`,
  };
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

function startValidator(paths: {
  ledgerDir: string;
  bondingSo: string;
  soulSo: string;
  mintDump: string;
}): ChildProcessWithoutNullStreams {
  const args = [
    "--reset",
    "--quiet",
    "--ledger",
    paths.ledgerDir,
    "--rpc-port",
    "8899",
    "--bpf-program",
    PROGRAM_IDS.bondingCurve,
    paths.bondingSo,
    "--bpf-program",
    PROGRAM_IDS.soulGenerator,
    paths.soulSo,
    "--account",
    launchAddressPlaceholder(paths.mintDump),
    paths.mintDump,
  ];

  console.log(
    `[sdk] starting solana-test-validator with programs ${PROGRAM_IDS.bondingCurve}, ${PROGRAM_IDS.soulGenerator}`,
  );
  const child = spawn("solana-test-validator", args, {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk: Buffer) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
  return child;
}

async function waitForValidator(
  connection: Connection,
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < VALIDATOR_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(`solana-test-validator exited early with code ${child.exitCode}`);
    }
    try {
      await connection.getVersion();
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error("Timed out waiting for solana-test-validator RPC");
}

async function confirm(connection: Connection, signature: string): Promise<void> {
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

async function stopValidator(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolveStop) => child.once("exit", () => resolveStop())),
    sleep(5_000).then(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
  console.log("[sdk] stopped solana-test-validator");
}

function writeAccountDump(filePath: string, options: AccountDumpOptions): void {
  const owner = options.owner instanceof PublicKey ? options.owner.toBase58() : options.owner;
  const data = Buffer.alloc(options.dataLength).toString("base64");
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        pubkey: options.pubkey.toBase58(),
        account: {
          lamports: options.lamports,
          data: [data, "base64"],
          owner,
          executable: false,
          rentEpoch: 0,
        },
      },
      null,
      2,
    ),
  );
}

function assertExists(path: string): void {
  if (!existsSync(path)) {
    throw new Error(`Required file does not exist: ${path}`);
  }
}

function launchAddressPlaceholder(_filePath: string): string {
  return "-";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function closeConnection(connection: Connection | undefined): void {
  const rpcWebSocket = (
    connection as
      | (Connection & {
          _rpcWebSocket?: { close: () => void; removeAllListeners?: () => void };
        })
      | undefined
  )?._rpcWebSocket;
  rpcWebSocket?.removeAllListeners?.();
  rpcWebSocket?.close();
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("[sdk] e2e-localnet failed");
    console.error(error);
    process.exit(1);
  });
