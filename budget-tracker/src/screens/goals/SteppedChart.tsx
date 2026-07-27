/**
 * Stepped savings trend chart (v0.3 handoff §3.9, mockup "Savings · stepped
 * trend + 45% projection"). Solid accent history segment, 45%-opacity accent
 * projection segment ("if your last 3 months hold"), a vertical hairline at
 * today, and a dashed horizontal hairline at the goal target when one
 * exists. The geometry itself is steppedChart.logic's buildStepChart (fully
 * unit-tested there); this component only reads dates for the axis labels
 * and draws the SVG.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import * as tokens from '../../theme/tokens';
import { formatCents, ZERO, type Cents } from '../../lib/money';
import { buildStepChart } from './steppedChart.logic';
import type { ProjectionPoint } from '../../projections';
import type { ISODate } from '../../types/contracts';

const { color, space } = tokens;
const typo = tokens.type;
const font = tokens.font;

// Virtual coordinate space the geometry is computed in; the <Svg> scales
// this to the container width via a viewBox (matches the mockup's 328x140).
const CHART_WIDTH = 328;
const CHART_HEIGHT = 140;

const MONTHS_SHORT = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];
function monthShortUpper(iso: ISODate): string {
  return MONTHS_SHORT[Number(iso.slice(5, 7)) - 1];
}

export interface SteppedChartProps {
  /** Oldest -> today's week, inclusive of today's balance as the last point. */
  history: readonly ProjectionPoint[];
  /** Today -> future weeks. Element 0 is expected to equal history's last
   * element (the shared "today" boundary). */
  projection: readonly ProjectionPoint[];
  targetCents: Cents | null;
}

export function SteppedChart({ history, projection, targetCents }: SteppedChartProps) {
  const chart = buildStepChart({
    history: history.map((p) => p.projectedCents),
    projection: projection.map((p) => p.projectedCents),
    targetCents,
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
  });

  const currentBalance =
    history.length > 0
      ? history[history.length - 1].projectedCents
      : (projection[0]?.projectedCents ?? ZERO);
  const startLabel = history.length > 0 ? monthShortUpper(history[0].weekStartISO) : null;
  const endLabel =
    projection.length > 0 ? monthShortUpper(projection[projection.length - 1].weekStartISO) : null;

  return (
    <View>
      <Text style={styles.balanceLabel}>Savings balance</Text>
      <Text style={styles.balanceAmount}>{formatCents(currentBalance)}</Text>

      <Svg
        width="100%"
        height={CHART_HEIGHT}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        style={styles.svg}
      >
        {chart.targetY !== null ? (
          <Line
            x1={0}
            y1={chart.targetY}
            x2={CHART_WIDTH}
            y2={chart.targetY}
            stroke={color.hairline}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        ) : null}
        {chart.historyPath !== '' ? (
          <Path d={chart.historyPath} fill="none" stroke={color.accent} strokeWidth={3} />
        ) : null}
        {chart.projectionPath !== '' ? (
          <Path
            d={chart.projectionPath}
            fill="none"
            stroke={color.accent}
            strokeWidth={3}
            opacity={0.45}
          />
        ) : null}
        <Line
          x1={chart.todayX}
          y1={0}
          x2={chart.todayX}
          y2={CHART_HEIGHT}
          stroke={color.border}
          strokeWidth={1}
        />
      </Svg>

      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>{startLabel ?? ''}</Text>
        <Text style={styles.axisLabelToday}>TODAY</Text>
        <Text style={[styles.axisLabel, styles.axisLabelEnd]}>{endLabel ?? ''}</Text>
      </View>

      <Text style={styles.caption}>if your last 3 months hold</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  balanceLabel: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
    fontFamily: typo.sectionLabel.fontFamily,
    marginBottom: space.xs,
  },
  balanceAmount: {
    color: color.text,
    fontSize: 28,
    fontFamily: font.monoBold,
    fontVariant: [...typo.tabularNums.fontVariant],
    letterSpacing: -0.5,
    marginBottom: space.md,
  },
  svg: {
    marginBottom: space.sm,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisLabel: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    fontFamily: typo.sectionLabel.fontFamily,
  },
  axisLabelEnd: {
    color: color.accent,
    opacity: 0.7,
  },
  axisLabelToday: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    fontFamily: typo.sectionLabel.fontFamily,
  },
  caption: {
    color: color.textSecondary,
    fontSize: typo.body.fontSize,
    fontWeight: typo.caption.fontWeight,
    fontFamily: typo.caption.fontFamily,
    lineHeight: 20,
    marginTop: space.sm,
  },
});

export default SteppedChart;
