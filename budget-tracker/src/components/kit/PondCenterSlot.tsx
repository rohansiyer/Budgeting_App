import React from 'react';
import type { ReactNode } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import * as tokens from '../../theme/tokens';
import type { DuckSpriteProps } from './types';

const { color, space, pixel } = tokens;
const typo = tokens.type;

/**
 * TEAM 4 SEAM — the duck pond in the center of the Pond donut (§4.4).
 * Team 4's pond renderer / DuckSprite drops in via `renderDuck`, typed
 * against the canonical DuckSpriteProps in kit/types.ts. Until merge, a
 * labelled pond-water placeholder square holds the space. No emoji.
 */
export interface PondCenterSlotProps {
  size?: number;
  duckProps?: Partial<DuckSpriteProps>;
  /** Team 4 injects the pond/sprite renderer here at merge. */
  renderDuck?: (props: DuckSpriteProps) => ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function PondCenterSlot({
  size = 96,
  duckProps,
  renderDuck,
  accessibilityLabel = 'The pond — your flock lives here',
  style,
}: PondCenterSlotProps) {
  const spriteProps: DuckSpriteProps = {
    accessoryTier: 0,
    scale: size / 28,
    animation: 'idle',
    ...duckProps,
  };

  return (
    <View
      style={[styles.root, { width: size, height: size }, style]}
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      {renderDuck ? (
        renderDuck(spriteProps)
      ) : (
        <View style={styles.placeholder}>
          <Svg width={size * 0.5} height={size * 0.5}>
            <Rect
              x={pixel.hairlineWidth}
              y={pixel.hairlineWidth}
              width={size * 0.5 - pixel.hairlineWidth * 2}
              height={size * 0.5 - pixel.hairlineWidth * 2}
              fill={color.pondDeep}
              stroke={color.pondEdge}
              strokeWidth={pixel.hairlineWidth * 2}
            />
          </Svg>
          <Text style={styles.caption}>POND</Text>
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
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
  },
});

export default PondCenterSlot;
