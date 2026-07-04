import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { G, Circle } from 'react-native-svg';
import { colors, categoryColors, metrics, space, type } from '../theme/tokens';
import { PixelBox, BlockMeter, PondCenterSlot } from '../components/kit';
import { Screen, SectionLabel, MoneyText } from '../components/Primitives';
import { useStore } from '../providers/StoreProvider';
import type { PlanVsActualSlice } from '../types/contracts';

const SIZE = 240;
const STROKE = 26;
const OUTER_R = (SIZE - STROKE) / 2;
const INNER_R = OUTER_R - STROKE - 6;
const OUTER_C = 2 * Math.PI * OUTER_R;
const INNER_C = 2 * Math.PI * INNER_R;

export function PondScreen() {
  const store = useStore();
  const slices = store.getPlanVsActual(store.getToday());
  const goal = store.getGoal();

  const totalPlanned = Math.max(1, slices.reduce((s, c) => s + c.planned, 0));
  const totalActual = slices.reduce((s, c) => s + c.actual, 0);

  return (
    <Screen title="Pond">
      <PixelBox padding={space.lg} style={styles.donutBox}>
        <View style={styles.donutWrap}>
          <Svg width={SIZE} height={SIZE}>
            <G rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}>
              {/* base tracks */}
              <Circle cx={SIZE / 2} cy={SIZE / 2} r={OUTER_R} stroke={colors.bg.sunken} strokeWidth={STROKE} fill="none" />
              <Circle cx={SIZE / 2} cy={SIZE / 2} r={INNER_R} stroke={colors.bg.sunken} strokeWidth={STROKE} fill="none" />
              {/* outer = planned (semi-transparent) */}
              {renderRing(slices, totalPlanned, OUTER_R, OUTER_C, STROKE, 'planned', 0.4)}
              {/* inner = actual (solid) */}
              {renderRing(slices, totalPlanned, INNER_R, INNER_C, STROKE, 'actual', 1)}
            </G>
          </Svg>
          {/* Team 4 duck slot at the pond centre */}
          <View style={styles.center} pointerEvents="box-none">
            <PondCenterSlot size={INNER_R * 1.4} />
          </View>
        </View>

        <View style={styles.totals}>
          <Text style={styles.totalsLabel}>SPENT / PLANNED</Text>
          <View style={styles.totalsRow}>
            <MoneyText amount={totalActual} format={store.formatMoney} kind="spend" size={type.size.title} />
            <Text style={styles.totalsSlash}> / </Text>
            <MoneyText amount={totalPlanned} format={store.formatMoney} size={type.size.title} />
          </View>
        </View>
      </PixelBox>

      {/* Goal tracker */}
      {goal ? (
        <>
          <SectionLabel>Goal tracker</SectionLabel>
          <PixelBox padding={space.lg} fill={colors.bg.panel}>
            <BlockMeter
              label={goal.name}
              value={goal.saved}
              max={goal.target}
              blocks={10}
              state="bonus"
              fillColor={colors.accent.pond}
              valueText={`${store.formatMoney(goal.saved)} of ${store.formatMoney(goal.target)} · ${Math.round((goal.saved / goal.target) * 100)}%`}
            />
          </PixelBox>
        </>
      ) : null}

      {/* Legend */}
      <SectionLabel>Categories</SectionLabel>
      <PixelBox padding={space.lg}>
        {slices.map((c, i) => (
          <View key={c.categoryId} style={[styles.legendRow, i > 0 && styles.legendRuled]}>
            <View style={[styles.swatch, { backgroundColor: categoryColors[c.colorKey] }]} />
            <Text style={styles.legendName}>{c.name}</Text>
            <Text style={styles.legendNums}>
              {store.formatMoney(c.actual)} / {store.formatMoney(c.planned)}
            </Text>
          </View>
        ))}
      </PixelBox>
    </Screen>
  );
}

function renderRing(
  slices: PlanVsActualSlice[],
  denominator: number,
  radius: number,
  circumference: number,
  stroke: number,
  field: 'planned' | 'actual',
  opacity: number
) {
  let cumulative = 0;
  return slices.map((c) => {
    const value = field === 'planned' ? c.planned : c.actual;
    const fraction = Math.min(1, value / denominator);
    const dash = fraction * circumference;
    const offset = -cumulative * circumference;
    cumulative += fraction;
    if (dash <= 0) return null;
    return (
      <Circle
        key={`${field}_${c.categoryId}`}
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={radius}
        stroke={categoryColors[c.colorKey]}
        strokeWidth={stroke}
        strokeOpacity={opacity}
        strokeDasharray={`${dash} ${circumference}`}
        strokeDashoffset={offset}
        fill="none"
      />
    );
  });
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
    marginTop: space.lg,
    alignItems: 'center',
  },
  totalsLabel: {
    color: colors.text.secondary,
    fontFamily: type.family.mono,
    fontSize: type.size.micro,
    letterSpacing: 2,
    marginBottom: space.xs,
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalsSlash: {
    color: colors.text.muted,
    fontFamily: type.family.mono,
    fontSize: type.size.title,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
  },
  legendRuled: {
    borderTopWidth: metrics.hairline,
    borderTopColor: colors.border.hairline,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: metrics.radius,
    marginRight: space.md,
  },
  legendName: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: type.family.text,
    fontSize: type.size.body,
  },
  legendNums: {
    color: colors.text.secondary,
    fontFamily: type.family.mono,
    fontSize: type.size.caption,
  },
});

export default PondScreen;
