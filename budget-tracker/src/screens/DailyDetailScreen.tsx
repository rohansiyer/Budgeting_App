import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import * as tokens from '../theme/tokens';
import { Cents, formatCents, sumCents, toDecimalString, ZERO } from '../lib/money';
import { PixelBox, HardButton, RuledList, CategoryChip, EmptyState } from '../components/kit';
import { DuckSprite } from '../ducks/DuckSprite';
import { Screen, SectionLabel, MoneyText, Row } from '../components/Primitives';
import { Sheet } from '../components/Sheet';
import { useStore } from '../providers/StoreProvider';
import { useAppShell } from '../providers/AppShell';
import { isDayEmpty } from './DailyDetailScreen.logic';
import { tryParseCents } from '../format/moneyInput';
import { longDate, weekStartOf } from '../format/dates';
import type {
  ISODate,
  TransactionRecord,
  CategoryConfig,
  IncomeSourceConfig,
  AccountConfig,
} from '../types/contracts';

const { color, space, pixel } = tokens;
const typo = tokens.type;

export function DailyDetailScreen({ date, onClose }: { date: ISODate; onClose: () => void }) {
  const store = useStore();
  const { showUndo } = useAppShell();

  const categories = store.listCategories();
  const accounts = store.listAccounts();
  const incomeSources = store.listIncomeSources();
  const catById = (id: string) => categories.find((c) => c.id === id);
  const acctById = (id: string) => accounts.find((a) => a.id === id);
  const spendingAccount = accounts.find((a) => a.kind === 'spending') ?? accounts[0];

  const dayTxns = store.getTransactions({ from: date, to: date });
  const spentToday = sumCents(
    dayTxns.filter((t) => t.kind === 'expense').map((t) => t.amount),
  );
  const accountAfter = spendingAccount
    ? store.getAccountBalance(spendingAccount.id, date)
    : ZERO;
  const envelopeLeft = store.getSafeToSpend(weekStartOf(date));

  const [menuTxn, setMenuTxn] = useState<TransactionRecord | null>(null);
  const [editTxn, setEditTxn] = useState<TransactionRecord | null>(null);
  const [addKind, setAddKind] = useState<'expense' | 'income' | null>(null);

  const handleDelete = async (t: TransactionRecord) => {
    const { undo } = await store.deleteTransaction(t.id);
    const catName = catById(t.categoryId)?.name ?? 'transaction';
    showUndo(`Deleted ${t.kind === 'income' ? (t.note ?? 'income') : catName}`, async () => {
      const ok = await undo();
      if (!ok) showUndo('Too late, the undo window closed.');
    });
  };

  return (
    <Screen
      title={longDate(date)}
      right={
        <HardButton
          label="Done"
          variant="ghost"
          onPress={onClose}
          accessibilityLabel="Close day detail"
        />
      }
    >
      {/* Day KPIs: spent / account after / envelope left (§4.3). */}
      <View style={styles.kpiRow}>
        <Kpi label="Spent" amount={spentToday} kind="spend" />
        <Kpi label={spendingAccount ? `${spendingAccount.name} after` : 'Account after'} amount={accountAfter} kind="plain" />
        <Kpi label="Envelope left" amount={envelopeLeft} kind="income" />
      </View>

      {/* Ruled transaction list: press/long-press → context menu. Zero state
          swaps in the kit EmptyState (§3.3) instead of an empty list. */}
      <SectionLabel>Transactions</SectionLabel>
      {isDayEmpty(dayTxns.length) ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            message="Nothing logged for this day yet. Add an expense to get started."
            actionLabel="Add expense"
            onAction={() => setAddKind('expense')}
            renderDuck={(props) => <DuckSprite {...props} />}
            accessibilityLabel="No transactions logged for this day"
          />
        </View>
      ) : (
        <RuledList<TransactionRecord>
          data={dayTxns}
          keyExtractor={(t) => t.id}
          renderRow={(t) => (
            <Pressable
              onPress={() => setMenuTxn(t)}
              onLongPress={() => setMenuTxn(t)}
              delayLongPress={350}
              accessibilityRole="button"
              accessibilityLabel={txnA11yLabel(t, catById, acctById)}
              accessibilityHint="Opens edit, recategorize and delete actions"
            >
              <TxnRow txn={t} cat={catById(t.categoryId)} acctById={acctById} />
            </Pressable>
          )}
        />
      )}

      <Row style={styles.addRow}>
        <HardButton
          label="+ Expense"
          onPress={() => setAddKind('expense')}
          accessibilityLabel="Add an expense to this day"
        />
        <HardButton
          label="+ Income"
          variant="ghost"
          onPress={() => setAddKind('income')}
          accessibilityLabel="Add income to this day"
        />
      </Row>

      {/* Long-press context menu: edit / recategorize / delete (no confirms — undo). */}
      <Sheet
        visible={menuTxn !== null}
        onClose={() => setMenuTxn(null)}
        title={menuTxn ? (catById(menuTxn.categoryId)?.name ?? 'Transaction') : ''}
      >
        <HardButton
          label="Edit"
          variant="ghost"
          onPress={() => {
            setEditTxn(menuTxn);
            setMenuTxn(null);
          }}
          accessibilityLabel="Edit this transaction"
        />
        <HardButton
          label="Delete"
          variant="danger"
          onPress={() => {
            const t = menuTxn;
            setMenuTxn(null);
            if (t) void handleDelete(t);
          }}
          accessibilityLabel="Delete this transaction, with undo"
        />
      </Sheet>

      {editTxn ? (
        <EditSheet
          key={editTxn.id}
          txn={editTxn}
          categories={categories}
          onClose={() => setEditTxn(null)}
          onSave={async (patch) => {
            await store.editTransaction(editTxn.id, patch);
            setEditTxn(null);
          }}
        />
      ) : null}

      {addKind === 'expense' ? (
        <AddExpenseSheet
          categories={categories}
          onClose={() => setAddKind(null)}
          onSave={async (amount, categoryId, note) => {
            if (!spendingAccount) return; // no accounts configured yet
            await store.addExpense({
              accountId: spendingAccount.id,
              categoryId,
              amount,
              date,
              note,
            });
            setAddKind(null);
          }}
        />
      ) : null}

      {addKind === 'income' ? (
        <AddIncomeSheet
          sources={incomeSources}
          onClose={() => setAddKind(null)}
          onSave={async (sourceId, amount) => {
            await store.addIncome({ sourceId, date, amount });
            setAddKind(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

// --- rows --------------------------------------------------------------------
function txnA11yLabel(
  t: TransactionRecord,
  catById: (id: string) => CategoryConfig | undefined,
  acctById: (id: string) => AccountConfig | undefined,
): string {
  if (t.kind === 'income') {
    const splits = (t.incomeSplit ?? [])
      .map((leg) => `${formatCents(leg.amount)} to ${acctById(leg.accountId)?.name ?? 'account'}`)
      .join(', ');
    return `Income, ${t.note ?? 'income'}, ${formatCents(t.amount)}${splits ? `, split ${splits}` : ''}`;
  }
  const cat = catById(t.categoryId);
  return `${t.kind === 'expense' ? 'Expense' : 'Transfer'}, ${cat?.name ?? ''}, ${formatCents(t.amount)}${t.note ? `, ${t.note}` : ''}`;
}

function TxnRow({
  txn,
  cat,
  acctById,
}: {
  txn: TransactionRecord;
  cat: CategoryConfig | undefined;
  acctById: (id: string) => AccountConfig | undefined;
}) {
  const isIncome = txn.kind === 'income';
  const isTransfer = txn.kind === 'transfer_in' || txn.kind === 'transfer_out';
  const title = isIncome ? (txn.note ?? 'Income') : (cat?.name ?? 'Uncategorized');
  return (
    <View>
      <Row style={styles.txnRow}>
        {cat && !isIncome ? <CategoryChip colorKey={cat.colorKey} /> : null}
        <View style={styles.txnMeta}>
          <Text style={styles.txnTitle}>{title}</Text>
          {!isIncome && txn.note ? <Text style={styles.txnNote}>{txn.note}</Text> : null}
          {isTransfer ? (
            <Text style={styles.txnNote}>
              {txn.kind === 'transfer_in' ? 'Transfer in' : 'Transfer out'}
            </Text>
          ) : null}
        </View>
        <MoneyText
          amount={txn.amount}
          kind={isIncome || txn.kind === 'transfer_in' ? 'income' : 'spend'}
          signed={isIncome}
        />
      </Row>
      {/* Inline split display on income rows (§4.3). */}
      {isIncome && (txn.incomeSplit ?? []).length > 1 ? (
        <View style={styles.splitBlock}>
          {(txn.incomeSplit ?? []).map((leg) => (
            <Row key={leg.accountId} style={styles.splitRow}>
              <Text style={styles.splitLabel}>{acctById(leg.accountId)?.name ?? 'Account'}</Text>
              <MoneyText amount={leg.amount} size={typo.caption.fontSize} />
            </Row>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Kpi({ label, amount, kind }: { label: string; amount: Cents; kind: 'plain' | 'income' | 'spend' }) {
  return (
    <View
      style={styles.kpi}
      accessible
      accessibilityLabel={`${label}: ${formatCents(amount)}`}
    >
      <Text style={styles.kpiLabel} numberOfLines={1}>
        {label}
      </Text>
      <MoneyText amount={amount} kind={kind} size={typo.body.fontSize + 2} />
    </View>
  );
}

// --- forms ---------------------------------------------------------------------
function MoneyField({
  value,
  onChangeText,
  autoFocus,
  label = 'Amount',
}: {
  value: string;
  onChangeText: (t: string) => void;
  autoFocus?: boolean;
  label?: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType="decimal-pad"
      placeholder="0.00"
      placeholderTextColor={color.textMuted}
      autoFocus={autoFocus}
      accessibilityLabel={label}
      style={styles.input}
    />
  );
}

function CategoryPicker({
  categories,
  selected,
  onSelect,
}: {
  categories: CategoryConfig[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.pickerWrap}>
      {categories.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => onSelect(c.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: c.id === selected }}
          accessibilityLabel={`Category ${c.name}${c.id === selected ? ', selected' : ''}`}
          style={[styles.pickerItem, c.id === selected && styles.pickerItemSelected]}
        >
          <CategoryChip colorKey={c.colorKey} />
          <Text style={styles.pickerLabel}>{c.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function EditSheet({
  txn,
  categories,
  onClose,
  onSave,
}: {
  txn: TransactionRecord;
  categories: CategoryConfig[];
  onClose: () => void;
  onSave: (patch: { amount: Cents; categoryId: string; note: string }) => void;
}) {
  const [amountText, setAmountText] = useState(toDecimalString(txn.amount));
  const [note, setNote] = useState(txn.note ?? '');
  const [catId, setCatId] = useState(txn.categoryId);
  const parsed = tryParseCents(amountText);
  const isExpense = txn.kind === 'expense';
  return (
    <Sheet visible onClose={onClose} title="Edit transaction">
      <SectionLabel>Amount</SectionLabel>
      <MoneyField value={amountText} onChangeText={setAmountText} autoFocus />
      {isExpense ? (
        <>
          <SectionLabel>Category</SectionLabel>
          <CategoryPicker categories={categories} selected={catId} onSelect={setCatId} />
        </>
      ) : null}
      <SectionLabel>Note</SectionLabel>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional)"
        placeholderTextColor={color.textMuted}
        accessibilityLabel="Note"
        style={styles.input}
      />
      <Row style={styles.formActions}>
        <HardButton
          label="Save"
          disabled={parsed === null || parsed <= 0}
          onPress={() => {
            if (parsed !== null && parsed > 0) onSave({ amount: parsed, categoryId: catId, note });
          }}
          accessibilityLabel="Save changes"
        />
      </Row>
    </Sheet>
  );
}

function AddExpenseSheet({
  categories,
  onClose,
  onSave,
}: {
  categories: CategoryConfig[];
  onClose: () => void;
  onSave: (amount: Cents, categoryId: string, note?: string) => void;
}) {
  const spendable = categories.filter((c) => c.envelope !== null || c.fixed);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [catId, setCatId] = useState(spendable[0]?.id ?? '');
  const parsed = tryParseCents(amountText);
  const valid = parsed !== null && parsed > 0 && catId !== '';
  return (
    <Sheet visible onClose={onClose} title="Add expense">
      <SectionLabel>Amount</SectionLabel>
      <MoneyField value={amountText} onChangeText={setAmountText} autoFocus />
      <SectionLabel>Category</SectionLabel>
      <CategoryPicker categories={spendable} selected={catId} onSelect={setCatId} />
      <SectionLabel>Note</SectionLabel>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional)"
        placeholderTextColor={color.textMuted}
        accessibilityLabel="Note"
        style={styles.input}
      />
      <Row style={styles.formActions}>
        <HardButton
          label="Add expense"
          disabled={!valid}
          onPress={() => {
            if (valid && parsed !== null) onSave(parsed, catId, note || undefined);
          }}
          accessibilityLabel="Save the new expense"
        />
      </Row>
    </Sheet>
  );
}

function AddIncomeSheet({
  sources,
  onClose,
  onSave,
}: {
  sources: IncomeSourceConfig[];
  onClose: () => void;
  onSave: (sourceId: string, amount?: Cents) => void;
}) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '');
  const source = sources.find((s) => s.id === sourceId);
  const [amountText, setAmountText] = useState('');
  const parsed = tryParseCents(amountText);
  const override = amountText.trim() !== '';
  const valid = sourceId !== '' && (!override || (parsed !== null && parsed > 0));
  return (
    <Sheet visible onClose={onClose} title="Add income">
      <SectionLabel>Source</SectionLabel>
      <View style={styles.pickerWrap}>
        {sources.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => setSourceId(s.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: s.id === sourceId }}
            accessibilityLabel={`Income source ${s.name}, usually ${formatCents(s.amount)}${s.id === sourceId ? ', selected' : ''}`}
            style={[styles.pickerItem, s.id === sourceId && styles.pickerItemSelected]}
          >
            <Text style={styles.pickerLabel}>{s.name}</Text>
            <Text style={styles.pickerAmount}>{formatCents(s.amount)}</Text>
          </Pressable>
        ))}
      </View>
      <SectionLabel>Amount (leave blank for the usual)</SectionLabel>
      <MoneyField
        value={amountText}
        onChangeText={setAmountText}
        label={source ? `Amount, defaults to ${formatCents(source.amount)}` : 'Amount'}
      />
      <Row style={styles.formActions}>
        <HardButton
          label="Add income"
          disabled={!valid}
          onPress={() => {
            if (valid) onSave(sourceId, override && parsed !== null ? parsed : undefined);
          }}
          accessibilityLabel="Save the income"
        />
      </Row>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  emptyWrap: {
    marginTop: space.sm,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
  kpi: {
    flex: 1,
    borderTopWidth: pixel.hairlineWidth * 2,
    borderTopColor: color.border,
    paddingTop: space.sm,
  },
  kpiLabel: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
    marginBottom: space.xs,
  },
  txnRow: {
    justifyContent: 'space-between',
  },
  txnMeta: {
    flex: 1,
    marginLeft: space.sm,
  },
  txnTitle: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
  },
  txnNote: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: 2,
  },
  splitBlock: {
    marginTop: space.xs,
    marginLeft: space.md,
    borderLeftWidth: pixel.hairlineWidth,
    borderLeftColor: color.hairline,
    paddingLeft: space.sm,
  },
  splitRow: {
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  splitLabel: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
  },
  addRow: {
    marginTop: space.md,
  },
  input: {
    backgroundColor: color.surfaceDeep,
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    color: color.text,
    fontSize: typo.body.fontSize + 4,
    fontVariant: [...typo.tabularNums.fontVariant],
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
  },
  pickerWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderWidth: pixel.hairlineWidth,
    borderColor: color.hairline,
    backgroundColor: color.surfaceDeep,
  },
  pickerItemSelected: {
    borderColor: color.accent,
    backgroundColor: color.surface,
  },
  pickerLabel: {
    color: color.text,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.body.fontWeight,
  },
  pickerAmount: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
  formActions: {
    marginTop: space.lg,
  },
});

export default DailyDetailScreen;
