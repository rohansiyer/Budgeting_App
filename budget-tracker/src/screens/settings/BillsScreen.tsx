/**
 * Settings subscreen: bills forecast + subscription detection (v0.3 handoff
 * §3.8, mockups "Bills forecast · next 14 days" / "Due before payday" and
 * "Subscription detection · an insight rule").
 *
 * Lives in the Settings local state stack (SettingsScreen wires this in) —
 * NOT the root navigator, per CLAUDE.md convention.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as tokens from '../../theme/tokens';
import { formatCents } from '../../lib/money';
import { RuledList, HardButton, Snackbar } from '../../components/kit';
import { Screen, Row } from '../../components/Primitives';
import { SubscreenHeader } from './SubscreenHeader';
import { SubscriptionPromptCard } from './SubscriptionPromptCard';
import { useStore } from '../../providers/StoreProvider';
import { todayISO, weekStartOf, addDaysISO } from '../../format/dates';
import { safeToSpendBreakdown } from '../../ledger';
import { detectSubscriptions, type DetectTxn, type SubscriptionCandidate } from '../../import';
import {
  resolveActiveBills,
  forecastWindowEnd,
  dueBeforePayday,
  totalDueCents,
  billsCoverageStatus,
  shortMonthDay,
  type ResolvedBill,
} from './billsForecast.logic';
import {
  typicalDueDay,
  candidateToRecurringBillInput,
  ignoredSubscriptionKey,
} from './subscriptionPrompt.logic';
import type { RecurringBill } from '../../types/contracts';

const { color, space, pixel } = tokens;
const typo = tokens.type;

export function BillsScreen({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const today = todayISO();
  const chapter = store.getActiveChapter();

  const bills = store.getRecurringBills();
  const activeBills = useMemo(() => bills.filter((b) => b.active), [bills]);

  const resolved = useMemo(() => resolveActiveBills(bills, today), [bills, today]);
  const paydays = store.getPaydays({ from: today, to: addDaysISO(today, 60) });
  const windowEnd = useMemo(() => forecastWindowEnd(today, paydays), [today, paydays]);
  const dueList = useMemo(() => dueBeforePayday(resolved, windowEnd), [resolved, windowEnd]);
  const total = totalDueCents(dueList);

  const week = weekStartOf(today);
  const breakdown = safeToSpendBreakdown(week);
  const safeToSpend = store.getSafeToSpend(week);
  const status = billsCoverageStatus(total, breakdown.lines, safeToSpend);

  // --- subscription detection --------------------------------------------
  const transactions = store.getTransactions({ from: chapter.startedAt, to: today });
  const detectTxns: DetectTxn[] = useMemo(
    () =>
      transactions
        .filter((t) => t.kind === 'expense')
        .map((t) => ({ date: t.date, amountCents: t.amount, note: t.note, categoryId: t.categoryId })),
    [transactions],
  );
  const activeBillNames = useMemo(() => activeBills.map((b) => b.name), [activeBills]);
  const candidates = useMemo(
    () => detectSubscriptions(detectTxns, { activeBillNames }),
    [detectTxns, activeBillNames],
  );

  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    const keys = candidates.map((c) => ignoredSubscriptionKey(chapter.id, c.merchant));
    if (keys.length === 0) {
      setIgnored(new Set());
      return;
    }
    AsyncStorage.multiGet(keys).then((pairs) => {
      if (cancelled) return;
      const next = new Set<string>();
      pairs.forEach(([, value], i) => {
        if (value) next.add(candidates[i].merchant);
      });
      setIgnored(next);
    });
    return () => {
      cancelled = true;
    };
    // Re-check whenever the candidate set (by merchant) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.id, candidates.map((c) => c.merchant).join('|')]);

  const visibleCandidates = candidates.filter((c) => !ignored.has(c.merchant));

  const fallbackCategoryId = store.listCategories()[0]?.id ?? '';

  const handleMarkAsBill = async (candidate: SubscriptionCandidate) => {
    const dueDay = typicalDueDay(detectTxns, candidate.merchant);
    const input = candidateToRecurringBillInput(candidate, { dueDay, fallbackCategoryId });
    await store.addRecurringBill(input);
  };

  const handleIgnore = async (candidate: SubscriptionCandidate) => {
    await AsyncStorage.setItem(ignoredSubscriptionKey(chapter.id, candidate.merchant), '1');
    setIgnored((prev) => new Set(prev).add(candidate.merchant));
  };

  // --- manage list (remove with undo) -------------------------------------
  const [snackbarBill, setSnackbarBill] = useState<RecurringBill | null>(null);

  const handleRemove = async (bill: RecurringBill) => {
    await store.updateRecurringBill(bill.id, { active: false });
    setSnackbarBill(bill);
  };

  const handleUndoRemove = async () => {
    if (!snackbarBill) return;
    await store.updateRecurringBill(snackbarBill.id, { active: true });
    setSnackbarBill(null);
  };

  return (
    <Screen scroll>
      <SubscreenHeader title="Bills" onBack={onBack} />

      <Text style={styles.sectionLabel}>Due before payday</Text>
      <RuledList<ResolvedBill>
        data={dueList}
        keyExtractor={(r) => r.bill.id}
        renderRow={(r) => (
          <View
            accessible
            accessibilityLabel={`${r.bill.name}, due ${shortMonthDay(r.dueDate)}, ${formatCents(r.bill.amountCents)}`}
          >
            <Row style={styles.dueRow}>
              <Text style={styles.dueDate}>{shortMonthDay(r.dueDate)}</Text>
              <Text style={styles.dueName} numberOfLines={1}>
                {r.bill.name}
              </Text>
              <Text style={styles.dueAmount}>{formatCents(r.bill.amountCents)}</Text>
            </Row>
          </View>
        )}
      />

      <Row style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalAmount}>{formatCents(total)}</Text>
      </Row>

      <Text
        style={[styles.statusCaption, { color: status.covered ? color.accent : color.warn }]}
        accessibilityLiveRegion="polite"
      >
        {status.caption}
      </Text>

      <Text style={styles.sectionLabel}>Manage bills</Text>
      <RuledList<RecurringBill>
        data={activeBills}
        keyExtractor={(b) => b.id}
        renderRow={(b) => (
          <Row style={styles.manageRow}>
            <View style={styles.manageMeta}>
              <Text style={styles.manageName}>{b.name}</Text>
              <Text style={styles.manageAmount}>{formatCents(b.amountCents)}</Text>
            </View>
            <HardButton
              label="Remove"
              variant="ghost"
              onPress={() => void handleRemove(b)}
              accessibilityLabel={`Remove ${b.name} from recurring bills`}
            />
          </Row>
        )}
      />

      {visibleCandidates.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>Looks like a subscription</Text>
          {visibleCandidates.map((c) => (
            <SubscriptionPromptCard
              key={c.merchant}
              candidate={c}
              onMarkAsBill={() => void handleMarkAsBill(c)}
              onIgnore={() => void handleIgnore(c)}
            />
          ))}
        </>
      ) : null}

      <Snackbar
        visible={snackbarBill !== null}
        message={snackbarBill ? `${snackbarBill.name} removed.` : ''}
        actionLabel="Undo"
        onAction={() => void handleUndoRemove()}
        onTimeout={() => setSnackbarBill(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  dueRow: {
    justifyContent: 'flex-start',
    gap: space.sm,
  },
  dueDate: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.title.fontWeight,
    fontVariant: [...typo.tabularNums.fontVariant],
    width: 48,
  },
  dueName: {
    flex: 1,
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
  },
  dueAmount: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.title.fontWeight,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
  totalRow: {
    justifyContent: 'space-between',
    borderTopWidth: pixel.hairlineWidth * 2,
    borderTopColor: color.border,
    paddingTop: space.sm,
    marginTop: space.xs,
  },
  totalLabel: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.title.fontWeight,
  },
  totalAmount: {
    color: color.text,
    fontSize: typo.kpi.fontSize,
    fontWeight: typo.kpi.fontWeight,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
  statusCaption: {
    fontSize: typo.body.fontSize,
    fontWeight: typo.caption.fontWeight,
    lineHeight: 20,
    marginTop: space.sm,
  },
  manageRow: {
    justifyContent: 'space-between',
  },
  manageMeta: {
    flex: 1,
    marginRight: space.md,
  },
  manageName: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
  },
  manageAmount: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    fontVariant: [...typo.tabularNums.fontVariant],
    marginTop: 2,
  },
});

export default BillsScreen;
