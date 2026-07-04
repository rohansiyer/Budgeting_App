/**
 * TEAM 1 ADVERSARY (Opus) — attacks on Migration 1's legacy dollars → cents
 * string-conversion path and the runner's idempotency / gap detection.
 *
 * The migration MUST convert via a STRING path (printf('%.2f') → strip '.'),
 * never a float multiply (`amount * 100`), so that values whose ×100 product is
 * a hair under an integer (e.g. 810.63×100 = 81062.9999… in float) round to the
 * correct cent instead of truncating down.
 */
import { openDatabaseSync } from 'expo-sqlite';
import { SqliteMigrationRunner, MIGRATIONS, type RawSqlDb } from '../migrations';
import { migration001 } from '../migrations/migration_001';
import type { Migration } from '../migrations';

type Raw = RawSqlDb & { getFirstSync: <T>(sql: string) => T | null; getAllSync: <T>(sql: string) => T[] };

function legacyDb(): Raw {
  return openDatabaseSync('adv-legacy') as unknown as Raw;
}

describe('Migration 1 — adversarial dollar→cent conversion', () => {
  it('converts every adversarial REAL value to exact cents with no float-multiply drift', async () => {
    const raw = legacyDb();
    raw.execSync(
      `CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, starting_balance REAL, starting_date TEXT, created_at TEXT)`,
    );
    // 810.63 → 81063 (float ×100 = 81062.9999… would truncate to 81062 — the trap).
    // 0.1    → 10   (single-tenth)
    // 1234.005 → 123401 (rounds the half-cent up via printf %.2f)
    // 99999999.99 → 9999999999 (large, still a safe integer)
    // -3.5   → -350 (negative)
    // NULL   → 0   (COALESCE)
    raw.execSync(
      `INSERT INTO accounts VALUES
        ('a_810','PNC','checking',810.63,'2026-01-01','t'),
        ('a_01','X','checking',0.1,'2026-01-01','t'),
        ('a_half','Y','checking',1234.005,'2026-01-01','t'),
        ('a_big','Z','savings',99999999.99,'2026-01-01','t'),
        ('a_neg','W','savings',-3.5,'2026-01-01','t'),
        ('a_null','N','checking',NULL,'2026-01-01','t')`,
    );
    raw.execSync(
      `CREATE TABLE transactions (id TEXT PRIMARY KEY, amount REAL, type TEXT, category_id TEXT, account_id TEXT, date TEXT, note TEXT, to_account_id TEXT, created_at TEXT)`,
    );
    raw.execSync(
      `INSERT INTO transactions VALUES
        ('t_810',810.63,'expense',NULL,'a_810','2026-01-02',NULL,NULL,'t'),
        ('t_half',1234.005,'expense',NULL,'a_810','2026-01-02',NULL,NULL,'t'),
        ('t_xfer',100.00,'transfer',NULL,'a_810','2026-01-03',NULL,'a_big','t')`,
    );
    raw.execSync(`CREATE TABLE settings (id TEXT PRIMARY KEY, theme TEXT)`);

    await new SqliteMigrationRunner(raw, [migration001]).migrateToLatest();

    const bal = (id: string): number =>
      raw.getFirstSync<{ b: number }>(`SELECT starting_balance b FROM accounts WHERE id='${id}'`)!.b;

    expect(bal('a_810')).toBe(81063); // NOT 81062 — proves the string path, not ×100 truncation
    expect(bal('a_01')).toBe(10);
    expect(bal('a_half')).toBe(123401);
    expect(bal('a_big')).toBe(9999999999);
    expect(bal('a_neg')).toBe(-350);
    expect(bal('a_null')).toBe(0);

    // All converted values are exact integers (no fractional residue).
    const nonInt = raw.getAllSync<{ id: string }>(
      `SELECT id FROM accounts WHERE starting_balance <> CAST(starting_balance AS INTEGER)`,
    );
    expect(nonInt).toHaveLength(0);

    const txn = (id: string): number =>
      raw.getFirstSync<{ a: number }>(`SELECT amount a FROM transactions WHERE id='${id}'`)!.a;
    expect(txn('t_810')).toBe(81063);
    expect(txn('t_half')).toBe(123401);
    // Transfer split into two legs, both exact cents.
    expect(txn('t_xfer')).toBe(10000);
    expect(txn('t_xfer_in')).toBe(10000);
    const tin = raw.getFirstSync<{ acc: string; kind: string }>(
      `SELECT account_id acc, kind FROM transactions WHERE id='t_xfer_in'`,
    )!;
    expect(tin.acc).toBe('a_big');
    expect(tin.kind).toBe('transfer_in');
  });

  it('is idempotent: a second migrateToLatest does not double-convert or re-run', async () => {
    const raw = legacyDb();
    raw.execSync(
      `CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, starting_balance REAL, starting_date TEXT, created_at TEXT)`,
    );
    raw.execSync(`INSERT INTO accounts VALUES ('a1','PNC','checking',810.63,'2026-01-01','t')`);

    const runner = new SqliteMigrationRunner(raw, [migration001]);
    const first = await runner.migrateToLatest();
    expect(first.applied).toEqual([1]);
    const second = await runner.migrateToLatest();
    expect(second.applied).toEqual([]); // nothing re-applied
    expect(second.currentVersion).toBe(1);
    // Value converted exactly once (81063, not re-string-converted into garbage).
    const b = raw.getFirstSync<{ b: number }>(`SELECT starting_balance b FROM accounts WHERE id='a1'`)!.b;
    expect(b).toBe(81063);
    // schema_version has exactly one row.
    const n = raw.getFirstSync<{ n: number }>(`SELECT COUNT(*) n FROM schema_version`)!.n;
    expect(n).toBe(1);
  });

  it('fresh install (no legacy tables) converts zero rows and creates no default chapter', async () => {
    const raw = legacyDb();
    await new SqliteMigrationRunner(raw, [migration001]).migrateToLatest();
    const chapters = raw.getFirstSync<{ n: number }>(`SELECT COUNT(*) n FROM chapters`)!.n;
    expect(chapters).toBe(0); // default chapter only created when legacy accounts exist
    const accounts = raw.getFirstSync<{ n: number }>(`SELECT COUNT(*) n FROM accounts`)!.n;
    expect(accounts).toBe(0);
    // Every money column is INTEGER affinity.
    const cols = raw.getAllSync<{ name: string; type: string }>(`PRAGMA table_info(accounts)`);
    expect(cols.find((c) => c.name === 'starting_balance')!.type).toBe('INTEGER');
  });

  it('rejects a version gap (missing v2 between v1 and v3)', async () => {
    const raw = legacyDb();
    const gap: Migration = { version: 3, name: 'gap', up: () => {} };
    await expect(
      new SqliteMigrationRunner(raw, [migration001, gap]).migrateToLatest(),
    ).rejects.toThrow(/gap/i);
  });

  it('a throwing migration rolls back and leaves currentVersion unchanged', async () => {
    const raw = legacyDb();
    const boom: Migration = {
      version: 2, name: 'boom',
      up: (exec) => {
        exec(`CREATE TABLE will_be_rolled_back (x TEXT)`);
        throw new Error('kaboom');
      },
    };
    const runner = new SqliteMigrationRunner(raw, [migration001, boom]);
    await expect(runner.migrateToLatest()).rejects.toThrow(/boom|kaboom/i);
    // v1 applied and committed; v2 rolled back.
    expect(await runner.currentVersion()).toBe(1);
    const leftover = raw.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) n FROM sqlite_master WHERE name='will_be_rolled_back'`,
    )!.n;
    expect(leftover).toBe(0);
  });

  it('MIGRATIONS registry is contiguous from 1 and reaches latest on a fresh DB', async () => {
    const raw = legacyDb();
    const res = await new SqliteMigrationRunner(raw, MIGRATIONS).migrateToLatest();
    expect(res.currentVersion).toBe(MIGRATIONS.length);
    MIGRATIONS.forEach((m, i) => expect(m.version).toBe(i + 1));
  });
});
