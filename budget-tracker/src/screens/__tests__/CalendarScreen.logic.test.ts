import {
  isCalendarMonthEmpty,
  shiftMonthKey,
  clampMonthKey,
  canGoToPrevMonth,
  canGoToNextMonth,
} from '../CalendarScreen.logic';

describe('isCalendarMonthEmpty', () => {
  test('zero transactions is the empty state', () => {
    expect(isCalendarMonthEmpty(0)).toBe(true);
  });

  test('any recorded transaction clears the empty state', () => {
    expect(isCalendarMonthEmpty(1)).toBe(false);
    expect(isCalendarMonthEmpty(42)).toBe(false);
  });
});

describe('shiftMonthKey', () => {
  test('steps forward within a year', () => {
    expect(shiftMonthKey('2026-07', 1)).toBe('2026-08');
  });

  test('steps backward within a year', () => {
    expect(shiftMonthKey('2026-07', -1)).toBe('2026-06');
  });

  test('rolls forward across a year boundary', () => {
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
  });

  test('rolls backward across a year boundary', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
  });

  test('supports multi-month deltas', () => {
    expect(shiftMonthKey('2026-01', 13)).toBe('2027-02');
    expect(shiftMonthKey('2026-01', -13)).toBe('2024-12');
  });

  test('zero delta is a no-op', () => {
    expect(shiftMonthKey('2026-07', 0)).toBe('2026-07');
  });
});

describe('clampMonthKey', () => {
  test('passes a month already within range through unchanged', () => {
    expect(clampMonthKey('2026-05', '2026-01', '2026-07')).toBe('2026-05');
  });

  test('clamps below the minimum', () => {
    expect(clampMonthKey('2025-11', '2026-01', '2026-07')).toBe('2026-01');
  });

  test('clamps above the maximum', () => {
    expect(clampMonthKey('2026-09', '2026-01', '2026-07')).toBe('2026-07');
  });

  test('a single-month range clamps everything to that month', () => {
    expect(clampMonthKey('2026-01', '2026-07', '2026-07')).toBe('2026-07');
    expect(clampMonthKey('2026-12', '2026-07', '2026-07')).toBe('2026-07');
  });
});

describe('canGoToPrevMonth / canGoToNextMonth (back-limit = chapter start, forward-limit = today)', () => {
  test('prev is enabled while the viewed month is after the chapter start month', () => {
    expect(canGoToPrevMonth('2026-07', '2026-01')).toBe(true);
  });

  test('prev is disabled once the viewed month IS the chapter start month', () => {
    expect(canGoToPrevMonth('2026-01', '2026-01')).toBe(false);
  });

  test('next is enabled while the viewed month is before the current month', () => {
    expect(canGoToNextMonth('2026-06', '2026-07')).toBe(true);
  });

  test('next is disabled once the viewed month IS the current month', () => {
    expect(canGoToNextMonth('2026-07', '2026-07')).toBe(false);
  });

  test('both clamps agree at a single-month chapter (fresh chapter, this month)', () => {
    expect(canGoToPrevMonth('2026-07', '2026-07')).toBe(false);
    expect(canGoToNextMonth('2026-07', '2026-07')).toBe(false);
  });
});
