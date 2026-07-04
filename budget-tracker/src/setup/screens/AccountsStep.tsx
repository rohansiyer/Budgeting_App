/**
 * Setup wizard — Accounts step (DucksInARow_DesignDoc_v2.md §4 Setup:
 * "accounts (add/rename/balance)"). Add / rename / pick a kind / set a
 * starting balance, all through `parseDecimal` (money.ts) — no float
 * ever touches a balance here.
 */
import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { HardButton, PixelBox, RuledList } from '../kit-stubs';
import { formatCents, MoneyError, parseDecimal } from '../../lib/money';
import { color, space, type } from '../../theme/tokens';
import type { Dispatch } from 'react';
import { nextDraftKey, type AccountDraft, type WizardAction } from '../wizardState';
import type { AccountConfig } from '../../types/contracts';

interface AccountsStepProps {
  accounts: AccountDraft[];
  dispatch: Dispatch<WizardAction>;
}

const KINDS: Array<AccountConfig['kind']> = ['spending', 'savings'];

export function AccountsStep({ accounts, dispatch }: AccountsStepProps) {
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [kind, setKind] = useState<AccountConfig['kind']>('spending');
  const [balanceInput, setBalanceInput] = useState('0');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    if (name.trim().length === 0) {
      setError('Give the account a name.');
      return;
    }
    let startingBalance;
    try {
      startingBalance = parseDecimal(balanceInput || '0');
    } catch (e) {
      setError(e instanceof MoneyError ? e.message : 'Enter a valid starting balance.');
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
    setError(null);
  };

  return (
    <View style={{ gap: space.md }}>
      <Text style={[type.title, { color: color.text }]}>Your accounts</Text>
      <Text style={[type.body, { color: color.textSecondary }]}>
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
          <TextInput
            accessibilityLabel="New account name"
            placeholder="Account name (e.g. Everyday Checking)"
            placeholderTextColor={color.textMuted}
            value={name}
            onChangeText={setName}
            style={{ color: color.text, borderBottomWidth: 1, borderBottomColor: color.hairline }}
          />
          <TextInput
            accessibilityLabel="Institution (optional)"
            placeholder="Institution (optional)"
            placeholderTextColor={color.textMuted}
            value={institution}
            onChangeText={setInstitution}
            style={{ color: color.text, borderBottomWidth: 1, borderBottomColor: color.hairline }}
          />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {KINDS.map((k) => (
              <HardButton
                key={k}
                label={k}
                variant={kind === k ? 'primary' : 'ghost'}
                accessibilityLabel={`Account kind ${k}`}
                onPress={() => setKind(k)}
              />
            ))}
          </View>
          <TextInput
            accessibilityLabel="Starting balance in dollars"
            placeholder="Starting balance (e.g. 250.00)"
            placeholderTextColor={color.textMuted}
            keyboardType="decimal-pad"
            value={balanceInput}
            onChangeText={setBalanceInput}
            style={{ color: color.text, borderBottomWidth: 1, borderBottomColor: color.hairline }}
          />
          {error ? <Text style={[type.caption, { color: color.danger }]}>{error}</Text> : null}
          <HardButton label="Add account" accessibilityLabel="Add account" onPress={handleAdd} />
        </View>
      </PixelBox>
    </View>
  );
}
