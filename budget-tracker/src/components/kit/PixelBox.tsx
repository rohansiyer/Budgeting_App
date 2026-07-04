import React, { useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { colors, metrics, space } from '../../theme/tokens';
import type { PixelBoxProps } from './types';

/**
 * Square container with 4px notched corners.
 *
 * The outline + fill are drawn as an SVG octagon (a square with each corner
 * chamfered by `notch` px). Content sits in an absolutely-filled View above it,
 * so the box behaves like a normal padded container.
 */
export function PixelBox({
  children,
  fill = colors.bg.panel,
  borderColor = colors.border.hairline,
  notch = metrics.notch,
  padding = space.lg,
  style,
  accessibilityLabel,
  testID,
}: PixelBoxProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  // Inset the stroke by half the hairline so it renders crisp inside the box.
  const s = metrics.hairline / 2;
  const w = size.w;
  const h = size.h;
  const n = notch;

  // Octagon points, clockwise from top-left notch.
  const points = [
    `${n},${s}`,
    `${w - n},${s}`,
    `${w - s},${n}`,
    `${w - s},${h - n}`,
    `${w - n},${h - s}`,
    `${n},${h - s}`,
    `${s},${h - n}`,
    `${s},${n}`,
  ].join(' ');

  return (
    <View
      style={[styles.root, style]}
      onLayout={onLayout}
      accessibilityLabel={accessibilityLabel}
      accessible={accessibilityLabel !== undefined}
      testID={testID}
    >
      {w > 0 && h > 0 ? (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Polygon
            points={points}
            fill={fill}
            stroke={borderColor}
            strokeWidth={metrics.hairline}
          />
        </Svg>
      ) : null}
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
  },
});

export default PixelBox;
