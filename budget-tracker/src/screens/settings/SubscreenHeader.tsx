import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';

const { color, space } = tokens;
const typo = tokens.type;

/**
 * Shared header for every Settings subscreen: a back affordance to the root
 * list plus a title. Deliberately separate from Primitives.tsx's `Screen`
 * header (which only takes a plain string title) so this local stack
 * doesn't need to touch that shared file.
 */
export function SubscreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back to Settings"
        hitSlop={12}
        style={styles.backTap}
      >
        <Text style={styles.back}>{'< BACK'}</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: space.md,
  },
  backTap: {
    alignSelf: 'flex-start',
    marginBottom: space.sm,
    paddingVertical: space.xs,
  },
  back: {
    color: color.accent,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
  },
  title: {
    color: color.text,
    fontSize: typo.title.fontSize,
    fontWeight: typo.title.fontWeight,
  },
});

export default SubscreenHeader;
