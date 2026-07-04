import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { colors, metrics, space, type } from '../../theme/tokens';
import type { DuckSlotProps } from './types';

/**
 * TEAM 4 SEAM — the empty slot at the centre of the Pond donut.
 *
 * The Pond screen positions this absolutely inside the SVG donut hole. Team 4
 * injects their DuckSprite via `renderDuck`; until then a labelled pixel
 * placeholder square holds the space (no emoji).
 */
export function PondCenterSlot({
  size = 96,
  duckProps,
  renderDuck,
  accessibilityLabel = 'Pond — your duck lives here',
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
        <View style={styles.placeholder}>
          <Svg width={size * 0.5} height={size * 0.5}>
            <Rect
              x={0}
              y={0}
              width={size * 0.5}
              height={size * 0.5}
              fill={colors.bg.raised}
              stroke={colors.accent.pond}
              strokeWidth={metrics.hairline * 2}
            />
          </Svg>
          <Text style={styles.caption}>duck</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    marginTop: space.xs,
    color: colors.text.muted,
    fontFamily: type.family.mono,
    fontSize: type.size.micro,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

export default PondCenterSlot;
