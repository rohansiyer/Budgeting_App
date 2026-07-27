import React from 'react';
import { View, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import { buildStepBlocks } from './StepTrack.logic';
import type { StepTrackProps } from './types';

const { color, pixel } = tokens;

const TRACK_HEIGHT = 8; // fixed per §3.1, distinct from BlockMeter's 12px cell

/**
 * Wizard progress (§3.1): N discrete blocks, 8px tall, 3px gaps. Filled =
 * `accent`, unfilled = `surfaceDeep` + 1px border. Never a continuous bar.
 */
export function StepTrack({ total, completed, accessibilityLabel }: StepTrackProps) {
  const blocks = buildStepBlocks(total, completed);
  const safeCompleted = blocks.filter(Boolean).length;

  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{
        min: 0,
        max: blocks.length,
        now: safeCompleted,
        text: `Step ${safeCompleted} of ${blocks.length}`,
      }}
    >
      {blocks.map((filled, i) => (
        <View
          key={i}
          style={[
            styles.cell,
            filled
              ? { backgroundColor: color.accent, borderColor: color.accent }
              : { backgroundColor: color.surfaceDeep, borderColor: color.border },
            i < blocks.length - 1 && { marginRight: pixel.blockGap },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: TRACK_HEIGHT,
  },
  cell: {
    flex: 1,
    borderWidth: pixel.hairlineWidth,
  },
});

export default StepTrack;
