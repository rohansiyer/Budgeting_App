/**
 * Setup wizard — Income step (DucksInARow_DesignDoc_v2.md §4 Setup:
 * "income sources (amount, schedule: weekly/biweekly/semi-monthly/
 * monthly; split bar between accounts)"). The split editor takes a ratio
 * per account and previews the actual cent split via `money.allocate`
 * (cent-conserving) rather than doing its own float division.
 *
 * Tapping a row loads it into the form for in-place editing (F1-1/F1-3): the
 * primary button becomes "Save changes" and dispatches UPDATE_INCOME_SOURCE.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Dispatch } from 'react';
import { ChoiceRow, Field, HardButton, PixelBox, RuledList } from '../../components/kit';
import { allocate, formatCents, MoneyError, parseDecimal, toDecimalString } from '../../lib/money';
import { color, space, type } from '../../theme/tokens';
import { paydaysBetween } from '../../lib/schedule';
import { todayISO } from '../../format/dates';
import {
  nextDraftKey,
  splitDropWarningText,
  type AccountDraft,
  type IncomeSourceDraft,
  type WizardAction,
} from '../wizardState';
import type { IncomeScheduleKind, IncomeSplitConfig } from '../../types/contracts';
import { stepSubtextStyle, stepTitleStyle } from './stepTypography';

interface IncomeStepProps {
  accounts: AccountDraft[];
  incomeSources: IncomeSourceDraft[];
  dispatch: Dispatch<WizardAction>;
  /** F1-5: per-source names of accounts whose removal dropped a split. */
  splitDropNotices?: Record<string, string[]>;
}

const KIND_OPTIONS: Array<{ key: IncomeScheduleKind; label: string }> = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'biweekly', label: 'Every 2 weeks' },
  { key: 'semimonthly', label: 'Semimonthly' },
  { key: 'monthly', label: 'Monthly' },
];

const AMOUNT_HINT = 'Enter an amount with up to 2 decimals (e.g. 12.34)';

