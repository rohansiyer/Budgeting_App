import { isDayOnePond } from '../PondScreen.logic';

describe('isDayOnePond', () => {
  test('one duck and no evaluations is day one', () => {
    expect(isDayOnePond(1, 0)).toBe(true);
  });

  test('a flock of 1 after a hold-then-loss history is NOT day one', () => {
    // Started at 1, held a partial month, still 1 duck, but a month WAS
    // evaluated, so the starter-duck seed will never fire again.
    expect(isDayOnePond(1, 3)).toBe(false);
  });

  test('two or more ducks is never day one, regardless of evaluations', () => {
    expect(isDayOnePond(2, 0)).toBe(false);
    expect(isDayOnePond(5, 4)).toBe(false);
  });

  test('zero ducks (a 0/3 month) is never day one', () => {
    expect(isDayOnePond(0, 1)).toBe(false);
  });
});
