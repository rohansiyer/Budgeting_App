/**
 * Pure median math (handoff §3.9). Edge cases: 0/1/2/3 values, even counts
 * (lower-median rule), ordering independence, and the trailing-calendar-months
 * helper across a year boundary.
 */
import { lowerMedianCents, trailingCalendarMonths } from '../median';
import { cents, type Cents } from '../../lib/money';

const C = (n: number): Cents => cents(n);

describe('lowerMedianCents', () => {
  it('0 values => null (no history basis)', () => {
    expect(lowerMedianCents([])).toBeNull();
  });

  it('1 value => that value', () => {
    expect(lowerMedianCents([C(4200)])).toBe(4200);
  });

  it('2 values (even) => the LOWER of the two', () => {
    expect(lowerMedianCents([C(3000), C(5000)])).toBe(3000);
    // order must not matter
    expect(lowerMedianCents([C(5000), C(3000)])).toBe(3000);
  });

  it('3 values (odd) => the middle value', () => {
    expect(lowerMedianCents([C(1000), C(9000), C(4000)])).toBe(4000);
  });

  it('4 values (even) => lower of the two central values', () => {
    // sorted: 1000, 3000, 7000, 9000 -> central pair (3000, 7000) -> lower 3000
    expect(lowerMedianCents([C(9000), C(1000), C(7000), C(3000)])).toBe(3000);
  });

  it('duplicates and zeros are ordinary data points', () => {
    expect(lowerMedianCents([C(0), C(0), C(5000)])).toBe(0);
    expect(lowerMedianCents([C(2500), C(2500)])).toBe(2500);
  });

  it('returns an exact input value (never a fractional average)', () => {
    // mean would be 2500; lower median is an actual element (1000).
    expect(lowerMedianCents([C(1000), C(4000)])).toBe(1000);
  });
});

describe('trailingCalendarMonths', () => {
  it('returns the 3 completed months before the reference, oldest-first', () => {
    expect(trailingCalendarMonths('2026-07', 3)).toEqual(['2026-04', '2026-05', '2026-06']);
  });

  it('crosses the year boundary correctly', () => {
    expect(trailingCalendarMonths('2026-02', 3)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('excludes the reference (current, partial) month', () => {
    expect(trailingCalendarMonths('2026-07', 3)).not.toContain('2026-07');
  });

  it('honors an arbitrary count', () => {
    expect(trailingCalendarMonths('2026-03', 1)).toEqual(['2026-02']);
    expect(trailingCalendarMonths('2026-01', 2)).toEqual(['2025-11', '2025-12']);
  });
});
