/**
 * Team 4 (Pond) — monthly Results screen (§9.6 "Time to count ducks!").
 *
 * Presents the stacked, oldest-first evaluations returned by the DuckEngine:
 *   title → three GoalResult rows → outcome staging → CTAs.
 * Staging per outcome:
 *   gain          — waddle-in + confetti squares in category colors
 *   fancy_upgrade — happy dance (the flock got fancier)
 *   hold          — idle, neutral copy
 *   lose          — walk-off with look-back + supportive copy
 * A big-win month adds the happy dance regardless of outcome.
 *
 * Duck naming: the flock preview is tappable; a tap opens a name prompt that
 * calls the NameDuck callback (Team 1 wires persistence via DuckPersistencePort).
 * No emoji, no rounded cards, no literal hex — tokens only.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  StyleSheet,
} from 'react-native';
import { color, space, type as typo } from '../theme/tokens';
import type { DuckEvaluation, Duck, GoalResult, MonthKey } from '../types/contracts';
import { DuckSprite } from './DuckSprite';
import { PondView } from './PondView';
import type { AnimationName } from './sprites';
import { MONTH_END_RECAP_EYEBROW, monthLabel as defaultMonthLabel, outcomeCopy } from './copy';

export type NameDuck = (duckId: string, name: string) => void;

export interface ResultsScreenProps {
  /** Newly-issued evaluations, oldest-first, each with its big-win flag. */
  results: ReadonlyArray<{ evaluation: DuckEvaluation; bigWin: boolean }>;
  /** Current flock, for the tappable preview + naming. */
  flock: { ducks: readonly Duck[]; accessoryTier: 0 | 1 | 2 | 3 };
  onNameDuck: NameDuck;
  onGoToPond: () => void;
  onReviewBills: () => void;
  /** 'YYYY-MM' → display label. Defaults to "Month YYYY". */
  monthLabel?: (month: MonthKey) => string;
}

function animationFor(outcome: DuckEvaluation['outcome'], bigWin: boolean): AnimationName {
  if (bigWin) return 'happy-dance';
  switch (outcome) {
    case 'gain':
      return 'waddle-in';
    case 'fancy_upgrade':
      return 'happy-dance';
    case 'lose':
      return 'walk-off';
    default:
      return 'idle';
  }
}

const CATEGORY_HEXES = [
  color.category.violet,
  color.category.amber,
  color.category.mint,
  color.category.blue,
  color.category.pink,
];

