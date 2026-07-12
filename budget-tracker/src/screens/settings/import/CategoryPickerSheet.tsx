import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import * as tokens from '../../../theme/tokens';
import { CategoryChip } from '../../../components/kit';
import { Sheet } from '../../../components/Sheet';
import type { CategoryConfig } from '../../../types/contracts';

const { color, space, pixel } = tokens;
const typo = tokens.type;

/**
 * Small category picker sheet for the import review screen's "Change"
 * action. Same visual idea as DailyDetailScreen's inline CategoryPicker
 * (chip + name, selected state) but hosted in a Sheet overlay, since this
 * flow needs it summoned per-row rather than always on screen.
 */
export function CategoryPickerSheet({
  visible,
  categories,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  categories: readonly CategoryConfig[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Choose a category">
      <View style={styles.list}>
        {categories.map((c) => {
          const selected = c.id === selectedId;
          return (
            <Pressable
              key={c.id}
              onPress={() => {
                onSelect(c.id);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Category ${c.name}${selected ? ', selected' : ''}`}
              style={[styles.item, selected && styles.itemSelected]}
            >
              <CategoryChip colorKey={c.colorKey} />
              <Text style={styles.label}>{c.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 48,
    paddingHorizontal: space.sm,
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
  },
  itemSelected: {
    borderColor: color.accent,
  },
  label: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
  },
});

export default CategoryPickerSheet;
