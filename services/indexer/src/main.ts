import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Connection, PublicKey, type KeyedAccountInfo } from "@solana/web3.js";
import {
  decodeReceiptAccount,
  parseEventLog,
  RECEIPT_ACCOUNT_SIZE,
  type ReceiptLifecycleState,
} from "./events.js";
import { EventStore, type GenerationQuery, type ReceiptQuery, type TokenQuery } from "./db.js";

export const BONDING_CURVE_ACCOUNT_SIZE = 57;

export interface DecodedTokenAccount {
  mint: string;
  curve: string;
  cumulativeSol: bigint;
  totalMinted: bigint;
  selfDeprecated: boolean;
  lastInteractionSlot: bigint;
}

export function decodeBondingCurveAccount(
  address: string,
  data: Uint8Array,
): DecodedTokenAccount {
  if (data.byteLength < BONDING_CURVE_ACCOUNT_SIZE) {
    throw new Error(
      `BondingCurveAccount data too small: expected ${BONDING_CURVE_ACCOUNT_SIZE}, got ${data.byteLength}`,
    );
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const selfDeprecated = data[48];
  if (selfDeprecated !== 0 && selfDeprecated !== 1) {
    throw new Error(`Invalid selfDeprecated flag: ${selfDeprecated}`);
  }
  return {
    mint: new PublicKey(data.slice(0, 32)).toBase58(),
    curve: address,
    cumulativeSol: view.getBigUint64(32, true),
    totalMinted: view.getBigUint64(40, true),
    selfDeprecated: selfDeprecated === 1,
    lastInteractionSlot: view.getBigUint64(49, true),
  };
}

export const DEFAULT_BONDING_CURVE_PROGRAM_ID =
  "CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un";
export const DEFAULT_SOUL_GENERATOR_PROGRAM_ID =
  "34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ";

export interface ProgramIdConfig {
  bondingCurve: string;
  soulGenerator: string;
  programIds: readonly string[];
}

export function resolveProgramIdConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProgramIdConfig {
  const bondingCurve = readProgramId(
    env,
    "BONDING_CURVE_PROGRAM_ID",
    DEFAULT_BONDING_CURVE_PROGRAM_ID,
  );
  const soulGenerator = readProgramId(
    env,
    "SOUL_GENERATOR_PROGRAM_ID",
    DEFAULT_SOUL_GENERATOR_PROGRAM_ID,
  );

  return {
    bondingCurve,
    soulGenerator,
    programIds: [bondingCurve, soulGenerator],
  };
}

export function programIdStartupLines(config: ProgramIdConfig): string[] {
  return [
    `[indexer] config BONDING_CURVE_PROGRAM_ID=${config.bondingCurve}`,
    `[indexer] config SOUL_GENERATOR_PROGRAM_ID=${config.soulGenerator}`,
  ];
}

interface CliOptions {
  rpc: string;
  durationSec: number;
  dbPath: string;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    rpc: process.env.RPC_URL,
    durationSec: 30,
    dbPath: resolve(process.cwd(), "data/indexer.sqlite"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--rpc") {
      options.rpc = requireValue(argv, (index += 1), arg);
    } else if (arg === "--duration-sec") {
      options.durationSec = Number(requireValue(argv, (index += 1), arg));
    } else if (arg === "--db") {
      options.dbPath = resolve(requireValue(argv, (index += 1), arg));
    } else if (arg === "--help" || arg === "-h") {
      throw new Error(usage());
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  if (!options.rpc) {
    throw new Error(`Missing required --rpc <url>\n${usage()}`);
  }
  const durationSec = options.durationSec;
  if (durationSec === undefined || !Number.isFinite(durationSec) || durationSec < 0) {
    throw new Error("--duration-sec must be a non-negative number");
  }

  return options as CliOptions;
}

export async function runIndexer(options: CliOptions): Promise<number> {
  const connection = new Connection(options.rpc, "finalized");
  const programIdConfig = resolveProgramIdConfig();
  for (const line of programIdStartupLines(programIdConfig)) {
    console.log(line);
  }
  const store = await EventStore.open(options.dbPath);
  const logListenerIds: number[] = [];
  const receiptListenerIds: number[] = [];
  const pendingNotifications = new Set<Promise<number>>();
  let inserted = 0;
  let receiptRows = 0;
  let tokenRows = 0;
  const healthServer = await startHealthServer(process.env.PORT, store, () => ({
    inserted,
    generationRows: store.generationCount(),
    receiptRows: store.receiptCount(),
    tokenRows: store.tokenCount(),
    subscriptions: logListenerIds.length + receiptListenerIds.length,
  }));

  try {
    const startupReceiptSlot = await connection.getSlot("finalized").catch(() => 0);
    receiptRows = await indexReceiptAccounts({
      connection,
      store,
      programId: programIdConfig.soulGenerator,
      slot: startupReceiptSlot,
      indexedAt: Math.floor(Date.now() / 1000),
    });
    if (receiptRows > 0) {
      console.log(`[indexer] receipt snapshot rows=${receiptRows}`);
    }
    const startupTokenSlot = await connection.getSlot("finalized").catch(() => 0);
    tokenRows = await indexTokenAccounts({
      connection,
      store,
      programId: programIdConfig.bondingCurve,
      slot: startupTokenSlot,
      indexedAt: Math.floor(Date.now() / 1000),
    });
    if (tokenRows > 0) {
      console.log(`[indexer] token snapshot rows=${tokenRows}`);
    }
    const tokenListenerId = subscribeTokenAccountChanges({
      connection,
      store,
      programId: programIdConfig.bondingCurve,
      pendingNotifications,
      onError: (error, keyedAccountInfo) => {
        console.error(
          `[indexer] failed to index token account=${keyedAccountInfo.accountId.toBase58()}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
    });
    receiptListenerIds.push(tokenListenerId);
    console.log(
      `[indexer] subscribe ok program=${programIdConfig.bondingCurve} accounts=token`,
    );
    const receiptListenerId = subscribeReceiptAccountChanges({
      connection,
      store,
      programId: programIdConfig.soulGenerator,
      pendingNotifications,
      onError: (error, keyedAccountInfo) => {
        console.error(
          `[indexer] failed to index receipt account=${keyedAccountInfo.accountId.toBase58()}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
    });
    receiptListenerIds.push(receiptListenerId);
    console.log(
      `[indexer] subscribe ok program=${programIdConfig.soulGenerator} accounts=receipt`,
    );
    for (const programId of programIdConfig.programIds) {
      const id = connection.onLogs(
        new PublicKey(programId),
        (notification, context) => {
          const pending = indexLogNotification({
            notification,
            slot: context.slot,
            store,
            loadBlockTime: (slot) => connection.getBlockTime(slot),
          })
            .then((insertedEvents) => {
              inserted += insertedEvents;
              return insertedEvents;
            })
            .catch((error: unknown) => {
              console.error(
                `[indexer] failed to index logs signature=${notification.signature}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
              return 0;
            })
            .finally(() => pendingNotifications.delete(pending));
          pendingNotifications.add(pending);
        },
        "finalized",
      );
      logListenerIds.push(id);
      console.log(`[indexer] subscribe ok program=${programId}`);
    }

    await waitForStop(options.durationSec);
    await Promise.allSettled(pendingNotifications);
    await store.flush();
    return inserted;
  } finally {
    await Promise.allSettled(pendingNotifications);
    await Promise.allSettled(
      logListenerIds.map((id) => connection.removeOnLogsListener(id)),
    );
    await Promise.allSettled(
      receiptListenerIds.map((id) => connection.removeProgramAccountChangeListener(id)),
    );
    await closeServer(healthServer);
    await store.flush();
    store.close();
  }
}

export async function indexReceiptAccounts({
  connection,
  store,
  programId,
  slot = 0,
  indexedAt = Math.floor(Date.now() / 1000),
}: {
  connection: Pick<Connection, "getProgramAccounts">;
  store: Pick<EventStore, "upsertReceipt">;
  programId: string;
  slot?: number;
  indexedAt?: number;
}): Promise<number> {
  const accounts = await connection.getProgramAccounts(new PublicKey(programId), {
    commitment: "finalized",
    filters: [{ dataSize: RECEIPT_ACCOUNT_SIZE }],
  });
  let inserted = 0;
  for (const account of accounts) {
    try {
      const receipt = decodeReceiptAccount(account.account.data);
      if (
        store.upsertReceipt({
          receipt: account.pubkey.toBase58(),
          ...receipt,
          slot,
          indexedAt,
        })
      ) {
        inserted += 1;
      }
    } catch {
      // Ignore malformed same-size accounts; the receipt decoder is the classifier.
    }
  }
  return inserted;
}

export function subscribeReceiptAccountChanges({
  connection,
  store,
  programId,
  pendingNotifications = new Set<Promise<number>>(),
  indexedAt = () => Math.floor(Date.now() / 1000),
  onError = () => {},
}: {
  connection: Pick<Connection, "onProgramAccountChange">;
  store: Pick<EventStore, "upsertReceipt">;
  programId: string;
  pendingNotifications?: Set<Promise<number>>;
  indexedAt?: () => number;
  onError?: (error: unknown, keyedAccountInfo: KeyedAccountInfo) => void;
}): number {
  return connection.onProgramAccountChange(
    new PublicKey(programId),
    (keyedAccountInfo, context) => {
      let pending!: Promise<number>;
      pending = Promise.resolve()
        .then(() =>
          indexReceiptAccountChange({
            keyedAccountInfo,
            slot: context.slot,
            store,
            indexedAt: indexedAt(),
          }),
        )
        .catch((error: unknown) => {
          onError(error, keyedAccountInfo);
          return 0;
        })
        .finally(() => pendingNotifications.delete(pending));
      pendingNotifications.add(pending);
    },
    {
      commitment: "finalized",
      filters: [{ dataSize: RECEIPT_ACCOUNT_SIZE }],
    },
  );
}

export function indexReceiptAccountChange({
  keyedAccountInfo,
  slot,
  store,
  indexedAt = Math.floor(Date.now() / 1000),
}: {
  keyedAccountInfo: Pick<KeyedAccountInfo, "accountId" | "accountInfo">;
  slot: number;
  store: Pick<EventStore, "upsertReceipt">;
  indexedAt?: number;
}): number {
  try {
    const receipt = decodeReceiptAccount(keyedAccountInfo.accountInfo.data);
    return store.upsertReceipt({
      receipt: keyedAccountInfo.accountId.toBase58(),
      ...receipt,
      slot,
      indexedAt,
    })
      ? 1
      : 0;
  } catch {
    // Ignore malformed same-size accounts consistently with startup snapshots.
    return 0;
  }
}

interface LogNotification {
  err: unknown;
  logs: readonly string[];
  signature: string;
}

export async function indexLogNotification({
  notification,
  slot,
  store,
  loadBlockTime,
  indexedAt = Math.floor(Date.now() / 1000),
}: {
  notification: LogNotification;
  slot: number;
  store: EventStore;
  loadBlockTime: (slot: number) => Promise<number | null>;
  indexedAt?: number;
}): Promise<number> {
  if (notification.err) {
    return 0;
  }

  const events = notification.logs.map(parseEventLog).filter((event) => event !== null);
  if (events.length === 0) {
    return 0;
  }

  const blockTime = await loadBlockTime(slot).catch(() => null);
  let insertedEvents = 0;
  for (const event of events) {
    const result = store.insert({
      ...event,
      slot,
      txSig: notification.signature,
      blockTime,
      indexedAt,
    });
    if (result.eventInserted) {
      insertedEvents += 1;
    }
  }
  return insertedEvents;
}

export async function indexTokenAccounts({
  connection,
  store,
  programId,
  slot = 0,
  indexedAt = Math.floor(Date.now() / 1000),
}: {
  connection: Pick<Connection, "getProgramAccounts">;
  store: Pick<EventStore, "upsertToken">;
  programId: string;
  slot?: number;
  indexedAt?: number;
}): Promise<number> {
  const accounts = await connection.getProgramAccounts(new PublicKey(programId), {
    commitment: "finalized",
    filters: [{ dataSize: BONDING_CURVE_ACCOUNT_SIZE }],
  });
  let inserted = 0;
  for (const account of accounts) {
    try {
      const token = decodeBondingCurveAccount(account.pubkey.toBase58(), account.account.data);
      if (
        store.upsertToken({
          mint: token.mint,
          curve: token.curve,
          cumulativeSol: token.cumulativeSol.toString(),
          totalMinted: token.totalMinted.toString(),
          selfDeprecated: token.selfDeprecated,
          lastInteractionSlot: Number(token.lastInteractionSlot),
          slot,
          indexedAt,
        })
      ) {
        inserted += 1;
      }
    } catch {
      // Ignore malformed same-size accounts.
    }
  }
  return inserted;
}

export function subscribeTokenAccountChanges({
  connection,
  store,
  programId,
  pendingNotifications = new Set<Promise<number>>(),
  indexedAt = () => Math.floor(Date.now() / 1000),
  onError = () => {},
}: {
  connection: Pick<Connection, "onProgramAccountChange">;
  store: Pick<EventStore, "upsertToken">;
  programId: string;
  pendingNotifications?: Set<Promise<number>>;
  indexedAt?: () => number;
  onError?: (error: unknown, keyedAccountInfo: KeyedAccountInfo) => void;
}): number {
  return connection.onProgramAccountChange(
    new PublicKey(programId),
    (keyedAccountInfo, context) => {
      let pending!: Promise<number>;
      pending = Promise.resolve()
        .then(() =>
          indexTokenAccountChange({
            keyedAccountInfo,
            slot: context.slot,
            store,
            indexedAt: indexedAt(),
          }),
        )
        .catch((error: unknown) => {
          onError(error, keyedAccountInfo);
          return 0;
        })
        .finally(() => pendingNotifications.delete(pending));
      pendingNotifications.add(pending);
    },
    {
      commitment: "finalized",
      filters: [{ dataSize: BONDING_CURVE_ACCOUNT_SIZE }],
    },
  );
}

export function indexTokenAccountChange({
  keyedAccountInfo,
  slot,
  store,
  indexedAt = Math.floor(Date.now() / 1000),
}: {
  keyedAccountInfo: Pick<KeyedAccountInfo, "accountId" | "accountInfo">;
  slot: number;
  store: Pick<EventStore, "upsertToken">;
  indexedAt?: number;
}): number {
  try {
    const token = decodeBondingCurveAccount(
      keyedAccountInfo.accountId.toBase58(),
      keyedAccountInfo.accountInfo.data,
    );
    return store.upsertToken({
      mint: token.mint,
      curve: token.curve,
      cumulativeSol: token.cumulativeSol.toString(),
      totalMinted: token.totalMinted.toString(),
      selfDeprecated: token.selfDeprecated,
      lastInteractionSlot: Number(token.lastInteractionSlot),
      slot,
      indexedAt,
    })
      ? 1
      : 0;
  } catch {
    return 0;
  }
}

interface HealthSnapshot {
  inserted: number;
  generationRows: number;
  receiptRows: number;
  tokenRows: number;
  subscriptions: number;
}

async function startHealthServer(
  portValue: string | undefined,
  store: EventStore,
  snapshot: () => HealthSnapshot,
): Promise<Server | undefined> {
  if (!portValue) {
    return undefined;
  }
  const port = Number(portValue);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT: ${portValue}`);
  }

  const server = createServer((request, response) => {
    if (request.url !== "/" && request.url !== "/health") {
      const apiResponse = generationApiResponse(request, store);
      const receiptResponse =
        apiResponse ?? receiptLifecycleCountsApiResponse(request, store) ?? receiptApiResponse(request, store);
      const tokenResponse = tokenApiResponse(request, store);
      const resolved = receiptResponse ?? tokenResponse;
      if (resolved) {
        writeJson(response, resolved.status, resolved.body);
      } else {
        writeJson(response, 404, { ok: false, error: "not_found" });
      }
      return;
    }

    writeJson(response, 200, {
      ok: true,
      service: "solsoul-indexer",
      ...snapshot(),
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, () => {
      server.off("error", rejectListen);
      console.log(`[indexer] listening on :${port}`);
      resolveListen();
    });
  });

  return server;
}

export function receiptLifecycleCountsApiResponse(
  request: Pick<IncomingMessage, "method" | "url" | "headers">,
  store: Pick<EventStore, "listReceiptLifecycleCounts">,
): { status: number; body: unknown } | null {
  if (request.method && request.method !== "GET") {
    return null;
  }
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    !(parts.length === 1 && ["receipt-counts", "receipt-lifecycle-counts"].includes(parts[0] ?? ""))
  ) {
    return null;
  }
  return {
    status: 200,
    body: {
      ok: true,
      source: {
        receipts: "receipt_binding_state",
        burnedReceiptsIncludes: ["burned", "forfeited"],
      },
      receiptCounts: store.listReceiptLifecycleCounts(),
    },
  };
}

export function receiptApiResponse(
  request: Pick<IncomingMessage, "method" | "url" | "headers">,
  store: Pick<EventStore, "listReceipts">,
): { status: number; body: unknown } | null {
  if (request.method && request.method !== "GET") {
    return null;
  }
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  let query: ReceiptQuery | null;
  try {
    query = receiptQueryForUrl(url);
  } catch (error: unknown) {
    return {
      status: 400,
      body: {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
  if (!query) {
    return null;
  }
  return {
    status: 200,
    body: {
      ok: true,
      receipts: store.listReceipts(query),
    },
  };
}

export function generationApiResponse(
  request: Pick<IncomingMessage, "method" | "url" | "headers">,
  store: Pick<EventStore, "listGenerations">,
): { status: number; body: unknown } | null {
  if (request.method && request.method !== "GET") {
    return null;
  }
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  let query: GenerationQuery | null;
  try {
    query = generationQueryForUrl(url);
  } catch (error: unknown) {
    return {
      status: 400,
      body: {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
  if (!query) {
    return null;
  }

  const generations = store.listGenerations(query);
  return {
    status: 200,
    body: {
      ok: true,
      generations,
    },
  };
}

function generationQueryForUrl(url: URL): GenerationQuery | null {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 1 && parts[0] === "generations") {
    const mint = url.searchParams.get("mint") ?? url.searchParams.get("token") ?? undefined;
    const soul = url.searchParams.get("soul") ?? undefined;
    const generation = numberSearchParam(url.searchParams.get("generation"));
    return { mint, soul, generation };
  }

  if (parts.length >= 3 && parts[0] === "tokens" && parts[2] === "generations") {
    return {
      mint: parts[1],
      generation: parts[3] ? numberPathSegment(parts[3]) : undefined,
    };
  }

  if (parts.length >= 3 && parts[0] === "souls" && parts[2] === "generations") {
    return {
      soul: parts[1],
      generation: parts[3] ? numberPathSegment(parts[3]) : undefined,
    };
  }

  return null;
}

export function tokenApiResponse(
  request: Pick<IncomingMessage, "method" | "url" | "headers">,
  store: Pick<EventStore, "listTokens">,
): { status: number; body: unknown } | null {
  if (request.method && request.method !== "GET") {
    return null;
  }
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const parts = url.pathname.split("/").filter(Boolean);
  if (!(parts.length === 1 && parts[0] === "tokens")) {
    return null;
  }
  const mint = url.searchParams.get("mint") ?? undefined;
  const activeOnly = url.searchParams.get("active") === "true";
  const limit = numberSearchParam(url.searchParams.get("limit")) ?? 100;
  const tokens = store.listTokens({ mint, activeOnly, limit });
  return {
    status: 200,
    body: {
      ok: true,
      tokens,
    },
  };
}

function receiptQueryForUrl(url: URL): ReceiptQuery | null {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 1 && parts[0] === "receipts") {
    const tokenMint = url.searchParams.get("mint") ?? url.searchParams.get("token") ?? undefined;
    const claimant = url.searchParams.get("claimant") ?? undefined;
    const lifecycleState = receiptLifecycleSearchParam(url.searchParams.get("state"));
    const activeOnly = url.searchParams.get("active") === "true";
    return { tokenMint, claimant, lifecycleState, activeOnly };
  }

  if (parts.length >= 3 && parts[0] === "tokens" && parts[2] === "receipts") {
    return {
      tokenMint: parts[1],
      lifecycleState: receiptLifecycleSearchParam(url.searchParams.get("state")),
      activeOnly: url.searchParams.get("active") === "true",
    };
  }

  return null;
}

function receiptLifecycleSearchParam(value: string | null): ReceiptLifecycleState | undefined {
  if (value === null || value === "") {
    return undefined;
  }
  if (value === "active" || value === "burned" || value === "forfeited") {
    return value;
  }
  throw new Error(`Invalid receipt lifecycle state: ${value}`);
}

function numberSearchParam(value: string | null): number | undefined {
  return value === null ? undefined : numberPathSegment(value);
}

function numberPathSegment(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid generation number: ${value}`);
  }
  return parsed;
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) {
    return;
  }
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
      } else {
        resolveClose();
      }
    });
  });
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function readProgramId(
  env: NodeJS.ProcessEnv,
  key: "BONDING_CURVE_PROGRAM_ID" | "SOUL_GENERATOR_PROGRAM_ID",
  fallback: string,
): string {
  const rawValue = env[key];
  const candidate = rawValue?.trim() || fallback;

  try {
    const publicKey = new PublicKey(candidate);
    if (publicKey.toBase58() !== candidate) {
      throw new Error("non-canonical");
    }
    return candidate;
  } catch {
    throw new Error(`Invalid Solana pubkey for ${key}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function waitForStop(durationSec: number): Promise<void> {
  if (durationSec > 0) {
    return sleep(durationSec * 1000);
  }

  return new Promise((resolveStop) => {
    const stop = () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolveStop();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

function usage(): string {
  return "Usage: pnpm exec tsx services/indexer/src/main.ts --rpc <url> --duration-sec <n> [--db data/indexer.sqlite]";
}

const isEntrypoint = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isEntrypoint) {
  runIndexer(parseArgs(process.argv.slice(2)))
    .then((inserted) => {
      console.log(`[indexer] indexed ${inserted} events`);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
