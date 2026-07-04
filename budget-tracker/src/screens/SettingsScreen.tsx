import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, space, type, metrics } from '../theme/tokens';
import { PixelBox, RuledList } from '../components/kit';
import { Screen, SectionLabel } from '../components/Primitives';
import { useAppShell } from '../providers/AppShell';

interface LinkItem {
  key: string;
  title: string;
  subtitle: string;
  /** Team 2 owns the destination; wired at merge. */
  team2Route?: string;
}

const SETUP_LINKS: LinkItem[] = [
  { key: 'accounts', title: 'Accounts', subtitle: 'PNC Spending · DCU Savings', team2Route: 'setup/Accounts' },
  { key: 'income', title: 'Income & paycheck split', subtitle: 'Weekly paycheck, tutoring', team2Route: 'setup/Income' },
  { key: 'categories', title: 'Categories & budgets', subtitle: 'Envelopes and plans', team2Route: 'setup/Categories' },
  { key: 'recurring', title: 'Recurring bills', subtitle: 'Monthly fixed expenses', team2Route: 'setup/Recurring' },
  { key: 'notifications', title: 'Notifications', subtitle: 'Reminders and timing', team2Route: 'setup/Notifications' },
];

export function SettingsScreen() {
  const { showUndo } = useAppShell();

  const openTeam2 = (item: LinkItem) => {
    // Placeholder until Team 2's setup flow is merged in.
    showUndo(`${item.title} opens in setup (Team 2) at merge.`);
  };

  return (
    <Screen title="Settings">
      <SectionLabel>Setup</SectionLabel>
      <PixelBox padding={space.md}>
        <RuledList<LinkItem>
          data={SETUP_LINKS}
          onPressItem={openTeam2}
          itemAccessibilityLabel={(i) => `${i.title}. ${i.subtitle}. Opens setup.`}
          renderItem={(i) => (
            <View style={styles.linkRow}>
              <View style={styles.linkText}>
                <Text style={styles.linkTitle}>{i.title}</Text>
                <Text style={styles.linkSub}>{i.subtitle}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
          )}
        />
      </PixelBox>

      <SectionLabel>App</SectionLabel>
      <PixelBox padding={space.lg}>
        <InfoRow label="App" value="Ducks in a Row" />
        <InfoRow label="Version" value="2.0.0 (rebuild)" ruled />
        <InfoRow label="Theme" value="Midnight" ruled />
        <InfoRow label="Data" value="Dev fake store" ruled />
      </PixelBox>

      <Text style={styles.footnote}>
        Running on the Team 3 dev store. Real data lands when Team 1's store is merged.
      </Text>
    </Screen>
  );
}

function InfoRow({ label, value, ruled }: { label: string; value: string; ruled?: boolean }) {
  return (
    <View style={[styles.infoRow, ruled && styles.infoRuled]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkText: {
    flex: 1,
  },
  linkTitle: {
    color: colors.text.primary,
    fontFamily: type.family.text,
    fontSize: type.size.body,
    fontWeight: type.weight.medium,
  },
  linkSub: {
    color: colors.text.secondary,
    fontFamily: type.family.text,
    fontSize: type.size.caption,
    marginTop: 2,
  },
  chevron: {
    color: colors.text.muted,
    fontSize: type.size.title,
    marginLeft: space.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.md,
  },
  infoRuled: {
    borderTopWidth: metrics.hairline,
    borderTopColor: colors.border.hairline,
  },
  infoLabel: {
    color: colors.text.secondary,
    fontFamily: type.family.text,
    fontSize: type.size.body,
  },
  infoValue: {
    color: colors.text.primary,
    fontFamily: type.family.mono,
    fontSize: type.size.body,
  },
  footnote: {
    color: colors.text.muted,
    fontFamily: type.family.text,
    fontSize: type.size.caption,
    marginTop: space.xl,
    lineHeight: 20,
  },
});

export default SettingsScreen;
