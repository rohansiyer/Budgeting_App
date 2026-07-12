/**
 * Setup wizard — Accounts step (DucksInARow_DesignDoc_v2.md §4 Setup:
 * "accounts (add/rename/balance)"). Add / rename / pick a kind / set a
 * starting balance, all through `parseDecimal` (money.ts) — no float
 * ever touches a balance here.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { ChoiceRow, Field, HardButton, PixelBox, RuledList } from '../../components/kit';
import { formatCents, MoneyError, parseDecimal, type Cents } from '../../lib/money';
import { color, space, type } from '../../theme/tokens';
import type { Dispatch } from 'react';
import { nextDraftKey, type AccountDraft, type WizardAction } from '../wizardState';
import type { AccountConfig } from '../../types/contracts';
import { stepSubtextStyle, stepTitleStyle } from './stepTypography';

interface AccountsStepProps {
  accounts: AccountDraft[];
  dispatch: Dispatch<WizardAction>;
}

const KIND_OPTIONS: Array<{ key: AccountConfig['kind']; label: string }> = [
  { key: 'spending', label: 'Spending' },
  { key: 'savings', label: 'Savings' },
];

export function AccountsStep({ accounts, dispatch }: AccountsStepProps) {
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [kind, setKind] = useState<AccountConfig['kind']>('spending');
  const [balanceInput, setBalanceInput] = useState('0');
  const [nameError, setNameError] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const handleAdd = () => {
    setNameError(null);
    setBalanceError(null);
    if (name.trim().length === 0) {
      setNameError('Give the account a name.');
      return;
    }
    let startingBalance: Cents;
    try {
      startingBalance = parseDecimal(balanceInput || '0');
    } catch (e) {
      setBalanceError(e instanceof MoneyError ? e.message : 'Enter a valid starting balance.');
      return;
    }
    const draft: AccountDraft = {
      key: nextDraftKey('account'),
      name: name.trim(),
      institution: institution.trim().length > 0 ? institution.trim() : null,
      kind,
      startingBalance,
    };
    dispatch({ type: 'ADD_ACCOUNT', draft });
    setName('');
    setInstitution('');
    setBalanceInput('0');
  };

  return (
    <View style={{ gap: space.md }}>
      <Text style={stepTitleStyle}>Where does your money live?</Text>
      <Text style={stepSubtextStyle}>
        Add every account you move money through. You can rename these later.
      </Text>

      <RuledList
        sectionLabel="Accounts"
        data={accounts}
        keyExtractor={(a) => a.key}
        renderRow={(a) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text style={[type.body, { color: color.text }]}>{a.name}</Text>
              <Text style={[type.caption, { color: color.textMuted }]}>
                {a.kind}
                {a.institution ? ` · ${a.institution}` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Text
                style={[
                  type.body,
                  // `type.tabularNums.fontVariant` is a readonly tuple (contract file,
                  // not ours to change); RN's TextStyle wants a mutable array.
                  { fontVariant: [...type.tabularNums.fontVariant] },
                  { color: color.text },
                ]}
              >
                {formatCents(a.startingBalance)}
              </Text>
              <HardButton
                label="Remove"
                variant="ghost"
                accessibilityLabel={`Remove account ${a.name}`}
                onPress={() => dispatch({ type: 'REMOVE_ACCOUNT', key: a.key })}
              />
            </View>
          </View>
        )}
      />

      <PixelBox>
        <View style={{ gap: space.sm }}>
          <Field
            label="Account name"
            placeholder="e.g. Everyday Checking"
            value={name}
            onChangeText={setName}
            error={nameError ?? undefined}
            accessibilityLabel="New account name"
          />
          <Field
            label="Institution (optional)"
            placeholder="e.g. Local Bank"
            value={institution}
            onChangeText={setInstitution}
            accessibilityLabel="Institution (optional)"
          />
          <ChoiceRow
            options={KIND_OPTIONS}
            selectedKey={kind}
            onSelect={(key) => setKind(key as AccountConfig['kind'])}
            accessibilityLabel="Account kind"
          />
          <Field
            label="Starting balance"
            placeholder="e.g. 250.00"
            keyboardType="decimal-pad"
            value={balanceInput}
            onChangeText={setBalanceInput}
            error={balanceError ?? undefined}
            accessibilityLabel="Starting balance in dollars"
          />
          <HardButton label="Add account" accessibilityLabel="Add account" onPress={handleAdd} />
        </View>
      </PixelBox>
    </View>
  );
}
