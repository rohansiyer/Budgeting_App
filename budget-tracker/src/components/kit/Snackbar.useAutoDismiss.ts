/**
 * Auto-dismiss timer for Snackbar, split out of Snackbar.tsx so it can be
 * unit tested directly (see StepTrack.logic.ts for why). Starts a timer
 * whenever the bar becomes visible; clears it on hide, duration change, or
 * unmount, so a screen that flips `visible` off manually never double-fires.
 */
import { useEffect } from 'react';

export function useAutoDismiss(
  visible: boolean,
  durationMs: number,
  onTimeout?: () => void,
): void {
  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => {
      onTimeout?.();
    }, durationMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, durationMs]);
}
