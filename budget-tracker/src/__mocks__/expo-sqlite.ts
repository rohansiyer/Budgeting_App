/**
 * Test mock for `expo-sqlite` backed by Node's built-in `node:sqlite`.
 *
 * The production drizzle expo-sqlite driver drives the connection through a
 * SYNCHRONOUS statement API (`prepareSync` → `executeSync`/
 * `executeForRawResultSync`). This mock implements exactly that surface (plus
 * the `execSync`/`getFirstSync` convenience methods the migration runner uses)
 * on top of a real in-memory SQLite engine, so db + store suites exercise
 * genuine SQL, transactions, and constraints — not stubs.
 *
 * Each `openDatabaseSync` call returns a fresh in-memory database; combined
 * with `resetDatabaseForTests()` in the client this isolates every suite.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => NodeSqliteDb;
};

interface NodeSqliteStatement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(...params: unknown[]): Array<Record<string, unknown>>;
  get(...params: unknown[]): Record<string, unknown> | undefined;
}
interface NodeSqliteDb {
  exec(sql: string): void;
  prepare(sql: string): NodeSqliteStatement;
  close(): void;
}

type Params = unknown[];

/** drizzle calls executeSync(paramsArray); also support variadic just in case. */
function normalizeParams(args: unknown[]): Params {
  const raw = args.length === 1 && Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
  // node:sqlite rejects `undefined`; SQLite NULL is the intended meaning.
  return raw.map((p) => (p === undefined ? null : p));
}

function toNumber(v: number | bigint): number {
  return typeof v === 'bigint' ? Number(v) : v;
}

class ExecuteResult implements Iterable<Record<string, unknown>> {
  readonly lastInsertRowId: number;
  readonly changes: number;
  private readonly rows: Array<Record<string, unknown>>;
  private readonly raw: boolean;

  constructor(
    rows: Array<Record<string, unknown>>,
    changes: number,
    lastInsertRowId: number,
    raw: boolean,
  ) {
    this.rows = rows;
    this.changes = changes;
    this.lastInsertRowId = lastInsertRowId;
    this.raw = raw;
  }

  private shape(): Array<Record<string, unknown> | unknown[]> {
    return this.raw ? this.rows.map((r) => Object.values(r)) : this.rows;
  }

  getAllSync(): Array<Record<string, unknown> | unknown[]> {
    return this.shape();
  }

  getFirstSync(): Record<string, unknown> | unknown[] | null {
    const shaped = this.shape();
    return shaped.length > 0 ? shaped[0] : null;
  }

  [Symbol.iterator](): Iterator<Record<string, unknown>> {
    return (this.raw ? (this.shape() as Record<string, unknown>[]) : this.rows)[Symbol.iterator]();
  }
}

class MockStatement {
  constructor(
    private readonly db: NodeSqliteDb,
    private readonly stmt: NodeSqliteStatement,
  ) {}

  private exec(args: unknown[], raw: boolean): ExecuteResult {
    const params = normalizeParams(args);
    // `.all` executes reads AND writes; for writes it returns []. Change counts
    // come from SQLite's session functions afterwards.
    const rows = this.stmt.all(...params);
    const meta = this.db
      .prepare('SELECT changes() AS c, last_insert_rowid() AS r')
      .get() as { c: number | bigint; r: number | bigint };
    return new ExecuteResult(rows, toNumber(meta.c), toNumber(meta.r), raw);
  }

  executeSync(...args: unknown[]): ExecuteResult {
    return this.exec(args, false);
  }

  executeForRawResultSync(...args: unknown[]): ExecuteResult {
    return this.exec(args, true);
  }

  finalizeSync(): void {
    /* node:sqlite statements are GC-managed; nothing to release. */
  }
}

class MockDatabase {
  private readonly db: NodeSqliteDb;

  constructor() {
    this.db = new DatabaseSync(':memory:');
  }

  execSync(sql: string): void {
    this.db.exec(sql);
  }

  runSync(sql: string, ...params: unknown[]): { changes: number; lastInsertRowId: number } {
    const res = this.db.prepare(sql).run(...normalizeParams(params));
    return { changes: toNumber(res.changes), lastInsertRowId: toNumber(res.lastInsertRowid) };
  }

  getFirstSync<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | null {
    const row = this.db.prepare(sql).get(...normalizeParams(params));
    return (row ?? null) as T | null;
  }

  getAllSync<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...normalizeParams(params)) as T[];
  }

  prepareSync(sql: string): MockStatement {
    return new MockStatement(this.db, this.db.prepare(sql));
  }

  closeSync(): void {
    this.db.close();
  }
}

export const openDatabaseSync = (_name: string): MockDatabase => new MockDatabase();
