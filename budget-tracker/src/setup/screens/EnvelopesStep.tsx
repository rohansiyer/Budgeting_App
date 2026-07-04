/**
 * Setup wizard — Envelopes step (DucksInARow_DesignDoc_v2.md §4 Setup:
 * "envelopes (create/rename/re-budget, weekly or monthly)"). Every spend
 * category is created here, fixed (rent, utilities — no envelope, judged
 * by Duck Goal 1) or enveloped (variable-spend, weekly/monthly budget +
 * a Monday-prompt carryover default).
 */
import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { Dispatch } from 'react';
import { CategoryChip, HardButton, PixelBox, RuledList } from '../../components/kit';
import { formatCents, MoneyError, parseDecimal } from '../../lib/money';
import { color, space, type } from '../../theme/tokens';
import { nextDraftKey, type CategoryDraft, type WizardAction } from '../wizardState';
import type { CategoryColorKey, EnvelopeConfig } from '../../types/contracts';

interface EnvelopesStepProps {
  categories: CategoryDraft[];
  dispatch: Dispatch<WizardAction>;
}

const COLOR_KEYS: CategoryColorKey[] = ['violet', 'amber', 'mint', 'blue', 'pink'];
const CARRYOVER_DEFAULTS: EnvelopeConfig['carryoverDefault'][] = ['ask', 'roll', 'sweep', 'reset'];

export function EnvelopesStep({ categories, dispatch }: EnvelopesStepProps) {
  const [name, setName] = useState('');
  const [colorKey, setColorKey] = useState<CategoryColorKey>('violet');
  const [fixed, setFixed] = useState(false);
  const [period, setPeriod] = useState<EnvelopeConfig['period']>('weekly');
  const [budgetInput, setBudgetInput] = useState('');
  const [carryoverDefault, setCarryoverDefault] = useState<EnvelopeConfig['carryoverDefault']>('ask');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    if (name.trim().length === 0) {
      setError('Give the category a name.');
      return;
    }
    let envelope: EnvelopeConfig | null = null;
    if (!fixed) {
      let budget;
      try {
        budget = parseDecimal(budgetInput || '0');
      } catch (e) {
        setError(e instanceof MoneyError ? e.message : 'Enter a valid budget.');
        return;
      }
      if (budget <= 0) {
        setError('Envelope budget must be positive.');
        return;
      }
      envelope = { period, budget, carryoverDefault };
    }

    const draft: CategoryDraft = {
      key: nextDraftKey('category'),
      name: name.trim(),
      colorKey,
      fixed,
      envelope,
    };
    dispatch({ type: 'ADD_CATEGORY', draft });
    setName('');
    setBudgetInput('');
    setError(null);
  };

  return (
    <View style={{ gap: space.md }}>
      <Text style={[type.title, { color: color.text }]}>Envelopes</Text>
      <Text style={[type.body, { color: color.textSecondary }]}>
        Fixed bills (rent, utilities) don't need a budget meter — everything else does.
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
          <TextInput
            accessibilityLabel="Category name"
            placeholder="Category name (e.g. Groceries)"
            placeholderTextColor={color.textMuted}
            value={name}
            onChangeText={setName}
            style={{ color: color.text, borderBottomWidth: 1, borderBottomColor: color.hairline }}
          />

          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {COLOR_KEYS.map((k) => (
              <HardButton
                key={k}
                label={k}
                variant={colorKey === k ? 'primary' : 'ghost'}
                accessibilityLabel={`Category color ${k}`}
                onPress={() => setColorKey(k)}
              />
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <HardButton
              label="Fixed bill"
              variant={fixed ? 'primary' : 'ghost'}
              accessibilityLabel="Mark as a fixed bill (no envelope)"
              onPress={() => setFixed(true)}
            />
            <HardButton
              label="Variable / enveloped"
              variant={!fixed ? 'primary' : 'ghost'}
              accessibilityLabel="Mark as a variable, enveloped category"
              onPress={() => setFixed(false)}
            />
          </View>

          {!fixed ? (
            <>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <HardButton
                  label="Weekly"
                  variant={period === 'weekly' ? 'primary' : 'ghost'}
                  accessibilityLabel="Weekly budget period"
                  onPress={() => setPeriod('weekly')}
                />
                <HardButton
                  label="Monthly"
                  variant={period === 'monthly' ? 'primary' : 'ghost'}
                  accessibilityLabel="Monthly budget period"
                  onPress={() => setPeriod('monthly')}
                />
              </View>
              <TextInput
                accessibilityLabel="Envelope budget in dollars"
                placeholder={`Budget per ${period === 'weekly' ? 'week' : 'month'} (e.g. 60.00)`}
                placeholderTextColor={color.textMuted}
                keyboardType="decimal-pad"
                value={budgetInput}
                onChangeText={setBudgetInput}
                style={{ color: color.text, borderBottomWidth: 1, borderBottomColor: color.hairline }}
              />
              <Text style={[type.sectionLabel, { color: color.textMuted, marginTop: space.xs }]}>
                Monday-prompt default for leftovers
              </Text>
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                {CARRYOVER_DEFAULTS.map((cd) => (
                  <HardButton
                    key={cd}
                    label={cd}
                    variant={carryoverDefault === cd ? 'primary' : 'ghost'}
                    accessibilityLabel={`Carryover default ${cd}`}
                    onPress={() => setCarryoverDefault(cd)}
                  />
                ))}
              </View>
            </>
          ) : null}

          {error ? <Text style={[type.caption, { color: color.danger }]}>{error}</Text> : null}
          <HardButton label="Add category" accessibilityLabel="Add category" onPress={handleAdd} />
        </View>
      </PixelBox>
    </View>
  );
}
