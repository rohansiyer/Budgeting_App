import { cents } from '../../../lib/money';
import {
  filterLedger,
  toggleCategoryId,
  MAX_RENDER_ROWS,
  type LedgerSearchRow,
} from '../searchLedger.logic';

function row(partial: Partial<LedgerSearchRow> & { id: string }): LedgerSearchRow {
  return {
    categoryId: 'food',
    title: 'Food',
    note: null,
    date: '2026-07-01',
    amount: cents(500),
    kind: 'expense',
    ...partial,
  };
}

describe('filterLedger — text query', () => {
  it('matches case-insensitively on title', () => {
    const rows = [row({ id: 'a', title: 'Pilot Coffee' }), row({ id: 'b', title: 'Groceries' })];
    const result = filterLedger(rows, { query: 'COFFEE', categoryIds: [] });
    expect(result.rows.map((r) => r.id)).toEqual(['a']);
  });

  it('matches case-insensitively on note when title does not match', () => {
    const rows = [
      row({ id: 'a', title: 'Food', note: 'Pilot Coffee run' }),
      row({ id: 'b', title: 'Food', note: 'Groceries' }),
    ];
    const result = filterLedger(rows, { query: 'coffee', categoryIds: [] });
    expect(result.rows.map((r) => r.id)).toEqual(['a']);
  });

  it('a hit on either title OR note is sufficient (not both)', () => {
    const rows = [
      row({ id: 'a', title: 'Coffee shop', note: 'unrelated' }),
      row({ id: 'b', title: 'unrelated', note: 'coffee run' }),
      row({ id: 'c', title: 'unrelated', note: null }),
    ];
    const result = filterLedger(rows, { query: 'coffee', categoryIds: [] });
    expect(result.rows.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('empty/whitespace query matches everything (no text filter)', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })];
    expect(filterLedger(rows, { query: '', categoryIds: [] }).rows).toHaveLength(2);
    expect(filterLedger(rows, { query: '   ', categoryIds: [] }).rows).toHaveLength(2);
  });

  it('treats a null note as empty string, not a crash or false match', () => {
    const rows = [row({ id: 'a', title: 'Food', note: null })];
    const result = filterLedger(rows, { query: 'null', categoryIds: [] });
    expect(result.rows).toHaveLength(0);
  });
});

