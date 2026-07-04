import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import type { RuledListProps } from './types';

const { color, space, pixel } = tokens;
const typo = tokens.type;

/**
 * Hairline-divided list (§3): rows are full-bleed, no container, no cards.
 * Interactivity (press / long-press) lives inside `renderRow` — the list
 * itself only rules and labels. Optional uppercase micro-label above.
 */
export function RuledList<T>({ data, renderRow, keyExtractor, sectionLabel }: RuledListProps<T>) {
  return (
    <View>
      {sectionLabel ? (
        <Text style={styles.sectionLabel} accessibilityRole="header">
          {sectionLabel}
        </Text>
      ) : null}
      {data.length === 0 ? (
        <Text style={styles.empty}>Nothing here yet.</Text>
      ) : (
        data.map((item, index) => (
          <View key={keyExtractor(item)} style={[styles.row, index > 0 && styles.ruled]}>
            {renderRow(item, index)}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
    marginBottom: space.sm,
  },
  row: {
    paddingVertical: space.sm + space.xs,
  },
  ruled: {
    borderTopWidth: pixel.hairlineWidth,
    borderTopColor: color.hairline,
  },
  empty: {
    color: color.textMuted,
    fontSize: typo.body.fontSize,
    fontWeight: typo.caption.fontWeight,
    paddingVertical: space.md,
  },
});

export default RuledList;
