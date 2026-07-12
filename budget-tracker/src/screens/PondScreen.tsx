import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TextInput, StyleSheet } from 'react-native';
import * as tokens from '../theme/tokens';
import { Cents, cents, formatCents, ZERO } from '../lib/money';
import { PixelBox, RuledList, CategoryChip, HardButton } from '../components/kit';
import PondView from '../ducks/PondView';
import EnvelopeRing from './pond/EnvelopeRing';
import { DuckSprite } from '../ducks/DuckSprite';
import { useFlock } from '../ducks/appEngine';
import { Screen, SectionLabel, MoneyText, Row } from '../components/Primitives';
import { useStore } from '../providers/StoreProvider';
import { useBudgetStore } from '../store';
import {
  isDayOnePond,
  envelopePeriodWindow,
  assemblePondRing,
  flockCountLabel,
  type CategoryPeriodRead,
  type PondLegendRow,
} from './PondScreen.logic';
import { todayISO, monthKeyOf } from '../format/dates';
import type { CategoryConfig, Duck } from '../types/contracts';

const { color, space, pixel } = tokens;
const typo = tokens.type;

/** EnvelopeRing's authored reference container (handoff v3 §2.2). */
const RING_SIZE = 312;
/** Pond diameter — sized to sit well inside the ring's inner hole so ducks
 * never geometrically overlap the ring band (no pointerEvents hacks needed). */
const POND_SIZE = 224;

interface Slice {
  cat: CategoryConfig;
  planned: Cents;
  actual: Cents;
}

/**
 * How many months have ever been evaluated for the active chapter, straight
 * from the duck persistence port (the same one src/ducks/appEngine.ts wires
 * to the real store). `null` while loading; resolves to 0 for a pre-wizard
 * chapter rather than throwing into the UI (mirrors useFlock's own fallback).
 */
function useEvaluationsCount(refreshKey = 0): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = useBudgetStore.getState();
        const chapter = s.getActiveChapter();
        const state = await s.duckPersistence.loadState(chapter.id);
        if (alive) setCount(state.evaluations.length);
      } catch {
        if (alive) setCount(0);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  return count;
}

