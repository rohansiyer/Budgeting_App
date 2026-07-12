import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import { HardButton } from './HardButton';
import { useAutoDismiss } from './Snackbar.useAutoDismiss';
import type { SnackbarProps } from './types';

const { color, space, pixel } = tokens;
const typo = tokens.type;

const DEFAULT_DURATION_MS = 5000;

/**
 * Transient undo bar (§3.1, "undo, never confirm"). `surface` bg, 1px
 * border, message left + ghost HardButton action right. Position-agnostic:
 * the host screen places it, this component only renders the bar itself and
 * runs its own self-dismiss timer.
 */
export function Snackbar({
  message,
  actionLabel = 'Undo',
  onAction,
  onTimeout,
  durationMs = DEFAULT_DURATION_MS,
  visible,
}: SnackbarProps) {
  useAutoDismiss(visible, durationMs, onTimeout);

  if (!visible) return null;

  return (
    <View style={styles.bar} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.message} numberOfLines={2}>
        {message}
      </Text>
      {onAction ? (
        <HardButton
          label={actionLabel}
          onPress={onAction}
          variant="ghost"
          accessibilityLabel={actionLabel}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    paddingLeft: space.md,
    paddingVertical: space.sm,
  },
  message: {
    flex: 1,
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
    marginRight: space.sm,
  },
});

export default Snackbar;
