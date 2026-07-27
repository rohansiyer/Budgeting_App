/**
 * Migration framework tests (Team 1): fresh install, idempotency, version-gap
 * detection, and legacy REAL-dollars → INTEGER-cents string conversion.
 */
import { openDatabaseSync } from 'expo-sqlite';
import { initDatabase, getRawDb, resetDatabaseForTests } from '../client';
import { SqliteMigrationRunner, MIGRATIONS, type RawSqlDb } from '../migrations';
import { migration001 } from '../migrations/migration_001';
import { migration002 } from '../migrations/migration_002';
import type { Migration } from '../migrations';

describe('MigrationRunner', () => {
  beforeEach(() => resetDatabaseForTests());

  it('brings a fresh install to the latest version', async () => {
    await initDatabase();
    const runner = new SqliteMigrationRunner(getRawDb() as unknown as RawSqlDb, MIGRATIONS);
    expect(await runner.currentVersion()).toBe(MIGRATIONS.length);
  });

  it('is idempotent (second migrate applies nothing)', async () => {
    await initDatabase();
    const runner = new SqliteMigrationRunner(getRawDb() as unknown as RawSqlDb, MIGRATIONS);
    const result = await runner.migrateToLatest();
    expect(result.applied).toEqual([]); // already at latest from initDatabase
    expect(result.currentVersion).toBe(MIGRATIONS.length);
  });

  it('records the applied version in schema_version', async () => {
    await initDatabase();
    const raw = getRawDb() as unknown as RawSqlDb;
    const row = raw.getFirstSync<{ v: number }>('SELECT MAX(version) AS v FROM schema_version');
    expect(row?.v).toBe(MIGRATIONS.length);
  });

  it('rejects a version gap', async () => {
    await initDatabase();
    resetDatabaseForTests();
    const raw = openDatabaseSync('gap') as unknown as RawSqlDb;
    const gapMigration: Migration = { version: 3, name: 'gap', up: () => {} };
    const runner = new SqliteMigrationRunner(raw, [migration001, gapMigration]);
    await expect(runner.migrateToLatest()).rejects.toThrow(/gap/i);
  });
});

