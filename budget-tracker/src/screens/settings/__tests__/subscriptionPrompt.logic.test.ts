import { cents } from '../../../lib/money';
import type { SubscriptionCandidate, DetectTxn } from '../../../import';
import {
  ordinal,
  titleCaseMerchant,
  subscriptionPromptCopy,
  typicalDueDay,
  candidateToRecurringBillInput,
  ignoredSubscriptionKey,
} from '../subscriptionPrompt.logic';

describe('ordinal', () => {
  it('handles st/nd/rd/th', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(5)).toBe('5th');
  });

  it('the 11th/12th/13th teens are always "th"', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
  });

  it('handles the 21/22/23 boundary correctly', () => {
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
    expect(ordinal(24)).toBe('24th');
  });

  it('handles larger numbers, e.g. 101st, 111th', () => {
    expect(ordinal(101)).toBe('101st');
    expect(ordinal(111)).toBe('111th');
  });
});

describe('titleCaseMerchant', () => {
  it('title-cases a single normalized word', () => {
    expect(titleCaseMerchant('SPOTIFY')).toBe('Spotify');
  });

  it('title-cases multiple words', () => {
    expect(titleCaseMerchant('THE PAPER STORE')).toBe('The Paper Store');
  });
});

function candidate(over: Partial<SubscriptionCandidate> = {}): SubscriptionCandidate {
  return {
    merchant: over.merchant ?? 'SPOTIFY',
    categoryId: 'categoryId' in over ? over.categoryId ?? null : 'cat-fun',
    amountCents: over.amountCents ?? cents(1199),
    hitCount: over.hitCount ?? 3,
    monthsSpanned: over.monthsSpanned ?? 3,
  };
}

describe('subscriptionPromptCopy', () => {
  it('matches the mockup sentence exactly', () => {
    const copy = subscriptionPromptCopy(candidate());
    expect(copy).toBe(
      "Spotify has hit for the 3rd month running, $11.99 each time. Want to track it as a bill so it's reserved before you spend?",
    );
  });

  it('never contains an em dash', () => {
    const copy = subscriptionPromptCopy(candidate({ monthsSpanned: 12 }));
    expect(copy).not.toMatch(/—|–/);
  });

  it('uses exact dollars, not rounded figures', () => {
    const copy = subscriptionPromptCopy(candidate({ amountCents: cents(2650) }));
    expect(copy).toContain('$26.50');
  });
});

describe('typicalDueDay', () => {
  it('returns the mode day-of-month across matching transactions', () => {
    const txns: DetectTxn[] = [
      { date: '2026-01-18', amountCents: cents(1199), note: 'SPOTIFY', categoryId: null },
      { date: '2026-02-18', amountCents: cents(1199), note: 'SPOTIFY', categoryId: null },
      { date: '2026-03-19', amountCents: cents(1199), note: 'SPOTIFY', categoryId: null },
    ];
    expect(typicalDueDay(txns, 'SPOTIFY')).toBe(18);
  });

  it('breaks ties by the smaller day', () => {
    const txns: DetectTxn[] = [
      { date: '2026-01-05', amountCents: cents(1199), note: 'SPOTIFY', categoryId: null },
      { date: '2026-02-10', amountCents: cents(1199), note: 'SPOTIFY', categoryId: null },
    ];
    expect(typicalDueDay(txns, 'SPOTIFY')).toBe(5);
  });

  it('ignores transactions from other merchants', () => {
    const txns: DetectTxn[] = [
      { date: '2026-01-01', amountCents: cents(999), note: 'NETFLIX', categoryId: null },
      { date: '2026-02-18', amountCents: cents(1199), note: 'SPOTIFY', categoryId: null },
    ];
    expect(typicalDueDay(txns, 'SPOTIFY')).toBe(18);
  });

  it('falls back to 1 with no matching transactions', () => {
    expect(typicalDueDay([], 'SPOTIFY')).toBe(1);
  });
});

describe('candidateToRecurringBillInput', () => {
  it('uses the candidate categoryId when present', () => {
    const input = candidateToRecurringBillInput(candidate({ categoryId: 'cat-fun' }), {
      dueDay: 18,
      fallbackCategoryId: 'cat-fallback',
    });
    expect(input).toEqual({
      name: 'Spotify',
      categoryId: 'cat-fun',
      amountCents: 1199,
      dueDay: 18,
    });
  });

  it('falls back when the candidate has no categoryId', () => {
    const input = candidateToRecurringBillInput(candidate({ categoryId: null }), {
      dueDay: 18,
      fallbackCategoryId: 'cat-fallback',
    });
    expect(input.categoryId).toBe('cat-fallback');
  });
});

describe('ignoredSubscriptionKey', () => {
  it('is distinct per chapter and merchant', () => {
    const a = ignoredSubscriptionKey('chapter-1', 'SPOTIFY');
    const b = ignoredSubscriptionKey('chapter-2', 'SPOTIFY');
    const c = ignoredSubscriptionKey('chapter-1', 'NETFLIX');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('is stable for the same inputs', () => {
    expect(ignoredSubscriptionKey('chapter-1', 'SPOTIFY')).toBe(
      ignoredSubscriptionKey('chapter-1', 'SPOTIFY'),
    );
  });
});
