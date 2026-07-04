import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import * as tokens from '../../theme/tokens';
import { PIN_LENGTH } from '../../security/pinStorage';

const { color, space, pixel } = tokens;
const typo = tokens.type;

const KEY_ROWS: readonly (readonly string[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
];

export interface PinPadProps {
  /** Called once PIN_LENGTH digits have been entered. Does not clear itself
   * afterwards — give this component a fresh `key` from the parent to reset
   * it for the next step (enter → confirm → retry, …). */
  onComplete: (pin: string) => void;
  disabled?: boolean;
}

/**
 * Minimal digit-entry pad for the Security subscreen's PIN setup/change
 * flow. Deliberately a NEW, separate component rather than a reuse of
 * security/LockScreen.tsx's keypad — that screen is explicitly standalone
 * and not to be modified (see its header comment), and its pad is wired to
 * unlock/verify, not to a two-step set/confirm flow. Same "quiet pixel
 * instrument" look, built directly against tokens.
 */
export function PinPad({ onComplete, disabled = false }: PinPadProps) {
  const [digits, setDigits] = useState('');

  const pressDigit = useCallback(
    (d: string) => {
      if (disabled || digits.length >= PIN_LENGTH) return;
      const next = digits + d;
      setDigits(next);
      if (next.length === PIN_LENGTH) onComplete(next);
    },
    [disabled, digits, onComplete],
  );

  const pressDelete = useCallback(() => {
    if (disabled) return;
    setDigits((prev) => prev.slice(0, -1));
  }, [disabled]);

  return (
    <View>
      <View
        style={styles.dotsRow}
        accessibilityLabel={`PIN entry, ${digits.length} of ${PIN_LENGTH} digits entered`}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.dot, i < digits.length && styles.dotFilled]} />
        ))}
      </View>

      <View style={styles.pad}>
        {KEY_ROWS.map((row, rowIndex) => (
          <View style={styles.padRow} key={rowIndex}>
            {row.map((key, colIndex) => {
              if (key === '') {
                return <View key={`gap-${rowIndex}-${colIndex}`} style={styles.key} />;
              }
              if (key === 'del') {
                return (
                  <Pressable
                    key={key}
                    style={styles.key}
                    onPress={pressDelete}
                    disabled={disabled}
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
                  disabled={disabled}
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
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  dot: {
    width: 14,
    height: 14,
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    backgroundColor: 'transparent',
    marginHorizontal: space.xs,
    // square by design — no borderRadius (no rounded containers).
  },
  dotFilled: {
    backgroundColor: color.accent,
    borderColor: color.accent,
  },
  pad: {
    alignSelf: 'center',
  },
  padRow: {
    flexDirection: 'row',
  },
  key: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    margin: space.xs,
    backgroundColor: color.surface,
  },
  keyLabel: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
  },
});

export default PinPad;