export function PondScreen() {
  const store = useStore();
  const [flockKey, setFlockKey] = useState(0);
  const flock = useFlock(flockKey);
  const evaluationsCount = useEvaluationsCount(flockKey);
  const dayOne =
    flock !== null && evaluationsCount !== null && isDayOnePond(flock.ducks.length, evaluationsCount);
  const [naming, setNaming] = useState<Duck | null>(null);
  const [draft, setDraft] = useState('');
  const [howDucksWork, setHowDucksWork] = useState(false);
  const today = todayISO();
  const month = monthKeyOf(today);

  // Duck naming: tap a duck in the pond to (re)name it (§6 "name on tap").
  const openName = (duck: Duck) => {
    setDraft(duck.name ?? '');
    setNaming(duck);
  };
  const commitName = async () => {
    const target = naming;
    setNaming(null);
    if (!target) return;
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    await useBudgetStore.getState().duckPersistence.renameDuck(target.id, trimmed);
    setFlockKey((k) => k + 1);
  };

  // Cadence-aware period reads (v0.3 §1.3): weekly envelopes read this budget
  // week (getEnvelopeWeekState), monthly envelopes and fixed categories read
  // this calendar month (getPlanVsActual, the same call the old donut used).
  const categories = store.listCategories();
  const monthReads = store.getPlanVsActual(month);
  const monthByCategory = new Map(monthReads.map((p) => [p.categoryId, p] as const));

  const reads: CategoryPeriodRead[] = categories.map((cat) => {
    if (cat.envelope === null) {
      const pva = monthByCategory.get(cat.id);
      return {
        categoryId: cat.id,
        categoryName: cat.name,
        colorKey: cat.colorKey,
        hasEnvelope: false,
        budgetCents: 0,
        spentCents: pva?.actual ?? ZERO,
      };
    }
    const window = envelopePeriodWindow(cat.cadence, today);
    if (window.cadence === 'weekly') {
      const st = store.getEnvelopeWeekState(cat.id, window.weekStart);
      return {
        categoryId: cat.id,
        categoryName: cat.name,
        colorKey: cat.colorKey,
        hasEnvelope: true,
        budgetCents: st.configuredBudget,
        spentCents: st.spent,
      };
    }
    const pva = monthByCategory.get(cat.id);
    return {
      categoryId: cat.id,
      categoryName: cat.name,
      colorKey: cat.colorKey,
      hasEnvelope: true,
      budgetCents: pva?.planned ?? ZERO,
      spentCents: pva?.actual ?? ZERO,
    };
  });

  const assembly = assemblePondRing(reads);
  // Same cadence-resolved reads, reshaped for GoalTrackerCard (unchanged
  // downstream consumer expecting the full CategoryConfig per row).
  const slices: Slice[] = categories.map((cat, i) => ({
    cat,
    planned: cents(reads[i].budgetCents),
    actual: cents(reads[i].spentCents),
  }));

  const duckCount = flock?.ducks.length ?? 0;
  const flockLine = flockCountLabel(duckCount);

  return (
    <Screen title="The Pond">
      {/* Day one (§3.3): introduces the starter duck and the three-goal rule.
          Shows ONLY the intro box's goal checkboxes — the live GoalTrackerCard
          is hidden below so a fresh user never sees two stacked goal blocks
          (known issue B4). */}
      {dayOne ? (
        <PixelBox style={styles.dayOneBox}>
          <View style={styles.dayOneRoot}>
            <DuckSprite accessoryTier={flock?.accessoryTier ?? 0} scale={6} animation="idle" />
            <Text style={styles.dayOneMessage}>
              Meet your first duck, it's yours from day one. Hit all three goals this month and a
              second one waddles in.
            </Text>
            <View style={styles.dayOneGoals}>
              <GoalRow ok={false} pending label="Fixed bills" detail="not evaluated yet" />
              <GoalRow ok={false} pending label="Variable budgets" detail="not evaluated yet" />
              <GoalRow ok={false} pending label="Savings" detail="not evaluated yet" />
            </View>
          </View>
          <View style={styles.dayOneAction}>
            <HardButton
              label="How ducks work"
              variant="ghost"
              onPress={() => setHowDucksWork(true)}
              accessibilityLabel="Learn how ducks work"
            />
          </View>
        </PixelBox>
      ) : null}

      {/* The Pond, redrawn (§2.2): a thin 48-block envelope ring around the
          wandering-duck pond. Ring band sits at ~radius 148-156 of a 312px
          container; the pond is sized well inside that hole, so ducks stay
          pressable purely through layout — no overlap hacks. */}
      <PixelBox style={styles.ringBox}>
        <View style={styles.ringWrap}>
          <EnvelopeRing envelopes={assembly.ringEnvelopes} size={RING_SIZE} />
          <View style={styles.pondCenterWrap} pointerEvents="box-none">
            {flock ? (
              <PondView
                ducks={flock.ducks}
                accessoryTier={flock.accessoryTier}
                size={POND_SIZE}
                onDuckPress={openName}
              />
            ) : null}
          </View>
        </View>
        {flock && flock.ducks.length > 0 ? (
          <Text style={styles.nameHint}>Tap a duck to name it</Text>
        ) : null}
        <View
          style={styles.statsRow}
          accessible
          accessibilityLabel={`${flockLine}. ${formatCents(assembly.totalSpentCents)} of ${formatCents(
            assembly.totalBudgetCents,
          )} spent this period.`}
        >
          <Text style={styles.flockCount}>{flockLine.toUpperCase()}</Text>
          <Row>
            <Text style={styles.periodSpendAccent}>{formatCents(assembly.totalSpentCents)}</Text>
            <Text style={styles.periodSpendMuted}> of {formatCents(assembly.totalBudgetCents)} spent</Text>
          </Row>
        </View>
      </PixelBox>

      {/* Live goal tracker with early warnings (§6) — day one shows its own
          checkboxes above instead, never both at once. */}
      {dayOne ? null : <GoalTrackerCard slices={slices} month={month} />}

      {/* Legend: tap-free ruled list of plan-vs-actual dollars, every category
          (fixed included), matching the mockup's "Fixed / Food / Fun / Transit". */}
      <SectionLabel>Categories</SectionLabel>
      <RuledList<PondLegendRow>
        data={assembly.legend}
        keyExtractor={(r) => r.categoryId}
        renderRow={(r) => (
          <Row style={styles.legendRow}>
            <CategoryChip colorKey={r.colorKey} />
            <Text
              style={styles.legendName}
              accessibilityLabel={`${r.categoryName}: ${formatCents(r.actual)} of ${formatCents(r.planned)} planned`}
            >
              {r.categoryName}
            </Text>
            <Text style={styles.legendNums}>
              {formatCents(r.actual)} / {formatCents(r.planned)}
            </Text>
          </Row>
        )}
      />

      {/* Name-a-duck prompt (§6). */}
      <Modal
        visible={naming !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setNaming(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalScrim} />
          <PixelBox style={styles.modalBox}>
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
            <Row style={styles.modalActions}>
              <HardButton
                label="Cancel"
                variant="ghost"
                onPress={() => setNaming(null)}
                accessibilityLabel="Cancel naming"
              />
              <HardButton
                label="Save"
                onPress={() => {
                  void commitName();
                }}
                accessibilityLabel="Save duck name"
              />
            </Row>
          </PixelBox>
        </View>
      </Modal>

      {/* "How ducks work" explainer (§3.3 day one), earning-framed rules from
          the duck economy (handoff v3 §1.1). Plain read-only PixelBox. */}
      <Modal
        visible={howDucksWork}
        transparent
        animationType="fade"
        onRequestClose={() => setHowDucksWork(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalScrim} />
          <PixelBox style={styles.modalBox}>
            <Text style={styles.modalTitle}>How ducks work</Text>
            <RuledList<{ id: string; text: string }>
              data={DUCK_RULES}
              keyExtractor={(rule) => rule.id}
              renderRow={(rule) => (
                <Text style={styles.ruleText} accessibilityLabel={rule.text}>
                  {rule.text}
                </Text>
              )}
            />
            <Row style={styles.modalActions}>
              <HardButton
                label="Got it"
                onPress={() => setHowDucksWork(false)}
                accessibilityLabel="Close how ducks work"
              />
            </Row>
          </PixelBox>
        </View>
      </Modal>
    </Screen>
  );
}

/** Earning-framed duck rules for the "How ducks work" explainer (§1.1). */
const DUCK_RULES: ReadonlyArray<{ id: string; text: string }> = [
  {
    id: 'starter',
    text: 'Your first duck is yours from day one. The pond is never empty.',
  },
  {
    id: 'gain',
    text: 'Hit all three goals in a month, bills paid on time, every envelope under budget, and savings on target, and you earn a new duck.',
  },
  {
    id: 'hold',
    text: 'Hit one or two of three goals and your flock holds steady. A partial month is never a loss.',
  },
  {
    id: 'lose',
    text: 'Miss all three goals in a month and one duck waddles off. Only a fully missed month costs you a duck.',
  },
];

/**
 * Live duck-goal tracker: fixed bills paid, variable envelopes vs plan,
 * savings so far — with early warnings ("Gas at 96%") so ducks are saveable.
 */
function GoalTrackerCard({ slices, month }: { slices: Slice[]; month: string }) {
  const store = useStore();
  const [bills, setBills] = useState<{ expected: number; paid: number } | null>(null);
  const [savings, setSavings] = useState<Cents | null>(null);

  useEffect(() => {
    let alive = true;
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

  const variable = slices.filter((r) => r.cat.envelope !== null);
  const over = variable.filter((r) => r.planned > 0 && r.actual > r.planned);
  const warnings = variable
    .filter((r) => r.planned > 0 && r.actual <= r.planned && r.actual >= 0.9 * r.planned)
    .map((r) => `${r.cat.name} at ${Math.round((r.actual / r.planned) * 100)}%`);

  return (
    <>
      <SectionLabel>Live duck goals</SectionLabel>
      <PixelBox>
        <GoalRow
          ok={bills !== null && bills.paid >= bills.expected}
          pending={bills === null}
          label="Fixed bills"
          detail={bills ? `${bills.paid} of ${bills.expected} paid` : 'checking…'}
        />
        <GoalRow
          ok={over.length === 0}
          label="Variable budgets"
          detail={
            over.length === 0
              ? 'all envelopes within plan'
              : `over in ${over.map((r) => r.cat.name).join(', ')}`
          }
        />
        <GoalRow
          ok={savings !== null && savings > 0}
          pending={savings === null}
          label="Savings"
          detail={savings !== null ? `${formatCents(savings)} saved this month` : 'checking…'}
        />
        {warnings.length > 0 ? (
          <Text style={styles.warnText} accessibilityLiveRegion="polite">
            Early warning: {warnings.join(' · ')}
          </Text>
        ) : null}
      </PixelBox>
    </>
  );
}

function GoalRow({
  ok,
  pending = false,
  label,
  detail,
}: {
  ok: boolean;
  pending?: boolean;
  label: string;
  detail: string;
}) {
  const stateWord = pending ? 'checking' : ok ? 'on track' : 'at risk';
  return (
    <Row
      style={styles.goalRow}
      // Color square + explicit text so the state is never color-only.
    >
      <View
        style={[
          styles.goalDot,
          { backgroundColor: pending ? color.textMuted : ok ? color.accent : color.danger },
        ]}
      />
      <Text style={styles.goalLabel}>{label}</Text>
      <Text style={styles.goalDetail} accessibilityLabel={`${label}: ${stateWord}, ${detail}`}>
        {stateWord} · {detail}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  dayOneBox: {
    marginTop: space.sm,
  },
  dayOneRoot: {
    alignItems: 'center',
    gap: space.md,
  },
  dayOneMessage: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
    textAlign: 'center',
    lineHeight: typo.body.fontSize * 1.5,
    maxWidth: 260,
  },
  dayOneGoals: {
    width: '100%',
    gap: space.xs,
  },
  dayOneAction: {
    marginTop: space.md,
    alignItems: 'center',
  },
  ruleText: {
    color: color.textSecondary,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
    lineHeight: typo.body.fontSize * 1.5,
    paddingVertical: space.xs,
  },
  ringBox: {
    marginTop: space.sm,
    alignItems: 'center',
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pondCenterWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameHint: {
    marginTop: space.sm,
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    textAlign: 'center',
  },
  statsRow: {
    marginTop: space.md,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  flockCount: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
  periodSpendAccent: {
    color: color.accent,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.title.fontWeight,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
  periodSpendMuted: {
    color: color.text,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.title.fontWeight,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
  legendRow: {
    justifyContent: 'space-between',
  },
  legendName: {
    flex: 1,
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
    marginLeft: space.sm,
  },
  legendNums: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
  goalRow: {
    paddingVertical: space.xs,
  },
  goalDot: {
    width: 10,
    height: 10,
    marginRight: space.sm,
  },
  goalLabel: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
    width: 120,
  },
  goalDetail: {
    flex: 1,
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
  },
  warnText: {
    marginTop: space.sm,
    color: color.warn,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.body.fontWeight,
  },
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
  },
  modalTitle: {
    color: color.text,
    fontSize: typo.title.fontSize,
    fontWeight: typo.title.fontWeight,
    marginBottom: space.md,
  },
  input: {
    backgroundColor: color.surfaceDeep,
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    color: color.text,
    fontSize: typo.body.fontSize,
    fontVariant: [...typo.tabularNums.fontVariant],
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
  },
  modalActions: {
    marginTop: space.md,
    gap: space.sm,
  },
});

export default PondScreen;
