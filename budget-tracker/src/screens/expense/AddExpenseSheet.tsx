import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import { PixelBox, HardButton, CategoryChip } from '../../components/kit';
import { Sheet } from '../../components/Sheet';
import { useStore } from '../../providers/StoreProvider';
import { envelopeLedger } from '../../ledger';
import { formatCents, ZERO, type Cents } from '../../lib/money';
import type { CategoryColorKey, CategoryConfig, ISODate } from '../../types/contracts';
import {
  appendDigits,
  backspaceDigits,
  digitsToCents,
  liveFeedback,
  shouldPromptBorrow,
  overspendAmount,
  borrowPromptCopy,
  confirmLabel,
  isValidDraft,
  recentCategories,
  recentWindowRange,
  type BorrowPromptCopy,
} from './AddExpenseSheet.logic';

const { color, space, pixel, font } = tokens;
const typo = tokens.type;

/** 3x4 keypad: digits, a 00 fast-entry key, and backspace. Mirrors PinPad.tsx's key look. */
const KEY_ROWS: readonly (readonly string[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['00', '0', 'back'],
];

export interface AddExpenseCommitInfo {
  transactionId: string;
  categoryName: string;
  amount: Cents;
  borrowed: boolean;
}

/**
 * Amount-first add-expense sheet (v0.3 handoff §3.4, mockups "Add expense ·
 * amount-first" and "Borrow prompt"). Owns the whole commit flow, including
 * the cadence-aware borrow prompt, so callers only need to react to
 * `onCommitted` for undo + snackbar wiring.
 */
export function AddExpenseSheet({
  categories,
  accountId,
  date,
  onClose,
  onCommitted,
}: {
  categories: CategoryConfig[];
  /** Undefined when no spending account is configured yet; confirm stays disabled. */
  accountId: string | undefined;
  date: ISODate;
  onClose: () => void;
  onCommitted: (info: AddExpenseCommitInfo) => void;
}) {
  const store = useStore();
  const [rawDigits, setRawDigits] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [stage, setStage] = useState<'entry' | 'borrow'>('entry');
  const [submitting, setSubmitting] = useState(false);

  const spendable = useMemo(
    () => categories.filter((c) => c.envelope !== null || c.fixed),
    [categories],
  );

  const recents = useMemo(() => {
    const range = recentWindowRange(date);
    const recentExpenseCategoryIds = store
      .getTransactions(range)
      .filter((t) => t.kind === 'expense')
      .map((t) => t.categoryId);
    return recentCategories(spendable, recentExpenseCategoryIds, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, spendable]);

  const [categoryId, setCategoryId] = useState<string>(recents[0]?.id ?? spendable[0]?.id ?? '');

  const draftCents = digitsToCents(rawDigits);
  const category = spendable.find((c) => c.id === categoryId);

  const remaining = useMemo(() => {
    if (!category || category.envelope === null) return null;
    return envelopeLedger(category.id, date).endingBalanceCents;
  }, [category, date]);

  const feedback =
    category && remaining !== null ? liveFeedback(category.name, remaining, draftCents) : null;
  const overspend = category && remaining !== null ? overspendAmount(remaining, draftCents) : ZERO;
  const wouldBorrow = category && remaining !== null && shouldPromptBorrow(remaining, draftCents);

  const nextCycle = useMemo(() => {
    if (!category || !wouldBorrow) return null;
    return store.nextCycleStartState(category.id, date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, wouldBorrow, date]);

  const promptCopy: BorrowPromptCopy | null = useMemo(() => {
    if (!category || !nextCycle) return null;
    return borrowPromptCopy({
      categoryName: category.name,
      cadence: category.cadence,
      overspend,
      nextCycleStartsWith: nextCycle.startsWith,
    });
  }, [category, nextCycle, overspend]);

  const valid = isValidDraft(draftCents, categoryId) && accountId !== undefined && !submitting;

  async function commit(borrowed: boolean) {
    if (!category || !accountId) return;
    setSubmitting(true);
    try {
      const transactionId = await store.addExpense({
        accountId,
        categoryId: category.id,
        amount: draftCents,
        date,
      });
      onCommitted({ transactionId, categoryName: category.name, amount: draftCents, borrowed });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  function handleConfirmPress() {
    if (!valid || !category) return;
    if (remaining !== null && shouldPromptBorrow(remaining, draftCents)) {
      setStage('borrow');
      return;
    }
    void commit(false);
  }

  async function handleBorrowConfirm() {
    if (!category) return;
    setSubmitting(true);
    try {
      await store.borrowFromNextCycle(category.id, date, overspend);
      await commit(true);
    } finally {
      setSubmitting(false);
    }
  }

  function handleNotNow() {
    void commit(false);
  }

  const confirmText = category ? confirmLabel(category.name, draftCents) : 'Add expense';

  return (
    <Sheet visible onClose={onClose} title="Add expense">
      {stage === 'borrow' && promptCopy && category ? (
        <BorrowPrompt
          copy={promptCopy}
          categoryColorKey={category.colorKey}
          onBorrow={() => void handleBorrowConfirm()}
          onNotNow={handleNotNow}
          disabled={submitting}
        />
      ) : (
        <>
          <View style={styles.amountBlock}>
            <Text
              style={[styles.amount, draftCents > 0 && styles.amountActive]}
              accessibilityLabel={`Amount, ${formatCents(draftCents)}`}
            >
              {formatCents(draftCents)}
            </Text>
            {feedback ? (
              <Text
                style={[styles.feedback, feedback.danger && styles.feedbackDanger]}
                accessibilityLabel={feedback.text}
              >
                {feedback.text}
              </Text>
            ) : null}
          </View>

          <View style={styles.recentBlock}>
            <Text style={styles.recentLabel}>Recent</Text>
            <View style={styles.recentGrid}>
              {(showAll ? spendable : recents).map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCategoryId(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: c.id === categoryId }}
                  accessibilityLabel={`Category ${c.name}${c.id === categoryId ? ', selected' : ''}`}
                  style={[styles.recentCell, c.id === categoryId && styles.recentCellSelected]}
                >
                  <CategoryChip colorKey={c.colorKey} size={11} />
                  <Text
                    style={[
                      styles.recentCellLabel,
                      c.id === categoryId && styles.recentCellLabelSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </View>
            {spendable.length > recents.length ? (
              <Pressable
                onPress={() => setShowAll((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showAll ? 'Show fewer categories' : 'Show all categories'}
                hitSlop={8}
              >
                <Text style={styles.moreLink}>{showAll ? 'Show fewer' : 'More categories'}</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.keypad}>
            {KEY_ROWS.map((row, r) => (
              <View style={styles.keypadRow} key={r}>
                {row.map((key) => (
                  <Pressable
                    key={key}
                    style={styles.key}
                    onPress={() => {
                      if (key === 'back') setRawDigits((d) => backspaceDigits(d));
                      else setRawDigits((d) => appendDigits(d, key));
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      key === 'back' ? 'Delete last digit' : key === '00' ? 'Double zero' : `Digit ${key}`
                    }
                  >
                    <Text style={styles.keyLabel}>{key === 'back' ? 'DEL' : key}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>

          <HardButton
            label={confirmText}
            onPress={handleConfirmPress}
            disabled={!valid}
            accessibilityLabel={confirmText}
          />
        </>
      )}
    </Sheet>
  );
}

function BorrowPrompt({
  copy,
  categoryColorKey,
  onBorrow,
  onNotNow,
  disabled,
}: {
  copy: BorrowPromptCopy;
  categoryColorKey: CategoryColorKey;
  onBorrow: () => void;
  onNotNow: () => void;
  disabled: boolean;
}) {
  return (
    <PixelBox>
      <View style={styles.borrowHeadRow}>
        <CategoryChip colorKey={categoryColorKey} />
        <Text style={styles.borrowHeadline}>{copy.headline}</Text>
      </View>
      <Text style={styles.borrowBody}>{copy.body}</Text>
      <View style={styles.borrowActions}>
        <HardButton
          label={copy.primaryLabel}
          onPress={onBorrow}
          disabled={disabled}
          accessibilityLabel={copy.primaryLabel}
        />
        <HardButton
          label={copy.ghostLabel}
          variant="ghost"
          onPress={onNotNow}
          disabled={disabled}
          accessibilityLabel="Add the expense without borrowing"
        />
      </View>
    </PixelBox>
  );
}

const styles = StyleSheet.create({
  amountBlock: {
    alignItems: 'center',
    marginBottom: space.md,
  },
  amount: {
    color: color.text,
    fontSize: 44,
    fontWeight: typo.kpi.fontWeight,
    fontFamily: font.monoBold,
    fontVariant: [...typo.tabularNums.fontVariant],
    letterSpacing: -1.5,
  },
  amountActive: {
    color: color.accent,
  },
  feedback: {
    color: color.accent,
    fontSize: 13,
    fontWeight: typo.caption.fontWeight,
    fontFamily: font.uiMedium,
    marginTop: space.xs + 4,
  },
  feedbackDanger: {
    color: color.danger,
  },
  recentBlock: {
    marginBottom: space.md,
  },
  recentLabel: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
    fontFamily: typo.sectionLabel.fontFamily,
    marginBottom: space.xs,
  },
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  recentCell: {
    minWidth: 48,
    height: 48,
    flexGrow: 1,
    flexBasis: '22%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  recentCellSelected: {
    borderColor: color.accent,
  },
  recentCellLabel: {
    color: color.textSecondary,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    fontFamily: font.uiBold,
  },
  recentCellLabelSelected: {
    color: color.text,
  },
  moreLink: {
    color: color.accent,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    fontFamily: font.uiMedium,
    marginTop: space.sm,
  },
  keypad: {
    marginBottom: space.md,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.xs,
  },
  key: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    backgroundColor: color.surfaceDeep,
  },
  keyLabel: {
    color: color.text,
    fontSize: 20,
    fontWeight: typo.kpi.fontWeight,
    fontFamily: font.monoBold,
  },
  borrowHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginBottom: space.md,
  },
  borrowHeadline: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.title.fontWeight,
    fontFamily: font.uiBold,
    flexShrink: 1,
  },
  borrowBody: {
    color: color.textSecondary,
    fontSize: 13,
    fontWeight: typo.caption.fontWeight,
    fontFamily: font.uiMedium,
    lineHeight: 20,
    marginBottom: space.md,
  },
  borrowActions: {
    gap: space.sm,
  },
});

export default AddExpenseSheet;
