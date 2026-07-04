import React from 'react';
import type { ReactNode } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import * as tokens from '../../theme/tokens';
import type { DuckSpriteProps } from './types';

const { color, space, pixel } = tokens;
const typo = tokens.type;

/**
 * TEAM 4 SEAM — the duck chip beside the Home greeting (live mini sprite +
 * duck count /12 per §4.1). Team 4 injects its sprite renderer via
 * `renderDuck`, typed against the canonical DuckSpriteProps in kit/types.ts.
 * Until merge an on-brand pixel placeholder holds the layout. No emoji.
 */
export interface DuckChipSlotProps {
  size?: number;
  /** Current flock size, shown as "n/12". Omit to hide the count. */
  duckCount?: number;
  duckProps?: Partial<DuckSpriteProps>;
  /** Team 4's DuckSprite renderer drops in here at merge. */
  renderDuck?: (props: DuckSpriteProps) => ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function DuckChipSlot({
  size = 36,
  duckCount,
  duckProps,
  renderDuck,
  accessibilityLabel,
  style,
}: DuckChipSlotProps) {
  const spriteProps: DuckSpriteProps = {
    accessoryTier: 0,
    scale: size / 14, // placeholder sprite is 14px wide (§6)
    animation: 'idle',
    ...duckProps,
  };
  const label =
    accessibilityLabel ??
    (duckCount !== undefined ? `Your flock: ${duckCount} of 12 ducks` : 'Your duck');

  return (
    <View style={[styles.root, style]} accessible accessibilityLabel={label}>
      <View style={{ width: size, height: size }}>
        {renderDuck ? renderDuck(spriteProps) : <PlaceholderDuck size={size} />}
      </View>
      {duckCount !== undefined ? <Text style={styles.count}>{duckCount}/12</Text> : null}
    </View>
  );
}

/** 2×2 pixel-square stand-in until the sprite lands. */
function PlaceholderDuck({ size }: { size: number }) {
  const cell = (size - pixel.blockGap) / 2;
  return (
    <Svg width={size} height={size}>
      <Rect x={0} y={0} width={cell} height={cell} fill={color.accent} />
      <Rect x={cell + pixel.blockGap} y={0} width={cell} height={cell} fill={color.pondEdge} />
      <Rect x={0} y={cell + pixel.blockGap} width={cell} height={cell} fill={color.pondEdge} />
      <Rect
        x={cell + pixel.blockGap}
        y={cell + pixel.blockGap}
        width={cell}
        height={cell}
        fill={color.accent}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  count: {
    marginLeft: space.sm,
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
});

export default DuckChipSlot;