export function IncomeStep({ accounts, incomeSources, dispatch, splitDropNotices }: IncomeStepProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [kind, setKind] = useState<IncomeScheduleKind>('biweekly');
  const [anchorDate, setAnchorDate] = useState('');
  const [semiDay1, setSemiDay1] = useState('1');
  const [semiDay2, setSemiDay2] = useState('15');
  const [ratios, setRatios] = useState<Record<string, string>>({});
  const [nameError, setNameError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [anchorError, setAnchorError] = useState<string | null>(null);
  const [splitsError, setSplitsError] = useState<string | null>(null);

  const resetForm = () => {
    setEditingKey(null);
    setName('');
    setAmountInput('');
    setKind('biweekly');
    setAnchorDate('');
    setSemiDay1('1');
    setSemiDay2('15');
    setRatios({});
    setNameError(null);
    setAmountError(null);
    setAnchorError(null);
    setSplitsError(null);
  };

  const beginEdit = (s: IncomeSourceDraft) => {
    setEditingKey(s.key);
    setName(s.name);
    setAmountInput(toDecimalString(s.amount));
    setKind(s.schedule.kind);
    setAnchorDate(s.schedule.anchorDate);
    if (s.schedule.semimonthlyDays) {
      setSemiDay1(String(s.schedule.semimonthlyDays[0]));
      setSemiDay2(String(s.schedule.semimonthlyDays[1]));
    } else {
      setSemiDay1('1');
      setSemiDay2('15');
    }
    // Splits reference account draft keys; rebuild the ratio inputs from them.
    const nextRatios: Record<string, string> = {};
    for (const sp of s.splits) nextRatios[sp.accountId] = String(sp.ratio);
    setRatios(nextRatios);
    setNameError(null);
    setAmountError(null);
    setAnchorError(null);
    setSplitsError(null);
  };

  const preview = useMemo(() => {
    let amount;
    try {
      amount = parseDecimal(amountInput || '0');
    } catch {
      return null;
    }
    const entries = accounts
      .map((a) => ({ account: a, ratio: Number(ratios[a.key] ?? '0') }))
      .filter((e) => Number.isFinite(e.ratio) && e.ratio > 0);
    if (entries.length === 0 || amount <= 0) return null;
    try {
      const splitAmounts = allocate(
        amount,
        entries.map((e) => e.ratio),
      );
      return entries.map((e, i) => ({ account: e.account, amount: splitAmounts[i] }));
    } catch {
      return null;
    }
  }, [amountInput, accounts, ratios]);

  const nextPaydayPreview = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) return null;
    try {
      // F1-7: preview the paydays that are still upcoming — never the anchor
      // itself when it is already in the past.
      const today = todayISO();
      const from = anchorDate > today ? anchorDate : today;
      // A one-year lookahead window is enough to preview a few upcoming paydays.
      const to = `${Number(from.slice(0, 4)) + 1}-12-31`;
      const schedule =
        kind === 'semimonthly'
          ? {
              kind,
              anchorDate,
              semimonthlyDays: [Number(semiDay1), Number(semiDay2)] as [number, number],
            }
          : { kind, anchorDate };
      return paydaysBetween(schedule, { from, to }).slice(0, 3);
    } catch {
      return null;
    }
  }, [anchorDate, kind, semiDay1, semiDay2]);

  const handleSubmit = () => {
    setNameError(null);
    setAmountError(null);
    setAnchorError(null);
    setSplitsError(null);

    if (name.trim().length === 0) {
      setNameError('Give the income source a name.');
      return;
    }
    let amount;
    try {
      amount = parseDecimal(amountInput || '0');
    } catch (e) {
      // F1-8: never surface the raw MoneyError text.
      setAmountError(e instanceof MoneyError ? AMOUNT_HINT : 'Enter a valid amount.');
      return;
    }
    if (amount <= 0) {
      setAmountError('Amount must be positive.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
      setAnchorError('Enter an anchor date as YYYY-MM-DD.');
      return;
    }
    const splits: IncomeSplitConfig[] = accounts
      .map((a) => ({ accountId: a.key, ratio: Number(ratios[a.key] ?? '0') }))
      .filter((s) => Number.isFinite(s.ratio) && s.ratio > 0);
    if (splits.length === 0) {
      setSplitsError('Split this income across at least one account.');
      return;
    }

    const schedule =
      kind === 'semimonthly'
        ? { kind, anchorDate, semimonthlyDays: [Number(semiDay1), Number(semiDay2)] as [number, number] }
        : { kind, anchorDate };

    if (editingKey) {
      dispatch({
        type: 'UPDATE_INCOME_SOURCE',
        key: editingKey,
        patch: { name: name.trim(), amount, schedule, splits },
      });
    } else {
      dispatch({
        type: 'ADD_INCOME_SOURCE',
        draft: { key: nextDraftKey('income'), name: name.trim(), amount, schedule, splits },
      });
    }
    resetForm();
  };

  const isEditing = editingKey !== null;

  return (
    <View style={{ gap: space.md }}>
      <Text style={stepTitleStyle}>Where does your money come from?</Text>
      <Text style={stepSubtextStyle}>
        Add each paycheck or recurring deposit and how it splits across your accounts. Tap a row to
        edit it.
      </Text>

      <RuledList
        sectionLabel="Income sources"
        data={incomeSources}
        keyExtractor={(s) => s.key}
        renderRow={(s) => {
          const warning = splitDropWarningText(splitDropNotices?.[s.key]);
          return (
            <View style={{ gap: space.xs }}>
              <Pressable
                onPress={() => beginEdit(s)}
                accessibilityRole="button"
                accessibilityLabel={`Edit income source ${s.name}`}
                accessibilityState={{ selected: s.key === editingKey }}
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <View>
                  <Text style={[type.body, { color: color.text }]}>{s.name}</Text>
                  <Text style={[type.caption, { color: color.textMuted }]}>
                    {s.schedule.kind} · {formatCents(s.amount)}
                  </Text>
                </View>
                <HardButton
                  label="Remove"
                  variant="ghost"
                  accessibilityLabel={`Remove income source ${s.name}`}
                  onPress={() => {
                    if (s.key === editingKey) resetForm();
                    dispatch({ type: 'REMOVE_INCOME_SOURCE', key: s.key });
                  }}
                />
              </Pressable>
              {warning ? (
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}
                >
                  <Text style={[type.caption, { color: color.warn, flexShrink: 1 }]}>{warning}</Text>
                  <HardButton
                    label="Got it"
                    variant="ghost"
                    accessibilityLabel={`Dismiss split warning for ${s.name}`}
                    onPress={() => dispatch({ type: 'ACK_SPLIT_DROP', key: s.key })}
                  />
                </View>
              ) : null}
            </View>
          );
        }}
      />

      {accounts.length === 0 ? (
        <Text style={[type.caption, { color: color.warn }]}>
          Add an account first, income needs somewhere to land.
        </Text>
      ) : (
        <PixelBox>
          <View style={{ gap: space.sm }}>
            {isEditing ? (
              <Text style={[type.sectionLabel, { color: color.accent }]}>Editing income source</Text>
            ) : null}
            <Field
              label="Source name"
              placeholder="e.g. Day job"
              value={name}
              onChangeText={setName}
              error={nameError ?? undefined}
              accessibilityLabel="Income source name"
            />
            <Field
              label="Amount per payday"
              placeholder="e.g. 1500.00"
              keyboardType="decimal-pad"
              value={amountInput}
              onChangeText={setAmountInput}
              error={amountError ?? undefined}
              accessibilityLabel="Income amount in dollars"
            />

            <ChoiceRow
              options={KIND_OPTIONS}
              selectedKey={kind}
              onSelect={(key) => setKind(key as IncomeScheduleKind)}
              accessibilityLabel="Income schedule kind"
            />

            <Field
              label="Anchor payday"
              placeholder="YYYY-MM-DD"
              value={anchorDate}
              onChangeText={setAnchorDate}
              error={anchorError ?? undefined}
              accessibilityLabel="Anchor date, a known payday, in YYYY-MM-DD format"
            />

            {kind === 'semimonthly' ? (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Day 1"
                    placeholder="e.g. 1"
                    keyboardType="number-pad"
                    value={semiDay1}
                    onChangeText={setSemiDay1}
                    accessibilityLabel="First semimonthly day of month"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Day 2"
                    placeholder="e.g. 15"
                    keyboardType="number-pad"
                    value={semiDay2}
                    onChangeText={setSemiDay2}
                    accessibilityLabel="Second semimonthly day of month"
                  />
                </View>
              </View>
            ) : null}

            {nextPaydayPreview && nextPaydayPreview.length > 0 ? (
              <Text style={[type.caption, { color: color.textMuted }]}>
                Next paydays: {nextPaydayPreview.join(', ')}
              </Text>
            ) : null}

            <Text style={[type.sectionLabel, { color: color.textMuted, marginTop: space.sm }]}>
              Split (ratios, e.g. 70 / 30)
            </Text>
            {accounts.map((a) => (
              <Field
                key={a.key}
                label={a.name}
                placeholder="0"
                keyboardType="decimal-pad"
                value={ratios[a.key] ?? ''}
                onChangeText={(v) => setRatios((prev) => ({ ...prev, [a.key]: v }))}
                accessibilityLabel={`Split ratio for ${a.name}`}
              />
            ))}
            {splitsError ? (
              <Text style={[type.caption, { color: color.danger }]}>{splitsError}</Text>
            ) : null}

            {preview ? (
              <View style={{ gap: 2 }}>
                {preview.map(({ account, amount }) => (
                  <Text key={account.key} style={[type.caption, { color: color.accent }]}>
                    {account.name}: {formatCents(amount)}
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <HardButton
                label={isEditing ? 'Save changes' : 'Add income source'}
                accessibilityLabel={isEditing ? 'Save income source changes' : 'Add income source'}
                onPress={handleSubmit}
              />
              {isEditing ? (
                <HardButton
                  label="Cancel"
                  variant="ghost"
                  accessibilityLabel="Cancel editing income source"
                  onPress={resetForm}
                />
              ) : null}
            </View>
          </View>
        </PixelBox>
      )}
    </View>
  );
}
