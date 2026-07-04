import React, { useState } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { colors, metrics, space, type, layout } from '../../theme/tokens';
import type { HardButtonProps } from './types';

/**
 * Chunky square button with a 3px hard offset shadow. Pressing shifts the face
 * down+right by exactly the shadow offset so it visually sinks into its shadow.
 * The shift is a discrete step (not eased), so it is fine under reduced motion.
 */
export function HardButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  leading,
  fullWidth = false,
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: HardButtonProps) {
  const [pressed, setPressed] = useState(false);

  const faceColor =
    variant === 'primary'
      ? colors.accent.base
      : variant === 'danger'
      ? colors.status.spend
      : colors.bg.raised;
  const labelColor =
    variant === 'ghost' ? colors.text.primary : colors.text.onAccent;
  const borderColor =
    variant === 'ghost' ? colors.border.strong : colors.shadow;

  const offset = metrics.hardShadow;
  const active = pressed && !disabled;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={[
        styles.root,
        fullWidth && styles.fullWidth,
        { opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      {/* Shadow layer (static, offset down+right behind the face). */}
      <View
        style={[
          styles.shadow,
          {
            backgroundColor: colors.shadow,
            opacity: active ? 0 : 1,
            transform: [{ translateX: offset }, { translateY: offset }],
          },
        ]}
      />
      {/* Face. Sinks into the shadow when pressed. */}
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
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <Text style={[styles.label, { color: labelColor }, textStyle]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    alignSelf: 'flex-start',
    // Reserve room for the offset shadow so layout doesn't clip it.
    marginRight: metrics.hardShadow,
    marginBottom: metrics.hardShadow,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  shadow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: metrics.radius,
  },
  face: {
    minHeight: layout.touchTarget,
    borderWidth: metrics.hairline,
    borderRadius: metrics.radius,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leading: {
    marginRight: space.sm,
  },
  label: {
    fontFamily: type.family.text,
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    letterSpacing: 0.5,
  },
});

export default HardButton;
