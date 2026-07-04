import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as tokens from '../theme/tokens';
import { formatCents } from '../lib/money';
import { RuledList } from '../components/kit';
import { Screen, SectionLabel, MoneyText, Row } from '../components/Primitives';
import { useStore } from '../providers/StoreProvider';
import { useAppShell } from '../providers/AppShell';
import { todayISO } from '../format/dates';
import type { AccountConfig } from '../types/contracts';

const { color, space } = tokens;
const typo = tokens.type;

interface SetupLink {
  id: string;
  title: string;
  subtitle: string;
  /** Team 2 owns the destination; wired at merge. */
  team2Route: string;
}

const SETUP_LINKS: SetupLink[] = [
  { id: 'accounts', title: 'Accounts', subtitle: 'Add, rename, balances', team2Route: 'setup/accounts' },
  { id: 'income', title: 'Income sources', subtitle: 'Amounts, schedules, split bars', team2Route: 'setup/income' },
  { id: 'envelopes', title: 'Envelopes & categories', subtitle: 'Create, rename, re-budget', team2Route: 'setup/envelopes' },
  { id: 'savings', title: 'Savings target', subtitle: 'Monthly goal for Duck Goal 3', team2Route: 'setup/savings' },
  { id: 'chapter', title: 'New chapter', subtitle: 'Archive this setup, keep the flock', team2Route: 'setup/new-chapter' },
];

export function SettingsScreen() {
  const store = useStore();
  const { showUndo } = useAppShell();
  const today = todayISO();
  const accounts = store.listAccounts();
  const chapter = store.getActiveChapter();

  const openTeam2 = (item: SetupLink) => {
    // Placeholder until Team 2's setup wizard is merged in.
    showUndo(`"${item.title}" opens Team 2's setup flow at merge.`);
  };

  return (
    <Screen title="Settings">
      <SectionLabel>Accounts</SectionLabel>
      <RuledList<AccountConfig>
        data={accounts}
        keyExtractor={(a) => a.id}
        renderRow={(a) => (
          <Row
            style={styles.acctRow}
          >
            <View style={styles.acctMeta}>
              <Text
                style={styles.rowTitle}
                accessibilityLabel={`${a.name}${a.institution ? `, ${a.institution}` : ''}, ${a.kind} account, balance ${formatCents(store.getAccountBalance(a.id, today))}`}
              >
                {a.name}
              </Text>
              <Text style={styles.rowSub}>
                {a.institution ? `${a.institution} · ` : ''}
                {a.kind}
              </Text>
            </View>
            <MoneyText amount={store.getAccountBalance(a.id, today)} />
          </Row>
        )}
      />

      <SectionLabel>Setup</SectionLabel>
      <RuledList<SetupLink>
        data={SETUP_LINKS}
        keyExtractor={(l) => l.id}
        renderRow={(l) => (
          <Pressable
            onPress={() => openTeam2(l)}
            accessibilityRole="button"
            accessibilityLabel={`${l.title}. ${l.subtitle}. Opens setup.`}
          >
            <Row style={styles.linkRow}>
              <View style={styles.acctMeta}>
                <Text style={styles.rowTitle}>{l.title}</Text>
                <Text style={styles.rowSub}>{l.subtitle}</Text>
              </View>
              <Text style={styles.chevron}>{'>'}</Text>
            </Row>
          </Pressable>
        )}
      />

      <SectionLabel>App</SectionLabel>
      <InfoRow label="App" value="Ducks in a Row" />
      <InfoRow label="Version" value="2.0.0 (rebuild)" />
      <InfoRow label="Chapter" value={chapter.name} />
      <InfoRow label="Theme" value="Midnight" />
      <InfoRow label="Data" value="Dev fake store" />

      <Text style={styles.footnote}>
        Running on the Team 3 dev store. Real data lands when Team 1's store merges; setup links
        light up when Team 2's wizard merges.
      </Text>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Row style={styles.infoRow}>
      <Text style={styles.rowSub}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  acctRow: {
    justifyContent: 'space-between',
  },
  linkRow: {
    justifyContent: 'space-between',
  },
  acctMeta: {
    flex: 1,
  },
  rowTitle: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
  },
  rowSub: {
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
  infoRow: {
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  infoValue: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
  },
  footnote: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: space.lg,
    lineHeight: 18,
  },
});

export default SettingsScreen;
