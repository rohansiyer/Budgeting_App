/**
 * Shared test harness for the insights rule engine — seeds the REAL store
 * against real in-memory SQLite (node:sqlite via the expo-sqlite mock),
 * mirroring src/store/__tests__/money-path.test.ts. Not a test file itself
 * (no *.test.ts suffix), so jest's testMatch skips it.
 */
import { useBudgetStore } from '../../store';
import { initDatabase, resetDatabaseForTests } from '../../db/client';
import { cents } from '../../lib/money';
import type { CategoryColorKey } from '../../types/contracts';

// No explicit StoreContract annotation: the live Zustand state exposes a few
// members beyond the contract (e.g. `init`) that this harness also needs.
export const store = () => useBudgetStore.getState();

export async function freshChapter(startedAt = '2026-01-05') {
  resetDatabaseForTests();
  await initDatabase();
  await store().init();
  await store().createChapter({ name: 'Test', startedAt });
}

export async function makeAccount(
  name: string,
  balance = 0,
  kind: 'spending' | 'savings' = 'spending',
  openedOn = '2026-01-01',
): Promise<string> {
  const a = await store().createAccount({
    name,
    institution: null,
    kind,
    startingBalance: cents(balance),
    openedOn,
  });
  return a.id;
}

export async function makeWeeklyEnvelope(
  name: string,
  budget: number,
  colorKey: CategoryColorKey = 'mint',
): Promise<string> {
  const c = await store().createCategory({
    name,
    colorKey,
    fixed: false,
    envelope: { period: 'weekly', budget: cents(budget), carryoverDefault: 'ask' },
  });
  return c.id;
}

export async function makeMonthlyEnvelope(
  name: string,
  budget: number,
  colorKey: CategoryColorKey = 'blue',
): Promise<string> {
  const c = await store().createCategory({
    name,
    colorKey,
    fixed: false,
    cadence: 'monthly',
    envelope: { period: 'monthly', budget: cents(budget), carryoverDefault: 'ask' },
  });
  return c.id;
}

export async function makeFixedCategory(name: string, colorKey: CategoryColorKey = 'amber'): Promise<string> {
  const c = await store().createCategory({ name, colorKey, fixed: true, envelope: null });
  return c.id;
}

export async function expense(
  accountId: string,
  categoryId: string,
  amount: number,
  date: string,
  note?: string,
): Promise<string> {
  return store().addExpense({ accountId, categoryId, amount: cents(amount), date, note });
}

export async function makeIncomeSource(
  name: string,
  amount: number,
  destinationAccountId: string,
  anchorDate = '2026-01-05',
): Promise<string> {
  const src = await store().createIncomeSource({
    name,
    amount: cents(amount),
    schedule: { kind: 'monthly', anchorDate },
    splits: [{ accountId: destinationAccountId, ratio: 1 }],
  });
  return src.id;
}

export async function payIncome(sourceId: string, date: string, amount?: number): Promise<string> {
  return store().addIncome({ sourceId, date, amount: amount !== undefined ? cents(amount) : undefined });
}

export async function moveToSavings(
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  date: string,
): Promise<string> {
  return store().transfer({ fromAccountId, toAccountId, amount: cents(amount), date });
}