const Confetti: React.FC = () => (
  <View style={styles.confettiRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {Array.from({ length: 12 }).map((_, i) => (
      <View
        key={i}
        style={{
          width: 8,
          height: 8,
          marginHorizontal: 3,
          marginTop: (i % 3) * 4,
          backgroundColor: CATEGORY_HEXES[i % CATEGORY_HEXES.length],
        }}
      />
    ))}
  </View>
);

const GoalRow: React.FC<{ label: string; result: GoalResult }> = ({ label, result }) => (
  <View style={styles.goalRow} accessibilityRole="text">
    <View style={styles.goalHeader}>
      <Text style={styles.goalLabel}>{label}</Text>
      <Text
        style={[styles.goalStatus, { color: result.met ? color.accent : color.danger }]}
        accessibilityLabel={result.met ? 'Met' : 'Missed'}
      >
        {result.met ? 'MET' : 'MISSED'}
      </Text>
    </View>
    <Text style={styles.goalDetail}>{result.detail}</Text>
  </View>
);

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  results,
  flock,
  onNameDuck,
  onGoToPond,
  onReviewBills,
  monthLabel = defaultMonthLabel,
}) => {
  const [naming, setNaming] = useState<Duck | null>(null);
  const [draft, setDraft] = useState('');

  const openName = (duck: Duck) => {
    setDraft(duck.name ?? '');
    setNaming(duck);
  };
  const commitName = () => {
    if (naming) {
      const trimmed = draft.trim();
      if (trimmed.length > 0) onNameDuck(naming.id, trimmed);
    }
    setNaming(null);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {results.map(({ evaluation, bigWin }) => (
        <View key={evaluation.id} style={styles.card}>
          <Text style={styles.eyebrow}>{MONTH_END_RECAP_EYEBROW}</Text>
          <Text style={styles.title}>{monthLabel(evaluation.month)}</Text>

          <View style={styles.stage}>
            <DuckSprite
              accessoryTier={evaluation.accessoryTierAfter as 0 | 1 | 2 | 3}
              scale={5}
              animation={animationFor(evaluation.outcome, bigWin)}
            />
            {(evaluation.outcome === 'gain' || bigWin) && <Confetti />}
          </View>

          <GoalRow label="Fixed bills paid" result={evaluation.goalFixedBills} />
          <GoalRow label="Budgets kept" result={evaluation.goalVariableBudgets} />
          <GoalRow label="Savings rate" result={evaluation.goalSavingsRate} />

          <Text style={styles.outcomeCopy}>{outcomeCopy(evaluation.outcome, bigWin)}</Text>
          <Text style={styles.flockLine}>
            {`Flock: ${evaluation.duckCountAfter} ${evaluation.duckCountAfter === 1 ? 'duck' : 'ducks'}`}
          </Text>
        </View>
      ))}

      <Text style={styles.sectionLabel}>Your pond — tap a duck to name it</Text>
      <PondView
        ducks={flock.ducks}
        accessoryTier={flock.accessoryTier}
        size={240}
        onDuckPress={openName}
      />

      <View style={styles.ctaColumn}>
        <Pressable
          style={[styles.cta, styles.ctaPrimary]}
          onPress={onGoToPond}
          accessibilityRole="button"
          accessibilityLabel="Go to the Pond"
        >
          <Text style={styles.ctaPrimaryLabel}>Go to the Pond</Text>
        </Pressable>
        <Pressable
          style={[styles.cta, styles.ctaGhost]}
          onPress={onReviewBills}
          accessibilityRole="button"
          accessibilityLabel="Review recurring bills"
        >
          <Text style={styles.ctaGhostLabel}>Review recurring bills</Text>
        </Pressable>
      </View>

      <Modal visible={naming !== null} transparent animationType="fade" onRequestClose={() => setNaming(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalScrim} />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Name this duck</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="e.g. Gerald"
              placeholderTextColor={color.textMuted}
              style={styles.input}
              accessibilityLabel="Duck name"
              autoFocus
              maxLength={24}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.cta, styles.ctaGhost, styles.modalBtn]}
                onPress={() => setNaming(null)}
                accessibilityRole="button"
                accessibilityLabel="Cancel naming"
              >
                <Text style={styles.ctaGhostLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.cta, styles.ctaPrimary, styles.modalBtn]}
                onPress={commitName}
                accessibilityRole="button"
                accessibilityLabel="Save duck name"
              >
                <Text style={styles.ctaPrimaryLabel}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

export default ResultsScreen;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.md, paddingBottom: space.xl },
  card: {
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    borderRadius: 0,
    padding: space.md,
    marginBottom: space.md,
  },
  eyebrow: {
    ...typo.sectionLabel,
    color: color.accent,
    marginBottom: space.xs,
  },
  title: { ...typo.title, color: color.text, marginBottom: space.sm },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.md,
  },
  confettiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: space.sm,
  },
  goalRow: {
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    paddingVertical: space.sm,
  },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalLabel: { ...typo.body, color: color.text },
  goalStatus: { ...typo.caption, fontWeight: '800' },
  goalDetail: { ...typo.caption, color: color.textSecondary, marginTop: 2 },
  outcomeCopy: {
    ...typo.body,
    color: color.textSecondary,
    marginTop: space.md,
    fontWeight: '600',
  },
  flockLine: { ...typo.caption, color: color.textMuted, marginTop: space.xs },
  sectionLabel: {
    ...typo.sectionLabel,
    color: color.textMuted,
    marginTop: space.md,
    marginBottom: space.sm,
    textAlign: 'center',
  },
  ctaColumn: { marginTop: space.lg, gap: space.sm },
  cta: {
    borderWidth: 1,
    borderRadius: 0,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  ctaPrimary: { backgroundColor: color.accent, borderColor: color.accent },
  ctaPrimaryLabel: { ...typo.body, color: color.bg, fontWeight: '800' },
  ctaGhost: { backgroundColor: 'transparent', borderColor: color.border },
  ctaGhostLabel: { ...typo.body, color: color.text },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: color.bg,
    opacity: 0.72,
  },
  modalBox: {
    width: '100%',
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    borderRadius: 0,
    padding: space.md,
  },
  modalTitle: { ...typo.title, color: color.text, marginBottom: space.md },
  input: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 0,
    color: color.text,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    ...typo.body,
  },
  modalActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  modalBtn: { flex: 1 },
});
