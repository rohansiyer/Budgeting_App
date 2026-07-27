/**
 * Import data-layer store surface (Team 1 / C5): merchant corrections + recurring
 * bills against a REAL in-memory SQLite, plus an end-to-end commit through the
 * store's own mutation APIs.
 */
import { useBudgetStore, withTransaction } from '../index';
import { initDatabase, resetDatabaseForTests, getRawDb } from '../../db/client';
import { cents, type Cents } from '../../lib/money';
import { buildImportSession, commitImportSession, type ImportDecision } from '../../import';
import { normalizeMerchant } from '../../import';

const store = () => useBudgetStore.getState();

async function freshChapter() {
  resetDatabaseForTests();
  await initDatabase();
  await store().init();
  await store().createChapter({ name: 'Test', startedAt: '2026-01-01' });
}

async function makeAccount(name: string) {
  const a = await store().createAccount({
    name,
    institution: null,
    kind: 'spending',
    startingBalance: cents(0),
    openedOn: '2026-01-01',
  });
  return a.id;
}

async function makeCategory(name: string, colorKey: 'amber' | 'blue' = 'amber') {
  const c = await store().createCategory({
    name,
    colorKey,
    fixed: false,
    envelope: { period: 'weekly', budget: cents(10000), carryoverDefault: 'ask' },
  });
  return c.id;
}

describe('migration 3 tables', () => {
  it('creates merchant_corrections and recurring_bills', async () => {
    await freshChapter();
    const raw = getRawDb() as unknown as {
      getFirstSync: <T>(sql: string) => T | null;
    };
    const t1 = raw.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='merchant_corrections'`,
    );
    const t2 = raw.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='recurring_bills'`,
    );
    expect(t1?.n).toBe(1);
    expect(t2?.n).toBe(1);
  });
});

describe('merchant corrections', () => {
  it('learns and re-points a merchant (unique per chapter)', async () => {
    await freshChapter();
    const food = await makeCategory('Food', 'amber');
    const transit = await makeCategory('Transit', 'blue');

    const first = await store().upsertMerchantCorrection({
      normalizedMerchant: 'TRADER JOES',
      categoryId: food,
    });
    expect(store().getMerchantCorrections()).toHaveLength(1);
    expect(store().getMerchantCorrections()[0].categoryId).toBe(food);

    // Upsert same merchant → updates in place, no duplicate.
    const second = await store().upsertMerchantCorrection({
      normalizedMerchant: 'TRADER JOES',
      categoryId: transit,
    });
    expect(second.id).toBe(first.id);
    expect(store().getMerchantCorrections()).toHaveLength(1);
    expect(store().getMerchantCorrections()[0].categoryId).toBe(transit);
  });

  it('rejects a correction to a phantom category', async () => {
    await freshChapter();
    await expect(
      store().upsertMerchantCorrection({ normalizedMerchant: 'X', categoryId: 'ghost' }),
    ).rejects.toThrow(/category/i);
  });
});

describe('recurring bills', () => {
  it('adds an active bill and reads it back', async () => {
    await freshChapter();
    const cat = await makeCategory('Fixed');
    const bill = await store().addRecurringBill({
      name: 'Rent',
      categoryId: cat,
      amountCents: cents(85000),
      dueDay: 12,
    });
    expect(bill.active).toBe(true);
    const bills = store().getRecurringBills();
    expect(bills).toHaveLength(1);
    expect(bills[0].amountCents).toBe(85000);
    expect(bills[0].dueDay).toBe(12);
  });

  it('validates dueDay range and positive amount', async () => {
    await freshChapter();
    const cat = await makeCategory('Fixed');
    await expect(
      store().addRecurringBill({ name: 'X', categoryId: cat, amountCents: cents(100), dueDay: 32 }),
    ).rejects.toThrow(/dueDay/);
    await expect(
      store().addRecurringBill({ name: 'X', categoryId: cat, amountCents: cents(0), dueDay: 1 }),
    ).rejects.toThrow(/amount/);
  });

  it('active:false is a non-destructive remove (row retained)', async () => {
    await freshChapter();
    const cat = await makeCategory('Fixed');
    const bill = await store().addRecurringBill({
      name: 'Gym',
      categoryId: cat,
      amountCents: cents(3000),
      dueDay: 1,
    });
    await store().updateRecurringBill(bill.id, { active: false });
    const bills = store().getRecurringBills();
    expect(bills).toHaveLength(1); // still present
    expect(bills[0].active).toBe(false);
  });
});

describe('end-to-end import commit through the store', () => {
  it('imports decided rows and learns corrections atomically', async () => {
    await freshChapter();
    const acct = await makeAccount('Checking');
    const food = await makeCategory('Food', 'amber');
    const transit = await makeCategory('Transit', 'blue');

    const parsed = [
      { date: '2026-01-05', description: 'STARBUCKS #12', amountCents: cents(450) as Cents, raw: [] },
      { date: '2026-01-06', description: 'THE PAPER STORE', amountCents: cents(3210) as Cents, raw: [] },
    ];
    const session = buildImportSession(parsed, {
      categories: store().listCategories().map((c) => ({
        id: c.id,
        name: c.name,
        colorKey: c.colorKey,
        fixed: c.fixed,
      })),
      corrections: store().getMerchantCorrections().map((c) => ({
        normalizedMerchant: c.normalizedMerchant,
        categoryId: c.categoryId,
      })),
      existingTransactions: [],
    });
    // STARBUCKS keyword-matches Food; THE PAPER STORE needs review → user picks Transit.
    expect(session.matched).toHaveLength(1);
    expect(session.needsReview).toHaveLength(1);

    const decisions: ImportDecision[] = [
      {
        row: session.matched[0].row,
        normalizedMerchant: session.matched[0].normalizedMerchant,
        categoryId: food,
        accountId: acct,
        overridden: false,
      },
      {
        row: session.needsReview[0].row,
        normalizedMerchant: session.needsReview[0].normalizedMerchant,
        categoryId: transit,
        accountId: acct,
        overridden: true,
      },
    ];
    const res = await commitImportSession(decisions, {
      withTransaction,
      addExpense: (input) => store().addExpense(input),
      upsertMerchantCorrection: (input) => store().upsertMerchantCorrection(input),
    });
    expect(res.imported).toBe(2);
    expect(res.corrections).toBe(1);

    // Both expenses landed.
    const txns = store().getTransactions({ from: '2026-01-01', to: '2026-01-31' });
    expect(txns.filter((t) => t.kind === 'expense')).toHaveLength(2);
    // The override was learned: THE PAPER STORE → Transit forever.
    const learned = store()
      .getMerchantCorrections()
      .find((c) => c.normalizedMerchant === normalizeMerchant('THE PAPER STORE'));
    expect(learned?.categoryId).toBe(transit);
  });
});
