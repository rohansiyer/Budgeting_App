import { cents, type Cents } from '../../../../lib/money';
import type { ImportRow } from '../../../../import';
import { buildImportSession } from '../../../../import';
import type { CategoryConfig, TransactionRecord } from '../../../../types/contracts';
import {
  acceptReviewSuggestion,
  assembleCommitPayload,
  buildReviewState,
  changeReviewCategory,
  commitResultCopy,
  confirmImportLabel,
  importableCount,
  matchedSummaryLine,
  reviewHeaderCopy,
  setDuplicateIncluded,
  skipReviewRow,
  toExistingTxns,
} from '../importFlow.logic';

function row(description: string, amount: number, date = '2026-01-02'): ImportRow {
  return { date, description, amountCents: cents(amount) as Cents, raw: [] };
}

const FOOD: CategoryConfig = {
  id: 'food',
  name: 'Food',
  colorKey: 'amber',
  fixed: false,
  cadence: 'weekly',
  envelope: { period: 'weekly', budget: cents(8000), carryoverDefault: 'ask' },
};
const TRANSIT: CategoryConfig = {
  id: 'transit',
  name: 'Transit',
  colorKey: 'blue',
  fixed: false,
  cadence: 'weekly',
  envelope: { period: 'weekly', budget: cents(4000), carryoverDefault: 'ask' },
};

const CTX = { categories: [FOOD, TRANSIT], corrections: [] };

describe('reviewHeaderCopy', () => {
  it('handles the plural case exactly like the mockup', () => {
    const copy = reviewHeaderCopy('chase_jan-jun.csv', { sorted: 142, needsReview: 9, duplicates: 0, total: 151 });
    expect(copy.fileLabel).toBe('Import · chase_jan-jun.csv');
    expect(copy.title).toBe('We sorted 142 of 151.');
    expect(copy.subtitle).toBe("Check these 9, we'll remember every correction.");
  });

  it('singularizes a single row to check', () => {
    const copy = reviewHeaderCopy('f.csv', { sorted: 5, needsReview: 1, duplicates: 0, total: 6 });
    expect(copy.subtitle).toBe("Check this 1, we'll remember every correction.");
  });

  it('has distinct, non-empty copy when nothing needs review', () => {
    const copy = reviewHeaderCopy('f.csv', { sorted: 6, needsReview: 0, duplicates: 0, total: 6 });
    expect(copy.subtitle).toBe("Nothing left to check, we'll remember every correction.");
  });
});

describe('matchedSummaryLine', () => {
  it('pluralizes the matched count', () => {
    expect(matchedSummaryLine(1)).toBe('1 transaction matched automatically.');
    expect(matchedSummaryLine(142)).toBe('142 transactions matched automatically.');
  });
});

describe('buildReviewState', () => {
  it('gives needsReview rows a fallback category and duplicates a matchRow guess', () => {
    const session = buildImportSession(
      [row('STARBUCKS', 450), row('MYSTERY LLC', 999)],
      { ...CTX, existingTransactions: [] },
    );
    const state = buildReviewState('f.csv', session, CTX);
    expect(state.matched).toHaveLength(1);
    expect(state.review).toHaveLength(1);
    expect(state.review[0].categoryId).toBe('food'); // first configured category
    expect(state.review[0].skipped).toBe(false);
    expect(state.duplicates).toHaveLength(0);
  });

  it('resolves a duplicate row a category guess via matchRow, defaulting to excluded', () => {
    const session = buildImportSession(
      [row('STARBUCKS #1', 450, '2026-01-02')],
      {
        ...CTX,
        existingTransactions: [
          { id: 'tx1', date: '2026-01-02', amountCents: cents(450) as Cents, normalizedMerchant: 'STARBUCKS' },
        ],
      },
    );
    const state = buildReviewState('f.csv', session, CTX);
    expect(state.duplicates).toHaveLength(1);
    expect(state.duplicates[0].included).toBe(false);
    expect(state.duplicates[0].suggestedCategoryId).toBe('food'); // STARBUCKS keyword hit
  });
});

