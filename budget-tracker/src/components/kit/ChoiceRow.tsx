import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import type { ChoiceRowProps } from './types';

const { color, space, pixel } = tokens;
const typo = tokens.type;

/**
 * Segmented options built from ghost-HardButton-style square cells (§3.1).
 * The selected cell gets an `accent` border + text; unselected cells stay
 * `border` + `textMuted`. `pixel.blockGap` separates the cells, same as
 * BlockMeter/StepTrack — never a joined pill shape.
 */
export function ChoiceRow({ options, selectedKey, onSelect, accessibilityLabel }: ChoiceRowProps) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option, index) => {
        const selected = option.key === selectedKey;
        return (
          <Pressable
            key={option.key}
            onPress={() => onSelect(option.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={option.label}
            style={[
              styles.cell,
              { borderColor: selected ? color.accent : color.border },
              index < options.length - 1 && { marginRight: pixel.blockGap },
            ]}
          >
            <Text style={[styles.label, { color: selected ? color.accent : color.textMuted }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    minHeight: 48,
    backgroundColor: color.surface,
    borderWidth: pixel.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  label: {
    fontSize: typo.body.fontSize,
    fontWeight: typo.title.fontWeight,
  },
});

export default ChoiceRow;
