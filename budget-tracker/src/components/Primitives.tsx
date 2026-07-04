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
import { colors, space, type } from '../theme/tokens';

/** Full-screen scaffold: safe area + midnight background + scrolling body. */
export function Screen({
  title,
  right,
  children,
  scroll = true,
  testID,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  testID?: string;
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.scrollBody}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.scrollBody}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']} testID={testID}>
      {title !== undefined ? (
        <View style={styles.header} accessibilityRole="header">
          <Text style={styles.headerTitle}>{title}</Text>
          {right}
        </View>
      ) : null}
      {body}
    </SafeAreaView>
  );
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.sectionLabel, style]}>{children}</Text>;
}

/** Monospace money value with income/spend/net colouring. */
export function MoneyText({
  amount,
  format,
  signed = false,
  kind = 'plain',
  size = type.size.body,
  style,
}: {
  amount: number;
  format: (n: number) => string;
  signed?: boolean;
  kind?: 'plain' | 'income' | 'spend' | 'net';
  size?: number;
  style?: StyleProp<TextStyle>;
}) {
  let color: string = colors.text.primary;
  if (kind === 'income') color = colors.status.income;
  else if (kind === 'spend') color = colors.status.spend;
  else if (kind === 'net') color = amount >= 0 ? colors.status.income : colors.status.spend;

  const prefix = signed && amount > 0 ? '+' : '';
  return (
    <Text style={[styles.money, { color, fontSize: size }, style]}>
      {prefix}
      {format(amount)}
    </Text>
  );
}

export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  headerTitle: {
    color: colors.text.primary,
    fontFamily: type.family.text,
    fontSize: type.size.title,
    fontWeight: type.weight.bold,
    letterSpacing: 0.5,
  },
  scrollBody: {
    paddingHorizontal: space.lg,
    paddingBottom: space.huge,
  },
  sectionLabel: {
    color: colors.text.secondary,
    fontFamily: type.family.mono,
    fontSize: type.size.caption,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: space.xl,
    marginBottom: space.md,
  },
  money: {
    fontFamily: type.family.mono,
    fontWeight: type.weight.bold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
