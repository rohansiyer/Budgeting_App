import { cents } from '../../../lib/money';
import {
  buildTransactionsCsv,
  csvEscape,
  signedAmount,
  transactionToCsvRow,
} from '../csvExport.logic';
import type { CategoryConfig, TransactionRecord } from '../../../types/contracts';

const FOOD: CategoryConfig = {
  id: 'cat_food',
  name: 'Food',
  colorKey: 'amber',
  fixed: false,
  cadence: 'weekly',
  envelope: { period: 'weekly', budget: cents(8000), carryoverDefault: 'ask' },
};

const expense: TransactionRecord = {
  id: 'txn_1',
  accountId: 'acct_1',
  categoryId: 'cat_food',
  amount: cents(1240),
  kind: 'expense',
  date: '2026-07-08',
  note: 'Coffee',
};

const income: TransactionRecord = {
  id: 'txn_2',
  accountId: 'acct_1',
  categoryId: 'cat_food',
  amount: cents(64000),
  kind: 'income',
  date: '2026-07-03',
  note: null,
};

const transferOut: TransactionRecord = {
  id: 'txn_3',
  accountId: 'acct_1',
  categoryId: 'cat_food',
  amount: cents(5000),
  kind: 'transfer_out',
  date: '2026-07-04',
  note: null,
};

describe('signedAmount', () => {
  test('expenses and transfer_out are negative', () => {
    expect(signedAmount(expense)).toBe(cents(-1240));
    expect(signedAmount(transferOut)).toBe(cents(-5000));
  });
  test('income and transfer_in are positive', () => {
    expect(signedAmount(income)).toBe(cents(64000));
    expect(signedAmount({ kind: 'transfer_in', amount: cents(500) })).toBe(cents(500));
  });
});

describe('transactionToCsvRow', () => {
  test('expense row: category name, note as note, negative amount text', () => {
    const row = transactionToCsvRow(expense, [FOOD]);
    expect(row.date).toBe('2026-07-08');
    expect(row.category).toBe('Food');
    expect(row.title).toBe('Food');
    expect(row.amountText).toBe('-$12.40');
    expect(row.note).toBe('Coffee');
  });

  test('income row: category and title are Income when no note, positive amount', () => {
    const row = transactionToCsvRow(income, [FOOD]);
    expect(row.category).toBe('Income');
    expect(row.title).toBe('Income');
    expect(row.amountText).toBe('$640.00');
    expect(row.note).toBe('');
  });

  test('unknown category falls back to Uncategorized', () => {
    const row = transactionToCsvRow({ ...expense, categoryId: 'nope' }, [FOOD]);
    expect(row.category).toBe('Uncategorized');
    expect(row.title).toBe('Uncategorized');
  });
});

describe('csvEscape', () => {
  test('plain fields pass through unchanged', () => {
    expect(csvEscape('Food')).toBe('Food');
  });
  test('fields with commas, quotes or newlines get quoted and doubled', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('buildTransactionsCsv', () => {
  test('header plus one CRLF-terminated line per transaction, in given order', () => {
    const csv = buildTransactionsCsv([expense, income], [FOOD]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Date,Category,Title,Amount,Note');
    expect(lines[1]).toBe('2026-07-08,Food,Food,-$12.40,Coffee');
    expect(lines[2]).toBe('2026-07-03,Income,Income,$640.00,');
    // trailing CRLF leaves one empty element at the end
    expect(lines[lines.length - 1]).toBe('');
  });

  test('empty transaction list still emits the header', () => {
    const csv = buildTransactionsCsv([], [FOOD]);
    expect(csv).toBe('Date,Category,Title,Amount,Note\r\n');
  });
});
