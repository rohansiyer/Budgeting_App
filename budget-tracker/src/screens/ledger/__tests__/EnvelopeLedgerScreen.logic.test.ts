import {
  periodStartFor,
  shiftPeriod,
  canGoToNextPeriod,
  periodLabel,
} from '../EnvelopeLedgerScreen.logic';

describe('periodStartFor', () => {
  test('weekly cadence normalizes to the Monday of the week', () => {
    expect(periodStartFor('2026-07-08', 'weekly')).toBe('2026-07-06');
  });

  test('monthly cadence normalizes to the 1st of the month', () => {
    expect(periodStartFor('2026-07-18', 'monthly')).toBe('2026-07-01');
  });
});

describe('shiftPeriod', () => {
  test('weekly cadence steps by 7 days forward', () => {
    expect(shiftPeriod('2026-07-06', 'weekly', 1)).toBe('2026-07-13');
  });

  test('weekly cadence steps by 7 days backward', () => {
    expect(shiftPeriod('2026-07-06', 'weekly', -1)).toBe('2026-06-29');
  });

  test('monthly cadence steps by 1 calendar month forward', () => {
    expect(shiftPeriod('2026-07-01', 'monthly', 1)).toBe('2026-08-01');
  });

  test('monthly cadence steps by 1 calendar month backward', () => {
    expect(shiftPeriod('2026-07-01', 'monthly', -1)).toBe('2026-06-01');
  });

  test('monthly cadence rolls across a year boundary', () => {
    expect(shiftPeriod('2026-12-01', 'monthly', 1)).toBe('2027-01-01');
    expect(shiftPeriod('2026-01-01', 'monthly', -1)).toBe('2025-12-01');
  });
});

describe('canGoToNextPeriod', () => {
  test('weekly: enabled while the viewed week is before the current week', () => {
    expect(canGoToNextPeriod('2026-06-29', 'weekly', '2026-07-08')).toBe(true);
  });

  test('weekly: disabled once the viewed week IS the current week', () => {
    expect(canGoToNextPeriod('2026-07-06', 'weekly', '2026-07-08')).toBe(false);
  });

  test('monthly: enabled while the viewed month is before the current month', () => {
    expect(canGoToNextPeriod('2026-06-01', 'monthly', '2026-07-18')).toBe(true);
  });

  test('monthly: disabled once the viewed month IS the current month', () => {
    expect(canGoToNextPeriod('2026-07-01', 'monthly', '2026-07-18')).toBe(false);
  });
});

describe('periodLabel', () => {
  test('weekly label reads "Week of <Mon D>"', () => {
    expect(periodLabel('2026-07-06', 'weekly')).toBe('Week of Jul 6');
  });

  test('monthly label reads "<Month> <Year>"', () => {
    expect(periodLabel('2026-07-01', 'monthly')).toBe('July 2026');
  });
});
