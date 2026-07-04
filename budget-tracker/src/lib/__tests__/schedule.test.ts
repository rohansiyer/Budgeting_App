import {
  paydaysBetween,
  toEpochDay,
  fromEpochDay,
  daysInMonth,
  clampDayToMonth,
} from '../schedule';
import type { IncomeSchedule } from '../../types/contracts';

const range = (from: string, to: string) => ({ from, to });

describe('epoch day helpers', () => {
  it('round-trips ISO dates through epoch days', () => {
    const dates = ['2024-01-01', '2024-02-29', '2023-02-28', '2024-12-31', '2000-01-01'];
    for (const d of dates) {
      expect(fromEpochDay(toEpochDay(d))).toBe(d);
    }
  });

  it('epoch days are exactly one apart for consecutive dates', () => {
    expect(toEpochDay('2024-03-02') - toEpochDay('2024-03-01')).toBe(1);
    // Leap day
    expect(toEpochDay('2024-03-01') - toEpochDay('2024-02-29')).toBe(1);
    // Non-leap year, no Feb 29
    expect(toEpochDay('2023-03-01') - toEpochDay('2023-02-28')).toBe(1);
    // Year boundary
    expect(toEpochDay('2025-01-01') - toEpochDay('2024-12-31')).toBe(1);
  });

  it('is unaffected by DST transitions (US spring-forward / fall-back)', () => {
    // 2024-03-10 is the US spring-forward date; 2024-11-03 is fall-back.
    expect(toEpochDay('2024-03-10') - toEpochDay('2024-03-09')).toBe(1);
    expect(toEpochDay('2024-03-11') - toEpochDay('2024-03-10')).toBe(1);
    expect(toEpochDay('2024-11-03') - toEpochDay('2024-11-02')).toBe(1);
    expect(toEpochDay('2024-11-04') - toEpochDay('2024-11-03')).toBe(1);
  });
});

describe('daysInMonth / clampDayToMonth', () => {
  it('knows leap years', () => {
    expect(daysInMonth(2024, 2)).toBe(29); // leap
    expect(daysInMonth(2023, 2)).toBe(28); // not leap
    expect(daysInMonth(2000, 2)).toBe(29); // divisible by 400 -> leap
    expect(daysInMonth(1900, 2)).toBe(28); // divisible by 100, not 400 -> not leap
  });

  it('knows 30 vs 31 day months', () => {
    expect(daysInMonth(2024, 4)).toBe(30);
    expect(daysInMonth(2024, 1)).toBe(31);
    expect(daysInMonth(2024, 12)).toBe(31);
  });

  it('clamps into range, leaving valid days untouched', () => {
    expect(clampDayToMonth(15, 2024, 2)).toBe(15);
    expect(clampDayToMonth(31, 2024, 2)).toBe(29); // leap Feb
    expect(clampDayToMonth(31, 2023, 2)).toBe(28); // non-leap Feb
    expect(clampDayToMonth(31, 2024, 4)).toBe(30); // April has 30 days
    expect(clampDayToMonth(0, 2024, 4)).toBe(1);
  });
});

describe('paydaysBetween — weekly', () => {
  const schedule: IncomeSchedule = { kind: 'weekly', anchorDate: '2024-01-03' }; // Wednesday

  it('lists every 7th day starting at the anchor', () => {
    const result = paydaysBetween(schedule, range('2024-01-01', '2024-01-31'));
    expect(result).toEqual([
      '2024-01-03',
      '2024-01-10',
      '2024-01-17',
      '2024-01-24',
      '2024-01-31',
    ]);
  });

  it('includes paydays on the exact from/to boundary', () => {
    const result = paydaysBetween(schedule, range('2024-01-03', '2024-01-03'));
    expect(result).toEqual(['2024-01-03']);
  });

  it('computes correctly when the anchor is in the future relative to the range', () => {
    // Anchor is 2024-06-05; ask for a range entirely before it.
    const futureAnchor: IncomeSchedule = { kind: 'weekly', anchorDate: '2024-06-05' };
    const result = paydaysBetween(futureAnchor, range('2024-01-01', '2024-01-31'));
    // 2024-06-05 is a Wednesday; walking backward by 7s lands on Wednesdays
    // in January too.
    expect(result).toEqual([
      '2024-01-03',
      '2024-01-10',
      '2024-01-17',
      '2024-01-24',
      '2024-01-31',
    ]);
  });

  it('spans a year boundary', () => {
    // 2023-12-20 is itself 14 days (two weeks) before the anchor, so it's
    // a Wednesday and included at the range's lower boundary.
    const result = paydaysBetween(schedule, range('2023-12-20', '2024-01-10'));
    expect(result).toEqual(['2023-12-20', '2023-12-27', '2024-01-03', '2024-01-10']);
  });

  it('returns [] for an empty/inverted range', () => {
    expect(paydaysBetween(schedule, range('2024-02-01', '2024-01-01'))).toEqual([]);
  });

  it('is stable across a DST-transition week (spring forward)', () => {
    const dstAnchor: IncomeSchedule = { kind: 'weekly', anchorDate: '2024-03-06' }; // Wed before DST
    const result = paydaysBetween(dstAnchor, range('2024-03-01', '2024-03-31'));
    expect(result).toEqual(['2024-03-06', '2024-03-13', '2024-03-20', '2024-03-27']);
  });
});

