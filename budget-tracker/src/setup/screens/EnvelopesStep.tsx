/**
 * Setup wizard — Envelopes step (DucksInARow_DesignDoc_v2.md §4 Setup:
 * "envelopes (create/rename/re-budget, weekly or monthly)"). Every spend
 * category is created here, fixed (rent, utilities — no envelope, judged
 * by Duck Goal 1) or enveloped (variable-spend, weekly/monthly budget +
 * a Monday-prompt carryover default).
 *
 * The weekly/monthly choice doubles as the envelope's budget `period`
 * (EnvelopeConfig) and the category's own `cadence` (CategoryDraft,
 * threaded through for the duck engine's cadence-aware attribution) —
 * one ChoiceRow, not two, since a category never wants those to disagree.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { Dispatch } from 'react';
import { ChoiceRow, CategoryChip, Field, HardButton, PixelBox, RuledList } from '../../components/kit';
import { formatCents, MoneyError, parseDecimal } from '../../lib/money';
import { color, space, type } from '../../theme/tokens';
import { nextDraftKey, type CategoryDraft, type WizardAction } from '../wizardState';
import type { CadenceType, CategoryColorKey, EnvelopeConfig } from '../../types/contracts';
import { stepSubtextStyle, stepTitleStyle } from './stepTypography';

interface EnvelopesStepProps {
  categories: CategoryDraft[];
  dispatch: Dispatch<WizardAction>;
}

const COLOR_OPTIONS: Array<{ key: CategoryColorKey; label: string }> = [
  { key: 'violet', label: 'Violet' },
  { key: 'amber', label: 'Amber' },
  { key: 'mint', label: 'Mint' },
  { key: 'blue', label: 'Blue' },
  { key: 'pink', label: 'Pink' },
];

const FIXED_OPTIONS = [
  { key: 'fixed', label: 'Fixed bill' },
  { key: 'variable', label: 'Variable' },
] as const;

const CADENCE_OPTIONS: Array<{ key: CadenceType; label: string }> = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

const CARRYOVER_OPTIONS: Array<{ key: EnvelopeConfig['carryoverDefault']; label: string }> = [
  { key: 'ask', label: 'Ask' },
  { key: 'roll', label: 'Roll' },
  { key: 'sweep', label: 'Sweep' },
  { key: 'reset', label: 'Reset' },
];

export function EnvelopesStep({ categories, dispatch }: EnvelopesStepProps) {
  const [name, setName] = useState('');
  const [colorKey, setColorKey] = useState<CategoryColorKey>('violet');
  const [fixed, setFixed] = useState(false);
  const [cadence, setCadence] = useState<CadenceType>('weekly');
  const [budgetInput, setBudgetInput] = useState('');
  const [carryoverDefault, setCarryoverDefault] = useState<EnvelopeConfig['carryoverDefault']>('ask');
  const [nameError, setNameError] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  const handleAdd = () => {
    setNameError(null);
    setBudgetError(null);
    if (name.trim().length === 0) {
      setNameError('Give the category a name.');
      return;
    }
    let envelope: EnvelopeConfig | null = null;
    if (!fixed) {
      let budget;
      try {
        budget = parseDecimal(budgetInput || '0');
      } catch (e) {
        setBudgetError(e instanceof MoneyError ? e.message : 'Enter a valid budget.');
        return;
      }
      if (budget <= 0) {
        setBudgetError('Envelope budget must be positive.');
        return;
      }
      envelope = { period: cadence, budget, carryoverDefault };
    }

    const draft: CategoryDraft = {
      key: nextDraftKey('category'),
      name: name.trim(),
      colorKey,
      fixed,
      cadence: fixed ? undefined : cadence,
      envelope,
    };
    dispatch({ type: 'ADD_CATEGORY', draft });
    setName('');
    setBudgetInput('');
  };

  return (
    <View style={{ gap: space.md }}>
      <Text style={stepTitleStyle}>How do you want to spend it?</Text>
      <Text style={stepSubtextStyle}>
        Fixed bills like rent don't need a budget meter. Everything else does.
      </Text>

      <RuledList
        sectionLabel="Categories"
        data={categories}
        keyExtractor={(c) => c.key}
        renderRow={(c) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <CategoryChip colorKey={c.colorKey} />
              <View>
                <Text style={[type.body, { color: color.text }]}>{c.name}</Text>
                <Text style={[type.caption, { color: color.textMuted }]}>
                  {c.fixed
                    ? 'Fixed'
                    : `${c.envelope?.period} · ${formatCents(c.envelope!.budget)} · ${c.envelope?.carryoverDefault}`}
                </Text>
              </View>
            </View>
            <HardButton
              label="Remove"
              variant="ghost"
              accessibilityLabel={`Remove category ${c.name}`}
              onPress={() => dispatch({ type: 'REMOVE_CATEGORY', key: c.key })}
            />
          </View>
        )}
      />

      <PixelBox>
        <View style={{ gap: space.sm }}>
          <Field
            label="Category name"
            placeholder="e.g. Groceries"
            value={name}
            onChangeText={setName}
            error={nameError ?? undefined}
            accessibilityLabel="Category name"
          />

          <ChoiceRow
            options={COLOR_OPTIONS}
            selectedKey={colorKey}
            onSelect={(key) => setColorKey(key as CategoryColorKey)}
            accessibilityLabel="Category color"
          />

          <ChoiceRow
            options={FIXED_OPTIONS}
            selectedKey={fixed ? 'fixed' : 'variable'}
            onSelect={(key) => setFixed(key === 'fixed')}
            accessibilityLabel="Fixed bill or variable, enveloped category"
          />

          {!fixed ? (
            <>
              <ChoiceRow
                options={CADENCE_OPTIONS}
                selectedKey={cadence}
                onSelect={(key) => setCadence(key as CadenceType)}
                accessibilityLabel="Envelope cadence"
              />
              <Text style={stepSubtextStyle}>
                Weekly envelopes reset every Monday. Monthly envelopes reset on the 1st.
              </Text>
              <Field
                label={`Budget per ${cadence === 'weekly' ? 'week' : 'month'}`}
                placeholder="e.g. 60.00"
                keyboardType="decimal-pad"
                value={budgetInput}
                onChangeText={setBudgetInput}
                error={budgetError ?? undefined}
                accessibilityLabel="Envelope budget in dollars"
              />
              <Text style={[type.sectionLabel, { color: color.textMuted, marginTop: space.xs }]}>
                Monday-prompt default for leftovers
              </Text>
              <ChoiceRow
                options={CARRYOVER_OPTIONS}
                selectedKey={carryoverDefault}
                onSelect={(key) => setCarryoverDefault(key as EnvelopeConfig['carryoverDefault'])}
                accessibilityLabel="Carryover default"
              />
            </>
          ) : null}

          <HardButton label="Add category" accessibilityLabel="Add category" onPress={handleAdd} />
        </View>
      </PixelBox>
    </View>
  );
}
