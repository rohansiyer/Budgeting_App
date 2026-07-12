import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import * as tokens from '../../../theme/tokens';
import { CategoryChip, HardButton, RuledList, Toggle } from '../../../components/kit';
import { Screen, Row } from '../../../components/Primitives';
import { SubscreenHeader } from '../SubscreenHeader';
import { cents, formatCents, type Cents } from '../../../lib/money';
import { shortDate } from '../../../format/dates';
import type { CategoryConfig } from '../../../types/contracts';
import type { SessionCounts } from '../../../import';
import { CategoryPickerSheet } from './CategoryPickerSheet';
import {
  confirmImportLabel,
  importableCount,
  matchedSummaryLine,
  reviewHeaderCopy,
  type DuplicateRowState,
  type ImportReviewState,
  type ReviewRowState,
} from './importFlow.logic';

const { color, space, pixel } = tokens;
const typo = tokens.type;

/** "-$18.40" for a spend-positive amount, "+$500.00" for an inflow (refund/income row). */
function amountDisplay(spendPositiveCents: Cents): string {
  const abs = cents(Math.abs(spendPositiveCents));
  return spendPositiveCents >= 0 ? `-${formatCents(abs)}` : `+${formatCents(abs)}`;
}

/**
 * CSV import review screen (v0.3 handoff §3.8, mockups "CSV import · review
 * screen" / "Import · chase_jan-jun.csv"). Never silent: the header names the
 * exact sorted/total counts, every needsReview row must be resolved or
 * explicitly skipped, and duplicates stay excluded unless the user opts them
 * back in per row.
 */
