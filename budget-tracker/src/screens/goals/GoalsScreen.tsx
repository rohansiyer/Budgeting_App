/**
 * Settings subscreen: named savings goals (v0.3 handoff §3.10, mockups
 * "Goal · my own place" / "Named goal · the one Monarch feature worth
 * taking" and §3.9 "Savings · stepped trend + 45% projection").
 *
 * Lives in the Settings local state stack (SettingsScreen wires this in) —
 * NOT the root navigator, per CLAUDE.md convention.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import { sumCents, type Cents } from '../../lib/money';
import { Field, ChoiceRow, HardButton, Snackbar, type ChoiceOption } from '../../components/kit';
import { Screen, SectionLabel } from '../../components/Primitives';
import { SubscreenHeader } from '../settings/SubscreenHeader';
import { GoalCard } from './GoalCard';
import { SteppedChart } from './SteppedChart';
import { goalTargetError, GOAL_TARGET_MAX_MESSAGE } from './goalsForm.logic';
import { useStore, useStoreVersion } from '../../providers/StoreProvider';
import { todayISO, weekStartOf, addDaysISO } from '../../format/dates';
import { tryParseCents } from '../../format/moneyInput';
import { projectSavings, projectGoalFunding, type ProjectionPoint } from '../../projections';
import type { Goal } from '../../types/contracts';
import type { StoreContract } from '../../types/contracts';

const { color, space } = tokens;
const typo = tokens.type;

/** Trailing weeks of actual balance shown before "today" in the chart. */
const TRAILING_WEEKS = 12;
/** Weeks of projection shown after "today". */
const PROJECTION_WEEKS = 12;

const ALL_SAVINGS_KEY = 'all';

/**
 * Weekly total-savings-balance history for the trailing `weeks` weeks,
 * ending at `today`'s actual balance (so it joins seamlessly with
 * projectSavings' first point, which is also `today`'s balance).
 */
function trailingSavingsHistory(
  store: StoreContract,
  today: string,
  weeks: number,
): ProjectionPoint[] {
  const savingsAccounts = store.listAccounts().filter((a) => a.kind === 'savings');
  const thisWeekMonday = weekStartOf(today);
  const points: ProjectionPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStartISO = addDaysISO(thisWeekMonday, -7 * i);
    const asOf = i === 0 ? today : weekStartISO;
    const total = sumCents(savingsAccounts.map((a) => store.getAccountBalance(a.id, asOf)));
    points.push({ weekStartISO, projectedCents: total });
  }
  return points;
}

