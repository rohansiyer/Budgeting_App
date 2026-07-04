import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { colors, metrics } from '../../theme/tokens';
import type { DuckSlotProps } from './types';

/**
 * TEAM 4 SEAM — the duck-chip slot beside the Home greeting.
 *
 * Renders `renderDuck(duckProps)` when Team 4 injects it; otherwise draws an
 * on-brand pixel placeholder (a small filled square grid) so the layout is
 * final today. No emoji.
 */
export function DuckChipSlot({
  size = 44,
  duckProps,
  renderDuck,
  accessibilityLabel = 'Your duck',
  style,
  testID,
}: DuckSlotProps) {
  return (
    <View
      style={[styles.root, { width: size, height: size }, style]}
      accessibilityLabel={accessibilityLabel}
      accessible
      testID={testID}
    >
      {renderDuck ? (
        renderDuck({ size, ...duckProps })
      ) : (
        <PlaceholderDuck size={size} />
      )}
    </View>
  );
}

/** A tiny pixel-square stand-in (2x2 block) until the sprite lands. */
function PlaceholderDuck({ size }: { size: number }) {
  const cell = (size - metrics.blockGap) / 2;
  return (
    <Svg width={size} height={size}>
      <Rect x={0} y={0} width={cell} height={cell} fill={colors.accent.base} />
      <Rect x={cell + metrics.blockGap} y={0} width={cell} height={cell} fill={colors.accent.dim} />
      <Rect x={0} y={cell + metrics.blockGap} width={cell} height={cell} fill={colors.accent.dim} />
      <Rect
        x={cell + metrics.blockGap}
        y={cell + metrics.blockGap}
        width={cell}
        height={cell}
        fill={colors.accent.base}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: metrics.radius,
  },
});

export default DuckChipSlot;
