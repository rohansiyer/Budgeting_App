import React, { useState } from 'react';
import { TextInput, View, Text, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import { resolveFieldBorderState } from './Field.logic';
import type { FieldProps } from './types';

const { color, space, pixel } = tokens;
const typo = tokens.type;

const borderColorFor = {
  error: color.danger,
  focused: tokens.focus.color,
  default: color.border,
} as const;

/**
 * Text/amount input (§3.1). Label above in tracked-uppercase 11px; the well
 * is `surfaceDeep` with a 1px border that swaps to `accent` on focus (no
 * glow) or `danger` when `error` is set, in which case the message renders
 * as a line below the well.
 */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoFocus,
  error,
  accessibilityLabel,
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const borderState = resolveFieldBorderState(focused, Boolean(error));

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.textMuted}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: false }}
        style={[styles.well, { borderColor: borderColorFor[borderState] }]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    // Host screens stack Fields with their own gap; no margin baked in here.
  },
  label: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
    marginBottom: space.xs,
  },
  well: {
    minHeight: 48,
    backgroundColor: color.surfaceDeep,
    borderWidth: pixel.hairlineWidth,
    paddingHorizontal: space.md,
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
  },
  error: {
    color: color.danger,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: space.xs,
  },
});

export default Field;
