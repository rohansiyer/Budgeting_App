import { cents } from '../../lib/money';
import {
  buildSpendTrend,
  goalsMetCount,
  lastSixMonths,
  recapHeaderLine,
  trendBlockValue,
} from '../ResultsScreen.logic';

describe('lastSixMonths', () => {
  test('returns 6 months oldest-first, ending at the given month', () => {
    const months = lastSixMonths('2026-07');
    expect(months.map((m) => m.monthKey)).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
    ]);
  });

  test('handles year rollover', () => {
    const months = lastSixMonths('2026-02');
    expect(months.map((m) => m.monthKey)).toEqual([
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  test('labels are single-letter month initials', () => {
    const months = lastSixMonths('2026-06'); // Jan..Jun
    expect(months.map((m) => m.label)).toEqual(['J', 'F', 'M', 'A', 'M', 'J']);
  });

  test('malformed input degrades to a single entry instead of throwing', () => {
    expect(lastSixMonths('not-a-month')).toEqual([{ monthKey: 'not-a-month', label: '?' }]);
  });
});

describe('buildSpendTrend', () => {
  test('maps each of the 6 months through totalFor, preserving order', () => {
    const totals = new Map<string, number>([
      ['2026-02', 10000],
      ['2026-07', 30000],
    ]);
    const columns = buildSpendTrend('2026-07', (m) => cents(totals.get(m) ?? 0));
    expect(columns).toHaveLength(6);
    expect(columns[0]).toEqual({ label: 'F', value: cents(10000) });
    expect(columns[5]).toEqual({ label: 'J', value: cents(30000) });
    expect(columns[1].value).toBe(cents(0));
  });
});

describe('trendBlockValue', () => {
  test('picks the smallest denomination that keeps the max at or under 8 blocks', () => {
    expect(trendBlockValue([cents(0), cents(3900)])).toBe(cents(500)); // 3900/500 = 7.8
    expect(trendBlockValue([cents(12000)])).toBe(cents(2500)); // 12000/2500 = 4.8, but 1000*8=8000 < 12000
  });

  test('an all-zero trend still returns the smallest denomination', () => {
    expect(trendBlockValue([cents(0), cents(0)])).toBe(cents(500));
  });

  test('a very large max falls back to the top denomination', () => {
    expect(trendBlockValue([cents(100_000_00)])).toBe(cents(100000));
  });
});

describe('goalsMetCount', () => {
  test('counts only the met results', () => {
    expect(goalsMetCount([{ met: true }, { met: false }, { met: true }])).toBe(2);
    expect(goalsMetCount([{ met: false }, { met: false }, { met: false }])).toBe(0);
    expect(goalsMetCount([{ met: true }, { met: true }, { met: true }])).toBe(3);
  });
});

describe('recapHeaderLine', () => {
  test('gain phrasing matches the mockup exactly', () => {
    expect(recapHeaderLine(3, 'gain')).toBe('3 of 3 goals, a duck waddles in.');
  });
  test('lose, hold and fancy_upgrade phrase distinctly, never mentioning losing a duck as blame', () => {
    expect(recapHeaderLine(0, 'lose')).toBe('0 of 3 goals, a duck waddles off.');
    expect(recapHeaderLine(2, 'hold')).toBe('2 of 3 goals, the flock holds steady.');
    expect(recapHeaderLine(3, 'fancy_upgrade')).toBe('3 of 3 goals, the flock gets fancier.');
  });
});
