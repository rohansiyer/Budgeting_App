import { isCalendarMonthEmpty } from '../CalendarScreen.logic';

describe('isCalendarMonthEmpty', () => {
  test('zero transactions is the empty state', () => {
    expect(isCalendarMonthEmpty(0)).toBe(true);
  });

  test('any recorded transaction clears the empty state', () => {
    expect(isCalendarMonthEmpty(1)).toBe(false);
    expect(isCalendarMonthEmpty(42)).toBe(false);
  });
});
