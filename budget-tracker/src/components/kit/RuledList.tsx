import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, metrics, space, type } from '../../theme/tokens';
import type { RuledListProps, RuledListItem } from './types';

/**
 * A list ruled by 1px hairlines — no rounded cards, no elevation. Rows are
 * separated by a top border (except the first). Supports press + long-press
 * (used for the transaction context menu).
 */
export function RuledList<T extends RuledListItem>({
  data,
  renderItem,
  onPressItem,
  onLongPressItem,
  emptyLabel = 'Nothing here yet.',
  itemAccessibilityLabel,
  style,
  testID,
}: RuledListProps<T>) {
  if (data.length === 0) {
    return (
      <View style={[styles.empty, style]} testID={testID}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <View style={style} testID={testID}>
      {data.map((item, index) => {
        const interactive = Boolean(onPressItem || onLongPressItem);
        const content = (
          <View style={[styles.row, index > 0 && styles.ruled]}>
            {renderItem(item, index)}
          </View>
        );
        if (!interactive) {
          return <View key={item.key}>{content}</View>;
        }
        return (
          <Pressable
            key={item.key}
            onPress={onPressItem ? () => onPressItem(item, index) : undefined}
            onLongPress={onLongPressItem ? () => onLongPressItem(item, index) : undefined}
            delayLongPress={350}
            accessibilityRole="button"
            accessibilityLabel={itemAccessibilityLabel?.(item, index)}
            accessibilityHint={onLongPressItem ? 'Double tap to open, long press for actions' : undefined}
            android_ripple={{ color: colors.bg.raised }}
            style={({ pressed }) => (pressed ? styles.pressed : undefined)}
          >
            {content}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: space.md,
  },
  ruled: {
    borderTopWidth: metrics.hairline,
    borderTopColor: colors.border.hairline,
  },
  pressed: {
    backgroundColor: colors.bg.raised,
  },
  empty: {
    paddingVertical: space.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.text.muted,
    fontFamily: type.family.text,
    fontSize: type.size.body,
  },
});

export default RuledList;
