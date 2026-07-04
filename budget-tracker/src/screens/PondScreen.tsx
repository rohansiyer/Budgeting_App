import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { G, Circle } from 'react-native-svg';
import * as tokens from '../theme/tokens';
import { Cents, formatCents, sumCents, ZERO } from '../lib/money';
import { PixelBox, RuledList, CategoryChip } from '../components/kit';
import PondView from '../ducks/PondView';
import { useFlock } from '../ducks/appEngine';
import { Screen, SectionLabel, MoneyText, Row } from '../components/Primitives';
import { useStore } from '../providers/StoreProvider';
import { todayISO, monthKeyOf, monthTitle } from '../format/dates';
import type { CategoryConfig } from '../types/contracts';

const { color, space, pixel } = tokens;
const typo = tokens.type;

const SIZE = 250;
const STROKE = 22;
const OUTER_R = (SIZE - STROKE) / 2;
const INNER_R = OUTER_R - STROKE - 5;
const OUTER_C = 2 * Math.PI * OUTER_R;
const INNER_C = 2 * Math.PI * INNER_R;

interface Slice {
  cat: CategoryConfig;
  planned: Cents;
  actual: Cents;
}

export function PondScreen() {
  const store = useStore();
  const flock = useFlock();
  const today = todayISO();
  const month = monthKeyOf(today);

  const categories = store.listCategories();
  const slices: Slice[] = store
    .getPlanVsActual(month)
    .map((row) => ({
      cat: categories.find((c) => c.id === row.categoryId),
      planned: row.planned,
      actual: row.actual,
    }))
    .filter((r): r is Slice => r.cat !== undefined);

  const totalPlanned = sumCents(slices.map((r) => r.planned));
  const totalActual = sumCents(slices.map((r) => r.actual));

  return (
    <Screen title="The Pond">
      {/* Dual-layer donut: INNER = plan, OUTER = month-to-date actual (§4.4). */}
      <PixelBox style={styles.donutBox}>
        <View style={styles.donutWrap}>
          <Svg width={SIZE} height={SIZE}>
            <G rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}>
              <Circle cx={SIZE / 2} cy={SIZE / 2} r={OUTER_R} stroke={color.surfaceDeep} strokeWidth={STROKE} fill="none" />
              <Circle cx={SIZE / 2} cy={SIZE / 2} r={INNER_R} stroke={color.surfaceDeep} strokeWidth={STROKE} fill="none" />
              {renderRing(slices, totalPlanned, INNER_R, INNER_C, 'planned', 0.45)}
              {renderRing(slices, totalPlanned, OUTER_R, OUTER_C, 'actual', 1)}
            </G>
          </Svg>
          <View style={styles.center} pointerEvents="box-none">
            {flock ? (
              <PondView ducks={flock.ducks} accessoryTier={flock.accessoryTier} size={INNER_R * 1.7} />
            ) : null}
          </View>
        </View>
        <View
          style={styles.totals}
          accessible
          accessibilityLabel={`Month to date: spent ${formatCents(totalActual)} of ${formatCents(totalPlanned)} planned`}
        >
          <Text style={styles.totalsLabel}>SPENT / PLANNED · {monthTitle(today).toUpperCase()}</Text>
          <Row>
            <MoneyText amount={totalActual} kind="spend" size={typo.title.fontSize} />
            <Text style={styles.totalsSlash}> / </Text>
            <MoneyText amount={totalPlanned} size={typo.title.fontSize} />
          </Row>
        </View>
      </PixelBox>

      {/* Live goal tracker with early warnings (§6). */}
      <GoalTrackerCard slices={slices} month={month} />

      {/* Legend: tap-free ruled list of plan-vs-actual dollars. */}
      <SectionLabel>Categories</SectionLabel>
      <RuledList<Slice>
        data={slices}
        keyExtractor={(r) => r.cat.id}
        renderRow={(r) => (
          <Row
            style={styles.legendRow}
            // Rows are informational; label carries the color-only identity.
          >
            <CategoryChip colorKey={r.cat.colorKey} />
            <Text style={styles.legendName} accessibilityLabel={`${r.cat.name}: ${formatCents(r.actual)} of ${formatCents(r.planned)} planned`}>
              {r.cat.name}
            </Text>
            <Text style={styles.legendNums}>
              {formatCents(r.actual)} / {formatCents(r.planned)}
            </Text>
          </Row>
        )}
      />
    </Screen>
  );
}

function renderRing(
  slices: Slice[],
  denominator: Cents,
  radius: number,
  circumference: number,
  field: 'planned' | 'actual',
  opacity: number,
) {
  const denom = Math.max(1, denominator);
  let cumulative = 0;
  return slices.map((r) => {
    const value = field === 'planned' ? r.planned : r.actual;
    const fraction = Math.min(1, value / denom); // display ratio only
    const dash = fraction * circumference;
    const offset = -cumulative * circumference;
    cumulative += fraction;
    if (dash <= 0) return null;
    return (
      <Circle
        key={`${field}_${r.cat.id}`}
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={radius}
        stroke={color.category[r.cat.colorKey]}
        strokeWidth={STROKE}
        strokeOpacity={opacity}
        strokeDasharray={`${dash} ${circumference}`}
        strokeDashoffset={offset}
        fill="none"
      />
    );
  });
}

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
      <SectionLabel>Duck goals — live</SectionLabel>
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
  donutBox: {
    marginTop: space.sm,
    alignItems: 'center',
  },
  donutWrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totals: {
    marginTop: space.md,
    alignItems: 'center',
  },
  totalsLabel: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    marginBottom: space.xs,
  },
  totalsSlash: {
    color: color.textMuted,
    fontSize: typo.title.fontSize,
    fontWeight: typo.caption.fontWeight,
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
});

export default PondScreen;
