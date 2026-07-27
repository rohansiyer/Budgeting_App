/**
 * Setup wizard — Accounts step (DucksInARow_DesignDoc_v2.md §4 Setup:
 * "accounts (add/rename/balance)"). Add / edit-in-place / pick a kind / set a
 * starting balance, all through `parseDecimal` (money.ts) — no float ever
 * touches a balance here.
 *
 * Tapping a row loads it into the form for in-place editing (F1-1/F1-3): the
 * primary button becomes "Save changes" and dispatches UPDATE_ACCOUNT instead
 * of ADD_ACCOUNT, so an edit never spawns a duplicate row.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChoiceRow, Field, HardButton, PixelBox, RuledList } from '../../components/kit';
import { formatCents, MoneyError, parseDecimal, toDecimalString, type Cents } from '../../lib/money';
import { color, space, type } from '../../theme/tokens';
import type { Dispatch } from 'react';
import {
  duplicateNameError,
  nextDraftKey,
  type AccountDraft,
  type WizardAction,
} from '../wizardState';
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

const AMOUNT_HINT = 'Enter an amount with up to 2 decimals (e.g. 12.34)';

export function AccountsStep({ accounts, dispatch }: AccountsStepProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [kind, setKind] = useState<AccountConfig['kind']>('spending');
  const [balanceInput, setBalanceInput] = useState('0');
  const [nameError, setNameError] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const resetForm = () => {
    setEditingKey(null);
    setName('');
    setInstitution('');
    setKind('spending');
    setBalanceInput('0');
    setNameError(null);
    setBalanceError(null);
  };

  const beginEdit = (a: AccountDraft) => {
    setEditingKey(a.key);
    setName(a.name);
    setInstitution(a.institution ?? '');
    setKind(a.kind);
    setBalanceInput(toDecimalString(a.startingBalance));
    setNameError(null);
    setBalanceError(null);
  };

  const handleSubmit = () => {
    setNameError(null);
    setBalanceError(null);
    if (name.trim().length === 0) {
      setNameError('Give the account a name.');
      return;
    }
    // F1-6: reject a duplicate name at Add/Save time, not only at Continue.
    const others = accounts.filter((a) => a.key !== editingKey).map((a) => a.name);
    const dupError = duplicateNameError(name, others, 'account');
    if (dupError) {
      setNameError(dupError);
      return;
    }
    let startingBalance: Cents;
    try {
      startingBalance = parseDecimal(balanceInput || '0');
    } catch (e) {
      // F1-8: never surface the raw MoneyError text.
      setBalanceError(e instanceof MoneyError ? AMOUNT_HINT : 'Enter a valid starting balance.');
      return;
    }
    const institutionValue = institution.trim().length > 0 ? institution.trim() : null;
    if (editingKey) {
      dispatch({
        type: 'UPDATE_ACCOUNT',
        key: editingKey,
        patch: { name: name.trim(), institution: institutionValue, kind, startingBalance },
      });
    } else {
      dispatch({
        type: 'ADD_ACCOUNT',
        draft: {
          key: nextDraftKey('account'),
          name: name.trim(),
          institution: institutionValue,
          kind,
          startingBalance,
        },
      });
    }
    resetForm();
  };

  const isEditing = editingKey !== null;

  return (
    <View style={{ gap: space.md }}>
      <Text style={stepTitleStyle}>Where does your money live?</Text>
      <Text style={stepSubtextStyle}>
        Add every account you move money through. Tap one to edit it.
      </Text>

      <RuledList
        sectionLabel="Accounts"
        data={accounts}
        keyExtractor={(a) => a.key}
        renderRow={(a) => (
          <Pressable
            onPress={() => beginEdit(a)}
            accessibilityRole="button"
            accessibilityLabel={`Edit account ${a.name}`}
            accessibilityState={{ selected: a.key === editingKey }}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
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
                onPress={() => {
                  if (a.key === editingKey) resetForm();
                  dispatch({ type: 'REMOVE_ACCOUNT', key: a.key });
                }}
              />
            </View>
          </Pressable>
        )}
      />

      <PixelBox>
        <View style={{ gap: space.sm }}>
          {isEditing ? (
            <Text style={[type.sectionLabel, { color: color.accent }]}>Editing account</Text>
          ) : null}
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
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <HardButton
              label={isEditing ? 'Save changes' : 'Add account'}
              accessibilityLabel={isEditing ? 'Save account changes' : 'Add account'}
              onPress={handleSubmit}
            />
            {isEditing ? (
              <HardButton
                label="Cancel"
                variant="ghost"
                accessibilityLabel="Cancel editing account"
                onPress={resetForm}
              />
            ) : null}
          </View>
        </View>
      </PixelBox>
    </View>
  );
}
