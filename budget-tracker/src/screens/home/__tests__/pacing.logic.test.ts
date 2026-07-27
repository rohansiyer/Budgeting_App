import { cents } from '../../../lib/money';
import {
  computePacingLine,
  daysToPayday,
  daysToPaydayPhrase,
  perDayAmount,
} from '../pacing.logic';
import type { ISODate } from '../../../types/contracts';

const D = (s: string): ISODate => s as ISODate;

describe('daysToPayday', () => {
  test('counts whole days to the nearest upcoming payday', () => {
    expect(daysToPayday(D('2026-07-11'), [D('2026-07-15')])).toBe(4);
  });

  test('payday today is 0 days away, not skipped', () => {
    expect(daysToPayday(D('2026-07-11'), [D('2026-07-11')])).toBe(0);
  });

  test('ignores paydays strictly in the past, picks the next future one', () => {
    expect(daysToPayday(D('2026-07-11'), [D('2026-07-01'), D('2026-07-20')])).toBe(9);
  });

  test('null when no payday is known in the lookahead window (pre-setup)', () => {
    expect(daysToPayday(D('2026-07-11'), [])).toBeNull();
  });

  test('picks the nearest of several future paydays regardless of input order', () => {
    expect(daysToPayday(D('2026-07-11'), [D('2026-08-01'), D('2026-07-12'), D('2026-07-25')])).toBe(1);
  });
});

describe('perDayAmount', () => {
  test('divides evenly when it divides evenly', () => {
    expect(perDayAmount(cents(1000), 4)).toBe(cents(250));
  });

  test('payday today (0 days) treats the remainder as one day, not a division by zero', () => {
    expect(perDayAmount(cents(1284), 0)).toBe(cents(1284));
  });

  test('zero remaining is zero a day regardless of day count', () => {
    expect(perDayAmount(cents(0), 5)).toBe(cents(0));
  });

  test('negative safe-to-spend stays negative and cent-exact, never NaN', () => {
    const result = perDayAmount(cents(-500), 3);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeLessThan(0);
  });

  test('a single remaining day gets the whole amount', () => {
    expect(perDayAmount(cents(4321), 1)).toBe(cents(4321));
  });
});

describe('computePacingLine', () => {
  test('composes days + per-day figure from store-shaped inputs', () => {
    const line = computePacingLine({
      today: D('2026-07-11'),
      paydays: [D('2026-07-15')],
      remaining: cents(12840),
    });
    expect(line).toEqual({ daysToPayday: 4, perDay: cents(3210) });
  });

  test('hides gracefully (returns null) when there is no known payday', () => {
    expect(
      computePacingLine({ today: D('2026-07-11'), paydays: [], remaining: cents(1000) }),
    ).toBeNull();
  });
});

describe('daysToPaydayPhrase', () => {
  test('0 renders as "Payday today"', () => {
    expect(daysToPaydayPhrase(0)).toBe('Payday today');
  });

  test('1 is singular', () => {
    expect(daysToPaydayPhrase(1)).toBe('1 day to payday');
  });

  test('plural for N > 1', () => {
    expect(daysToPaydayPhrase(4)).toBe('4 days to payday');
  });
});