describe('paydaysBetween — biweekly', () => {
  const schedule: IncomeSchedule = { kind: 'biweekly', anchorDate: '2024-01-05' }; // Friday

  it('lists every 14th day starting at the anchor', () => {
    const result = paydaysBetween(schedule, range('2024-01-01', '2024-03-01'));
    // 2024-01-05 + 14*4 = 2024-03-01, which is included (inclusive upper bound).
    expect(result).toEqual([
      '2024-01-05',
      '2024-01-19',
      '2024-02-02',
      '2024-02-16',
      '2024-03-01',
    ]);
  });

  it('computes backward correctly for a range before the anchor', () => {
    const result = paydaysBetween(schedule, range('2023-12-01', '2023-12-31'));
    // Walking back by 14s from 2024-01-05: 12-22, 12-08.
    expect(result).toEqual(['2023-12-08', '2023-12-22']);
  });

  it('spans a DST fall-back boundary without drifting off the 14-day cadence', () => {
    const schedule2: IncomeSchedule = { kind: 'biweekly', anchorDate: '2024-10-18' };
    const result = paydaysBetween(schedule2, range('2024-10-01', '2024-11-30'));
    expect(result).toEqual([
      '2024-10-04',
      '2024-10-18',
      '2024-11-01',
      '2024-11-15',
      '2024-11-29',
    ]);
    // Confirm exact 14-day spacing straight through 2024-11-03 (fall-back).
    for (let i = 1; i < result.length; i++) {
      expect(toEpochDay(result[i]) - toEpochDay(result[i - 1])).toBe(14);
    }
  });
});

describe('paydaysBetween — monthly', () => {
  it('uses the anchor day-of-month, unclamped when it fits', () => {
    const schedule: IncomeSchedule = { kind: 'monthly', anchorDate: '2024-01-15' };
    const result = paydaysBetween(schedule, range('2024-01-01', '2024-04-30'));
    expect(result).toEqual(['2024-01-15', '2024-02-15', '2024-03-15', '2024-04-15']);
  });

  it('clamps a day-31 anchor into shorter months (leap Feb, April)', () => {
    const schedule: IncomeSchedule = { kind: 'monthly', anchorDate: '2024-01-31' };
    const result = paydaysBetween(schedule, range('2024-01-01', '2024-04-30'));
    expect(result).toEqual(['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30']);
  });

  it('clamps into non-leap February', () => {
    const schedule: IncomeSchedule = { kind: 'monthly', anchorDate: '2023-01-31' };
    const result = paydaysBetween(schedule, range('2023-01-01', '2023-02-28'));
    expect(result).toEqual(['2023-01-31', '2023-02-28']);
  });

  it('spans a year boundary', () => {
    const schedule: IncomeSchedule = { kind: 'monthly', anchorDate: '2024-01-31' };
    const result = paydaysBetween(schedule, range('2023-11-01', '2024-02-29'));
    expect(result).toEqual(['2023-11-30', '2023-12-31', '2024-01-31', '2024-02-29']);
  });

  it('computes for a range entirely before the anchor date (anchor in the future)', () => {
    // Anchor is over a year after the queried range; only its day-of-month
    // (31) matters for monthly projection.
    const schedule: IncomeSchedule = { kind: 'monthly', anchorDate: '2025-08-31' };
    const result = paydaysBetween(schedule, range('2024-01-01', '2024-03-31'));
    expect(result).toEqual(['2024-01-31', '2024-02-29', '2024-03-31']);
  });
});