describe('filterLedger — category filter', () => {
  it('empty categoryIds means no filter (ALL)', () => {
    const rows = [row({ id: 'a', categoryId: 'food' }), row({ id: 'b', categoryId: 'fun' })];
    const result = filterLedger(rows, { query: '', categoryIds: [] });
    expect(result.rows).toHaveLength(2);
  });

  it('selecting one category excludes rows in other categories', () => {
    const rows = [row({ id: 'a', categoryId: 'food' }), row({ id: 'b', categoryId: 'fun' })];
    const result = filterLedger(rows, { query: '', categoryIds: ['food'] });
    expect(result.rows.map((r) => r.id)).toEqual(['a']);
  });

  it('multiple selected categories are OR-ed together (union, not intersection)', () => {
    const rows = [
      row({ id: 'a', categoryId: 'food' }),
      row({ id: 'b', categoryId: 'fun' }),
      row({ id: 'c', categoryId: 'transport' }),
    ];
    const result = filterLedger(rows, { query: '', categoryIds: ['food', 'fun'] });
    expect(result.rows.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('income/transfer rows with categoryId "" are excluded once any category filter is active', () => {
    const rows = [row({ id: 'a', categoryId: '', kind: 'income', title: 'Income' })];
    const result = filterLedger(rows, { query: '', categoryIds: ['food'] });
    expect(result.rows).toHaveLength(0);
  });

  it('category filter and text query combine with AND', () => {
    const rows = [
      row({ id: 'a', categoryId: 'food', title: 'Coffee' }),
      row({ id: 'b', categoryId: 'fun', title: 'Coffee' }),
      row({ id: 'c', categoryId: 'food', title: 'Groceries' }),
    ];
    const result = filterLedger(rows, { query: 'coffee', categoryIds: ['food'] });
    expect(result.rows.map((r) => r.id)).toEqual(['a']);
  });
});

describe('filterLedger — sort', () => {
  it('sorts date-descending (most recent first)', () => {
    const rows = [
      row({ id: 'a', date: '2026-07-01' }),
      row({ id: 'b', date: '2026-07-08' }),
      row({ id: 'c', date: '2026-07-05' }),
    ];
    const result = filterLedger(rows, { query: '', categoryIds: [] });
    expect(result.rows.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('is stable for equal dates: preserves original relative order', () => {
    const rows = [
      row({ id: 'first', date: '2026-07-01' }),
      row({ id: 'second', date: '2026-07-01' }),
      row({ id: 'third', date: '2026-07-01' }),
    ];
    const result = filterLedger(rows, { query: '', categoryIds: [] });
    expect(result.rows.map((r) => r.id)).toEqual(['first', 'second', 'third']);
  });

  it('does not mutate the input array', () => {
    const rows = [row({ id: 'a', date: '2026-07-01' }), row({ id: 'b', date: '2026-07-08' })];
    const copy = [...rows];
    filterLedger(rows, { query: '', categoryIds: [] });
    expect(rows).toEqual(copy);
  });
});

describe('filterLedger — footer aggregate', () => {
  it('counts and sums exactly the matched set (cent-exact)', () => {
    const rows = [
      row({ id: 'a', amount: cents(460) }),
      row({ id: 'b', amount: cents(625) }),
      row({ id: 'c', amount: cents(1799), categoryId: 'other' }),
    ];
    const result = filterLedger(rows, { query: '', categoryIds: ['food'] });
    expect(result.footer).toEqual({ count: 2, totalCents: cents(1085) });
  });

  it('footer reflects the FULL matched set even when the render list is truncated', () => {
    const rows = Array.from({ length: MAX_RENDER_ROWS + 5 }, (_, i) =>
      row({ id: `t${i}`, date: '2026-07-01', amount: cents(100) }),
    );
    const result = filterLedger(rows, { query: '', categoryIds: [] });
    expect(result.footer.count).toBe(MAX_RENDER_ROWS + 5);
    expect(result.footer.totalCents).toBe(cents((MAX_RENDER_ROWS + 5) * 100));
  });

  it('footer is zero for an empty match', () => {
    const result = filterLedger([], { query: 'nothing', categoryIds: [] });
    expect(result.footer).toEqual({ count: 0, totalCents: cents(0) });
  });
});

describe('filterLedger — truncation', () => {
  it('does not truncate at or under the cap', () => {
    const rows = Array.from({ length: MAX_RENDER_ROWS }, (_, i) => row({ id: `t${i}` }));
    const result = filterLedger(rows, { query: '', categoryIds: [] });
    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(MAX_RENDER_ROWS);
  });

  it('truncates to MAX_RENDER_ROWS, keeping the most recent rows', () => {
    const rows = Array.from({ length: MAX_RENDER_ROWS + 10 }, (_, i) =>
      row({ id: `t${i}`, date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}` }),
    );
    const result = filterLedger(rows, { query: '', categoryIds: [] });
    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(MAX_RENDER_ROWS);
    // The rendered slice stays in non-increasing date order (a prefix of
    // the full date-descending sort).
    const dates = result.rows.map((r) => r.date);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] <= dates[i - 1]).toBe(true);
    }
  });
});

describe('toggleCategoryId', () => {
  it('adds an id not present', () => {
    expect(toggleCategoryId(['food'], 'fun')).toEqual(['food', 'fun']);
  });

  it('removes an id already present', () => {
    expect(toggleCategoryId(['food', 'fun'], 'food')).toEqual(['fun']);
  });

  it('does not mutate the input array', () => {
    const input = ['food'];
    toggleCategoryId(input, 'fun');
    expect(input).toEqual(['food']);
  });
});
