import React, { ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as tokens from '../theme/tokens';
import { Cents, formatCents } from '../lib/money';

const { color, space } = tokens;
const typo = tokens.type;

/** Full-screen scaffold: safe area + midnight background + scrolling body. */
export function Screen({
  title,
  right,
  children,
  scroll = true,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
}) {
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={styles.scrollBody}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {title !== undefined ? (
        <View style={styles.header}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            {title}
          </Text>
          {right}
        </View>
      ) : null}
      {body}
    </SafeAreaView>
  );
}

export function SectionLabel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[styles.sectionLabel, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

/**
 * Money value with tabular numerals and income/spend/net coloring. The ONLY
 * string rendering of money is formatCents (money.ts) — no float math here.
 */
export function MoneyText({
  amount,
  signed = false,
  kind = 'plain',
  size = typo.body.fontSize,
  style,
}: {
  amount: Cents;
  signed?: boolean;
  kind?: 'plain' | 'income' | 'spend' | 'net';
  size?: number;
  style?: StyleProp<TextStyle>;
}) {
  let tint: string = color.text;
  if (kind === 'income') tint = color.accent;
  else if (kind === 'spend') tint = color.danger;
  else if (kind === 'net') tint = amount >= 0 ? color.accent : color.danger;

  return (
    <Text style={[styles.money, { color: tint, fontSize: size }, style]}>
      {formatCents(amount, { signDisplay: signed ? 'always' : 'auto' })}
    </Text>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: color.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  headerTitle: {
    color: color.text,
    fontSize: typo.title.fontSize,
    fontWeight: typo.title.fontWeight,
    letterSpacing: 0.3,
  },
  scrollBody: {
    paddingHorizontal: space.md,
    paddingBottom: space.xl * 2,
  },
  sectionLabel: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  money: {
    fontWeight: typo.title.fontWeight,
    // Money is always the mono face (handoff §2.4); fontWeight above is only
    // the system-font fallback path.
    fontFamily: tokens.font.monoBold,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
