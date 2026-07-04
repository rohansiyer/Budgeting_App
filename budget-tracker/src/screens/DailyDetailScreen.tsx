import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, categoryColors, metrics, space, type } from '../theme/tokens';
import { PixelBox, HardButton, RuledList, CategoryChip } from '../components/kit';
import { Screen, SectionLabel, MoneyText } from '../components/Primitives';
import { Sheet } from '../components/Sheet';
import { useStore } from '../providers/StoreProvider';
import { useAppShell } from '../providers/AppShell';
import { longDate } from '../format/dates';
import type { Txn, ISODate, ColorKey } from '../types/contracts';

type RuledTxn = Txn & { key: string };

export function DailyDetailScreen({ date, onClose }: { date: ISODate; onClose: () => void }) {
  const store = useStore();
  const { showUndo } = useAppShell();
  const detail = store.getDayDetail(date);

  const [menuTxn, setMenuTxn] = useState<Txn | null>(null);
  const [editTxn, setEditTxn] = useState<Txn | null>(null);
  const [addKind, setAddKind] = useState<'expense' | 'income' | null>(null);

  const incomeTxns = detail.transactions.filter((t) => t.kind === 'income');
  const expenseTxns = detail.transactions.filter((t) => t.kind === 'expense');

  // Group income legs by split parent for the inline-split display.
  const incomeGroups = useMemo(() => groupIncome(incomeTxns), [incomeTxns]);

  return (
    <Screen
      title={longDate(date)}
      right={
        <HardButton label="Done" variant="ghost" onPress={onClose} accessibilityLabel="Close day" />
      }
    >
      {/* 3 KPIs */}
      <View style={styles.kpiRow}>
        {detail.kpis.map((k) => (
          <PixelBox key={k.label} padding={space.md} style={styles.kpi}>
            <Text style={styles.kpiLabel}>{k.label}</Text>
            <MoneyText
              amount={k.value}
              format={store.formatMoney}
              kind={k.kind}
              signed={k.kind === 'net'}
              size={type.size.label}
            />
          </PixelBox>
        ))}
      </View>

      {/* Income with inline splits */}
      <SectionLabel>Income</SectionLabel>
      {incomeGroups.length === 0 ? (
        <Text style={styles.empty}>No income logged.</Text>
      ) : (
        incomeGroups.map((g) => (
          <PixelBox key={g.key} padding={space.md} style={styles.incomeBox}>
            <View style={styles.incomeHead}>
              <Text style={styles.incomeTitle}>{g.title}</Text>
              <MoneyText amount={g.total} format={store.formatMoney} kind="income" signed />
            </View>
            {g.legs.length > 1
              ? g.legs.map((leg) => (
                  <View key={leg.id} style={styles.splitRow}>
                    <Text style={styles.splitLabel}>{accountName(leg.accountId)}</Text>
                    <MoneyText amount={leg.amount} format={store.formatMoney} size={type.size.caption} />
                  </View>
                ))
              : null}
          </PixelBox>
        ))
      )}
      <HardButton label="+ Add income" variant="ghost" onPress={() => setAddKind('income')} />

      {/* Expenses */}
      <SectionLabel>Expenses</SectionLabel>
      <PixelBox padding={space.md}>
        <RuledList<RuledTxn>
          data={expenseTxns.map((t) => ({ ...t, key: t.id }))}
          emptyLabel="No expenses yet — tap add below."
          onLongPressItem={(t) => setMenuTxn(t)}
          onPressItem={(t) => setMenuTxn(t)}
          itemAccessibilityLabel={(t) =>
            `${t.categoryName}, ${store.formatMoney(t.amount)}${t.note ? ', ' + t.note : ''}. Long press for actions.`
          }
          renderItem={(t) => (
            <View style={styles.txnRow}>
              <View style={[styles.swatch, { backgroundColor: categoryColors[t.colorKey] }]} />
              <View style={styles.txnMeta}>
                <Text style={styles.txnCat}>{t.categoryName}</Text>
                {t.note ? <Text style={styles.txnNote}>{t.note}</Text> : null}
                {t.isFixed ? <Text style={styles.fixedTag}>FIXED</Text> : null}
              </View>
              <MoneyText amount={t.amount} format={store.formatMoney} kind="spend" />
            </View>
          )}
        />
      </PixelBox>
      <HardButton label="+ Add expense" onPress={() => setAddKind('expense')} />

      {/* Context menu */}
      <Sheet visible={menuTxn !== null} onClose={() => setMenuTxn(null)} title={menuTxn?.categoryName ?? ''}>
        <HardButton
          label="Edit"
          fullWidth
          variant="ghost"
          onPress={() => {
            setEditTxn(menuTxn);
            setMenuTxn(null);
          }}
        />
        <HardButton
          label="Delete"
          fullWidth
          variant="danger"
          onPress={() => {
            const t = menuTxn;
            setMenuTxn(null);
            if (!t) return;
            const removed = store.deleteTransaction(t.id);
            if (removed) {
              showUndo(`Deleted ${removed.categoryName}`, () => store.restoreTransaction(removed));
            }
          }}
        />
      </Sheet>

      {/* Edit form */}
      {editTxn ? (
        <EditForm
          key={editTxn.id}
          txn={editTxn}
          onClose={() => setEditTxn(null)}
          onSave={(patch) => {
            store.editTransaction(editTxn.id, patch);
            setEditTxn(null);
          }}
          parse={store.parseDecimal}
        />
      ) : null}

      {/* Add forms */}
      {addKind === 'expense' ? (
        <AddExpenseForm
          categories={store.getCategories()}
          onClose={() => setAddKind(null)}
          parse={store.parseDecimal}
          onSave={(amount, categoryId, note) => {
            store.addExpense({ date, amount, categoryId, note });
            setAddKind(null);
          }}
        />
      ) : null}
      {addKind === 'income' ? (
        <AddIncomeForm
          onClose={() => setAddKind(null)}
          parse={store.parseDecimal}
          onSave={(amount, note, split) => {
            store.addIncome(
              split
                ? {
                    date,
                    amount,
                    note,
                    splits: [
                      { accountId: 'acct_pnc', amount: Math.round(amount * 0.7 * 100) / 100 },
                      { accountId: 'acct_dcu', amount: Math.round(amount * 0.3 * 100) / 100 },
                    ],
                  }
                : { date, amount, note }
            );
            setAddKind(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

// --- forms -----------------------------------------------------------------
function MoneyField({
  value,
  onChangeText,
  autoFocus,
}: {
  value: string;
  onChangeText: (t: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType="decimal-pad"
      placeholder="0.00"
      placeholderTextColor={colors.text.muted}
      autoFocus={autoFocus}
      accessibilityLabel="Amount"
      style={styles.input}
    />
  );
}

function NoteField({ value, onChangeText }: { value: string; onChangeText: (t: string) => void }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder="Note (optional)"
      placeholderTextColor={colors.text.muted}
      accessibilityLabel="Note"
      style={styles.input}
    />
  );
}

function EditForm({
  txn,
  onClose,
  onSave,
  parse,
}: {
  txn: Txn;
  onClose: () => void;
  onSave: (patch: { amount: number; note: string }) => void;
  parse: (t: string) => number | null;
}) {
  const [amount, setAmount] = useState(String(txn.amount));
  const [note, setNote] = useState(txn.note ?? '');
  const parsed = parse(amount);
  return (
    <Sheet visible onClose={onClose} title={`Edit ${txn.categoryName}`}>
      <SectionLabel>Amount</SectionLabel>
      <MoneyField value={amount} onChangeText={setAmount} autoFocus />
      <SectionLabel>Note</SectionLabel>
      <NoteField value={note} onChangeText={setNote} />
      <View style={styles.formActions}>
        <HardButton
          label="Save"
          disabled={parsed === null}
          onPress={() => parsed !== null && onSave({ amount: parsed, note })}
        />
      </View>
    </Sheet>
  );
}

function AddExpenseForm({
  categories,
  onClose,
  onSave,
  parse,
}: {
  categories: { id: string; name: string; colorKey: ColorKey }[];
  onClose: () => void;
  onSave: (amount: number, categoryId: string, note?: string) => void;
  parse: (t: string) => number | null;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [catId, setCatId] = useState(categories[0]?.id ?? '');
  const parsed = parse(amount);
  const valid = parsed !== null && catId !== '';
  return (
    <Sheet visible onClose={onClose} title="Add expense">
      <SectionLabel>Amount</SectionLabel>
      <MoneyField value={amount} onChangeText={setAmount} autoFocus />
      <SectionLabel>Category</SectionLabel>
      <View style={styles.chipWrap}>
        {categories.map((c) => (
          <CategoryChip
            key={c.id}
            label={c.name}
            colorKey={c.colorKey}
            selected={c.id === catId}
            onPress={() => setCatId(c.id)}
            style={styles.chipItem}
          />
        ))}
      </View>
      <SectionLabel>Note</SectionLabel>
      <NoteField value={note} onChangeText={setNote} />
      <View style={styles.formActions}>
        <HardButton
          label="Add expense"
          disabled={!valid}
          onPress={() => valid && parsed !== null && onSave(parsed, catId, note || undefined)}
        />
      </View>
    </Sheet>
  );
}

function AddIncomeForm({
  onClose,
  onSave,
  parse,
}: {
  onClose: () => void;
  onSave: (amount: number, note: string | undefined, split: boolean) => void;
  parse: (t: string) => number | null;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [split, setSplit] = useState(false);
  const parsed = parse(amount);
  return (
    <Sheet visible onClose={onClose} title="Add income">
      <SectionLabel>Amount</SectionLabel>
      <MoneyField value={amount} onChangeText={setAmount} autoFocus />
      <SectionLabel>Note</SectionLabel>
      <NoteField value={note} onChangeText={setNote} />
      <View style={styles.splitToggleRow}>
        <CategoryChip
          label={split ? 'Split 70% PNC / 30% DCU' : 'Single account'}
          colorKey="other"
          selected={split}
          onPress={() => setSplit((s) => !s)}
        />
      </View>
      <View style={styles.formActions}>
        <HardButton
          label="Add income"
          variant="primary"
          disabled={parsed === null}
          onPress={() => parsed !== null && onSave(parsed, note || undefined, split)}
        />
      </View>
    </Sheet>
  );
}

// --- helpers ---------------------------------------------------------------
interface IncomeGroup {
  key: string;
  title: string;
  total: number;
  legs: Txn[];
}
function groupIncome(income: Txn[]): IncomeGroup[] {
  const byParent = new Map<string, Txn[]>();
  for (const t of income) {
    const key = t.splitParentId ?? t.id;
    const arr = byParent.get(key) ?? [];
    arr.push(t);
    byParent.set(key, arr);
  }
  return Array.from(byParent.entries()).map(([key, legs]) => ({
    key,
    title: legs[0].note ?? legs[0].categoryName,
    total: legs.reduce((s, t) => s + t.amount, 0),
    legs,
  }));
}
function accountName(id: string): string {
  if (id === 'acct_pnc') return 'PNC Spending';
  if (id === 'acct_dcu') return 'DCU Savings';
  return 'Account';
}

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
  kpi: {
    flex: 1,
  },
  kpiLabel: {
    color: colors.text.secondary,
    fontFamily: type.family.mono,
    fontSize: type.size.micro,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: space.xs,
  },
  empty: {
    color: colors.text.muted,
    fontFamily: type.family.text,
    fontSize: type.size.body,
    marginBottom: space.sm,
  },
  incomeBox: {
    marginBottom: space.sm,
  },
  incomeHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  incomeTitle: {
    color: colors.text.primary,
    fontFamily: type.family.text,
    fontSize: type.size.body,
    fontWeight: type.weight.medium,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: metrics.hairline,
    borderTopColor: colors.border.hairline,
  },
  splitLabel: {
    color: colors.text.secondary,
    fontFamily: type.family.text,
    fontSize: type.size.caption,
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: metrics.radius,
    marginRight: space.md,
  },
  txnMeta: {
    flex: 1,
  },
  txnCat: {
    color: colors.text.primary,
    fontFamily: type.family.text,
    fontSize: type.size.body,
    fontWeight: type.weight.medium,
  },
  txnNote: {
    color: colors.text.secondary,
    fontFamily: type.family.text,
    fontSize: type.size.caption,
    marginTop: 2,
  },
  fixedTag: {
    color: colors.status.overflow,
    fontFamily: type.family.mono,
    fontSize: type.size.micro,
    letterSpacing: 1,
    marginTop: 2,
  },
  input: {
    backgroundColor: colors.bg.sunken,
    borderWidth: metrics.hairline,
    borderColor: colors.border.strong,
    borderRadius: metrics.radius,
    color: colors.text.primary,
    fontFamily: type.family.mono,
    fontSize: type.size.label,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chipItem: {
    marginBottom: space.xs,
  },
  splitToggleRow: {
    marginTop: space.lg,
    flexDirection: 'row',
  },
  formActions: {
    marginTop: space.xl,
    flexDirection: 'row',
  },
});

export default DailyDetailScreen;
