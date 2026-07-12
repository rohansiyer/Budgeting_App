import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import * as tokens from '../../theme/tokens';
import { PixelBox } from './PixelBox';
import { HardButton } from './HardButton';
import type { DuckSpriteProps, EmptyStateProps } from './types';

const { color, space, pixel } = tokens;
const typo = tokens.type;

const DUCK_SLOT_SIZE = 48;

/**
 * Zero-state block (§3.1): PixelBox + duck slot + one sentence + one action.
 * Defined once, used on every zero screen. Follows DuckChipSlot's inject
 * seam (`renderDuck`/`duckProps`) so kit stays decoupled from `src/ducks`;
 * a pixel-square fallback holds the layout until a renderer is supplied.
 */
export function EmptyState({
  message,
  actionLabel,
  onAction,
  duckProps,
  renderDuck,
  accessibilityLabel,
}: EmptyStateProps) {
  const spriteProps: DuckSpriteProps = {
    accessoryTier: 0,
    scale: DUCK_SLOT_SIZE / 14, // placeholder sprite is 14px wide (§6)
    animation: 'idle',
    ...duckProps,
  };

  return (
    <PixelBox>
      <View style={styles.root}>
        <View
          style={styles.duckSlot}
          accessible
          accessibilityLabel={accessibilityLabel}
        >
          {renderDuck ? renderDuck(spriteProps) : <PlaceholderDuck size={DUCK_SLOT_SIZE} />}
        </View>
        <Text style={styles.message}>{message}</Text>
        <HardButton
          label={actionLabel}
          onPress={onAction}
          variant="primary"
          accessibilityLabel={actionLabel}
        />
      </View>
    </PixelBox>
  );
}

/** 2x2 pixel-square stand-in until the sprite lands (mirrors DuckChipSlot). */
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
    alignItems: 'center',
  },
  duckSlot: {
    width: DUCK_SLOT_SIZE,
    height: DUCK_SLOT_SIZE,
    marginBottom: space.md,
  },
  message: {
    color: color.textSecondary,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
    textAlign: 'center',
    marginBottom: space.md,
  },
});

export default EmptyState;
