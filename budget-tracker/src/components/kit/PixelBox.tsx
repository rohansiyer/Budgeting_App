import React, { useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { color, space, pixel } from '../../theme/tokens';
import type { PixelBoxProps } from './types';

/**
 * Pixel-HUD container: square corners with a 4px notch, 1px border.
 * Reserved for GAME OBJECTS (envelopes, goals, the pond, prompts) — anything
 * read as a list stays ruled (§3 container treatment).
 *
 * The outline + fill are an SVG octagon (a square chamfered by pixel.notch);
 * content renders in a normal padded View above it.
 */
export function PixelBox({ children, padded = true, style }: PixelBoxProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  // Inset the stroke by half the hairline so it renders crisp inside the box.
  const s = pixel.hairlineWidth / 2;
  const { w, h } = size;
  const n = pixel.notch;

  // Octagon points, clockwise from the top-left notch.
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
    <View style={[styles.root, style]} onLayout={onLayout}>
      {w > 0 && h > 0 ? (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Polygon
            points={points}
            fill={color.surface}
            stroke={color.border}
            strokeWidth={pixel.hairlineWidth}
          />
        </Svg>
      ) : null}
      <View style={padded ? styles.padded : undefined}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
  },
  padded: {
    padding: space.md,
  },
});

export default PixelBox;
