import {
  appendDigits,
  backspaceDigits,
  digitsToCents,
  liveFeedback,
  shouldPromptBorrow,
  overspendAmount,
  cadenceCycleNoun,
  borrowPromptCopy,
  confirmLabel,
  isValidDraft,
  recentCategories,
  recentWindowRange,
  commitSnackbarMessage,
  MAX_AMOUNT_DIGITS,
} from '../AddExpenseSheet.logic';
import { cents, ZERO } from '../../../lib/money';
import type { CategoryConfig } from '../../../types/contracts';

function cat(id: string, overrides: Partial<CategoryConfig> = {}): CategoryConfig {
  return {
    id,
    name: id,
    colorKey: 'amber',
    fixed: false,
    cadence: 'weekly',
    envelope: { period: 'weekly', budget: cents(5000), carryoverDefault: 'ask' },
    ...overrides,
  };
}

describe('keypad digit accumulation', () => {
  it('accumulates digits left to right: 1 2 4 0 -> $12.40', () => {
    let raw = '';
    for (const d of ['1', '2', '4', '0']) raw = appendDigits(raw, d);
    expect(raw).toBe('1240');
    expect(digitsToCents(raw)).toBe(1240);
  });

  it('handles leading zeros: 0 0 5 -> $0.05', () => {
    let raw = '';
    raw = appendDigits(raw, '0');
    raw = appendDigits(raw, '0');
    raw = appendDigits(raw, '5');
    expect(raw).toBe('005');
    expect(digitsToCents(raw)).toBe(5);
  });

  it('empty raw is ZERO cents, not NaN', () => {
    expect(digitsToCents('')).toBe(ZERO);
  });

  it('the 00 key appends two zeros in one keystroke', () => {
    let raw = appendDigits('', '1');
    raw = appendDigits(raw, '00');
    expect(raw).toBe('100');
    expect(digitsToCents(raw)).toBe(100); // $1.00
  });

  it('backspace removes the last typed digit', () => {
    let raw = '1240';
    raw = backspaceDigits(raw);
    expect(raw).toBe('124');
    expect(digitsToCents(raw)).toBe(124);
  });

  it('backspacing an empty string is a no-op', () => {
    expect(backspaceDigits('')).toBe('');
  });

  it('caps at MAX_AMOUNT_DIGITS and ignores further keystrokes', () => {
    let raw = '1'.repeat(MAX_AMOUNT_DIGITS);
    const capped = appendDigits(raw, '9');
    expect(capped).toBe(raw); // unchanged: the extra digit is dropped
    expect(capped.length).toBe(MAX_AMOUNT_DIGITS);
  });

  it('caps a multi-char "00" keystroke to the max length rather than overshooting', () => {
    const raw = '1'.repeat(MAX_AMOUNT_DIGITS - 1); // one digit short of the cap
    const next = appendDigits(raw, '00');
    expect(next.length).toBe(MAX_AMOUNT_DIGITS);
  });
});

describe('live feedback math', () => {
  it('shows remaining left after the draft when it does not overspend', () => {
    const fb = liveFeedback('Food', cents(3900), cents(1240));
    expect(fb.danger).toBe(false);
    expect(fb.remainingAfter).toBe(2660);
    expect(fb.text).toBe('Food: $26.60 left after this');
  });

  it('flags danger and shows the over-amount when the draft would go negative', () => {
    const fb = liveFeedback('Fun', cents(3640), cents(5000));
    expect(fb.danger).toBe(true);
    expect(fb.remainingAfter).toBe(-1360);
    expect(fb.text).toBe('Fun: $13.60 over after this');
  });

  it('an exact-match draft (remaining hits zero) is not danger', () => {
    const fb = liveFeedback('Gas', cents(1000), cents(1000));
    expect(fb.danger).toBe(false);
    expect(fb.remainingAfter).toBe(0);
  });
});

describe('borrow-prompt trigger threshold', () => {
  it('does not trigger when the draft is within remaining', () => {
    expect(shouldPromptBorrow(cents(3900), cents(1240))).toBe(false);
    expect(overspendAmount(cents(3900), cents(1240))).toBe(0);
  });

  it('does not trigger on an exact match', () => {
    expect(shouldPromptBorrow(cents(1000), cents(1000))).toBe(false);
  });

  it('triggers the instant the draft exceeds remaining by even one cent', () => {
    expect(shouldPromptBorrow(cents(999), cents(1000))).toBe(true);
    expect(overspendAmount(cents(999), cents(1000))).toBe(1);
  });

  it('computes the overspend amount for the mockup figures', () => {
    expect(overspendAmount(cents(3640), cents(5000))).toBe(1360);
  });
});

