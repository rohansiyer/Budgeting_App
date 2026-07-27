import { isDayEmpty } from '../DailyDetailScreen.logic';

describe('isDayEmpty', () => {
  test('zero transactions is the empty state', () => {
    expect(isDayEmpty(0)).toBe(true);
  });

  test('any logged transaction clears the empty state', () => {
    expect(isDayEmpty(1)).toBe(false);
    expect(isDayEmpty(7)).toBe(false);
  });
});
