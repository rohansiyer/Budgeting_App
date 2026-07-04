/**
 * Setup wizard — Review + Save step. Summarizes every draft and, on
 * confirm, calls `saveSetup` (src/setup/save.ts) which is the only place
 * this package writes through `SetupWriter`.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { CategoryChip, HardButton, PixelBox, RuledList } from '../kit-stubs';
import { formatCents } from '../../lib/money';
import { color, space, type } from '../../theme/tokens';
import type { WizardState } from '../wizardState';

interface ReviewStepProps {
  state: WizardState;
  errors: string[];
  saving: boolean;
  onSave: () => void;
}

export function ReviewStep({ state, errors, saving, onSave }: ReviewStepProps) {
  return (
    <View style={{ gap: space.md }}>
      <Text style={[type.title, { color: color.text }]}>Review "{state.chapterName}"</Text>

      <RuledList
        sectionLabel="Accounts"
        data={state.accounts}
        keyExtractor={(a) => a.key}
        renderRow={(a) => (
          <Text style={[type.body, { color: color.text }]}>
            {a.name} · {a.kind} · {formatCents(a.startingBalance)}
          </Text>
        )}
      />

      <RuledList
        sectionLabel="Income"
        data={state.incomeSources}
        keyExtractor={(s) => s.key}
        renderRow={(s) => (
          <Text style={[type.body, { color: color.text }]}>
            {s.name} · {formatCents(s.amount)} · {s.schedule.kind}
          </Text>
        )}
      />

      <RuledList
        sectionLabel="Categories"
        data={state.categories}
        keyExtractor={(c) => c.key}
        renderRow={(c) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <CategoryChip colorKey={c.colorKey} />
            <Text style={[type.body, { color: color.text }]}>
              {c.name} · {c.fixed ? 'fixed' : `${formatCents(c.envelope!.budget)}/${c.envelope?.period}`}
            </Text>
          </View>
        )}
      />

      {errors.length > 0 ? (
        <PixelBox>
          <View style={{ gap: 2 }}>
            {errors.map((e, i) => (
              <Text key={i} style={[type.caption, { color: color.danger }]}>
                {e}
              </Text>
            ))}
          </View>
        </PixelBox>
      ) : null}

      <HardButton
        label={saving ? 'Saving…' : 'Save and start'}
        accessibilityLabel="Save setup and start using the app"
        disabled={saving || errors.length > 0}
        onPress={onSave}
      />
    </View>
  );
}
