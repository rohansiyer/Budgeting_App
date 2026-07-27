import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as tokens from '../theme/tokens';
import { formatCents, ZERO } from '../lib/money';
import { Screen, SectionLabel, Row } from '../components/Primitives';
import { EmptyState, HardButton } from '../components/kit';
import { DuckSprite } from '../ducks/DuckSprite';
import { useStore } from '../providers/StoreProvider';
import { useAppShell } from '../providers/AppShell';
import {
  isCalendarMonthEmpty,
  shiftMonthKey,
  clampMonthKey,
  canGoToPrevMonth,
  canGoToNextMonth,
} from './CalendarScreen.logic';
import {
  todayISO,
  monthKeyOf,
  monthRange,
  monthTitle,
  eachDay,
  dayOfWeek,
  dayNumber,
} from '../format/dates';
import type { ISODate, MonthKey } from '../types/contracts';

const { color, space, pixel } = tokens;
const typo = tokens.type;

const WEEK_HEADER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const CELL_PCT = '14.2857%' as const;

/** Monday-based column index (0 = Monday). */
function mondayIndex(isoDate: ISODate): number {
  const wd = dayOfWeek(isoDate);
  return wd === 0 ? 6 : wd - 1;
}

export function CalendarScreen() {
  const store = useStore();
  const { openDay } = useAppShell();
  const today = todayISO();
  const chapter = store.getActiveChapter();
  const minMonth = monthKeyOf(chapter.startedAt);
  const maxMonth = monthKeyOf(today);

  // F4-6: a viewed month independent of today, clamped to
  // [chapter start month, current month] — never a phantom month before the
  // active chapter began or ahead of the present.
  const [viewedMonth, setViewedMonth] = useState<MonthKey>(() =>
    clampMonthKey(maxMonth, minMonth, maxMonth),
  );
  const viewedISO = `${viewedMonth}-01`;
  const range = monthRange(viewedISO);

  const canPrev = canGoToPrevMonth(viewedMonth, minMonth);
  const canNext = canGoToNextMonth(viewedMonth, maxMonth);
  const goPrev = () => setViewedMonth((m) => clampMonthKey(shiftMonthKey(m, -1), minMonth, maxMonth));
  const goNext = () => setViewedMonth((m) => clampMonthKey(shiftMonthKey(m, 1), minMonth, maxMonth));

  const days = eachDay(range);
  const totals = store.getDaySpendTotals(range);
  const monthTxnCount = store.getTransactions(range).length;
  const isEmpty = isCalendarMonthEmpty(monthTxnCount);
  const paydays = useMemo(() => new Set(store.getPaydays(range)), [store, range.from, range.to]);
  const fixedHitDays = useMemo(() => {
    // includeArchived: with month navigation (F4-6) this screen renders PAST
    // months, and an archived fixed category's historical bill dots must not
    // vanish (consistent with the store's history-aware
    // getMonthFixedBillStatus — budget basis only zeroes AFTER archival).
    // Dots derive from real expense rows in the viewed range, and the store
    // rejects new expenses on archived categories, so this cannot invent
    // present/future dots for an archived category.
    const fixedIds = new Set(
      store
        .listCategories({ includeArchived: true })
        .filter((c) => c.fixed)
        .map((c) => c.id),
    );
    const out = new Set<ISODate>();
    for (const t of store.getTransactions(range)) {
      if (t.kind === 'expense' && fixedIds.has(t.categoryId)) out.add(t.date);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, range.from, range.to]);

  const maxSpent = Math.max(1, ...Array.from(totals.values()));
  const leadBlanks = mondayIndex(days[0]);

  return (
    <Screen title={monthTitle(viewedISO)}>
      <Row style={styles.monthNav}>
        <HardButton
          label="< Prev"
          variant="ghost"
          disabled={!canPrev}
          onPress={goPrev}
          accessibilityLabel="Previous month"
        />
        <HardButton
          label="Next >"
          variant="ghost"
          disabled={!canNext}
          onPress={goNext}
          accessibilityLabel="Next month"
        />
      </Row>
      <View style={styles.weekHeader}>
        {WEEK_HEADER.map((w, i) => (
          <Text key={i} style={styles.weekHeaderCell}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {Array.from({ length: leadBlanks }, (_, i) => (
          <View key={`blank_${i}`} style={styles.cell} />
        ))}
        {days.map((d) => {
          const spent = totals.get(d) ?? ZERO;
          const intensity = spent / maxSpent; // 0..1 display ratio only
          const isPayday = paydays.has(d);
          const isFixedHit = fixedHitDays.has(d);
          const isToday = d === today;
          return (
            <Pressable
              key={d}
              style={styles.cell}
              onPress={() => openDay(d)}
              accessibilityRole="button"
              accessibilityLabel={`${dayNumber(d)}: spent ${formatCents(spent)}${isPayday ? ', payday' : ''}${isFixedHit ? ', fixed bill' : ''}${isToday ? ', today' : ''}. Opens day detail.`}
            >
              <View
                style={[
                  styles.cellInner,
                  {
                    borderColor: isFixedHit
                      ? color.danger
                      : isToday
                        ? color.text
                        : color.hairline,
                  },
                ]}
              >
                {/* Heatmap fill: token spendFill at spend-scaled opacity. */}
                {spent > 0 ? (
                  <View
                    style={[
                      StyleSheet.absoluteFillObject,
                      { backgroundColor: color.spendFill, opacity: 0.2 + intensity * 0.65 },
                    ]}
                    pointerEvents="none"
                  />
                ) : null}
                <Text style={[styles.cellNum, isToday && styles.cellNumToday]}>
                  {dayNumber(d)}
                </Text>
                {/* Mint payday ring. */}
                {isPayday ? <View style={styles.paydayRing} pointerEvents="none" /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {isEmpty ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            message="No spending recorded yet. Add your first expense and this calendar starts filling in."
            actionLabel="Add expense"
            onAction={() => openDay(today)}
            renderDuck={(props) => <DuckSprite {...props} />}
            accessibilityLabel="No spending recorded yet"
          />
        </View>
      ) : (
        <>
          <SectionLabel>Legend</SectionLabel>
          <LegendRow swatch={<View style={styles.legendHeat} />} label="Fill intensity = spending" />
          <LegendRow swatch={<View style={styles.legendRing} />} label="Mint ring = payday" />
          <LegendRow swatch={<View style={styles.legendFixed} />} label="Coral edge = fixed bill spike" />
        </>
      )}
    </Screen>
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

const styles = StyleSheet.create({
  monthNav: {
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  emptyWrap: {
    marginTop: space.md,
  },
  weekHeader: {
    flexDirection: 'row',
    // Full-bleed to stay column-aligned with the full-bleed grid below.
    marginHorizontal: -space.md,
    marginTop: space.sm,
    marginBottom: space.xs,
  },
  weekHeaderCell: {
    width: CELL_PCT,
    textAlign: 'center',
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Full-bleed: reclaim the Screen's side padding so each of the 7 columns
    // gets the whole device width (a11y-v03 fix: 375px / 7 = 53px, 360px / 7 =
    // 51px; the padded grid landed under the 48px tap-target floor).
    marginHorizontal: -space.md,
  },
  cell: {
    width: CELL_PCT,
    // Hard 48px tap-target floor in the vertical axis regardless of device
    // width (replaces aspectRatio 1, which shrank with the column).
    minHeight: 48,
    padding: 2,
  },
  cellInner: {
    flex: 1,
    borderWidth: pixel.hairlineWidth,
    backgroundColor: color.surfaceDeep,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cellNum: {
    color: color.text,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
  cellNumToday: {
    fontWeight: typo.title.fontWeight,
  },
  paydayRing: {
    position: 'absolute',
    bottom: 3,
    width: 7,
    height: 7,
    borderWidth: pixel.hairlineWidth * 2,
    borderColor: color.accent,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  legendHeat: {
    width: 14,
    height: 14,
    backgroundColor: color.spendFill,
    marginRight: space.sm,
  },
  legendRing: {
    width: 14,
    height: 14,
    borderWidth: pixel.hairlineWidth * 2,
    borderColor: color.accent,
    marginRight: space.sm,
  },
  legendFixed: {
    width: 14,
    height: 14,
    borderWidth: pixel.hairlineWidth * 2,
    borderColor: color.danger,
    marginRight: space.sm,
  },
  legendLabel: {
    color: color.textSecondary,
    fontSize: typo.body.fontSize,
    fontWeight: typo.caption.fontWeight,
  },
});

export default CalendarScreen;
