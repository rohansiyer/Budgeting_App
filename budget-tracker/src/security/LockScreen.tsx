/**
 * App-lock screen: PIN keypad with an optional biometric shortcut.
 *
 * Standalone on purpose — Team 3 owns `src/components/kit/**` (PixelBox,
 * HardButton, …) and it's being built in parallel, so this renders its own
 * square/hairline "quiet pixel instrument" look directly against
 * `src/theme/tokens.ts` (the shared contract file) rather than the kit.
 *
 * // TODO(team3): swap the manual View/Pressable styling below for
 * // PixelBox + HardButton once the kit lands, so this picks up any kit-wide
 * // a11y/motion polish for free.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';

import { color, pixel, space, type } from '../theme/tokens';
import { PIN_LENGTH, verifyPin } from './pinStorage';
import { authenticateWithBiometrics, isBiometricHardwareAvailable } from './biometrics';
import { isBiometricEnabled } from './lockSettings';
import {
  isLocked as isThrottleLocked,
  registerFailure,
  remainingLockoutMs,
  reset as resetThrottle,
} from './lockThrottle';

export interface LockScreenProps {
  /** Called once the user has proven identity (PIN or biometric). */
  onUnlock: () => void;
  title?: string;
}

const KEYPAD_ROWS: readonly (readonly string[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['bio', '0', 'del'],
];

export function LockScreen({ onUnlock, title = 'Enter PIN' }: LockScreenProps) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  // Throttle (F6-3) is a module-level singleton that survives remounts of
  // this screen within the same app session, so initialize from it rather
  // than assuming unlocked.
  const [locked, setLocked] = useState(() => isThrottleLocked(Date.now()));
  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState(() =>
    Math.ceil(remainingLockoutMs(Date.now()) / 1000),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [enabled, hardwareOk] = await Promise.all([isBiometricEnabled(), isBiometricHardwareAvailable()]);
      if (!cancelled) setBiometricReady(enabled && hardwareOk);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live countdown while locked out; stops (and clears `locked`) once the
  // throttle's own clock says the window has elapsed.
  useEffect(() => {
    if (!locked) return;
    const tick = () => {
      const remaining = remainingLockoutMs(Date.now());
      if (remaining <= 0) {
        setLocked(false);
        setLockoutSecondsLeft(0);
      } else {
        setLockoutSecondsLeft(Math.ceil(remaining / 1000));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [locked]);

  const submit = useCallback(async (pin: string) => {
    setChecking(true);
    const ok = await verifyPin(pin);
    setChecking(false);
    if (ok) {
      resetThrottle();
      onUnlock();
      return;
    }
    setDigits('');
    const now = Date.now();
    const justLocked = registerFailure(now);
    if (justLocked) {
      setLocked(true);
      setLockoutSecondsLeft(Math.ceil(remainingLockoutMs(now) / 1000));
      setError(false);
      AccessibilityInfo.announceForAccessibility?.('Too many attempts. Try again in 30 seconds.');
    } else {
      setError(true);
      AccessibilityInfo.announceForAccessibility?.('Incorrect PIN');
    }
  }, [onUnlock]);

  const pressDigit = useCallback(
    (d: string) => {
      if (checking || locked) return;
      setError(false);
      setDigits((prev) => {
        const next = (prev + d).slice(0, PIN_LENGTH);
        if (next.length === PIN_LENGTH) {
          submit(next);
        }
        return next;
      });
    },
    [checking, locked, submit],
  );

  const pressDelete = useCallback(() => {
    if (locked) return;
    setError(false);
    setDigits((prev) => prev.slice(0, -1));
  }, [locked]);

  const pressBiometric = useCallback(async () => {
    const result = await authenticateWithBiometrics();
    if (result.success) {
      resetThrottle();
      onUnlock();
    } else {
      setError(true);
    }
  }, [onUnlock]);

  return (
    <View style={styles.screen} accessibilityRole="none">
      <Text style={styles.title}>{title}</Text>

      <View style={styles.dotsRow} accessibilityLabel={`PIN entry, ${digits.length} of ${PIN_LENGTH} digits entered`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < digits.length && styles.dotFilled,
              error && styles.dotError,
            ]}
          />
        ))}
      </View>

      {locked ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          Too many attempts. Try again in {lockoutSecondsLeft}s.
        </Text>
      ) : error ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          Incorrect PIN. Try again.
        </Text>
      ) : null}

      <View style={[styles.keypad, locked && styles.keypadLocked]}>
        {KEYPAD_ROWS.map((row, rowIndex) => (
          <View style={styles.keypadRow} key={rowIndex}>
            {row.map((key) => {
              if (key === 'bio') {
                // F6-2: with no biometric hardware/enrollment, this control
                // can never succeed — omit it from the tree entirely rather
                // than exposing a focusable, permanently-disabled button.
                // A plain non-accessible spacer keeps the 3-column grid.
                if (!biometricReady) {
                  return <View key={key} style={styles.key} />;
                }
                return (
                  <Pressable
                    key={key}
                    style={styles.key}
                    onPress={pressBiometric}
                    disabled={locked}
                    accessibilityRole="button"
                    accessibilityLabel="Unlock with biometrics"
                  >
                    <Text style={styles.keyLabel}>ID</Text>
                  </Pressable>
                );
              }
              if (key === 'del') {
                return (
                  <Pressable
                    key={key}
                    style={styles.key}
                    onPress={pressDelete}
                    disabled={locked}
                    accessibilityRole="button"
                    accessibilityLabel="Delete last digit"
                  >
                    <Text style={styles.keyLabel}>DEL</Text>
                  </Pressable>
                );
              }
              return (
                <Pressable
                  key={key}
                  style={styles.key}
                  onPress={() => pressDigit(key)}
                  disabled={locked}
                  accessibilityRole="button"
                  accessibilityLabel={`Digit ${key}`}
                >
                  <Text style={styles.keyLabel}>{key}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  title: {
    color: color.text,
    fontSize: type.title.fontSize,
    fontWeight: type.title.fontWeight,
    marginBottom: space.lg,
  },
  dotsRow: {
    flexDirection: 'row',
    marginBottom: space.md,
  },
  dot: {
    width: 16,
    height: 16,
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    backgroundColor: 'transparent',
    marginHorizontal: space.xs,
    // square by design — no borderRadius (contract: no rounded containers)
  },
  dotFilled: {
    backgroundColor: color.accent,
    borderColor: color.accent,
  },
  dotError: {
    borderColor: color.danger,
  },
  errorText: {
    color: color.danger,
    fontSize: type.body.fontSize,
    fontWeight: type.body.fontWeight,
    marginBottom: space.md,
  },
  keypad: {
    marginTop: space.lg,
  },
  keypadLocked: {
    opacity: 0.4,
  },
  keypadRow: {
    flexDirection: 'row',
  },
  key: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    margin: space.xs,
    backgroundColor: color.surface,
  },
  keyLabel: {
    color: color.text,
    fontSize: type.body.fontSize,
    fontWeight: type.body.fontWeight,
  },
});
