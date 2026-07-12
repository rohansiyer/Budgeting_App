import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import type { TabBarProps } from './types';

const { color, space, pixel } = tokens;
const typo = tokens.type;

const BAR_HEIGHT = 56;
const UNDERLINE_WIDTH = 24;
const UNDERLINE_HEIGHT = 3;

/**
 * The one fixed chrome element (§3.1). 56px tall, `surface` bg, top hairline.
 * Active tab = `text` color + a 24x3px `accent` underline block; inactive =
 * `textMuted`. Presentational only — a later wave wires this to navigation.
 */
export function TabBar({ tabs, activeKey, onPress }: TabBarProps) {
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onPress(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            style={styles.tab}
          >
            <Text style={[styles.label, { color: active ? color.text : color.textMuted }]}>
              {tab.label}
            </Text>
            <View style={[styles.underline, { opacity: active ? 1 : 0 }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    backgroundColor: color.surface,
    borderTopWidth: pixel.hairlineWidth,
    borderTopColor: color.hairline,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
  },
  underline: {
    marginTop: space.xs,
    width: UNDERLINE_WIDTH,
    height: UNDERLINE_HEIGHT,
    backgroundColor: color.accent,
  },
});

export default TabBar;
