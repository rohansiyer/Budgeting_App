import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, metrics, space, type, layout } from '../../theme/tokens';
import type { BlockMeterProps } from './types';
import type { EnvelopeState } from '../../types/contracts';

function stateColor(state: EnvelopeState, override?: string): string {
  if (override) return override;
  return colors.envelope[state] ?? colors.envelope.normal;
}

function stateWord(state: EnvelopeState): string {
  switch (state) {
    case 'bonus':
      return 'bonus';
    case 'debt':
      return 'behind';
    case 'overflow':
      return 'over';
    case 'borrowed':
      return 'borrowed';
    case 'rolled':
      return 'rolled over';
    default:
      return 'on track';
  }
}

/**
 * Segmented block meter. Fills `blocks` cells left-to-right by value/max, with a
 * 3px gap. Overflow adds amber cells past the plan; bonus/rolled carryover shows
 * as tinted leading cells; debt shows a hanging red cell. Colour-only meaning is
 * always mirrored in the accessibilityValue + a visible value line.
 */
export function BlockMeter({
  value,
  max,
  blocks = 8,
  state = 'normal',
  carryover = 0,
  fillColor,
  height = layout.blockMeter.height,
  label,
  valueText,
  style,
  accessibilityLabel,
  testID,
}: BlockMeterProps) {
  const safeMax = max > 0 ? max : 1;
  const ratio = value / safeMax;
  const filled = Math.max(0, Math.min(blocks, Math.round(ratio * blocks)));
  const overflowed = state === 'overflow' || value > max;
  const overflowCells = overflowed
    ? Math.min(blocks, Math.max(1, Math.round((value - max) / safeMax * blocks)))
    : 0;

  const activeColor = stateColor(state, fillColor);

  const cells = Array.from({ length: blocks }, (_, i) => {
    const isFilled = i < filled;
    // Past-plan overflow cells re-tint the trailing filled cells amber.
    const isOverflow = overflowed && i >= blocks - overflowCells;
    let bg: string = colors.bg.sunken;
    if (isOverflow) bg = colors.envelope.overflow;
    else if (isFilled) bg = activeColor;
    return (
      <View
        key={i}
        style={[
          styles.cell,
          {
            backgroundColor: bg,
            borderColor: isFilled || isOverflow ? bg : colors.border.hairline,
            marginRight: i === blocks - 1 ? 0 : metrics.blockGap,
          },
        ]}
      />
    );
  });

  const autoValueText = `$${Math.round(value)} of $${Math.round(max)} · ${stateWord(state)}`;
  const shownText = valueText ?? autoValueText;
  const a11yLabel =
    accessibilityLabel ?? `${label ? label + ', ' : ''}${shownText}`;

  return (
    <View style={style} testID={testID}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          {carryover !== 0 ? (
            <Text
              style={[
                styles.carryover,
                { color: carryover > 0 ? colors.status.income : colors.status.spend },
              ]}
            >
              {carryover > 0 ? '+' : '−'}${Math.abs(Math.round(carryover))}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View
        style={[styles.track, { height }]}
        accessibilityRole="progressbar"
        accessibilityLabel={a11yLabel}
        accessibilityValue={{ min: 0, max: Math.round(max), now: Math.round(value) }}
      >
        {cells}
      </View>
      <Text style={styles.valueText}>{shownText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  label: {
    color: colors.text.primary,
    fontFamily: type.family.text,
    fontSize: type.size.body,
    fontWeight: type.weight.medium,
    flexShrink: 1,
  },
  carryover: {
    fontFamily: type.family.mono,
    fontSize: type.size.caption,
    fontWeight: type.weight.bold,
    marginLeft: space.sm,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cell: {
    flex: 1,
    borderWidth: metrics.hairline,
    borderRadius: metrics.radius,
  },
  valueText: {
    marginTop: space.xs,
    color: colors.text.secondary,
    fontFamily: type.family.mono,
    fontSize: type.size.caption,
  },
});

export default BlockMeter;
