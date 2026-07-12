/**
 * Settings subscreen: search + filter the active chapter's ledger (v0.3
 * handoff §3.8 "Search/filter" — mockup "Ledger · search + filter"). A
 * Field over a category-chip filter row over a RuledList of results, with a
 * footer aggregate. Rows are informational only this wave (no tap action).
 *
 * Lives in the Settings local state stack (SettingsScreen wires this in at
 * the gate) — NOT the root navigator, per CLAUDE.md convention.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import { formatCents } from '../../lib/money';
import { Field, RuledList, CategoryChip } from '../../components/kit';
import { Screen, MoneyText, Row } from '../../components/Primitives';
import { SubscreenHeader } from './SubscreenHeader';
import { useStore } from '../../providers/StoreProvider';
import { todayISO, shortDate } from '../../format/dates';
import { filterLedger, toggleCategoryId, type LedgerSearchRow } from './searchLedger.logic';
import type { CategoryConfig, TransactionRecord } from '../../types/contracts';

const { color, space, pixel } = tokens;
const typo = tokens.type;

/** Title column mirrors csvExport.logic's titleFor: category name for
 * expense/transfer, note-or-'Income' for income. */
function titleFor(t: TransactionRecord, catById: Map<string, CategoryConfig>): string {
  if (t.kind === 'income') return t.note && t.note.length > 0 ? t.note : 'Income';
  return catById.get(t.categoryId)?.name ?? 'Uncategorized';
}

function toSearchRow(t: TransactionRecord, catById: Map<string, CategoryConfig>): LedgerSearchRow {
  return {
    id: t.id,
    categoryId: t.categoryId,
    title: titleFor(t, catById),
    note: t.note,
    date: t.date,
    amount: t.amount,
    kind: t.kind,
  };
}

export function SearchLedgerScreen({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const [query, setQuery] = useState('');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);

  const categories = store.listCategories();
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c] as const)), [categories]);

  const chapter = store.getActiveChapter();
  // Wide, safe window: from the chapter's start through today (same window
  // BackupScreen's CSV export uses) — this IS the "full chapter ledger".
  const allRows = store.getTransactions({ from: chapter.startedAt, to: todayISO() });
  const searchRows = useMemo(
    () => allRows.map((t) => toSearchRow(t, catById)),
    [allRows, catById],
  );

  const result = useMemo(
    () => filterLedger(searchRows, { query, categoryIds }),
    [searchRows, query, categoryIds],
  );

  const toggleCategory = (id: string) => setCategoryIds((prev) => toggleCategoryId(prev, id));
  const clearCategories = () => setCategoryIds([]);

  return (
    <Screen scroll>
      <SubscreenHeader title="Search ledger" onBack={onBack} />

      <Field
        label="Search your ledger"
        value={query}
        onChangeText={setQuery}
        placeholder="Title or note"
        autoFocus
        accessibilityLabel="Search your ledger by title or note"
      />

      <View style={styles.chipRow}>
        <Pressable
          onPress={clearCategories}
          accessibilityRole="button"
          accessibilityState={{ selected: categoryIds.length === 0 }}
          accessibilityLabel="Show all categories"
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          style={[styles.chip, categoryIds.length === 0 ? styles.chipSelected : styles.chipUnselected]}
        >
          <Text style={[styles.chipLabel, { color: categoryIds.length === 0 ? color.accent : color.textSecondary }]}>
            ALL
          </Text>
        </Pressable>
        {categories.map((c) => {
          const selected = categoryIds.includes(c.id);
          return (
            <Pressable
              key={c.id}
              onPress={() => toggleCategory(c.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Filter by ${c.name}${selected ? ', selected' : ''}`}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
            >
              <CategoryChip colorKey={c.colorKey} />
              <Text
                style={[
                  styles.chipLabel,
                  styles.chipLabelWithSwatch,
                  { color: selected ? color.accent : color.textSecondary },
                ]}
              >
                {c.name.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <RuledList<LedgerSearchRow>
        data={result.rows}
        keyExtractor={(r) => r.id}
        renderRow={(r) => <ResultRow row={r} category={catById.get(r.categoryId)} />}
      />

      {result.truncated ? (
        <Text style={styles.truncated}>{`Showing latest ${result.rows.length}.`}</Text>
      ) : null}

      <Row style={styles.footer}>
        <Text style={styles.footerCount}>
          {`${result.footer.count} ${result.footer.count === 1 ? 'transaction' : 'transactions'}`}
        </Text>
        <Text style={styles.footerTotal}>{`${formatCents(result.footer.totalCents)} total`}</Text>
      </Row>
    </Screen>
  );
}

function ResultRow({ row, category }: { row: LedgerSearchRow; category: CategoryConfig | undefined }) {
  const isInflow = row.kind === 'income' || row.kind === 'transfer_in';
  return (
    <View
      accessible
      accessibilityLabel={`${shortDate(row.date)}, ${row.title}, ${formatCents(row.amount)}`}
    >
      <Row style={styles.row}>
        <Text style={styles.rowDate}>{shortDate(row.date)}</Text>
        {category && !isInflow ? <CategoryChip colorKey={category.colorKey} /> : null}
        <Text style={styles.rowTitle} numberOfLines={1}>
          {row.title}
        </Text>
        <MoneyText amount={row.amount} kind={isInflow ? 'income' : 'spend'} />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
    marginBottom: space.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: 32,
    paddingHorizontal: space.sm + space.xs,
    borderWidth: pixel.hairlineWidth,
    backgroundColor: color.surface,
  },
  chipSelected: {
    borderColor: color.accent,
  },
  chipUnselected: {
    borderColor: color.border,
  },
  chipLabel: {
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
  },
  chipLabelWithSwatch: {
    marginLeft: 0,
  },
  row: {
    justifyContent: 'flex-start',
    gap: space.sm,
  },
  rowDate: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.title.fontWeight,
    fontVariant: [...typo.tabularNums.fontVariant],
    width: 56,
  },
  rowTitle: {
    flex: 1,
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
  },
  truncated: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: space.sm,
  },
  footer: {
    justifyContent: 'space-between',
    marginTop: space.md,
    borderTopWidth: pixel.hairlineWidth,
    borderTopColor: color.border,
    paddingTop: space.sm,
  },
  footerCount: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
  },
  footerTotal: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.title.fontWeight,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
});

export default SearchLedgerScreen;