describe('paydaysBetween — semimonthly', () => {
  it('emits both configured days per month when both are valid', () => {
    const schedule: IncomeSchedule = {
      kind: 'semimonthly',
      anchorDate: '2024-01-01',
      semimonthlyDays: [1, 15],
    };
    const result = paydaysBetween(schedule, range('2024-01-01', '2024-02-29'));
    expect(result).toEqual(['2024-01-01', '2024-01-15', '2024-02-01', '2024-02-15']);
  });

  it('clamps [1, 30] into February per the spec example ([1, 30] -> [1, 28])', () => {
    const schedule: IncomeSchedule = {
      kind: 'semimonthly',
      anchorDate: '2024-01-01',
      semimonthlyDays: [1, 30],
    };
    const result = paydaysBetween(schedule, range('2023-02-01', '2023-02-28'));
    expect(result).toEqual(['2023-02-01', '2023-02-28']);
  });

  it('clamps [1, 30] into a leap February as [1, 29]', () => {
    const schedule: IncomeSchedule = {
      kind: 'semimonthly',
      anchorDate: '2024-01-01',
      semimonthlyDays: [1, 30],
    };
    const result = paydaysBetween(schedule, range('2024-02-01', '2024-02-29'));
    expect(result).toEqual(['2024-02-01', '2024-02-29']);
  });

  it('collapses to a single payday when both days clamp to the same date', () => {
    const schedule: IncomeSchedule = {
      kind: 'semimonthly',
      anchorDate: '2024-01-01',
      semimonthlyDays: [30, 31],
    };
    const result = paydaysBetween(schedule, range('2023-02-01', '2023-02-28'));
    expect(result).toEqual(['2023-02-28']);
  });

  it('handles days out of natural order ([15, 1]) by sorting output ascending', () => {
    const schedule: IncomeSchedule = {
      kind: 'semimonthly',
      anchorDate: '2024-01-01',
      semimonthlyDays: [15, 1],
    };
    const result = paydaysBetween(schedule, range('2024-03-01', '2024-03-31'));
    expect(result).toEqual(['2024-03-01', '2024-03-15']);
  });

  it('spans a year boundary across several months', () => {
    const schedule: IncomeSchedule = {
      kind: 'semimonthly',
      anchorDate: '2024-01-01',
      semimonthlyDays: [1, 15],
    };
    // Dec's occurrences (1, 15) fall before the range's lower bound; only
    // Jan's do (1, 15) — 16 is not a configured semimonthly day.
    const result = paydaysBetween(schedule, range('2023-12-16', '2024-01-16'));
    expect(result).toEqual(['2024-01-01', '2024-01-15']);
  });

  it('throws when semimonthlyDays is missing', () => {
    const schedule: IncomeSchedule = { kind: 'semimonthly', anchorDate: '2024-01-01' };
    expect(() => paydaysBetween(schedule, range('2024-01-01', '2024-01-31'))).toThrow();
  });
});

describe('DST/timezone independence (adversarial)', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('produces identical results in UTC and a DST-observing timezone', () => {
    const schedule: IncomeSchedule = { kind: 'monthly', anchorDate: '2024-01-31' };
    const r = range('2024-01-01', '2024-12-31');

    process.env.TZ = 'UTC';
    const utcResult = paydaysBetween(schedule, r);

    process.env.TZ = 'America/New_York';
    const nyResult = paydaysBetween(schedule, r);

    expect(nyResult).toEqual(utcResult);
  });
});

describe('result invariants', () => {
  it('is always sorted ascending with no duplicates, across all kinds', () => {
    const schedules: IncomeSchedule[] = [
      { kind: 'weekly', anchorDate: '2024-01-03' },
      { kind: 'biweekly', anchorDate: '2024-01-05' },
      { kind: 'monthly', anchorDate: '2024-01-31' },
      { kind: 'semimonthly', anchorDate: '2024-01-01', semimonthlyDays: [1, 30] },
    ];
    const r = range('2023-06-01', '2025-03-15');
    for (const schedule of schedules) {
      const result = paydaysBetween(schedule, r);
      const sorted = [...result].sort();
      expect(result).toEqual(sorted);
      expect(new Set(result).size).toBe(result.length);
    }
  });
});
