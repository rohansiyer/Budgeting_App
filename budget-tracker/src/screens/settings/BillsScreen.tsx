/**
 * Settings subscreen: bills forecast + subscription detection (v0.3 handoff
 * §3.8, mockups "Bills forecast · next 14 days" / "Due before payday" and
 * "Subscription detection · an insight rule").
 *
 * Lives in the Settings local state stack (SettingsScreen wires this in) —
 * NOT the root navigator, per CLAUDE.md convention.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as tokens from '../../theme/tokens';
import { formatCents, parseDecimal, type Cents } from '../../lib/money';
import { RuledList, HardButton, Snackbar, Field, PixelBox, CategoryChip } from '../../components/kit';
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
  fixedCategoryNudges,
  type ResolvedBill,
} from './billsForecast.logic';
import {
  typicalDueDay,
  candidateToRecurringBillInput,
  ignoredSubscriptionKey,
} from './subscriptionPrompt.logic';
import type { CategoryConfig, RecurringBill } from '../../types/contracts';

const { color, space, pixel } = tokens;
const typo = tokens.type;

/** "12.34" -> "have up to 2 decimals" friendly copy for a bad amount (F1-8 pattern: never surface raw MoneyError text). */
const AMOUNT_ERROR_MESSAGE = 'Enter an amount with up to 2 decimals (e.g. 12.34)';

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

  const categories = store.listCategories();
  const fallbackCategoryId = categories[0]?.id ?? '';

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

  // --- manual "Add bill" form (F5-5) ---------------------------------------
  const [billName, setBillName] = useState('');
  const [billCategoryId, setBillCategoryId] = useState<string>(fallbackCategoryId);
  const [billAmountInput, setBillAmountInput] = useState('');
  const [billDueDayInput, setBillDueDayInput] = useState('1');
  const [billNameError, setBillNameError] = useState<string | null>(null);
  const [billCategoryError, setBillCategoryError] = useState<string | null>(null);
  const [billAmountError, setBillAmountError] = useState<string | null>(null);
  const [billDueDayError, setBillDueDayError] = useState<string | null>(null);

  // F5-5(b): fixed-bill categories (the wizard's category.fixed flag) with no
  // matching active recurring bill yet. Tapping a nudge only PREFILLS the
  // form below — nothing is created until the user hits "Add bill".
  const nudges = useMemo(() => fixedCategoryNudges(categories, bills), [categories, bills]);

  const clearBillErrors = () => {
    setBillNameError(null);
    setBillCategoryError(null);
    setBillAmountError(null);
    setBillDueDayError(null);
  };

  const handlePrefillFromNudge = (cat: CategoryConfig) => {
    clearBillErrors();
    setBillName(cat.name);
    setBillCategoryId(cat.id);
  };

  const handleAddBill = async () => {
    clearBillErrors();
    let ok = true;

    const trimmedName = billName.trim();
    if (trimmedName.length === 0) {
      setBillNameError('Give the bill a name.');
      ok = false;
    }

    if (!billCategoryId) {
      setBillCategoryError('Pick a category.');
      ok = false;
    }

    let amountCents: Cents | undefined;
    try {
      const parsed = parseDecimal(billAmountInput || '0');
      if (parsed <= 0) {
        setBillAmountError(AMOUNT_ERROR_MESSAGE);
        ok = false;
      } else {
        amountCents = parsed;
      }
    } catch {
      // parseDecimal only ever throws MoneyError; never surface its raw message (F1-8 pattern).
      setBillAmountError(AMOUNT_ERROR_MESSAGE);
      ok = false;
    }

    const dueDay = parseInt(billDueDayInput, 10);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      setBillDueDayError('Enter a day of month from 1 to 31.');
      ok = false;
    }

    if (!ok || amountCents === undefined) return;

    await store.addRecurringBill({
      name: trimmedName,
      categoryId: billCategoryId,
      amountCents,
      dueDay,
    });

    setBillName('');
    setBillAmountInput('');
    setBillDueDayInput('1');
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

      {nudges.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>Missing reminders</Text>
          {nudges.map((cat) => (
            <View
              key={cat.id}
              accessible
              accessibilityLabel={`${cat.name} is a fixed bill with no reminder set.`}
            >
              <Row style={styles.nudgeRow}>
                <View style={styles.nudgeMeta}>
                  <Row>
                    <CategoryChip colorKey={cat.colorKey} size={11} />
                    <Text style={styles.nudgeText}>
                      {cat.name} is a fixed bill with no reminder set.
                    </Text>
                  </Row>
                </View>
                <HardButton
                  label="Add it"
                  variant="ghost"
                  onPress={() => handlePrefillFromNudge(cat)}
                  accessibilityLabel={`Add a bill reminder for ${cat.name}`}
                />
              </Row>
            </View>
          ))}
        </>
      ) : null}

      <Text style={styles.sectionLabel}>Add a bill</Text>
      <PixelBox>
        <View style={{ gap: space.sm }}>
          <Field
            label="Bill name"
            placeholder="e.g. Rent"
            value={billName}
            onChangeText={setBillName}
            error={billNameError ?? undefined}
            accessibilityLabel="New bill name"
          />

          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {categories.map((c) => {
              const selected = c.id === billCategoryId;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setBillCategoryId(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Category ${c.name}${selected ? ', selected' : ''}`}
                  style={[styles.categoryCell, selected && styles.categoryCellSelected]}
                >
                  <CategoryChip colorKey={c.colorKey} size={11} />
                  <Text
                    style={[styles.categoryCellLabel, selected && styles.categoryCellLabelSelected]}
                    numberOfLines={1}
                  >
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {billCategoryError ? <Text style={styles.fieldError}>{billCategoryError}</Text> : null}

          <Field
            label="Amount"
            placeholder="e.g. 12.34"
            keyboardType="decimal-pad"
            value={billAmountInput}
            onChangeText={setBillAmountInput}
            error={billAmountError ?? undefined}
            accessibilityLabel="Bill amount in dollars"
          />
          <Field
            label="Due day of month (1-31)"
            placeholder="e.g. 15"
            keyboardType="number-pad"
            value={billDueDayInput}
            onChangeText={setBillDueDayInput}
            error={billDueDayError ?? undefined}
            accessibilityLabel="Due day of month, 1 to 31"
          />
          <HardButton label="Add bill" accessibilityLabel="Add bill" onPress={() => void handleAddBill()} />
        </View>
      </PixelBox>

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
  nudgeRow: {
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  nudgeMeta: {
    flex: 1,
    marginRight: space.sm,
  },
  nudgeText: {
    flex: 1,
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
    marginLeft: space.sm,
  },
  fieldLabel: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  categoryCell: {
    minHeight: 48,
    flexGrow: 1,
    flexBasis: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    backgroundColor: color.surface,
    paddingHorizontal: space.sm,
  },
  categoryCellSelected: {
    borderColor: color.accent,
  },
  categoryCellLabel: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.body.fontWeight,
  },
  categoryCellLabelSelected: {
    color: color.text,
  },
  fieldError: {
    color: color.danger,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
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
