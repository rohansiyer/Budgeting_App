/**
 * Pure, in-memory PIN-attempt throttle for LockScreen (F6-3).
 *
 * No timers, no persistence — module-level state resets on app restart
 * (memory-only, matching a "recent attempts" spirit rather than a permanent
 * account lock). `now` is always passed in by the caller so this stays
 * trivially unit-testable with fake `now` values instead of real timers.
 *
 * Semantics:
 *  - MAX_ATTEMPTS (5) consecutive failed attempts (registerFailure()) arm a
 *    LOCKOUT_MS (30s) lockout.
 *  - isLocked(now) is a pure query: true while `now` is before the lockout's
 *    expiry.
 *  - reset() clears both the failure counter and any active lockout — call
 *    it on a successful unlock.
 *  - Decision: once a lockout's window elapses, the failure counter is also
 *    cleared as a side effect of the next registerFailure() call (an expired
 *    lockout is a full reset, not "one free retry then re-lock on the very
 *    next miss") — the next run of MAX_ATTEMPTS starts counting from zero.
 *    isLocked()/remainingLockoutMs() alone never mutate state; only
 *    registerFailure() and reset() do.
 */

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 30_000;

let failureCount = 0;
let lockedUntil: number | null = null;

/**
 * Record a failed PIN attempt as of `now`. Returns true iff this call armed
 * a brand-new lockout (crossing the MAX_ATTEMPTS threshold). While an
 * existing lockout is still active, failures are not expected to be
 * registered at all (callers should gate input via isLocked() first) but if
 * one arrives anyway it's ignored — it doesn't stack/extend the lockout.
 */
export function registerFailure(now: number): boolean {
  if (lockedUntil !== null && now < lockedUntil) {
    return false;
  }
  if (lockedUntil !== null && now >= lockedUntil) {
    // Lockout expired — full reset before counting this new failure.
    lockedUntil = null;
    failureCount = 0;
  }
  failureCount += 1;
  if (failureCount >= MAX_ATTEMPTS) {
    lockedUntil = now + LOCKOUT_MS;
    return true;
  }
  return false;
}

/** Clear the failure counter and any active lockout. Call on successful unlock. */
export function reset(): void {
  failureCount = 0;
  lockedUntil = null;
}

/** Whether attempts are currently locked out, as of `now`. Pure query — no mutation. */
export function isLocked(now: number): boolean {
  return lockedUntil !== null && now < lockedUntil;
}

/** Milliseconds remaining in the current lockout as of `now`, or 0 if not locked. */
export function remainingLockoutMs(now: number): number {
  if (lockedUntil === null) return 0;
  return Math.max(0, lockedUntil - now);
}

/** Current consecutive-failure count. Exposed for tests/debugging only. */
export function getFailureCount(): number {
  return failureCount;
}