export function GoalsScreen({ onBack }: { onBack: () => void }) {
  const store = useStore();
  // F4-4: `store` is a referentially-stable object for the provider's
  // lifetime (useStore only forces a re-render via useSyncExternalStore) —
  // memoizing on [store, ...] never recomputes. Key on the store's monotonic
  // version counter instead, so these recompute on every committed mutation.
  const version = useStoreVersion();
  const today = todayISO();

  const goals = store.getGoals();
  const savingsAccounts = useMemo(
    () => store.listAccounts().filter((a) => a.kind === 'savings'),
    [version],
  );

  const history = useMemo(
    () => trailingSavingsHistory(store, today, TRAILING_WEEKS),
    [version, today],
  );
  const projection = useMemo(
    () => projectSavings(PROJECTION_WEEKS, today),
    [version, today],
  );
  const chartTarget: Cents | null = goals.length > 0 ? goals[0].targetCents : null;

  // --- create form ---------------------------------------------------------
  const [name, setName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [linkedKey, setLinkedKey] = useState(ALL_SAVINGS_KEY);
  // Backstop error for a store-side rejection (never the raw store message).
  const [createError, setCreateError] = useState<string | null>(null);

  const accountOptions: ChoiceOption[] = [
    { key: ALL_SAVINGS_KEY, label: 'All savings' },
    ...savingsAccounts.map((a) => ({ key: a.id, label: a.name })),
  ];

  const parsedAmount = tryParseCents(amountText);
  // Inline validation mirrors the store's $1M target cap so the user gets
  // friendly copy before the store would throw.
  const targetError = goalTargetError(parsedAmount);
  const canSubmit =
    name.trim().length > 0 && parsedAmount !== null && parsedAmount > 0 && targetError === null;

  const handleCreate = async () => {
    if (!canSubmit || parsedAmount === null) return;
    try {
      await store.addGoal({
        name: name.trim(),
        targetCents: parsedAmount,
        savingsAccountId: linkedKey === ALL_SAVINGS_KEY ? null : linkedKey,
      });
    } catch {
      // The store enforces the same cap and throws with a raw dev-facing
      // message; surface the friendly copy instead and keep the form intact.
      setCreateError(GOAL_TARGET_MAX_MESSAGE);
      return;
    }
    setCreateError(null);
    setName('');
    setAmountText('');
    setLinkedKey(ALL_SAVINGS_KEY);
  };

  // --- remove with undo ------------------------------------------------------
  const [removedGoal, setRemovedGoal] = useState<Goal | null>(null);

  const handleRemove = async (goal: Goal) => {
    await store.updateGoal(goal.id, { active: false });
    setRemovedGoal(goal);
  };

  const handleUndoRemove = async () => {
    if (!removedGoal) return;
    await store.updateGoal(removedGoal.id, { active: true });
    setRemovedGoal(null);
  };

  return (
    <Screen scroll>
      <SubscreenHeader title="Goals" onBack={onBack} />

      {goals.length > 0 ? (
        <View>
          {goals.map((goal) => (
            <View key={goal.id} style={styles.goalRow}>
              <GoalCard
                goal={goal}
                progress={store.goalProgress(goal.id, today)}
                funding={projectGoalFunding(goal.id, today)}
                today={today}
              />
              <HardButton
                label="Remove"
                variant="ghost"
                onPress={() => void handleRemove(goal)}
                accessibilityLabel={`Remove goal ${goal.name}`}
              />
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>No goals yet. Name one below and watch the blocks fill.</Text>
      )}

      <SectionLabel>Savings trend</SectionLabel>
      <SteppedChart history={history} projection={projection} targetCents={chartTarget} />

      <SectionLabel>New goal</SectionLabel>
      <View style={styles.form}>
        <Field
          label="Goal name"
          value={name}
          onChangeText={setName}
          placeholder="First month's rent"
          accessibilityLabel="Goal name"
        />
        <Field
          label="Target amount"
          value={amountText}
          onChangeText={(text) => {
            setAmountText(text);
            setCreateError(null);
          }}
          placeholder="0.00"
          keyboardType="decimal-pad"
          error={targetError ?? createError ?? undefined}
          accessibilityLabel="Goal target amount"
        />
        <View style={styles.linkedField}>
          <Text style={styles.linkedLabel}>Linked account</Text>
          <ChoiceRow
            options={accountOptions}
            selectedKey={linkedKey}
            onSelect={setLinkedKey}
            accessibilityLabel="Choose which savings account this goal tracks"
          />
        </View>
        <HardButton
          label="Create goal"
          disabled={!canSubmit}
          onPress={() => void handleCreate()}
          accessibilityLabel="Create goal"
        />
      </View>

      <Snackbar
        visible={removedGoal !== null}
        message={removedGoal ? `${removedGoal.name} removed.` : ''}
        actionLabel="Undo"
        onAction={() => void handleUndoRemove()}
        onTimeout={() => setRemovedGoal(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  goalRow: {
    marginBottom: space.md,
  },
  empty: {
    color: color.textMuted,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  form: {
    gap: space.md,
    marginBottom: space.lg,
  },
  linkedField: {
    gap: space.xs,
  },
  linkedLabel: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
    fontFamily: typo.sectionLabel.fontFamily,
  },
});

export default GoalsScreen;
