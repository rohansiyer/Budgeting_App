/**
 * Stepped-motion helpers. The Midnight system uses discrete steps only — no
 * eased/continuous animation — and must respect the OS "reduce motion" setting.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Live "reduce motion" flag from the OS accessibility settings. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setReduced(v);
      })
      .catch(() => {
        /* default: motion allowed */
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setReduced(v)
    );
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}

/** Snap a 0..1 progress value to `steps` discrete stops (stepped motion). */
export function stepProgress(progress: number, steps = 8): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return Math.round(clamped * steps) / steps;
}