export function ImportReviewScreen({
  state,
  counts,
  categories,
  busy,
  malformedCount = 0,
  onAccept,
  onChangeCategory,
  onSkip,
  onToggleDuplicate,
  onConfirm,
  onBack,
}: {
  state: ImportReviewState;
  counts: SessionCounts;
  categories: readonly CategoryConfig[];
  busy: boolean;
  /** Rows the CSV parser couldn't read at all (bad date/amount/blank description). */
  malformedCount?: number;
  onAccept: (index: number) => void;
  onChangeCategory: (index: number, categoryId: string) => void;
  onSkip: (index: number) => void;
  onToggleDuplicate: (index: number, included: boolean) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const headerCopy = reviewHeaderCopy(state.fileName, counts);
  const byId = new Map(categories.map((c) => [c.id, c] as const));
  const confirmDisabled = busy || importableCount(state) === 0;

  return (
    <Screen scroll>
      <SubscreenHeader title="Import CSV" onBack={onBack} />

      <Text style={styles.fileLabel}>{headerCopy.fileLabel}</Text>
      <Text style={styles.title}>{headerCopy.title}</Text>
      <Text style={styles.subtitle}>{headerCopy.subtitle}</Text>
      {malformedCount > 0 ? (
        <Text style={styles.malformedNote}>
          {malformedCount} {malformedCount === 1 ? 'row' : 'rows'} couldn't be read and{' '}
          {malformedCount === 1 ? "wasn't" : "weren't"} imported.
        </Text>
      ) : null}

      {state.review.length > 0 ? (
        <RuledList<{ row: ReviewRowState; index: number }>
          sectionLabel="Check these"
          data={state.review.map((row, index) => ({ row, index }))}
          keyExtractor={({ index }) => `review-${index}`}
          renderRow={({ row, index }) => {
            const cat = row.categoryId ? byId.get(row.categoryId) : undefined;
            const merchantLabel = row.result.normalizedMerchant || row.result.row.description;
            return (
              <View>
                <Row style={styles.topRow}>
                  <Text style={styles.merchant} numberOfLines={1}>
                    {merchantLabel}
                  </Text>
                  <Text style={styles.amount}>{amountDisplay(row.result.row.amountCents)}</Text>
                </Row>
                <Text style={styles.date}>{shortDate(row.result.row.date)}</Text>
                <Row style={styles.actionsRow}>
                  <Pressable
                    onPress={() => onAccept(index)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      cat
                        ? `Accept ${cat.name} for ${merchantLabel}`
                        : `Choose a category for ${merchantLabel}`
                    }
                    style={[styles.chip, !row.skipped && styles.chipSelected]}
                  >
                    {cat ? <CategoryChip colorKey={cat.colorKey} /> : null}
                    <Text style={[styles.chipLabel, !row.skipped && styles.chipLabelSelected]}>
                      {cat ? `${cat.name}?` : 'Choose'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setPickerIndex(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Change category for ${merchantLabel}`}
                    style={styles.smallButton}
                  >
                    <Text style={styles.smallButtonLabel}>Change</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => (row.skipped ? onAccept(index) : onSkip(index))}
                    accessibilityRole="button"
                    accessibilityLabel={
                      row.skipped
                        ? `Include ${merchantLabel} in the import`
                        : `Skip ${merchantLabel}, don't import it`
                    }
                    style={styles.smallButton}
                  >
                    <Text style={styles.smallButtonLabel}>{row.skipped ? 'Include' : 'Skip'}</Text>
                  </Pressable>
                </Row>
                {row.skipped ? <Text style={styles.skippedNote}>Won't be imported.</Text> : null}
              </View>
            );
          }}
        />
      ) : null}

      {state.duplicates.length > 0 ? (
        <RuledList<{ d: DuplicateRowState; index: number }>
          sectionLabel="Already in your ledger, skipped"
          data={state.duplicates.map((d, index) => ({ d, index }))}
          keyExtractor={({ index }) => `dup-${index}`}
          renderRow={({ d, index }) => {
            const merchantLabel = d.dupe.normalizedMerchant || d.dupe.row.description;
            return (
              <View>
                <Row style={styles.topRow}>
                  <Text style={styles.merchant} numberOfLines={1}>
                    {merchantLabel}
                  </Text>
                  <Text style={styles.amount}>{amountDisplay(d.dupe.row.amountCents)}</Text>
                </Row>
                <Text style={styles.date}>{shortDate(d.dupe.row.date)}</Text>
                <View style={styles.duplicateToggle}>
                  <Toggle
                    value={d.included}
                    onValueChange={(v) => onToggleDuplicate(index, v)}
                    offLabel="Skip"
                    onLabel="Include"
                    accessibilityLabel={`Include ${merchantLabel} in the import, it already matches a transaction in your ledger`}
                  />
                </View>
              </View>
            );
          }}
        />
      ) : null}

      {state.matched.length > 0 ? (
        <Text style={styles.matchedSummary}>{matchedSummaryLine(state.matched.length)}</Text>
      ) : null}

      <View style={styles.confirmWrap}>
        <HardButton
          label={confirmImportLabel(state)}
          onPress={onConfirm}
          disabled={confirmDisabled}
          accessibilityLabel={confirmImportLabel(state)}
        />
      </View>
      <Text style={styles.footerCaption}>
        Matching happens on your phone. Nothing is uploaded, ever.
      </Text>

      <CategoryPickerSheet
        visible={pickerIndex !== null}
        categories={categories}
        selectedId={pickerIndex !== null ? state.review[pickerIndex].categoryId : null}
        onSelect={(categoryId) => {
          if (pickerIndex !== null) onChangeCategory(pickerIndex, categoryId);
        }}
        onClose={() => setPickerIndex(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fileLabel: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
    marginBottom: space.sm,
  },
  title: {
    color: color.text,
    fontSize: typo.title.fontSize,
    fontWeight: typo.title.fontWeight,
  },
  subtitle: {
    color: color.textSecondary,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
    marginTop: space.xs,
    marginBottom: space.md,
  },
  malformedNote: {
    color: color.warn,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginBottom: space.md,
  },
  topRow: {
    justifyContent: 'space-between',
  },
  merchant: {
    flex: 1,
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.title.fontWeight,
    fontFamily: tokens.font.monoBold,
    marginRight: space.sm,
  },
  amount: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.title.fontWeight,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
  date: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: 2,
  },
  actionsRow: {
    gap: space.sm,
    marginTop: space.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 32,
    paddingHorizontal: space.sm,
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  chipSelected: {
    borderColor: color.accent,
  },
  chipLabel: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.title.fontWeight,
  },
  chipLabelSelected: {
    color: color.accent,
  },
  smallButton: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  smallButtonLabel: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.title.fontWeight,
  },
  skippedNote: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: space.xs,
  },
  duplicateToggle: {
    marginTop: space.sm,
    maxWidth: 200,
  },
  matchedSummary: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: space.md,
  },
  confirmWrap: {
    marginTop: space.lg,
  },
  footerCaption: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    lineHeight: 18,
  },
});

export default ImportReviewScreen;
