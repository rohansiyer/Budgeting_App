import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import { PixelBox } from '../../components/kit';
import { useStore } from '../../providers/StoreProvider';
import { monthDuckLabel } from '../../ducks/copy';
import type { Cents } from '../../lib/money';
import type { MonthKey } from '../../types/contracts';
import {
  deriveGoalStatus,
  overallGoalStatus,
  topWarning,
  type GoalStatus,
  type VariableEnvelopeInput,
} from './goalStatus.logic';

const { color, space } = tokens;
const typo = tokens.type;

const STATUS_WORD: Record<GoalStatus, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  checking: 'Checking',
};
const STATUS_COLOR: Record<GoalStatus, string> = {
  on_track: color.accent,
  at_risk: color.danger,
  checking: color.textMuted,
};

export interface GoalStripProps {
  month: MonthKey;
  /** Enveloped categories' plan vs actual for `month` (sync store read). */
  variable: readonly VariableEnvelopeInput[];
}

/**
 * "JULY'S DUCK" goal strip (v0.3 handoff §3.5): tracked month-duck label +
 * overall status word, three 10px status squares for the monthly goals, and
 * one optional "ease off X" warning phrased as earning (never as losing —
 * see src/ducks/copy.ts). Statuses are derived by the SHARED pure helper in
 * goalStatus.logic.ts (lifted from PondScreen's GoalTrackerCard) so both
 * screens agree on the same thresholds.
 */
export function GoalStrip({ month, variable }: GoalStripProps) {
  const store = useStore();
  const [bills, setBills] = useState<{ expected: number; paid: number } | null>(null);
  const [savings, setSavings] = useState<Cents | null>(null);

  useEffect(() => {
    let alive = true;
    setBills(null);
    setSavings(null);
    store.evaluation.getMonthFixedBillStatus(month).then((b) => {
      if (alive) setBills(b);
    });
    store.evaluation.getMonthSavingsTotal(month).then((sv) => {
      if (alive) setSavings(sv);
    });
    return () => {
      alive = false;
    };
  }, [store, month]);

  const result = deriveGoalStatus({ bills, savings, variable });
  const overall = overallGoalStatus(result);
  const warning = topWarning(result.variableBudgets);
  const label = monthDuckLabel(month);

  return (
    <PixelBox style={styles.box}>
      <View style={styles.headRow}>
        <Text style={styles.label}>{label.toUpperCase()}</Text>
        <Text
          style={[styles.overall, { color: STATUS_COLOR[overall] }]}
          accessibilityLabel={`This month's duck: ${STATUS_WORD[overall].toLowerCase()}`}
        >
          {STATUS_WORD[overall].toUpperCase()}
        </Text>
      </View>
      <View style={styles.squares}>
        <GoalSquare label="Bills paid" status={result.fixedBills} />
        <GoalSquare label="Savings" status={result.savingsRate} />
        <GoalSquare label="Envelopes" status={result.variableBudgets.status} />
      </View>
      {warning ? (
        <Text style={styles.warning}>
          Ease off {warning.categoryName} to earn {label}.
        </Text>
      ) : null}
    </PixelBox>
  );
}

function GoalSquare({ label, status }: { label: string; status: GoalStatus }) {
  return (
    <View
      style={styles.squareItem}
      accessible
      accessibilityLabel={`${label}: ${STATUS_WORD[status].toLowerCase()}`}
    >
      <View style={[styles.square, { backgroundColor: STATUS_COLOR[status] }]} />
      <Text style={styles.squareLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  label: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    fontFamily: typo.sectionLabel.fontFamily,
  },
  overall: {
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    fontFamily: typo.sectionLabel.fontFamily,
  },
  squares: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  squareItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: space.md,
    marginBottom: space.xs,
  },
  square: {
    width: 10,
    height: 10,
    marginRight: space.xs,
  },
  squareLabel: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    fontFamily: typo.caption.fontFamily,
  },
  warning: {
    marginTop: space.xs,
    color: color.warn,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.body.fontWeight,
    fontFamily: typo.body.fontFamily,
    lineHeight: 18,
  },
});

export default GoalStrip;
