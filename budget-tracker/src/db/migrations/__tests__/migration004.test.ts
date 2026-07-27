/**
 * Migration 4 — named goals. Upgrade-from-v3 path plus store-level goal
 * validation and progress reads (completing the D5 coverage the projection
 * suite exercises only through its happy paths).
 */
import { openDatabaseSync } from 'expo-sqlite';
import { SqliteMigrationRunner, MIGRATIONS, type RawSqlDb } from '../index';
import { migration001 } from '../migration_001';
import { migration002 } from '../migration_002';
import { migration003 } from '../migration_003';
import { useBudgetStore } from '../../../store';
import { initDatabase, resetDatabaseForTests } from '../../client';
import { cents } from '../../../lib/money';

type Raw = RawSqlDb & {
  getFirstSync: <T>(sql: string) => T | null;
  getAllSync: <T>(sql: string) => T[];
};

const store = () => useBudgetStore.getState();

describe('migration 4 (named goals)', () => {
  it('is registered at version 4 and versions stay contiguous', () => {
    expect(MIGRATIONS.some((m) => m.version === 4)).toBe(true);
    MIGRATIONS.forEach((m, i) => expect(m.version).toBe(i + 1));
  });

  it('upgrades a v3 database additively: goals table appears, existing data survives', async () => {
    const raw = openDatabaseSync('mig4-upgrade') as unknown as Raw;
    await new SqliteMigrationRunner(raw, [migration001, migration002, migration003]).migrateToLatest();
    raw.execSync(
      `INSERT INTO categories (id, chapter_id, name, color_key, fixed, cadence, created_at)
       VALUES ('c1','ch','Food','amber',0,'weekly','t')`,
    );
    await new SqliteMigrationRunner(raw, MIGRATIONS).migrateToLatest();

    const cols = raw.getAllSync<{ name: string }>(`PRAGMA table_info(goals)`).map((c) => c.name);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'chapter_id', 'name', 'target_cents', 'savings_account_id', 'active', 'created_at', 'achieved_at',
      ]),
    );
    const kept = raw.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM categories`);
    expect(kept?.n).toBe(1);
  });
});

describe('store goals (validation + progress)', () => {
  beforeEach(async () => {
    resetDatabaseForTests();
    await initDatabase();
    await store().init();
    await store().createChapter({ name: 'Test', startedAt: '2026-01-01' });
  });

  async function savingsAccount(name: string, startingBalance: number) {
    return store().createAccount({
      name,
      institution: null,
      kind: 'savings',
      startingBalance: cents(startingBalance),
      openedOn: '2025-12-01',
    });
  }

  it('rejects empty names, non-positive targets, and non-savings links', async () => {
    const spending = await store().createAccount({
      name: 'Checking', institution: null, kind: 'spending',
      startingBalance: cents(0), openedOn: '2025-12-01',
    });
    await expect(store().addGoal({ name: '  ', targetCents: cents(1000), savingsAccountId: null }))
      .rejects.toThrow(/name/);
    await expect(store().addGoal({ name: 'Place', targetCents: cents(0), savingsAccountId: null }))
      .rejects.toThrow(/target/);
    await expect(store().addGoal({ name: 'Place', targetCents: cents(1000), savingsAccountId: spending.id }))
      .rejects.toThrow(/savings/);
    await expect(store().updateGoal('phantom', { name: 'X' })).rejects.toThrow(/unknown goal/);
  });

  it('goalProgress: linked goal reads that account; unlinked sums all savings accounts', async () => {
    const a = await savingsAccount('Emergency', 20000);
    await savingsAccount('Travel', 5000);
    const linked = await store().addGoal({
      name: 'Emergency fund', targetCents: cents(100000), savingsAccountId: a.id,
    });
    const overall = await store().addGoal({
      name: 'My own place', targetCents: cents(120000), savingsAccountId: null,
    });
    expect(store().goalProgress(linked.id).currentCents).toBe(cents(20000));
    expect(store().goalProgress(overall.id).currentCents).toBe(cents(25000));
    expect(store().goalProgress(overall.id).targetCents).toBe(cents(120000));
  });

  it('updateGoal active:false removes non-destructively (row hidden, not deleted)', async () => {
    await savingsAccount('Emergency', 1000);
    const g = await store().addGoal({ name: 'Place', targetCents: cents(1000), savingsAccountId: null });
    expect(store().getGoals().map((x) => x.id)).toContain(g.id);
    await store().updateGoal(g.id, { active: false });
    expect(store().getGoals().map((x) => x.id)).not.toContain(g.id);
  });
});