describe('Migration 1 legacy conversion', () => {
  it('converts REAL dollars → INTEGER cents via string conversion and maps kinds', async () => {
    const raw = openDatabaseSync('legacy') as unknown as RawSqlDb & {
      getFirstSync: <T>(sql: string) => T | null;
    };

    // Stand up a v1-shaped install.
    raw.execSync(
      `CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, starting_balance REAL, starting_date TEXT, created_at TEXT, updated_at TEXT)`,
    );
    raw.execSync(
      `INSERT INTO accounts VALUES ('a1','PNC','checking',810.63,'2026-01-01','t','t'),('a2','DCU','savings',-3.5,'2026-01-01','t','t')`,
    );
    raw.execSync(
      `CREATE TABLE transactions (id TEXT PRIMARY KEY, amount REAL, type TEXT, category_id TEXT, account_id TEXT, date TEXT, timestamp TEXT, note TEXT, to_account_id TEXT, created_at TEXT, updated_at TEXT)`,
    );
    raw.execSync(
      `INSERT INTO transactions VALUES ('t1',12.85,'expense','c','a1','2026-01-02','ts',NULL,NULL,'t','t'),('t2',100.00,'transfer',NULL,'a1','2026-01-03','ts',NULL,'a2','t','t')`,
    );
    raw.execSync(`CREATE TABLE settings (id TEXT PRIMARY KEY, theme TEXT)`);

    const runner = new SqliteMigrationRunner(raw, [migration001]);
    await runner.migrateToLatest();

    // A default chapter now owns the migrated rows.
    const chap = raw.getFirstSync<{ id: string }>(`SELECT id FROM chapters LIMIT 1`);
    expect(chap?.id).toBe('chapter_default');

    // Accounts: string conversion (810.63 → 81063; -3.5 → -350) + kind mapping.
    const a1 = raw.getFirstSync<{ sb: number; kind: string; chapter_id: string }>(
      `SELECT starting_balance sb, kind, chapter_id FROM accounts WHERE id='a1'`,
    );
    expect(a1?.sb).toBe(81063);
    expect(a1?.kind).toBe('spending');
    expect(a1?.chapter_id).toBe('chapter_default');
    const a2 = raw.getFirstSync<{ sb: number; kind: string }>(
      `SELECT starting_balance sb, kind FROM accounts WHERE id='a2'`,
    );
    expect(a2?.sb).toBe(-350);
    expect(a2?.kind).toBe('savings');

    // Expense converted; transfer becomes a transfer_out + generated transfer_in leg.
    const t1 = raw.getFirstSync<{ amount: number; kind: string }>(
      `SELECT amount, kind FROM transactions WHERE id='t1'`,
    );
    expect(t1?.amount).toBe(1285);
    expect(t1?.kind).toBe('expense');
    const out = raw.getFirstSync<{ amount: number; kind: string }>(
      `SELECT amount, kind FROM transactions WHERE id='t2'`,
    );
    expect(out?.amount).toBe(10000);
    expect(out?.kind).toBe('transfer_out');
    const tin = raw.getFirstSync<{ amount: number; kind: string; account_id: string }>(
      `SELECT amount, kind, account_id FROM transactions WHERE id='t2_in'`,
    );
    expect(tin?.amount).toBe(10000);
    expect(tin?.kind).toBe('transfer_in');
    expect(tin?.account_id).toBe('a2');

    // Legacy tables are gone.
    const legacy = raw.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('legacy_accounts','income_configs','recurring_statuses')`,
    );
    expect(legacy?.n).toBe(0);
  });
});

describe('Migration 2 — category cadence column', () => {
  type Raw = RawSqlDb & { getAllSync: <T>(sql: string) => T[] };

  it('a fresh install has the cadence column defaulting to weekly', async () => {
    await initDatabase();
    const raw = getRawDb() as unknown as Raw;
    const cols = raw.getAllSync<{ name: string; notnull: number; dflt_value: string | null }>(
      `PRAGMA table_info(categories)`,
    );
    const cadence = cols.find((c) => c.name === 'cadence');
    expect(cadence).toBeDefined();
    expect(cadence!.notnull).toBe(1);
    // Insert without cadence → the column default applies.
    raw.execSync(
      `INSERT INTO categories (id, chapter_id, name, color_key, fixed, created_at)
       VALUES ('c1','ch','Food','amber',0,'t')`,
    );
    const row = raw.getFirstSync<{ cadence: string }>(`SELECT cadence FROM categories WHERE id='c1'`);
    expect(row?.cadence).toBe('weekly');
  });

  it('backfills weekly onto rows created before v2', async () => {
    // Stand up a DB at version 1 only, then upgrade to v2.
    const raw = openDatabaseSync('cadence-legacy') as unknown as Raw & {
      getFirstSync: <T>(sql: string) => T | null;
    };
    await new SqliteMigrationRunner(raw, [migration001]).migrateToLatest();
    // A v1 categories row has no cadence column yet.
    raw.execSync(
      `INSERT INTO categories (id, chapter_id, name, color_key, fixed, created_at)
       VALUES ('legacy-cat','ch','Rent','violet',1,'t')`,
    );
    const beforeCols = raw.getAllSync<{ name: string }>(`PRAGMA table_info(categories)`);
    expect(beforeCols.some((c) => c.name === 'cadence')).toBe(false);

    await new SqliteMigrationRunner(raw, [migration001, migration002]).migrateToLatest();

    const row = raw.getFirstSync<{ cadence: string }>(
      `SELECT cadence FROM categories WHERE id='legacy-cat'`,
    );
    expect(row?.cadence).toBe('weekly'); // pre-existing row backfilled
  });
});
