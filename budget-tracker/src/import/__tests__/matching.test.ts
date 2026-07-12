/**
 * Merchant normalization + match precedence (Import engine F11). Deterministic,
 * pure logic. LEARNED corrections must beat KEYWORD guesses.
 */
import { cents, type Cents } from '../../lib/money';
import type { ImportRow } from '../csv';
import {
  normalizeMerchant,
  matchRow,
  matchRows,
  type MatchContext,
} from '../matching';

function row(description: string, amount = 100): ImportRow {
  return { date: '2026-01-02', description, amountCents: cents(amount) as Cents, raw: [] };
}

const CATEGORIES = [
  { id: 'food', name: 'Food', colorKey: 'amber' as const, fixed: false },
  { id: 'transit', name: 'Transit', colorKey: 'blue' as const, fixed: false },
  { id: 'fun', name: 'Fun', colorKey: 'pink' as const, fixed: false },
];

const ctx = (corrections: MatchContext['corrections'] = []): MatchContext => ({
  categories: CATEGORIES,
  corrections,
});

describe('normalizeMerchant', () => {
  it('strips processor prefixes', () => {
    expect(normalizeMerchant('TST* GOLDEN DRAGON')).toBe('GOLDEN DRAGON');
    expect(normalizeMerchant('SQ* THE PAPER STORE')).toBe('THE PAPER STORE');
  });
  it('strips store numbers and punctuation', () => {
    expect(normalizeMerchant('STARBUCKS #123')).toBe('STARBUCKS');
    expect(normalizeMerchant("MCDONALD'S #4021")).toBe('MCDONALD S');
  });
  it('drops a trailing state code', () => {
    expect(normalizeMerchant('SHELL OIL 12345 AUSTIN TX')).toBe('SHELL OIL AUSTIN');
  });
  it('is idempotent', () => {
    const once = normalizeMerchant('TST* GOLDEN DRAGON #99 NY');
    expect(normalizeMerchant(once)).toBe(once);
  });
});

describe('match precedence', () => {
  it('keyword-matches a known merchant token', () => {
    const r = matchRow(row('STARBUCKS #123'), ctx());
    expect(r.confidence).toBe('keyword');
    expect(r.suggestedCategoryId).toBe('food');
  });

  it('keyword-matches transit and fun', () => {
    expect(matchRow(row('SHELL OIL'), ctx()).suggestedCategoryId).toBe('transit');
    expect(matchRow(row('NETFLIX.COM'), ctx()).suggestedCategoryId).toBe('fun');
  });

  it('LEARNED correction beats the keyword guess', () => {
    // STARBUCKS would keyword-match Food; a learned correction sends it to Transit.
    const r = matchRow(row('STARBUCKS #500'), ctx([
      { normalizedMerchant: 'STARBUCKS', categoryId: 'transit' },
    ]));
    expect(r.confidence).toBe('learned');
    expect(r.suggestedCategoryId).toBe('transit');
  });

  it('ignores a learned correction pointing at a deleted category', () => {
    const r = matchRow(row('STARBUCKS'), ctx([
      { normalizedMerchant: 'STARBUCKS', categoryId: 'ghost' },
    ]));
    // Falls through to keyword.
    expect(r.confidence).toBe('keyword');
    expect(r.suggestedCategoryId).toBe('food');
  });

  it('returns none when nothing fires', () => {
    const r = matchRow(row('SOME OBSCURE LLC'), ctx());
    expect(r.confidence).toBe('none');
    expect(r.suggestedCategoryId).toBeNull();
  });

  it('is deterministic across runs', () => {
    const rows = [row('STARBUCKS'), row('SHELL'), row('MYSTERY CO')];
    expect(matchRows(rows, ctx())).toEqual(matchRows(rows, ctx()));
  });
});
