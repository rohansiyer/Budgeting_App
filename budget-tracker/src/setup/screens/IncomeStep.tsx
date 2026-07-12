/**
 * Setup wizard — Income step (DucksInARow_DesignDoc_v2.md §4 Setup:
 * "income sources (amount, schedule: weekly/biweekly/semi-monthly/
 * monthly; split bar between accounts)"). The split editor takes a ratio
 * per account and previews the actual cent split via `money.allocate`
 * (cent-conserving) rather than doing its own float division.
 */
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { Dispatch } from 'react';
import { ChoiceRow, Field, HardButton, PixelBox, RuledList } from '../../components/kit';
import { allocate, formatCents, MoneyError, parseDecimal } from '../../lib/money';
import { color, space, type } from '../../theme/tokens';
import { paydaysBetween } from '../../lib/schedule';
import { nextDraftKey, type AccountDraft, type IncomeSourceDraft, type WizardAction } from '../wizardState';
import type { IncomeScheduleKind, IncomeSplitConfig } from '../../types/contracts';
import { stepSubtextStyle, stepTitleStyle } from './stepTypography';

interface IncomeStepProps {
  accounts: AccountDraft[];
  incomeSources: IncomeSourceDraft[];
  dispatch: Dispatch<WizardAction>;
}

const KIND_OPTIONS: Array<{ key: IncomeScheduleKind; label: string }> = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'biweekly', label: 'Every 2 weeks' },
  { key: 'semimonthly', label: 'Semimonthly' },
  { key: 'monthly', label: 'Monthly' },
];

export function IncomeStep({ accounts, incomeSources, dispatch }: IncomeStepProps) {
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
      const from = anchorDate;
      // A one-year lookahead window is enough to preview a few upcoming paydays.
      const to = `${Number(anchorDate.slice(0, 4)) + 1}-12-31`;
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

  const handleAdd = () => {
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
      setAmountError(e instanceof MoneyError ? e.message : 'Enter a valid amount.');
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

    const draft: IncomeSourceDraft = {
      key: nextDraftKey('income'),
      name: name.trim(),
      amount,
      schedule:
        kind === 'semimonthly'
          ? { kind, anchorDate, semimonthlyDays: [Number(semiDay1), Number(semiDay2)] }
          : { kind, anchorDate },
      splits,
    };
    dispatch({ type: 'ADD_INCOME_SOURCE', draft });
    setName('');
    setAmountInput('');
    setRatios({});
  };

  return (
    <View style={{ gap: space.md }}>
      <Text style={stepTitleStyle}>Where does your money come from?</Text>
      <Text style={stepSubtextStyle}>
        Add each paycheck or recurring deposit and how it splits across your accounts.
      </Text>

      <RuledList
        sectionLabel="Income sources"
        data={incomeSources}
        keyExtractor={(s) => s.key}
        renderRow={(s) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
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
              onPress={() => dispatch({ type: 'REMOVE_INCOME_SOURCE', key: s.key })}
            />
          </View>
        )}
      />

      {accounts.length === 0 ? (
        <Text style={[type.caption, { color: color.warn }]}>
          Add an account first, income needs somewhere to land.
        </Text>
      ) : (
        <PixelBox>
          <View style={{ gap: space.sm }}>
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

            <HardButton
              label="Add income source"
              accessibilityLabel="Add income source"
              onPress={handleAdd}
            />
          </View>
        </PixelBox>
      )}
    </View>
  );
}