describe('review row decision transitions', () => {
  function initialState() {
    const session = buildImportSession(
      [row('MYSTERY LLC', 999), row('OTHER MYSTERY', 500)],
      { ...CTX, existingTransactions: [] },
    );
    return buildReviewState('f.csv', session, CTX);
  }

  it('change sets an explicit category and un-skips the row', () => {
    let state = initialState();
    state = skipReviewRow(state, 0);
    expect(state.review[0].skipped).toBe(true);
    state = changeReviewCategory(state, 0, 'transit');
    expect(state.review[0].categoryId).toBe('transit');
    expect(state.review[0].skipped).toBe(false);
    // The other row is untouched.
    expect(state.review[1].categoryId).toBe('food');
  });

  it('skip excludes a row and accept brings it back', () => {
    let state = initialState();
    state = skipReviewRow(state, 1);
    expect(state.review[1].skipped).toBe(true);
    expect(importableCount(state)).toBe(1);
    state = acceptReviewSuggestion(state, 1);
    expect(state.review[1].skipped).toBe(false);
    expect(importableCount(state)).toBe(2);
  });

  it('toggles a duplicate row inclusion independently', () => {
    const session = buildImportSession(
      [row('STARBUCKS', 450, '2026-01-02')],
      {
        ...CTX,
        existingTransactions: [
          { id: 'tx1', date: '2026-01-02', amountCents: cents(450) as Cents, normalizedMerchant: 'STARBUCKS' },
        ],
      },
    );
    let state = buildReviewState('f.csv', session, CTX);
    expect(importableCount(state)).toBe(0);
    state = setDuplicateIncluded(state, 0, true);
    expect(state.duplicates[0].included).toBe(true);
    expect(importableCount(state)).toBe(1);
    state = setDuplicateIncluded(state, 0, false);
    expect(importableCount(state)).toBe(0);
  });
});

describe('confirmImportLabel', () => {
  it('names the exact count, singular and plural', () => {
    const session = buildImportSession([row('STARBUCKS', 450)], { ...CTX, existingTransactions: [] });
    const state = buildReviewState('f.csv', session, CTX);
    expect(confirmImportLabel(state)).toBe('Import 1 transaction');

    const session2 = buildImportSession(
      [row('STARBUCKS', 450), row('SHELL', 4000)],
      { ...CTX, existingTransactions: [] },
    );
    const state2 = buildReviewState('f.csv', session2, CTX);
    expect(confirmImportLabel(state2)).toBe('Import 2 transactions');
  });
});

describe('assembleCommitPayload', () => {
  it('includes matched (not overridden), non-skipped review (overridden), and included duplicates (not overridden)', () => {
    const session = buildImportSession(
      [row('STARBUCKS', 450), row('MYSTERY LLC', 999), row('ANOTHER MYSTERY', 700)],
      { ...CTX, existingTransactions: [] },
    );
    let state = buildReviewState('f.csv', session, CTX);
    // Confirm the first review row's default, skip the second.
    state = changeReviewCategory(state, 0, 'transit');
    state = skipReviewRow(state, 1);

    const decisions = assembleCommitPayload(state, 'acct_1');
    expect(decisions).toHaveLength(2); // matched STARBUCKS + first review row
    const starbucks = decisions.find((d) => d.normalizedMerchant === 'STARBUCKS');
    expect(starbucks).toMatchObject({ categoryId: 'food', overridden: false, accountId: 'acct_1' });
    const mystery = decisions.find((d) => d.normalizedMerchant === 'MYSTERY LLC');
    expect(mystery).toMatchObject({ categoryId: 'transit', overridden: true });
    expect(decisions.find((d) => d.normalizedMerchant === 'ANOTHER MYSTERY')).toBeUndefined();
  });

  it('never marks an included duplicate as overridden', () => {
    const session = buildImportSession(
      [row('STARBUCKS', 450, '2026-01-02')],
      {
        ...CTX,
        existingTransactions: [
          { id: 'tx1', date: '2026-01-02', amountCents: cents(450) as Cents, normalizedMerchant: 'STARBUCKS' },
        ],
      },
    );
    let state = buildReviewState('f.csv', session, CTX);
    state = setDuplicateIncluded(state, 0, true);
    const decisions = assembleCommitPayload(state, 'acct_1');
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ categoryId: 'food', overridden: false });
  });
});

describe('commitResultCopy', () => {
  it('names imported count and omits corrections when zero', () => {
    expect(commitResultCopy({ imported: 1, corrections: 0 })).toBe('Imported 1 transaction.');
    expect(commitResultCopy({ imported: 5, corrections: 0 })).toBe('Imported 5 transactions.');
  });

  it('appends the corrections-learned count when nonzero, singular and plural', () => {
    expect(commitResultCopy({ imported: 5, corrections: 1 })).toBe(
      'Imported 5 transactions. 1 correction learned.',
    );
    expect(commitResultCopy({ imported: 5, corrections: 2 })).toBe(
      'Imported 5 transactions. 2 corrections learned.',
    );
  });
});

describe('toExistingTxns', () => {
  it('keeps only expense rows and normalizes the merchant from the note', () => {
    const txns: TransactionRecord[] = [
      { id: 't1', accountId: 'a', categoryId: 'food', amount: cents(450) as Cents, kind: 'expense', date: '2026-01-02', note: 'STARBUCKS #123' },
      { id: 't2', accountId: 'a', categoryId: 'food', amount: cents(64000) as Cents, kind: 'income', date: '2026-01-03', note: null },
    ];
    const existing = toExistingTxns(txns);
    expect(existing).toHaveLength(1);
    expect(existing[0]).toMatchObject({ id: 't1', date: '2026-01-02', normalizedMerchant: 'STARBUCKS' });
  });
});
