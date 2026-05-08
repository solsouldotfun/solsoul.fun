import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import initSqlJs, { type Database } from "sql.js";
import {
  parseGenerationEventPayload,
  type DecodedReceiptAccount,
  type ParsedEvent,
  type ReceiptLifecycleState,
} from "./events.js";

const require = createRequire(import.meta.url);

export interface IndexedEvent extends ParsedEvent {
  slot: number;
  txSig: string;
  blockTime?: number | null;
  indexedAt: number;
}

export interface GenerationRow {
  mint: string;
  soul: string;
  generation: number;
  side: "buy" | "sell";
  amount: string;
  trader: string;
  tokenAccount: string;
  seedHash: string;
  signature: string;
  slot: number;
  blockTime: number | null;
  indexedAt: number;
}

export interface GenerationQuery {
  mint?: string;
  soul?: string;
  generation?: number;
  limit?: number;
}

export interface ReceiptRow extends DecodedReceiptAccount {
  receipt: string;
  slot: number;
  indexedAt: number;
}

export interface ReceiptLifecycleCountRow {
  tokenMint: string;
  active: string;
  burned: string;
  forfeited: string;
  inactive: string;
  burnedAggregate: string;
}

export interface ReceiptQuery {
  tokenMint?: string;
  claimant?: string;
  lifecycleState?: ReceiptLifecycleState;
  activeOnly?: boolean;
  limit?: number;
}

export interface TokenRow {
  mint: string;
  curve: string;
  cumulativeSol: string;
  totalMinted: string;
  selfDeprecated: boolean;
  lastInteractionSlot: number;
  slot: number;
  indexedAt: number;
}

export interface TokenQuery {
  mint?: string;
  activeOnly?: boolean;
  limit?: number;
}

export class EventStore {
  private constructor(
    private readonly db: Database,
    private readonly path: string,
  ) {}