describe('borrow-prompt copy: weekly vs monthly cadence', () => {
  it('weekly cadence names "week" throughout', () => {
    expect(cadenceCycleNoun('weekly')).toBe('week');
    const copy = borrowPromptCopy({
      categoryName: 'Fun',
      cadence: 'weekly',
      overspend: cents(1360),
      nextCycleStartsWith: cents(5000),
    });
    expect(copy.headline).toBe('Fun is $13.60 over this week');
    expect(copy.body).toBe(
      "Pull budget forward from Fun's next cycle? Fun runs weekly for you. " +
        'Next week would start with $36.40 instead of $50.00.',
    );
    expect(copy.primaryLabel).toBe('Borrow $13.60 from next week');
    expect(copy.ghostLabel).toBe('Not now');
  });

  it('monthly cadence names "month" throughout', () => {
    expect(cadenceCycleNoun('monthly')).toBe('month');
    const copy = borrowPromptCopy({
      categoryName: 'School',
      cadence: 'monthly',
      overspend: cents(2000),
      nextCycleStartsWith: cents(10000),
    });
    expect(copy.headline).toBe('School is $20.00 over this month');
    expect(copy.body).toContain('School runs monthly for you.');
    expect(copy.body).toContain('Next month would start with $80.00 instead of $100.00.');
    expect(copy.primaryLabel).toBe('Borrow $20.00 from next month');
  });

  it('copy contains no em dashes', () => {
    const copy = borrowPromptCopy({
      categoryName: 'Fun',
      cadence: 'weekly',
      overspend: cents(1360),
      nextCycleStartsWith: cents(5000),
    });
    expect(copy.headline).not.toMatch(/—/);
    expect(copy.body).not.toMatch(/—/);
    expect(copy.primaryLabel).not.toMatch(/—/);
  });
});

describe('confirm label + validity', () => {
  it('names the action with exact dollars', () => {
    expect(confirmLabel('Food', cents(1240))).toBe('Add $12.40 to Food');
  });

  it('is invalid until amount > 0 and a category is chosen', () => {
    expect(isValidDraft(ZERO, 'food')).toBe(false);
    expect(isValidDraft(cents(1240), '')).toBe(false);
    expect(isValidDraft(cents(1240), 'food')).toBe(true);
  });
});

describe('recent-category selection', () => {
  const categories = [cat('food'), cat('fun'), cat('transit'), cat('school'), cat('fixed', { fixed: true, envelope: null })];

  it('ranks by usage count within the window, most-used first', () => {
    const ids = ['fun', 'food', 'food', 'transit', 'food'];
    const picked = recentCategories(categories, ids, 4);
    expect(picked.map((c) => c.id)).toEqual(['food', 'fun', 'transit', 'school']);
  });

  it('breaks ties by first-seen order', () => {
    const ids = ['transit', 'food']; // one use each, transit seen first
    const picked = recentCategories(categories, ids, 2);
    expect(picked.map((c) => c.id)).toEqual(['transit', 'food']);
  });

  it('fills remaining slots from enveloped categories when fewer than limit recent', () => {
    const ids = ['fun'];
    const picked = recentCategories(categories, ids, 4);
    expect(picked[0].id).toBe('fun');
    expect(picked).toHaveLength(4);
    // fixed (no envelope) never fills a slot
    expect(picked.some((c) => c.id === 'fixed')).toBe(false);
  });

  it('falls back to the first 4 enveloped categories when nothing recent fired', () => {
    const picked = recentCategories(categories, [], 4);
    expect(picked.map((c) => c.id)).toEqual(['food', 'fun', 'transit', 'school']);
  });

  it('ignores recent activity in categories that no longer exist', () => {
    const picked = recentCategories(categories, ['ghost', 'food'], 4);
    expect(picked[0].id).toBe('food');
  });
});

describe('recentWindowRange', () => {
  it('spans 14 days inclusive of the given date by default', () => {
    const range = recentWindowRange('2026-07-11');
    expect(range).toEqual({ from: '2026-06-28', to: '2026-07-11' });
  });
});

describe('commitSnackbarMessage', () => {
  it('names the category and exact amount when no borrow happened', () => {
    expect(commitSnackbarMessage('Food', cents(1240), false)).toBe('Added $12.40 to Food.');
  });

  it('discloses that undo will not reverse a same-confirm borrow', () => {
    expect(commitSnackbarMessage('Fun', cents(5000), true)).toBe(
      'Added $50.00 to Fun. Undo removes the expense but keeps the borrow.',
    );
  });
});
