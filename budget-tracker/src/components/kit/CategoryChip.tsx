import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { colors, categoryColors, metrics, space, type } from '../../theme/tokens';
import type { CategoryChipProps } from './types';

/** Small square tag: colour swatch + label (+ optional amount). No rounding. */
export function CategoryChip({
  label,
  colorKey,
  selected = false,
  onPress,
  amountText,
  style,
  testID,
}: CategoryChipProps) {
  const swatch = categoryColors[colorKey];

  const body = (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.bg.raised : colors.bg.panel,
          borderColor: selected ? swatch : colors.border.hairline,
          borderWidth: selected ? metrics.hairline * 2 : metrics.hairline,
        },
        style,
      ]}
    >
      <View style={[styles.swatch, { backgroundColor: swatch }]} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {amountText ? <Text style={styles.amount}>{amountText}</Text> : null}
    </View>
  );

  if (!onPress) {
    return (
      <View testID={testID} accessibilityLabel={`${label}${amountText ? ', ' + amountText : ''}`}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}${amountText ? ', ' + amountText : ''}${selected ? ', selected' : ''}`}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: metrics.radius,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: metrics.radius,
    marginRight: space.sm,
  },
  label: {
    color: colors.text.primary,
    fontFamily: type.family.text,
    fontSize: type.size.caption,
    fontWeight: type.weight.medium,
  },
  amount: {
    color: colors.text.secondary,
    fontFamily: type.family.mono,
    fontSize: type.size.caption,
    marginLeft: space.sm,
  },
});

export default CategoryChip;
