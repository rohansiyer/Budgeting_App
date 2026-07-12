/**
 * Team 4 (Pond) — monthly Results screen (§9.6 "Time to count ducks!"),
 * rebuilt to the v0.3 "Recap · every pay period, plus month-end" mockup using
 * the form/insight kit (handoff v3 §3.6, §3.1): a PixelBox verdict header
 * (mallard + month title + goal squares), the top 3 recap insights as
 * InsightRows (tap opens the numbers behind one, via src/ledger's
 * insightBacking selector), a 6-month spend SparkBlocks trend, then the duck
 * verdict staging (waddle-in/walk-off/idle + confetti) and CTAs on kit
 * HardButton. "Time to count ducks!" stays the month-end frame only — this
 * screen is still reached exclusively from month-end verdicts
 * (DuckResultsGate); PayPeriodRecapGate's mid-month closes render separately
 * and carry no verdict.
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
import { color, space, pixel, type as typo } from '../theme/tokens';
import { cents, sumCents, type Cents } from '../lib/money';
import { PixelBox, HardButton, InsightRow, SparkBlocks, RuledList } from '../components/kit';
import type { DuckEvaluation, Duck, GoalResult, ISODate, MonthKey } from '../types/contracts';
import { DuckSprite } from './DuckSprite';
import { PondView } from './PondView';
import type { AnimationName } from './sprites';
import { MONTH_END_RECAP_EYEBROW, monthLabel as defaultMonthLabel, outcomeCopy } from './copy';
import { buildSpendTrend, recapHeaderLine, goalsMetCount, trendBlockValue } from './ResultsScreen.logic';
import { getInsightPort } from '../insights';
import type { InsightSentence } from '../insights';
import { insightBacking } from '../ledger';
import type { InsightBacking } from '../ledger';
import { useBudgetStore } from '../store';
import { monthRange, weekStartOf } from '../format/dates';

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

/** One 10px goal square, text-labeled so status is never color-only. */
const GoalSquare: React.FC<{ label: string; result: GoalResult }> = ({ label, result }) => (
  <View style={styles.squareItem} accessible accessibilityLabel={`${label}: ${result.met ? 'met' : 'missed'}`}>
    <View style={[styles.square, { backgroundColor: result.met ? color.accent : color.danger }]} />
    <Text style={styles.squareLabel}>{label}</Text>
  </View>
);

