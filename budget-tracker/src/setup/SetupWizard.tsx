/**
 * Setup wizard orchestrator (DucksInARow_DesignDoc_v2.md §4 Setup).
 * Drives the Accounts -> Income -> Envelopes -> Review step machine
 * (`wizardState.ts`) and, on Review's Save, persists through `saveSetup`
 * against the `SetupWriter` it's given — the real store at merge, an
 * in-memory fake in tests/dev.
 *
 * The wizard never creates or archives chapters itself: the caller
 * (first-run bootstrap or the "New chapter" action, see
 * `chapterFlow.ts`) is responsible for having an active `Chapter` ready
 * before mounting this component.
 *
 * Chrome (handoff v3 §3.2, "Wizard step" mockup): a tracked-mono step
 * counter + a small idle mallard up top, a StepTrack underneath, then
 * whichever step screen renders its own question-style title/subtext
 * (see `screens/stepTypography.ts`), and a Back (ghost) / Continue
 * (primary) row pinned to the bottom of each non-final step. Review
 * keeps its own confirm button and label ("Save and start").
 */
import React, { useReducer, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { HardButton, StepTrack } from '../components/kit';
import { DuckSprite } from '../ducks/DuckSprite';
import { color, space, type } from '../theme/tokens';
import { saveSetup, type SaveResult } from './save';
import type { SetupWriter } from './types';
import {
  initialWizardState,
  validateStep,
  wizardReducer,
  WIZARD_STEPS,
  type WizardStep,
  type WizardState,
} from './wizardState';
import type { Chapter } from '../types/contracts';
import { AccountsStep } from './screens/AccountsStep';
import { IncomeStep } from './screens/IncomeStep';
import { EnvelopesStep } from './screens/EnvelopesStep';
import { ReviewStep } from './screens/ReviewStep';

const STEP_TITLES: Record<WizardStep, string> = {
  accounts: 'Accounts',
  income: 'Income',
  envelopes: 'Envelopes',
  review: 'Review',
};

export interface SetupWizardProps {
  writer: SetupWriter;
  chapter: Chapter;
  onComplete: (result: SaveResult) => void;
  initialChapterName?: string;
  /** Prefilled state for edit mode — drafts carry existingId so Save updates in place. */
  initialState?: WizardState;
}

export function SetupWizard({ writer, chapter, onComplete, initialChapterName, initialState }: SetupWizardProps) {
  const [state, dispatch] = useReducer(
    wizardReducer,
    initialState ?? initialWizardState(initialChapterName ?? chapter.name),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const validation = validateStep(state, state.step);
  const isLastStep = state.step === 'review';
  const stepIndex = WIZARD_STEPS.indexOf(state.step);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveSetup(writer, state, chapter);
      onComplete(result);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save setup.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{ padding: space.md, gap: space.lg }}
      accessibilityLabel="Setup wizard"
    >
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
        accessible
        accessibilityLabel={`Step ${stepIndex + 1} of ${WIZARD_STEPS.length}: ${STEP_TITLES[state.step]}`}
      >
        <Text style={[type.sectionLabel, { color: color.textMuted }]}>
          {`Step ${stepIndex + 1} of ${WIZARD_STEPS.length}`}
        </Text>
        <DuckSprite accessoryTier={0} scale={2} animation="idle" />
      </View>

      <StepTrack
        total={WIZARD_STEPS.length}
        completed={stepIndex + 1}
        accessibilityLabel={`Setup progress: step ${stepIndex + 1} of ${WIZARD_STEPS.length}`}
      />

      {state.step === 'accounts' ? (
        <AccountsStep accounts={state.accounts} dispatch={dispatch} />
      ) : null}
      {state.step === 'income' ? (
        <IncomeStep accounts={state.accounts} incomeSources={state.incomeSources} dispatch={dispatch} />
      ) : null}
      {state.step === 'envelopes' ? (
        <EnvelopesStep categories={state.categories} dispatch={dispatch} />
      ) : null}
      {state.step === 'review' ? (
        <ReviewStep
          state={state}
          errors={validation.errors}
          saving={saving}
          onSave={handleSave}
        />
      ) : null}

      {saveError ? <Text style={[type.caption, { color: color.danger }]}>{saveError}</Text> : null}

      {!isLastStep ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <HardButton
            label="Back"
            variant="ghost"
            accessibilityLabel="Go back a step"
            disabled={state.step === 'accounts'}
            onPress={() => dispatch({ type: 'GO_BACK' })}
          />
          <HardButton
            label="Continue"
            accessibilityLabel="Continue to the next step"
            disabled={!validation.valid}
            onPress={() => dispatch({ type: 'GO_NEXT' })}
          />
        </View>
      ) : (
        <HardButton
          label="Back"
          variant="ghost"
          accessibilityLabel="Go back a step"
          onPress={() => dispatch({ type: 'GO_BACK' })}
        />
      )}

      {validation.errors.length > 0 && !isLastStep ? (
        <View style={{ gap: 2 }}>
          {validation.errors.map((e, i) => (
            <Text key={i} style={[type.caption, { color: color.warn }]}>
              {e}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
