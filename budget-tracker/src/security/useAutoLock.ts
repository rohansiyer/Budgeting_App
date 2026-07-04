/**
 * AppState wiring for the background-lock timer. This is orchestration glue
 * meant to be mounted once near the app root (outside Team 3's screen
 * ownership) — it just calls `onLockRequired` when the configured timeout
 * has elapsed since the app was last backgrounded. The actual decision logic
 * lives in `shouldLockAfterBackground` (lockSettings.ts) so it's testable
 * without mocking AppState.
 */
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { getLockTimeoutMs, isAppLockEnabled, shouldLockAfterBackground } from './lockSettings';

export function useAutoLock(onLockRequired: () => void): void {
  const backgroundedAtRef = useRef<number | null>(null);
  const onLockRequiredRef = useRef(onLockRequired);
  onLockRequiredRef.current = onLockRequired;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (next: AppStateStatus) => {
      const now = Date.now();
      if (next === 'background' || next === 'inactive') {
        backgroundedAtRef.current = now;
        return;
      }
      if (next === 'active' && backgroundedAtRef.current !== null) {
        const backgroundedAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;

        const [enabled, timeoutMs] = await Promise.all([isAppLockEnabled(), getLockTimeoutMs()]);
        if (enabled && shouldLockAfterBackground(backgroundedAt, now, timeoutMs)) {
          onLockRequiredRef.current();
        }
      }
    });
    return () => subscription.remove();
  }, []);
}
