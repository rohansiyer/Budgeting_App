import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, space, type, metrics } from '../theme/tokens';
import { PixelBox } from '../components/kit';
import { Screen, SectionLabel } from '../components/Primitives';
import { useStore } from '../providers/StoreProvider';
import { useAppShell } from '../providers/AppShell';
import { monthTitle, dayNumber } from '../format/dates';
import type { DaySpend, ISODate } from '../types/contracts';

const WEEK_HEADER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Monday-based weekday index (0 = Monday). */
function mondayIndex(isoDate: ISODate): number {
  const [y, m, d] = isoDate.split('-').map((n) => parseInt(n, 10));
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun..6 Sat
  return wd === 0 ? 6 : wd - 1;
}

export function CalendarScreen() {
  const store = useStore();
  const { openDay } = useAppShell();
  const today = store.getToday();
  const heatmap = store.getMonthHeatmap(today);
  const leadBlanks = heatmap.length > 0 ? mondayIndex(heatmap[0].date) : 0;

  const cells: (DaySpend | null)[] = [
    ...Array.from({ length: leadBlanks }, () => null),
    ...heatmap,
  ];

  return (
    <Screen title={monthTitle(today)}>
      <PixelBox padding={space.lg} style={styles.calBox}>
        <View style={styles.weekHeader}>
          {WEEK_HEADER.map((w, i) => (
            <Text key={i} style={styles.weekHeaderCell}>
              {w}
            </Text>
          ))}
        </View>
        <View style={styles.grid}>
          {cells.map((cell, i) =>
            cell ? (
              <DayCell
                key={cell.date}
                cell={cell}
                isToday={cell.date === today}
                onPress={() => openDay(cell.date)}
                formatMoney={store.formatMoney}
              />
            ) : (
              <View key={`blank_${i}`} style={styles.cell} />
            )
          )}
        </View>
      </PixelBox>

      <SectionLabel>Legend</SectionLabel>
      <PixelBox padding={space.lg}>
        <LegendRow swatch={<View style={[styles.legendSwatch, { backgroundColor: colors.accent.base }]} />} label="Spending intensity (darker = more)" />
        <LegendRow swatch={<View style={[styles.legendRing]} />} label="Payday" />
        <LegendRow swatch={<View style={[styles.legendSwatch, { backgroundColor: colors.status.spend }]} />} label="Fixed bill spike" />
      </PixelBox>
    </Screen>
  );
}

function DayCell({
  cell,
  isToday,
  onPress,
  formatMoney,
}: {
  cell: DaySpend;
  isToday: boolean;
  onPress: () => void;
  formatMoney: (n: number) => string;
}) {
  const border = cell.hasFixedSpike
    ? colors.status.spend
    : isToday
    ? colors.text.primary
    : colors.border.hairline;
  return (
    <Pressable
      style={styles.cell}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${dayNumber(cell.date)}: spent ${formatMoney(cell.spent)}${cell.isPayday ? ', payday' : ''}${cell.hasFixedSpike ? ', fixed bill' : ''}`}
    >
      <View style={[styles.cellInner, { borderColor: border }]}>
        {/* intensity fill via opacity (no colour literal) */}
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: colors.accent.base, opacity: 0.12 + cell.intensity * 0.68 },
          ]}
          pointerEvents="none"
        />
        <Text style={[styles.cellNum, isToday && styles.cellNumToday]}>{dayNumber(cell.date)}</Text>
        {cell.isPayday ? <View style={styles.paydayRing} pointerEvents="none" /> : null}
      </View>
    </Pressable>
  );
}

function LegendRow({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={styles.legendRow}>
      {swatch}
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const CELL_PCT = '14.2857%' as const;

const styles = StyleSheet.create({
  calBox: {
    marginTop: space.sm,
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: space.sm,
  },
  weekHeaderCell: {
    width: CELL_PCT,
    textAlign: 'center',
    color: colors.text.muted,
    fontFamily: type.family.mono,
    fontSize: type.size.micro,
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: CELL_PCT,
    aspectRatio: 1,
    padding: 2,
  },
  cellInner: {
    flex: 1,
    borderWidth: metrics.hairline,
    borderRadius: metrics.radius,
    backgroundColor: colors.bg.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cellNum: {
    color: colors.text.primary,
    fontFamily: type.family.mono,
    fontSize: type.size.caption,
  },
  cellNumToday: {
    fontWeight: type.weight.bold,
  },
  paydayRing: {
    position: 'absolute',
    bottom: 3,
    width: 6,
    height: 6,
    borderRadius: metrics.radius,
    borderWidth: metrics.hairline,
    borderColor: colors.status.payday,
    backgroundColor: colors.status.payday,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.md,
  },
  legendSwatch: {
    width: 16,
    height: 16,
    borderRadius: metrics.radius,
    marginRight: space.md,
  },
  legendRing: {
    width: 16,
    height: 16,
    borderRadius: metrics.radius,
    borderWidth: metrics.hairline * 2,
    borderColor: colors.status.payday,
    marginRight: space.md,
  },
  legendLabel: {
    color: colors.text.secondary,
    fontFamily: type.family.text,
    fontSize: type.size.body,
  },
});

export default CalendarScreen;
