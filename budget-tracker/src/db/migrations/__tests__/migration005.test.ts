/**
 * Migration 5 — entity archival. Upgrade-from-v4 path: the nullable
 * `archived_at` column appears on accounts, categories, and income_sources,
 * existing rows survive and backfill NULL (active), and the store's archival
 * mutations (removeAccount/removeCategory/removeIncomeSource) enforce their
 * documented guards on a real in-memory database.
 */
import { openDatabaseSync } from 'expo-sqlite';
import { SqliteMigrationRunner, MIGRATIONS, type RawSqlDb } from '../index';
import { migration001 } from '../migration_001';
import { migration002 } from '../migration_002';
import { migration003 } from '../migration_003';
import { migration004 } from '../migration_004';
import { useBudgetStore } from '../../../store';
import { initDatabase, resetDatabaseForTests } from '../../client';
import { cents } from '../../../lib/money';

type Raw = RawSqlDb & {
  getFirstSync: <T>(sql: string) => T | null;
  getAllSync: <T>(sql: string) => T[];
};

const store = () => useBudgetStore.getState();

describe('migration 5 (entity archival)', () => {
  it('is registered at version 5 and versions stay contiguous', () => {
    expect(MIGRATIONS.some((m) => m.version === 5)).toBe(true);
    MIGRATIONS.forEach((m, i) => expect(m.version).toBe(i + 1));
  });

  it('upgrades a v4 database additively: archived_at appears on the three tables, data survives + backfills NULL', async () => {
    const raw = openDatabaseSync('mig5-upgrade') as unknown as Raw;
    await new SqliteMigrationRunner(raw, [
      migration001,
      migration002,
      migration003,
      migration004,
    ]).migrateToLatest();
    raw.execSync(
      `INSERT INTO accounts (id, chapter_id, name, institution, kind, starting_balance, opened_on, created_at)
       VALUES ('a1','ch','Checking',NULL,'spending',0,'2026-01-01','t')`,
    );
    raw.execSync(
      `INSERT INTO categories (id, chapter_id, name, color_key, fixed, cadence, created_at)
       VALUES ('c1','ch','Food','amber',0,'weekly','t')`,
    );
    raw.execSync(
      `INSERT INTO income_sources (id, chapter_id, name, amount, schedule_kind, schedule_anchor_date, created_at)
       VALUES ('s1','ch','Pay',100000,'monthly','2026-01-01','t')`,
    );

    await new SqliteMigrationRunner(raw, MIGRATIONS).migrateToLatest();

    for (const table of ['accounts', 'categories', 'income_sources']) {
      const cols = raw.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);
      expect(cols).toContain('archived_at');
    }
    // Existing rows survive and backfill NULL (active).
    expect(raw.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM accounts`)?.n).toBe(1);
    expect(raw.getFirstSync<{ v: string | null }>(`SELECT archived_at AS v FROM accounts WHERE id='a1'`)?.v).toBeNull();
    expect(raw.getFirstSync<{ v: string | null }>(`SELECT archived_at AS v FROM categories WHERE id='c1'`)?.v).toBeNull();
    expect(raw.getFirstSync<{ v: string | null }>(`SELECT archived_at AS v FROM income_sources WHERE id='s1'`)?.v).toBeNull();
  });
});

describe('store archival mutations (guards + side effects)', () => {
  beforeEach(async () => {
    resetDatabaseForTests();
    await initDatabase();
    await store().init();
    await store().createChapter({ name: 'Test', startedAt: '2026-01-01' });
  });

  async function account(name: string, kind: 'spending' | 'savings' = 'spending') {
    return store().createAccount({
      name, institution: null, kind, startingBalance: cents(0), openedOn: '2026-01-01',
    });
  }

  it('removeAccount archives, scrubs its income splits, and refuses the last active account', async () => {
    const a = await account('Checking');
    const b = await account('Savings', 'savings');
    const src = await store().createIncomeSource({
      name: 'Pay', amount: cents(100000),
      schedule: { kind: 'monthly', anchorDate: '2026-01-10' },
      splits: [{ accountId: a.id, ratio: 1 }, { accountId: b.id, ratio: 1 }],
    });

    await store().removeAccount(a.id);
    // Archived: gone from the default list, present with includeArchived.
    expect(store().listAccounts().map((x) => x.id)).not.toContain(a.id);
    expect(store().listAccounts({ includeArchived: true }).map((x) => x.id)).toContain(a.id);
    // Its income split was scrubbed; the other split survives.
    const after = store().listIncomeSources().find((s) => s.id === src.id)!;
    expect(after.splits.map((sp) => sp.accountId)).toEqual([b.id]);
    // Double-archive throws.
    await expect(store().removeAccount(a.id)).rejects.toThrow(/already archived/);
    // Unknown throws.
    await expect(store().removeAccount('nope')).rejects.toThrow(/unknown account/);
    // Cannot archive the last active account (b is the only one left).
    await expect(store().removeAccount(b.id)).rejects.toThrow(/last active account/);
  });

  it('removeCategory archives, deactivates its bills, and deletes its merchant corrections', async () => {
    const cat = await store().createCategory({
      name: 'Food', colorKey: 'amber', fixed: false,
      envelope: { period: 'weekly', budget: cents(10000), carryoverDefault: 'ask' },
    });
    const bill = await store().addRecurringBill({
      name: 'Groceries', categoryId: cat.id, amountCents: cents(5000), dueDay: 1,
    });
    await store().upsertMerchantCorrection({ normalizedMerchant: 'TRADER JOES', categoryId: cat.id });
    expect(store().getMerchantCorrections()).toHaveLength(1);

    await store().removeCategory(cat.id);
    expect(store().listCategories().map((c) => c.id)).not.toContain(cat.id);
    expect(store().getRecurringBills().find((b) => b.id === bill.id)?.active).toBe(false);
    expect(store().getMerchantCorrections()).toHaveLength(0);
    await expect(store().removeCategory(cat.id)).rejects.toThrow(/already archived/);
    await expect(store().addExpense({
      accountId: (await account('X')).id, categoryId: cat.id, amount: cents(100), date: '2026-01-05',
    })).rejects.toThrow(/archived/);
  });

  it('removeIncomeSource archives, keeps splits inert, drops it from paydays, and blocks addIncome', async () => {
    const a = await account('Checking');
    const src = await store().createIncomeSource({
      name: 'Pay', amount: cents(100000),
      schedule: { kind: 'monthly', anchorDate: '2026-01-10' },
      splits: [{ accountId: a.id, ratio: 1 }],
    });
    expect(store().getPaydays({ from: '2026-01-01', to: '2026-01-31' })).toContain('2026-01-10');

    await store().removeIncomeSource(src.id);
    expect(store().listIncomeSources().map((s) => s.id)).not.toContain(src.id);
    // Splits retained inert (visible via includeArchived).
    const archived = store().listIncomeSources({ includeArchived: true }).find((s) => s.id === src.id)!;
    expect(archived.splits).toHaveLength(1);
    expect(store().getPaydays({ from: '2026-01-01', to: '2026-01-31' })).not.toContain('2026-01-10');
    await expect(store().addIncome({ sourceId: src.id, date: '2026-01-10' })).rejects.toThrow(/archived/);
    await expect(store().removeIncomeSource(src.id)).rejects.toThrow(/already archived/);
  });
});
