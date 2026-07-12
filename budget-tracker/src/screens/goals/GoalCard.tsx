/**
 * Named-goal card (v0.3 handoff §3.10, mockup "Named goal · the one Monarch
 * feature worth taking"). Display-only: PixelBox game object with a tracked
 * "GOAL" label, the goal's name at 20px/800, the amount line ($current in
 * accent, of $target muted), a BlockMeter (one block = $100), and a pace
 * line sourced from projectGoalFunding. Shared between HomeScreen (first
 * goal only) and GoalsScreen (the full list).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import { PixelBox, BlockMeter } from '../../components/kit';
import { cents, formatCents } from '../../lib/money';
import { GOAL_CARD_LABEL, goalAmountParts, goalPaceLine } from './goalCard.logic';
import type { Goal, GoalProgress, ISODate } from '../../types/contracts';
import type { GoalFunding } from '../../projections';

const { color, space } = tokens;
const typo = tokens.type;
const font = tokens.font;

/** One BlockMeter block = $100 (handoff §3.10 — savings stay countable). */
const GOAL_BLOCK_VALUE = cents(10000);

export interface GoalCardProps {
  goal: Goal;
  progress: GoalProgress;
  funding: GoalFunding;
  today: ISODate;
}

export function GoalCard({ goal, progress, funding, today }: GoalCardProps) {
  const { currentText, targetText } = goalAmountParts(progress.currentCents, progress.targetCents);
  const pace = goalPaceLine(funding, today);

  return (
    <PixelBox style={styles.box}>
      <Text style={styles.label}>{GOAL_CARD_LABEL}</Text>
      <Text style={styles.name}>{goal.name}</Text>
      <View style={styles.amountRow}>
        <Text style={styles.current}>{currentText}</Text>
        <Text style={styles.target}>{targetText}</Text>
      </View>
      <BlockMeter
        budget={progress.targetCents}
        spent={progress.currentCents}
        blockValue={GOAL_BLOCK_VALUE}
        accessibilityLabel={`${goal.name} goal, ${currentText} of ${formatCents(progress.targetCents)}`}
      />
      <Text style={styles.pace}>{pace}</Text>
    </PixelBox>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  label: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
    fontFamily: typo.sectionLabel.fontFamily,
    marginBottom: space.xs,
  },
  name: {
    color: color.text,
    fontSize: 20,
    fontWeight: '800',
    fontFamily: font.uiBold,
    marginBottom: space.sm,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: space.sm,
  },
  current: {
    color: color.accent,
    fontSize: typo.kpi.fontSize,
    fontWeight: typo.kpi.fontWeight,
    fontFamily: font.monoBold,
    fontVariant: [...typo.tabularNums.fontVariant],
    marginRight: space.xs,
  },
  target: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.title.fontWeight,
    fontFamily: font.mono,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
  pace: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    fontFamily: typo.caption.fontFamily,
    marginTop: space.sm,
  },
});

export default GoalCard;
