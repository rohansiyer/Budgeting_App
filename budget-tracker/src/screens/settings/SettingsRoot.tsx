import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';

import * as tokens from '../../theme/tokens';
import { RuledList } from '../../components/kit';
import { Screen, Row } from '../../components/Primitives';
import { ROOT_SETTINGS_ITEMS, RootSettingsItem } from './config';

const { color, space } = tokens;
const typo = tokens.type;

export interface SettingsRootProps {
  onSelect: (id: RootSettingsItem['id']) => void;
}

/** Root Settings list — RuledList, kit + tokens only (§3 container treatment). */
export function SettingsRoot({ onSelect }: SettingsRootProps) {
  return (
    <Screen title="Settings">
      <RuledList<RootSettingsItem>
        data={ROOT_SETTINGS_ITEMS}
        keyExtractor={(item) => item.id}
        renderRow={(item) => (
          <Pressable
            onPress={() => onSelect(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${item.subtitle}.`}
          >
            <Row style={styles.row}>
              <View style={styles.meta}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.subtitle}>{item.subtitle}</Text>
              </View>
              <Text style={styles.chevron}>{'>'}</Text>
            </Row>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    justifyContent: 'space-between',
  },
  meta: {
    flex: 1,
  },
  title: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
  },
  subtitle: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: 2,
  },
  chevron: {
    color: color.textMuted,
    fontSize: typo.title.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginLeft: space.md,
  },
});

export default SettingsRoot;
