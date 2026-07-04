import React from 'react';
import { View, StyleSheet } from 'react-native';
import { color } from '../../theme/tokens';
import type { CategoryChipProps } from './types';

/**
 * Category identity chip (§3): a square color swatch, default 11px. Never an
 * emoji. Decorative — the host row supplies the category name as text, so the
 * chip is hidden from screen readers.
 */
export function CategoryChip({ colorKey, size = 11 }: CategoryChipProps) {
  return (
    <View
      style={[
        styles.chip,
        { width: size, height: size, backgroundColor: color.category[colorKey] },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

const styles = StyleSheet.create({
  chip: {
    // Square by design — no radius.
  },
});

export default CategoryChip;
