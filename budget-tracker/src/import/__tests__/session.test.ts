/**
 * Import session classification + commit (Import engine F11). Duplicate
 * detection never silently imports; commit records a correction per override
 * and returns counts for the "We sorted N of M" copy.
 */
import { cents, type Cents } from '../../lib/money';
import type { ImportRow } from '../csv';
import { normalizeMerchant } from '../matching';
import {
  buildImportSession,
  sessionCounts,
  commitImportSession,
  type ImportStoreReads,
  type ImportCommitPort,
  type ImportDecision,
} from '../session';

function row(description: string, amount: number, date = '2026-01-02'): ImportRow {
  return { date, description, amountCents: cents(amount) as Cents, raw: [] };
}

const CATEGORIES = [
  { id: 'food', name: 'Food', colorKey: 'amber' as const, fixed: false },
  { id: 'transit', name: 'Transit', colorKey: 'blue' as const, fixed: false },
];

const reads = (over: Partial<ImportStoreReads> = {}): ImportStoreReads => ({
  categories: CATEGORIES,
  corrections: [],
  existingTransactions: [],
  ...over,
});

describe('buildImportSession', () => {
  it('splits matched vs needsReview by suggestion presence', () => {
    const s = buildImportSession([row('STARBUCKS', 450), row('MYSTERY LLC', 999)], reads());
    expect(s.matched.map((m) => m.row.description)).toEqual(['STARBUCKS']);
    expect(s.needsReview.map((m) => m.row.description)).toEqual(['MYSTERY LLC']);
  });

  it('detects a duplicate by date + amount + normalized merchant', () => {
    const s = buildImportSession([row('STARBUCKS #123', 450, '2026-01-02')], reads({
      existingTransactions: [
        {
          id: 'tx1',
          date: '2026-01-02',
          amountCents: cents(450) as Cents,
          normalizedMerchant: normalizeMerchant('STARBUCKS'),
        },
      ],
    }));
    expect(s.duplicates).toHaveLength(1);
    expect(s.duplicates[0].existingTransactionId).toBe('tx1');
    expect(s.matched).toHaveLength(0); // NOT silently imported
  });

  it('does not flag a duplicate when amount differs', () => {
    const s = buildImportSession([row('STARBUCKS #123', 451, '2026-01-02')], reads({
      existingTransactions: [
        {
          id: 'tx1',
          date: '2026-01-02',
          amountCents: cents(450) as Cents,
          normalizedMerchant: normalizeMerchant('STARBUCKS'),
        },
      ],
    }));
    expect(s.duplicates).toHaveLength(0);
    expect(s.matched).toHaveLength(1);
  });

  it('routes inflow rows (spend-negative) to needsReview, never keyword-filed', () => {
    const s = buildImportSession([row('PAYROLL DEPOSIT', -200000)], reads());
    expect(s.needsReview).toHaveLength(1);
    expect(s.matched).toHaveLength(0);
  });
});

describe('sessionCounts', () => {
  it('reports sorted / needsReview / total for the copy', () => {
    const rows = [row('STARBUCKS', 450), row('SHELL', 4000), row('MYSTERY', 100)];
    const c = sessionCounts(buildImportSession(rows, reads()));
    expect(c.sorted).toBe(2);
    expect(c.needsReview).toBe(1);
    expect(c.total).toBe(3);
  });
});

describe('commitImportSession', () => {
  function fakePort() {
    const expenses: Array<{ categoryId: string; amount: number }> = [];
    const corrections: Array<{ normalizedMerchant: string; categoryId: string }> = [];
    const port: ImportCommitPort = {
      withTransaction: async (fn) => fn(),
      addExpense: async (input) => {
        expenses.push({ categoryId: input.categoryId, amount: input.amount });
        return 'id';
      },
      upsertMerchantCorrection: async (input) => {
        corrections.push(input);
        return undefined;
      },
    };
    return { port, expenses, corrections };
  }

  it('imports each decided row and learns a correction per override', async () => {
    const { port, expenses, corrections } = fakePort();
    const decisions: ImportDecision[] = [
      { row: row('STARBUCKS', 450), normalizedMerchant: 'STARBUCKS', categoryId: 'food', accountId: 'a1', overridden: false },
      { row: row('THE PAPER STORE', 3210), normalizedMerchant: 'THE PAPER STORE', categoryId: 'transit', accountId: 'a1', overridden: true },
    ];
    const res = await commitImportSession(decisions, port);
    expect(res.imported).toBe(2);
    expect(res.corrections).toBe(1);
    expect(expenses).toHaveLength(2);
    expect(corrections).toEqual([{ normalizedMerchant: 'THE PAPER STORE', categoryId: 'transit' }]);
  });

  it('de-duplicates corrections for repeated overrides of one merchant', async () => {
    const { port, corrections } = fakePort();
    const decisions: ImportDecision[] = [
      { row: row('TRADER JOES', 1000), normalizedMerchant: 'TRADER JOES', categoryId: 'food', accountId: 'a1', overridden: true },
      { row: row('TRADER JOES', 2000), normalizedMerchant: 'TRADER JOES', categoryId: 'food', accountId: 'a1', overridden: true },
    ];
    const res = await commitImportSession(decisions, port);
    expect(res.imported).toBe(2);
    expect(res.corrections).toBe(1);
    expect(corrections).toHaveLength(1);
  });

  it('skips inflow rows defensively (never files income as an expense)', async () => {
    const { port, expenses } = fakePort();
    const decisions: ImportDecision[] = [
      { row: row('REFUND', -500), normalizedMerchant: 'REFUND', categoryId: 'food', accountId: 'a1', overridden: false },
    ];
    const res = await commitImportSession(decisions, port);
    expect(res.imported).toBe(0);
    expect(expenses).toHaveLength(0);
  });
});
