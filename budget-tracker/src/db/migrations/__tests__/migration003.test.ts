/**
 * Migration 3 — import data layer. Verifies the additive upgrade from the
 * previous version (2) onto an existing DB and the fresh-install path.
 */
import { openDatabaseSync } from 'expo-sqlite';
import { SqliteMigrationRunner, MIGRATIONS, type RawSqlDb } from '../index';
import { migration001 } from '../migration_001';
import { migration002 } from '../migration_002';
import { migration003 } from '../migration_003';

type Raw = RawSqlDb & {
  getFirstSync: <T>(sql: string) => T | null;
  getAllSync: <T>(sql: string) => T[];
};

describe('migration 3 (import data layer)', () => {
  it('is registered at version 3 in the runner sequence', () => {
    expect(MIGRATIONS.some((m) => m.version === 3)).toBe(true);
    // Versions must stay contiguous from 1 so the runner never skips.
    MIGRATIONS.forEach((m, i) => expect(m.version).toBe(i + 1));
  });

  it('upgrades a v2 database additively to v3', async () => {
    const raw = openDatabaseSync('mig3-upgrade') as unknown as Raw;
    // Stand up at version 2 only.
    await new SqliteMigrationRunner(raw, [migration001, migration002]).migrateToLatest();
    // Pre-existing data survives (no rebuild).
    raw.execSync(
      `INSERT INTO categories (id, chapter_id, name, color_key, fixed, created_at)
       VALUES ('c1','ch','Food','amber',0,'t')`,
    );
    const before = raw.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='merchant_corrections'`,
    );
    expect(before?.n).toBe(0);

    await new SqliteMigrationRunner(
      raw,
      [migration001, migration002, migration003],
    ).migrateToLatest();

    // Both new tables now exist.
    const mc = raw.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='merchant_corrections'`,
    );
    const rb = raw.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='recurring_bills'`,
    );
    expect(mc?.n).toBe(1);
    expect(rb?.n).toBe(1);
    // Old row is untouched.
    const cat = raw.getFirstSync<{ name: string }>(`SELECT name FROM categories WHERE id='c1'`);
    expect(cat?.name).toBe('Food');
  });

  it('enforces the unique (chapter, normalized_merchant) index', async () => {
    const raw = openDatabaseSync('mig3-unique') as unknown as Raw;
    await new SqliteMigrationRunner(raw, MIGRATIONS).migrateToLatest();
    raw.execSync(
      `INSERT INTO merchant_corrections (id, chapter_id, normalized_merchant, category_id, created_at)
       VALUES ('m1','ch','TRADER JOES','food','t')`,
    );
    expect(() =>
      raw.execSync(
        `INSERT INTO merchant_corrections (id, chapter_id, normalized_merchant, category_id, created_at)
         VALUES ('m2','ch','TRADER JOES','transit','t')`,
      ),
    ).toThrow();
  });
});
