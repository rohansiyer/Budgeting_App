import { cents } from '../../../lib/money';
import {
  goalTargetError,
  GOAL_TARGET_MAX_CENTS,
  GOAL_TARGET_MAX_MESSAGE,
} from '../goalsForm.logic';

describe('goalTargetError (client half of the $1M goal-target cap)', () => {
  it('accepts a normal target', () => {
    expect(goalTargetError(cents(120000))).toBeNull();
  });

  it('accepts the cap exactly ($1,000,000.00) — matches the store, which only rejects >cap', () => {
    expect(goalTargetError(cents(GOAL_TARGET_MAX_CENTS))).toBeNull();
  });

  it('rejects one cent over the cap with the friendly message', () => {
    expect(goalTargetError(cents(GOAL_TARGET_MAX_CENTS + 1))).toBe(GOAL_TARGET_MAX_MESSAGE);
  });

  it('rejects an absurdly large target', () => {
    expect(goalTargetError(cents(999_999_999_99))).toBe(GOAL_TARGET_MAX_MESSAGE);
  });

  it('an unparsed (null) amount is not an error — submit is simply disabled', () => {
    expect(goalTargetError(null)).toBeNull();
  });

  it('the cap constant matches the store-side GOAL_TARGET_CAP_CENTS value', () => {
    expect(GOAL_TARGET_MAX_CENTS).toBe(100_000_000);
  });

  it('the message is friendly copy, never a raw store error', () => {
    expect(GOAL_TARGET_MAX_MESSAGE).toBe('Goal targets max out at $1,000,000.');
    expect(GOAL_TARGET_MAX_MESSAGE).not.toMatch(/addGoal|targetCents/);
  });
});
