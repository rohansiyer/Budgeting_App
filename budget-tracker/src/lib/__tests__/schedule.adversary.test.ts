/**
 * Team 2 ADVERSARY — schedule.ts attack tests.
 *
 * Convention: a FAILING test in this file is a CONFIRMED BUG (left in place
 * on purpose). A PASSING test documents verified-safe behavior.
 */
import { paydaysBetween, toEpochDay, fromEpochDay } from '../schedule';
import type { IncomeSchedule } from '../../types/contracts';

const range = (from: string, to: string) => ({ from, to });

// ---------------------------------------------------------------------------
// VERIFIED-SAFE: biweekly back-projection parity with a FAR-FUTURE anchor.
// ---------------------------------------------------------------------------
describe('[safe] biweekly back-projection phase parity (anchor far in future)', () => {
  it('preserves the 14-day phase exactly for a range years before the anchor', () => {
    const anchor = '2030-06-14';
    const schedule: IncomeSchedule = { kind: 'biweekly', anchorDate: anchor };
    const anchorDay = toEpochDay(anchor);
    // Sweep many independent ranges in the distant past.
    for (const [from, to] of [
      ['2024-01-01', '2024-03-31'],
      ['2019-11-15', '2020-02-15'], // spans a leap-year boundary
      ['2000-01-01', '2000-12-31'],
    ] as const) {
      const result = paydaysBetween(schedule, range(from, to));
      for (let i = 0; i < result.length; i++) {
        // Every emitted date is exactly on the anchor's 14-day lattice.
        // (((x % 14) + 14) % 14) normalizes JS's -0 / negative-mod for past ranges.
        expect((((toEpochDay(result[i]) - anchorDay) % 14) + 14) % 14).toBe(0);
        if (i > 0) {
          expect(toEpochDay(result[i]) - toEpochDay(result[i - 1])).toBe(14);
        }
        // ...and strictly inside the requested window.
        expect(result[i] >= from && result[i] <= to).toBe(true);
      }
    }
  });

  it('from===to lands the payday only when the day is on the lattice', () => {
    const schedule: IncomeSchedule = { kind: 'biweekly', anchorDate: '2030-06-14' };
    // 2024-01-05: (epoch - anchor) % 14 === 0 ? compute a known on-lattice day.
    const onLattice = fromEpochDay(toEpochDay('2030-06-14') - 14 * 170);
    expect(paydaysBetween(schedule, range(onLattice, onLattice))).toEqual([onLattice]);
    const offLattice = fromEpochDay(toEpochDay(onLattice) + 1);
    expect(paydaysBetween(schedule, range(offLattice, offLattice))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// VERIFIED-SAFE: semimonthly collapse / clamp behavior.
// ---------------------------------------------------------------------------
describe('[safe] semimonthly [31,31] and [1,31] collapse/clamp', () => {
  it('[31,31] collapses to one payday, correctly ordered, in every month', () => {
    const schedule: IncomeSchedule = {
      kind: 'semimonthly',
      anchorDate: '2024-01-01',
      semimonthlyDays: [31, 31],
    };
    const result = paydaysBetween(schedule, range('2024-01-01', '2024-04-30'));
    // Jan 31, Feb 29 (leap), Mar 31, Apr 30 — exactly one per month, ascending, no dupes.
    expect(result).toEqual(['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30']);
    expect(new Set(result).size).toBe(result.length);
  });

  it('[1,31] clamps independently: Feb -> [1,29], Apr -> [1,30]', () => {
    const schedule: IncomeSchedule = {
      kind: 'semimonthly',
      anchorDate: '2024-01-01',
      semimonthlyDays: [1, 31],
    };
    expect(paydaysBetween(schedule, range('2024-02-01', '2024-02-29'))).toEqual([
      '2024-02-01',
      '2024-02-29',
    ]);
    expect(paydaysBetween(schedule, range('2024-04-01', '2024-04-30'))).toEqual([
      '2024-04-01',
      '2024-04-30',
    ]);
  });
});

// ---------------------------------------------------------------------------
// VERIFIED-SAFE: degenerate ranges.
// ---------------------------------------------------------------------------
describe('[safe] degenerate ranges', () => {
  it('from>to returns [] for every kind (defined behavior)', () => {
    const schedules: IncomeSchedule[] = [
      { kind: 'weekly', anchorDate: '2024-01-03' },
      { kind: 'biweekly', anchorDate: '2024-01-05' },
      { kind: 'monthly', anchorDate: '2024-01-31' },
      { kind: 'semimonthly', anchorDate: '2024-01-01', semimonthlyDays: [1, 15] },
    ];
    for (const s of schedules) {
      expect(paydaysBetween(s, range('2024-06-01', '2024-01-01'))).toEqual([]);
    }
  });

  it('monthly anchored on the 31st across a full year clamps every short month', () => {
    const schedule: IncomeSchedule = { kind: 'monthly', anchorDate: '2024-01-31' };
    expect(paydaysBetween(schedule, range('2024-01-01', '2024-12-31'))).toEqual([
      '2024-01-31',
      '2024-02-29',
      '2024-03-31',
      '2024-04-30',
      '2024-05-31',
      '2024-06-30',
      '2024-07-31',
      '2024-08-31',
      '2024-09-30',
      '2024-10-31',
      '2024-11-30',
      '2024-12-31',
    ]);
  });
});

// ---------------------------------------------------------------------------
// CONFIRMED BUG (low severity): an impossible-but-well-shaped calendar date
// is NOT rejected. parseISODate validates month∈[1,12] and day∈[1,31] and
// throws otherwise, but does NOT validate day-against-month, so Date.UTC
// silently rolls it over. '2024-02-31' becomes 2024-03-02 with no error.
// A weekly/biweekly anchor typed as an impossible date (the UI only checks
// the YYYY-MM-DD *shape*) therefore silently shifts the entire pay phase.
// ---------------------------------------------------------------------------
describe('[BUG] impossible calendar date silently rolls over instead of throwing', () => {
  it('toEpochDay should reject 2024-02-31 the way it rejects month 13, but does not', () => {
    // Sanity: an out-of-range month DOES throw — so the module clearly intends
    // to reject malformed dates.
    expect(() => toEpochDay('2024-13-01')).toThrow();
    // ...but an out-of-range *day for the month* is silently accepted:
    // this expectation FAILS today (toEpochDay('2024-02-31') === 2024-03-02).
    expect(() => toEpochDay('2024-02-31')).toThrow();
  });
});
