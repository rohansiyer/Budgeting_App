/**
 * Every number is a door (v0.3 handoff §3.7, mockup "Tap-down · the math
 * behind safe-to-spend"). Full-screen drill-down behind the Home hero's
 * safe-to-spend figure: the ledger selector's line items (RuledList, tabular
 * numerals, +amounts in accent, outflows plain), a double-hairline total row,
 * then a tappable list of the enveloped categories underneath (there is no
 * per-category line in the reconciliation itself — safeToSpendBreakdown's
 * lines are aggregates across every envelope, see src/ledger/safeToSpend.ts —
 * so this second RuledList is the concrete door into "an envelope" the
 * handoff describes rows opening further into).
 *
 * Mounted as a full-screen route on the root stack (src/navigation), the same
 * "local full-screen overlay" shape DailyDetailScreen uses via AppShell, just
 * reached through React Navigation instead since AppShell.tsx belongs to a
 * different wave's ownership.
 */
import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import { cents, formatCents } from '../../lib/money';
import { HardButton, RuledList, CategoryChip } from '../../components/kit';
import { Screen, MoneyText, Row } from '../../components/Primitives';
import { useStore } from '../../providers/StoreProvider';
import { safeToSpendBreakdown } from '../../ledger';
import type { SafeToSpendLine } from '../../ledger';
import { todayISO, weekStartOf } from '../../format/dates';
import type { CategoryConfig } from '../../types/contracts';

const { color, space, pixel } = tokens;
const typo = tokens.type;

export interface SafeToSpendLedgerProps {
  onClose: () => void;
  onOpenEnvelope: (categoryId: string) => void;
}

export function SafeToSpendLedger({ onClose, onOpenEnvelope }: SafeToSpendLedgerProps) {
  const store = useStore();
  const week = weekStartOf(todayISO());
  const breakdown = safeToSpendBreakdown(week);
  const enveloped = store.listCategories().filter((c) => c.envelope !== null);

  return (
    <Screen
      title="Where it comes from"
      right={
        <HardButton
          label="Close"
          variant="ghost"
          onPress={onClose}
          accessibilityLabel="Close the safe to spend ledger"
        />
      }
    >
      <RuledList<SafeToSpendLine>
        data={breakdown.lines}
        keyExtractor={(line) => line.label}
        renderRow={(line) => <LineRow line={line} />}
      />

      <View
        style={styles.totalRow}
        accessible
        accessibilityLabel={`Safe to spend: ${formatCents(breakdown.totalCents)}`}
      >
        <Text style={styles.totalLabel}>= Safe to spend</Text>
        <MoneyText amount={breakdown.totalCents} kind="net" size={typo.kpi.fontSize} />
      </View>

      {enveloped.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>Envelopes</Text>
          <RuledList<CategoryConfig>
            data={enveloped}
            keyExtractor={(c) => c.id}
            renderRow={(cat) => {
              const st = store.getEnvelopeWeekState(cat.id, week);
              return (
                <Pressable
                  onPress={() => onOpenEnvelope(cat.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${cat.name} envelope, ${formatCents(st.remaining)} left. Opens the full ledger.`}
                >
                  <Row style={styles.envRow}>
                    <Row>
                      <CategoryChip colorKey={cat.colorKey} />
                      <Text style={styles.lineLabel}>{cat.name}</Text>
                    </Row>
                    <MoneyText amount={st.remaining} kind={st.remaining < 0 ? 'spend' : 'plain'} />
                  </Row>
                </Pressable>
              );
            }}
          />
        </>
      ) : null}

      <Text style={styles.footer}>
        Every dollar is accounted for; nothing is ever invented or lost. Each row opens further.
      </Text>
    </Screen>
  );
}

/** One reconciliation line: label left, tabular amount right ('in' in accent, 'out' plain. */
function LineRow({ line }: { line: SafeToSpendLine }) {
  const signed = line.direction === 'out' ? cents(-line.amountCents) : line.amountCents;
  return (
    <View accessible accessibilityLabel={`${line.label}: ${formatCents(signed)}`}>
      <Row style={styles.lineRowWrap}>
        <Text style={styles.lineLabel}>{line.label}</Text>
        <MoneyText
          amount={signed}
          kind={line.direction === 'in' ? 'income' : 'plain'}
          signed={line.direction === 'in'}
        />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  lineRowWrap: {
    justifyContent: 'space-between',
  },
  lineLabel: {
    flex: 1,
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
    marginRight: space.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: pixel.hairlineWidth * 2,
    borderTopColor: color.border,
    paddingVertical: space.md,
    marginTop: space.xs,
  },
  totalLabel: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.title.fontWeight,
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
  envRow: {
    justifyContent: 'space-between',
  },
  footer: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    lineHeight: 18,
    marginTop: space.lg,
  },
});

export default SafeToSpendLedger;