  static async open(path: string): Promise<EventStore> {
    const sqlJsDir = dirname(require.resolve("sql.js"));
    const SQL = await initSqlJs({
      locateFile: (file) => join(sqlJsDir, file),
    });
    const existing = await readFile(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    });
    const db = existing ? new SQL.Database(existing) : new SQL.Database();
    const store = new EventStore(db, path);
    await store.initialize();
    return store;
  }

  insert(event: IndexedEvent): { eventInserted: boolean; generationInserted: boolean } {
    const eventInserted = this.insertEvent(event);
    const generationInserted = this.insertGeneration(event);
    return { eventInserted, generationInserted };
  }

  listGenerations(query: GenerationQuery = {}): GenerationRow[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (query.mint) {
      clauses.push("mint = ?");
      params.push(query.mint);
    }
    if (query.soul) {
      clauses.push("soul = ?");
      params.push(query.soul);
    }
    if (query.generation !== undefined) {
      clauses.push("generation = ?");
      params.push(query.generation);
    }

    const limit = query.limit ?? 100;
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = execWithParams(
      this.db,
      `SELECT mint, soul, generation, side, amount, trader, token_account, seed_hash, signature, slot, block_time, indexed_at
       FROM generation_rows
       ${where}
       ORDER BY slot ASC, generation ASC
       LIMIT ?`,
      [...params, Math.max(1, Math.min(limit, 500))],
    );

    return (rows[0]?.values ?? []).map((row) => ({
      mint: stringValue(row[0]),
      soul: stringValue(row[1]),
      generation: numberValue(row[2]),
      side: sideValue(row[3]),
      amount: stringValue(row[4]),
      trader: stringValue(row[5]),
      tokenAccount: stringValue(row[6]),
      seedHash: stringValue(row[7]),
      signature: stringValue(row[8]),
      slot: numberValue(row[9]),
      blockTime: row[10] == null ? null : numberValue(row[10]),
      indexedAt: numberValue(row[11]),
    }));
  }

  getGeneration(query: Required<Pick<GenerationQuery, "mint" | "soul" | "generation">>): GenerationRow | null {
    return this.listGenerations({ ...query, limit: 1 })[0] ?? null;
  }

  upsertReceipt(row: ReceiptRow): boolean {
    this.db.run(
      `INSERT INTO receipt_rows (
        receipt, soul, claimant, token_mint, nft_mint, sequence, generation_count,
        bound_quantity, bound_boundary, lifecycle_state, slot, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(receipt) DO UPDATE SET
        soul = excluded.soul,
        claimant = excluded.claimant,
        token_mint = excluded.token_mint,
        nft_mint = excluded.nft_mint,
        sequence = excluded.sequence,
        generation_count = excluded.generation_count,
        bound_quantity = excluded.bound_quantity,
        bound_boundary = excluded.bound_boundary,
        lifecycle_state = excluded.lifecycle_state,
        slot = excluded.slot,
        indexed_at = excluded.indexed_at
      WHERE excluded.slot >= receipt_rows.slot`,
      [
        row.receipt,
        row.soul,
        row.claimant,
        row.tokenMint,
        row.nftMint,
        row.sequence,
        row.generationCount,
        row.boundQuantity,
        row.boundBoundary,
        row.lifecycleState,
        row.slot,
        row.indexedAt,
      ],
    );
    return rowsModified(this.db) > 0;
  }

  listReceipts(query: ReceiptQuery = {}): ReceiptRow[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (query.tokenMint) {
      clauses.push("token_mint = ?");
      params.push(query.tokenMint);
    }
    if (query.claimant) {
      clauses.push("claimant = ?");
      params.push(query.claimant);
    }
    if (query.activeOnly) {
      clauses.push("lifecycle_state = 'active'");
    } else if (query.lifecycleState) {
      clauses.push("lifecycle_state = ?");
      params.push(query.lifecycleState);
    }

    const limit = query.limit ?? 100;
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = execWithParams(
      this.db,
      `SELECT receipt, soul, claimant, token_mint, nft_mint, sequence, generation_count,
              bound_quantity, bound_boundary, lifecycle_state, slot, indexed_at
       FROM receipt_rows
       ${where}
       ORDER BY slot ASC, receipt ASC
       LIMIT ?`,
      [...params, Math.max(1, Math.min(limit, 500))],
    );

    return (rows[0]?.values ?? []).map((row) => ({
      receipt: stringValue(row[0]),
      soul: stringValue(row[1]),
      claimant: stringValue(row[2]),
      tokenMint: stringValue(row[3]),
      nftMint: stringValue(row[4]),
      sequence: stringValue(row[5]),
      generationCount: stringValue(row[6]),
      boundQuantity: stringValue(row[7]),
      boundBoundary: stringValue(row[8]),
      lifecycleState: receiptLifecycleValue(row[9]),
      slot: numberValue(row[10]),
      indexedAt: numberValue(row[11]),
    }));
  }

  listReceiptLifecycleCounts(): ReceiptLifecycleCountRow[] {
    const rows = this.db.exec(
      `SELECT token_mint,
              SUM(CASE WHEN lifecycle_state = 'active' THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN lifecycle_state = 'burned' THEN 1 ELSE 0 END) AS burned,
              SUM(CASE WHEN lifecycle_state = 'forfeited' THEN 1 ELSE 0 END) AS forfeited
       FROM receipt_rows
       GROUP BY token_mint
       ORDER BY token_mint ASC`,
    );

    return (rows[0]?.values ?? []).map((row) => {
      const active = numberValue(row[1]);
      const burned = numberValue(row[2]);
      const forfeited = numberValue(row[3]);
      const inactive = burned + forfeited;
      return {
        tokenMint: stringValue(row[0]),
        active: active.toString(),
        burned: burned.toString(),
        forfeited: forfeited.toString(),
        inactive: inactive.toString(),
        burnedAggregate: inactive.toString(),
      };
    });
  }

  generationCount(): number {
    const rows = this.db.exec("SELECT COUNT(*) AS count FROM generation_rows");
    return Number(rows[0]?.values[0]?.[0] ?? 0);
  }

  receiptCount(): number {
    const rows = this.db.exec("SELECT COUNT(*) AS count FROM receipt_rows");
    return Number(rows[0]?.values[0]?.[0] ?? 0);
  }

  upsertToken(row: TokenRow): boolean {
    this.db.run(
      `INSERT INTO token_rows (
        mint, curve, cumulative_sol, total_minted, self_deprecated,
        last_interaction_slot, slot, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(mint) DO UPDATE SET
        curve = excluded.curve,
        cumulative_sol = excluded.cumulative_sol,
        total_minted = excluded.total_minted,
        self_deprecated = excluded.self_deprecated,
        last_interaction_slot = excluded.last_interaction_slot,
        slot = excluded.slot,
        indexed_at = excluded.indexed_at
      WHERE excluded.slot >= token_rows.slot`,
      [
        row.mint,
        row.curve,
        row.cumulativeSol,
        row.totalMinted,
        row.selfDeprecated ? 1 : 0,
        row.lastInteractionSlot,
        row.slot,
        row.indexedAt,
      ],
    );
    return rowsModified(this.db) > 0;
  }

  listTokens(query: TokenQuery = {}): TokenRow[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (query.mint) {
      clauses.push("mint = ?");
      params.push(query.mint);
    }
    if (query.activeOnly) {
      clauses.push("self_deprecated = 0");
    }

    const limit = query.limit ?? 100;
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = execWithParams(
      this.db,
      `SELECT mint, curve, cumulative_sol, total_minted, self_deprecated,
              last_interaction_slot, slot, indexed_at
       FROM token_rows
       ${where}
       ORDER BY slot DESC, mint ASC
       LIMIT ?`,
      [...params, Math.max(1, Math.min(limit, 500))],
    );

    return (rows[0]?.values ?? []).map((row) => ({
      mint: stringValue(row[0]),
      curve: stringValue(row[1]),
      cumulativeSol: stringValue(row[2]),
      totalMinted: stringValue(row[3]),
      selfDeprecated: Boolean(row[4]),
      lastInteractionSlot: numberValue(row[5]),
      slot: numberValue(row[6]),
      indexedAt: numberValue(row[7]),
    }));
  }

  tokenCount(): number {
    const rows = this.db.exec("SELECT COUNT(*) AS count FROM token_rows");
    return Number(rows[0]?.values[0]?.[0] ?? 0);
  }

  private insertEvent(event: IndexedEvent): boolean {
    this.db.run(
      "INSERT OR IGNORE INTO events (type, slot, tx_sig, payload, block_time, indexed_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        event.type,
        event.slot,
        event.txSig,
        JSON.stringify(event.payload),
        event.blockTime ?? null,
        event.indexedAt,
      ],
    );
    return rowsModified(this.db) > 0;
  }

  private insertGeneration(event: IndexedEvent): boolean {
    const generation = parseGenerationEventPayload(event);
    if (!generation) {
      return false;
    }

    this.db.run(
      `INSERT OR IGNORE INTO generation_rows (
        mint, soul, generation, side, amount, trader, token_account, seed_hash,
        signature, slot, block_time, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        generation.mint,
        generation.soul,
        generation.generation,
        generation.side,
        generation.amount,
        generation.trader,
        generation.tokenAccount,
        generation.seedHash,
        event.txSig,
        event.slot,
        event.blockTime ?? null,
        event.indexedAt,
      ],
    );
    const inserted = rowsModified(this.db) > 0;
    if (!inserted && event.blockTime != null) {
      this.db.run(
        `UPDATE generation_rows
         SET block_time = COALESCE(block_time, ?),
             indexed_at = MIN(indexed_at, ?)
         WHERE mint = ? AND soul = ? AND generation = ?`,
        [
          event.blockTime,
          event.indexedAt,
          generation.mint,
          generation.soul,
          generation.generation,
        ],
      );
    }
    return inserted;
  }

  count(): number {
    const rows = this.db.exec("SELECT COUNT(*) AS count FROM events");
    return Number(rows[0]?.values[0]?.[0] ?? 0);
  }

  async flush(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, this.db.export());
  }

  close(): void {
    this.db.close();
  }

  private async initialize(): Promise<void> {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY,
        type TEXT NOT NULL,
        slot INTEGER NOT NULL,
        tx_sig TEXT NOT NULL,
        payload TEXT NOT NULL,
        block_time INTEGER,
        indexed_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_events_unique
        ON events(type, slot, tx_sig, payload);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_slot ON events(slot);
      CREATE TABLE IF NOT EXISTS generation_rows (
        mint TEXT NOT NULL,
        soul TEXT NOT NULL,
        generation INTEGER NOT NULL,
        side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
        amount TEXT NOT NULL,
        trader TEXT NOT NULL,
        token_account TEXT NOT NULL,
        seed_hash TEXT NOT NULL,
        signature TEXT NOT NULL,
        slot INTEGER NOT NULL,
        block_time INTEGER,
        indexed_at INTEGER NOT NULL,
        PRIMARY KEY (mint, soul, generation)
      );
      CREATE INDEX IF NOT EXISTS idx_generation_rows_mint_slot
        ON generation_rows(mint, slot);
      CREATE INDEX IF NOT EXISTS idx_generation_rows_soul_generation
        ON generation_rows(soul, generation);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_rows_signature_generation
        ON generation_rows(signature, mint, soul, generation);
      CREATE TABLE IF NOT EXISTS receipt_rows (
        receipt TEXT PRIMARY KEY,
        soul TEXT NOT NULL,
        claimant TEXT NOT NULL,
        token_mint TEXT NOT NULL,
        nft_mint TEXT NOT NULL,
        sequence TEXT NOT NULL,
        generation_count TEXT NOT NULL,
        bound_quantity TEXT NOT NULL,
        bound_boundary TEXT NOT NULL,
        lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('active', 'burned', 'forfeited')),
        slot INTEGER NOT NULL,
        indexed_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_receipt_rows_token_state
        ON receipt_rows(token_mint, lifecycle_state);
      CREATE INDEX IF NOT EXISTS idx_receipt_rows_claimant_state
        ON receipt_rows(claimant, lifecycle_state);
      CREATE TABLE IF NOT EXISTS token_rows (
        mint TEXT PRIMARY KEY,
        curve TEXT NOT NULL,
        cumulative_sol TEXT NOT NULL,
        total_minted TEXT NOT NULL,
        self_deprecated INTEGER NOT NULL DEFAULT 0,
        last_interaction_slot INTEGER NOT NULL,
        slot INTEGER NOT NULL,
        indexed_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_token_rows_slot ON token_rows(slot);
      CREATE INDEX IF NOT EXISTS idx_token_rows_deprecated ON token_rows(self_deprecated);
    `);
    this.addColumnIfMissing("events", "block_time", "INTEGER");
    await this.flush();
  }

  private addColumnIfMissing(table: string, column: string, type: string): void {
    try {
      this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch (error: unknown) {
      if (
        !(error instanceof Error) ||
        !error.message.toLowerCase().includes("duplicate column name")
      ) {
        throw error;
      }
    }
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function numberValue(value: unknown): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`Invalid integer in generation row: ${String(value)}`);
  }
  return number;
}

function sideValue(value: unknown): "buy" | "sell" {
  if (value === "buy" || value === "sell") {
    return value;
  }
  throw new Error(`Invalid generation side in database: ${String(value)}`);
}

function receiptLifecycleValue(value: unknown): ReceiptLifecycleState {
  if (value === "active" || value === "burned" || value === "forfeited") {
    return value;
  }
  throw new Error(`Invalid receipt lifecycle state in database: ${String(value)}`);
}

function execWithParams(
  db: Database,
  sql: string,
  params: Array<string | number>,
): ReturnType<Database["exec"]> {
  return (
    db as unknown as {
      exec(statement: string, params: Array<string | number>): ReturnType<Database["exec"]>;
    }
  ).exec(sql, params);
}

function rowsModified(db: Database): number {
  return (db as unknown as { getRowsModified(): number }).getRowsModified();
}
