import React, { useState } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import type { HardButtonProps } from './types';

const { color, space, pixel } = tokens;
const typo = tokens.type;

/**
 * Square button with a hard 3px offset shadow (§3). Pressing shifts the face
 * down+right by exactly the shadow offset so it sinks into the shadow — a
 * discrete step, no tweening, safe under reduced motion.
 */
export function HardButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
}: HardButtonProps) {
  const [pressed, setPressed] = useState(false);

  const faceColor =
    variant === 'primary' ? color.accent : variant === 'danger' ? color.danger : color.surface;
  const labelColor = variant === 'ghost' ? color.text : color.bg;
  const borderColor = variant === 'ghost' ? color.border : color.bg;

  const offset = pixel.shadowOffset;
  const active = pressed && !disabled;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel}
      style={[styles.root, disabled && styles.disabled]}
    >
      {/* Shadow layer: pure black, offset down+right, never blurred. */}
      <View
        style={[
          styles.shadow,
          {
            opacity: active ? 0 : 1,
            transform: [{ translateX: offset }, { translateY: offset }],
          },
        ]}
      />
      {/* Face: sinks into the shadow while pressed. */}
      <View
        style={[
          styles.face,
          {
            backgroundColor: faceColor,
            borderColor,
            transform: [
              { translateX: active ? offset : 0 },
              { translateY: active ? offset : 0 },
            ],
          },
        ]}
      >
        <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    // Reserve room for the offset shadow so siblings don't clip it.
    marginRight: pixel.shadowOffset,
    marginBottom: pixel.shadowOffset,
  },
  disabled: {
    opacity: 0.45,
  },
  shadow: {
    ...StyleSheet.absoluteFillObject,
    // Hard shadow: the darkest token (near-black bg), offset, never blurred.
    backgroundColor: color.bg,
  },
  face: {
    minHeight: 48, // minimum tap target
    borderWidth: pixel.hairlineWidth,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  label: {
    fontSize: typo.body.fontSize,
    fontWeight: typo.title.fontWeight,
    letterSpacing: 0.5,
  },
});

export default HardButton;