/** Sum of expense transactions in the calendar month `monthKey`, a sync read. */
function monthSpendTotal(monthKey: MonthKey): Cents {
  const store = useBudgetStore.getState();
  const range = monthRange(`${monthKey}-01`);
  return sumCents(
    store.getTransactions(range).filter((t) => t.kind === 'expense').map((t) => t.amount),
  );
}

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
  const [nameFocused, setNameFocused] = useState(false);
  const [backingFor, setBackingFor] = useState<{
    insight: InsightSentence;
    periodStart: ISODate;
  } | null>(null);

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

  const backing: InsightBacking | null = backingFor
    ? insightBacking(backingFor.insight, backingFor.periodStart)
    : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {results.map(({ evaluation, bigWin }) => {
        const goalResults = [
          evaluation.goalFixedBills,
          evaluation.goalVariableBudgets,
          evaluation.goalSavingsRate,
        ];
        const metCount = goalsMetCount(goalResults);
        const period = monthRange(`${evaluation.month}-01`);
        const recapInsights = getInsightPort().getRecapInsights({
          start: period.from,
          end: period.to,
        });
        const trendColumns = buildSpendTrend(evaluation.month, monthSpendTotal);
        const blockValue = trendBlockValue(trendColumns.map((c) => c.value));
        // Anchor for drilling into an insight's backing rows: the month's
        // first budget week, a valid WeekStart for the safeToSpend path.
        const periodStart = weekStartOf(period.from);

        return (
          <PixelBox key={evaluation.id} style={styles.card}>
            <Text style={styles.eyebrow}>{MONTH_END_RECAP_EYEBROW}</Text>
            <View style={styles.headerRow}>
              <DuckSprite
                accessoryTier={evaluation.accessoryTierAfter as 0 | 1 | 2 | 3}
                scale={4}
                animation={animationFor(evaluation.outcome, bigWin)}
              />
              <View style={styles.headerMeta}>
                <Text style={styles.title}>{monthLabel(evaluation.month)}</Text>
                <Text style={styles.headerLine}>{recapHeaderLine(metCount, evaluation.outcome)}</Text>
              </View>
            </View>

            {(evaluation.outcome === 'gain' || bigWin) && <Confetti />}

            <View style={styles.squares}>
              <GoalSquare label="Bills paid" result={evaluation.goalFixedBills} />
              <GoalSquare label="Budgets kept" result={evaluation.goalVariableBudgets} />
              <GoalSquare label="Savings" result={evaluation.goalSavingsRate} />
            </View>

            <Text style={styles.outcomeCopy}>{outcomeCopy(evaluation.outcome, bigWin, evaluation.month)}</Text>
            <Text style={styles.flockLine}>
              {`Flock: ${evaluation.duckCountAfter} ${evaluation.duckCountAfter === 1 ? 'duck' : 'ducks'}`}
            </Text>

            {recapInsights.length > 0 ? (
              <View style={styles.insightSection}>
                {recapInsights.map((insight) => (
                  <Pressable
                    key={insight.id}
                    onPress={() => setBackingFor({ insight, periodStart })}
                    accessibilityRole="button"
                    accessibilityLabel={`${insight.prefix ?? ''}${insight.amountText ?? ''}${insight.suffix ? ` ${insight.suffix}` : ''}`}
                    accessibilityHint="Opens the numbers behind this insight"
                  >
                    <InsightRow
                      colorKey={insight.colorKey ?? 'mint'}
                      prefix={insight.prefix}
                      amountText={insight.amountText ?? ''}
                      suffix={insight.suffix}
                    />
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Text style={styles.sectionLabelSmall}>Spend &middot; last 6 months</Text>
            <SparkBlocks
              columns={trendColumns}
              blockValue={blockValue}
              maxBlocks={8}
              accessibilityLabel="Spend over the last 6 months"
            />
          </PixelBox>
        );
      })}

      <Text style={styles.sectionLabel}>Your pond: tap a duck to name it</Text>
      <PondView
        ducks={flock.ducks}
        accessoryTier={flock.accessoryTier}
        size={240}
        onDuckPress={openName}
      />

      <View style={styles.ctaColumn}>
        <HardButton label="Go to the Pond" onPress={onGoToPond} accessibilityLabel="Go to the Pond" />
        <HardButton
          label="Review recurring bills"
          variant="ghost"
          onPress={onReviewBills}
          accessibilityLabel="Review recurring bills"
        />
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
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              style={[styles.input, nameFocused && styles.inputFocused]}
              accessibilityLabel="Duck name"
              autoFocus
              maxLength={24}
            />
            <View style={styles.modalActions}>
              <HardButton
                label="Cancel"
                variant="ghost"
                onPress={() => setNaming(null)}
                accessibilityLabel="Cancel naming"
              />
              <HardButton label="Save" onPress={commitName} accessibilityLabel="Save duck name" />
            </View>
          </View>
        </View>
      </Modal>

      <InsightBackingModal
        visible={backingFor !== null}
        backing={backing}
        onClose={() => setBackingFor(null)}
      />
    </ScrollView>
  );
};

export default ResultsScreen;

/** One backing row, flattened from either an envelope ledger or a safe-to-spend breakdown. */
interface BackingRow {
  key: string;
  label: string;
  amount: Cents;
}

function backingRows(backing: InsightBacking | null): BackingRow[] {
  if (!backing) return [];
  if (backing.envelope) {
    return backing.envelope.rows.map((r, i) => ({
      key: `${r.dateISO}_${i}`,
      label: r.label,
      amount: r.amountCents,
    }));
  }
  if (backing.safeToSpend) {
    return backing.safeToSpend.lines.map((l, i) => ({
      key: `${l.label}_${i}`,
      label: l.label,
      amount: l.direction === 'out' ? cents(-l.amountCents) : l.amountCents,
    }));
  }
  return [];
}

/** "Tap an insight -> the numbers behind it" (v0.3 §3.7): a simple RuledList modal. */
function InsightBackingModal({
  visible,
  backing,
  onClose,
}: {
  visible: boolean;
  backing: InsightBacking | null;
  onClose: () => void;
}) {
  const rows = backingRows(backing);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>The numbers behind it</Text>
          <RuledList<BackingRow>
            data={rows}
            keyExtractor={(r) => r.key}
            renderRow={(r) => (
              <View style={styles.backingRow}>
                <Text style={styles.backingLabel}>{r.label}</Text>
                <Text
                  style={[
                    styles.backingAmount,
                    { color: r.amount >= 0 ? color.accent : color.text },
                  ]}
                >
                  {(r.amount / 100).toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    signDisplay: 'auto',
                  })}
                </Text>
              </View>
            )}
          />
          <View style={styles.modalActions}>
            <HardButton label="Close" onPress={onClose} accessibilityLabel="Close the numbers behind it" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.md, paddingBottom: space.xl },
  card: {
    marginBottom: space.md,
  },
  eyebrow: {
    ...typo.sectionLabel,
    color: color.accent,
    marginBottom: space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerMeta: {
    marginLeft: space.md,
    flexShrink: 1,
  },
  title: { ...typo.title, color: color.text },
  headerLine: {
    ...typo.body,
    color: color.textSecondary,
    marginTop: space.xs,
  },
  confettiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: space.sm,
  },
  squares: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: space.md,
    borderTopWidth: pixel.hairlineWidth,
    borderTopColor: color.hairline,
    paddingTop: space.sm,
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
    ...typo.caption,
    color: color.textSecondary,
  },
  outcomeCopy: {
    ...typo.body,
    color: color.textSecondary,
    marginTop: space.md,
  },
  flockLine: { ...typo.caption, color: color.textMuted, marginTop: space.xs },
  insightSection: {
    marginTop: space.md,
  },
  sectionLabelSmall: {
    ...typo.sectionLabel,
    color: color.textMuted,
    marginTop: space.md,
    marginBottom: space.sm,
  },
  sectionLabel: {
    ...typo.sectionLabel,
    color: color.textMuted,
    marginTop: space.md,
    marginBottom: space.sm,
    textAlign: 'center',
  },
  ctaColumn: { marginTop: space.lg, gap: space.sm },
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
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    backgroundColor: color.surface,
    padding: space.md,
  },
  modalTitle: { ...typo.title, color: color.text, marginBottom: space.md },
  input: {
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    color: color.text,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    ...typo.body,
  },
  // Focus ring (handoff v3 "Type and accessibility patches"): swap to the
  // accent border on focus, matching kit Field's treatment (§3.1).
  inputFocused: {
    borderColor: color.accent,
  },
  modalActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  backingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backingLabel: {
    ...typo.body,
    color: color.text,
    flex: 1,
    marginRight: space.sm,
  },
  backingAmount: {
    ...typo.body,
    fontVariant: [...typo.tabularNums.fontVariant],
    fontWeight: '700',
  },
});
