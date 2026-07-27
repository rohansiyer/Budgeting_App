import {
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  getFailureCount,
  isLocked,
  registerFailure,
  remainingLockoutMs,
  reset,
} from '../lockThrottle';

describe('lockThrottle', () => {
  beforeEach(() => {
    // Module-level state — explicitly reset between tests (mirrors what
    // production does on a successful unlock).
    reset();
  });

  it('starts unlocked with zero failures', () => {
    expect(getFailureCount()).toBe(0);
    expect(isLocked(0)).toBe(false);
    expect(remainingLockoutMs(0)).toBe(0);
  });

  it('counts failures below the threshold without locking', () => {
    const now = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      expect(registerFailure(now)).toBe(false);
    }
    expect(getFailureCount()).toBe(MAX_ATTEMPTS - 1);
    expect(isLocked(now)).toBe(false);
  });

  it('arms a lockout on the Nth (MAX_ATTEMPTS) consecutive failure', () => {
    const now = 1_000_000;
    let triggered = false;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      triggered = registerFailure(now);
    }
    expect(triggered).toBe(true);
    expect(isLocked(now)).toBe(true);
    expect(remainingLockoutMs(now)).toBe(LOCKOUT_MS);
  });

  it('stays locked for the full LOCKOUT_MS window', () => {
    const start = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS; i++) registerFailure(start);
    expect(isLocked(start + LOCKOUT_MS - 1)).toBe(true);
    expect(remainingLockoutMs(start + LOCKOUT_MS - 1)).toBe(1);
  });

  it('unlocks exactly at the lockout expiry instant', () => {
    const start = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS; i++) registerFailure(start);
    expect(isLocked(start + LOCKOUT_MS)).toBe(false);
    expect(remainingLockoutMs(start + LOCKOUT_MS)).toBe(0);
  });

  it('additional failures while locked do not extend or stack the lockout', () => {
    const start = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS; i++) registerFailure(start);
    const originalExpiry = start + LOCKOUT_MS;

    // A failure arriving mid-lockout should be a no-op on the timer.
    const midLockout = start + 5_000;
    expect(registerFailure(midLockout)).toBe(false);
    expect(remainingLockoutMs(midLockout)).toBe(originalExpiry - midLockout);
  });

  it('reset() clears the counter and lifts an active lockout immediately', () => {
    const now = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS; i++) registerFailure(now);
    expect(isLocked(now)).toBe(true);

    reset();

    expect(getFailureCount()).toBe(0);
    expect(isLocked(now)).toBe(false);
    expect(remainingLockoutMs(now)).toBe(0);
  });

  it('reset() after a successful unlock means the next failure starts a fresh count', () => {
    const now = 1_000_000;
    registerFailure(now);
    registerFailure(now);
    expect(getFailureCount()).toBe(2);

    reset(); // simulates a correct PIN entered before hitting MAX_ATTEMPTS

    expect(registerFailure(now + 1)).toBe(false);
    expect(getFailureCount()).toBe(1);
  });

  it('documented decision: an expired lockout resets the failure counter, so the very next failure does not immediately re-lock', () => {
    const start = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS; i++) registerFailure(start);
    expect(isLocked(start + LOCKOUT_MS)).toBe(false);

    // First failure after expiry: counter restarts at 1, not re-armed.
    const triggeredAgain = registerFailure(start + LOCKOUT_MS + 1);
    expect(triggeredAgain).toBe(false);
    expect(getFailureCount()).toBe(1);
    expect(isLocked(start + LOCKOUT_MS + 1)).toBe(false);
  });

  it('a fresh run of MAX_ATTEMPTS after an expired lockout arms a new lockout', () => {
    const start = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS; i++) registerFailure(start);
    const afterExpiry = start + LOCKOUT_MS + 1;

    let triggered = false;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      triggered = registerFailure(afterExpiry + i);
    }
    expect(triggered).toBe(true);
    expect(isLocked(afterExpiry + MAX_ATTEMPTS - 1)).toBe(true);
  });
});
