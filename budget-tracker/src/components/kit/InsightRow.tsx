import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import { CategoryChip } from './CategoryChip';
import type { InsightRowProps } from './types';

const { color, space, pixel } = tokens;
const typo = tokens.type;

/**
 * CategoryChip + one plain-language sentence, the dollar figure in mono
 * `accent` (§3.1). `prefix`/`amountText`/`suffix` keep the money text exact
 * rather than templating a string. Hairline top divider, full bleed like
 * RuledList rows.
 */
export function InsightRow({ colorKey, prefix, amountText, suffix, accessibilityLabel }: InsightRowProps) {
  const label = accessibilityLabel ?? `${prefix}${amountText}${suffix ? ` ${suffix}` : ''}`;

  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      <CategoryChip colorKey={colorKey} />
      <Text style={styles.sentence}>
        {prefix ? <Text style={styles.plain}>{prefix} </Text> : null}
        <Text style={styles.amount}>{amountText}</Text>
        {suffix ? <Text style={styles.plain}> {suffix}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: pixel.hairlineWidth,
    borderTopColor: color.hairline,
    paddingVertical: space.sm + space.xs,
  },
  sentence: {
    flex: 1,
    marginLeft: space.sm,
  },
  plain: {
    color: color.textSecondary,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
    fontFamily: typo.body.fontFamily,
  },
  amount: {
    color: color.accent,
    fontSize: typo.body.fontSize,
    fontWeight: typo.title.fontWeight,
    // "The exact dollar figure in mono accent" (§3.1) — mono face mandatory.
    fontFamily: tokens.font.monoBold,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
});

export default InsightRow;
