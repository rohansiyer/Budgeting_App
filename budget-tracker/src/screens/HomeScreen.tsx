import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, space, type, metrics } from '../theme/tokens';
import { PixelBox, BlockMeter, HardButton, DuckChipSlot } from '../components/kit';
import { Screen, SectionLabel, MoneyText } from '../components/Primitives';
import { Sheet } from '../components/Sheet';
import { useStore } from '../providers/StoreProvider';
import { useAppShell } from '../providers/AppShell';
import { weekdayShort, dayNumber } from '../format/dates';
import type { DaySpend, EnvelopeWeekState } from '../types/contracts';

function addDaysISO(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const pad = (v: number) => (v < 10 ? `0${v}` : `${v}`);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function HomeScreen() {
  const store = useStore();
  const { openDay } = useAppShell();

  const today = store.getToday();
  const name = store.getGreetingName();
  const sts = store.getSafeToSpend(today);
  const weekStart = addDaysISO(today, -6);
  const days = store.getDaySpendTotals(weekStart, 7);
  const paydays = new Set(store.getPaydays(today));
  const envelopes = store.getEnvelopeWeekState();
  const needsReset = store.needsWeeklyReset(today);

  const [borrowFor, setBorrowFor] = useState<EnvelopeWeekState | null>(null);

  return (
    <Screen title={`${greeting()}, ${name}`} right={<DuckChipSlot />}>
      {/* Monday reset prompt */}
      {needsReset ? (
        <PixelBox fill={colors.bg.raised} borderColor={colors.accent.base} style={styles.resetBox}>
          <Text style={styles.resetTitle}>New week — settle up?</Text>
          <Text style={styles.resetBody}>
            Roll last week's leftovers into this week, or sweep them into savings.
          </Text>
          <View style={styles.resetActions}>
            <HardButton label="Roll forward" onPress={() => store.rollForward(today)} />
            <HardButton label="Sweep to savings" variant="ghost" onPress={() => store.sweepToSavings(today)} />
          </View>
        </PixelBox>
      ) : null}

      {/* Hero: safe to spend */}
      <PixelBox fill={colors.bg.panel} style={styles.hero} accessibilityLabel={`Safe to spend, ${store.formatMoney(sts.amount)} ${sts.periodLabel}`}>
        <Text style={styles.heroLabel}>SAFE TO SPEND</Text>
        <MoneyText amount={sts.amount} format={store.formatMoney} size={type.size.hero} />
        <Text style={styles.heroSub}>
          {sts.periodLabel} · {store.formatMoney(sts.perDay)}/day for {sts.daysLeft} day
          {sts.daysLeft === 1 ? '' : 's'}
        </Text>
      </PixelBox>

      {/* 7-day bars */}
      <SectionLabel>Last 7 days</SectionLabel>
      <PixelBox padding={space.lg}>
        <SevenDayBars days={days} paydays={paydays} onPick={openDay} formatMoney={store.formatMoney} />
      </PixelBox>

      {/* Envelopes */}
      <SectionLabel>Envelopes this week</SectionLabel>
      {envelopes.map((e) => (
        <PixelBox key={e.categoryId} padding={space.lg} style={styles.envBox}>
          <BlockMeter
            label={e.name}
            value={e.spent}
            max={e.planned}
            blocks={e.blocks}
            state={e.state}
            carryover={e.carryover}
            valueText={envelopeText(e, store.formatMoney)}
          />
          {(e.state === 'overflow' || e.state === 'debt') ? (
            <View style={styles.envAction}>
              <HardButton
                label="Borrow from next week"
                variant="ghost"
                onPress={() => setBorrowFor(e)}
                accessibilityHint="Opens a confirmation to move money forward"
              />
            </View>
          ) : null}
        </PixelBox>
      ))}

      {/* Borrow confirm sheet */}
      <Sheet
        visible={borrowFor !== null}
        onClose={() => setBorrowFor(null)}
        title={`Borrow for ${borrowFor?.name ?? ''}`}
      >
        <Text style={styles.borrowBody}>
          Pull {borrowFor ? store.formatMoney(borrowFor.blocks >= 8 ? 25 : 15) : ''} from next week's{' '}
          {borrowFor?.name} plan into this week? Next week's envelope shrinks by the same amount.
        </Text>
        <View style={styles.borrowActions}>
          <HardButton
            label="Confirm borrow"
            onPress={() => {
              if (borrowFor) store.borrowFromNextWeek(borrowFor.categoryId, borrowFor.blocks >= 8 ? 25 : 15);
              setBorrowFor(null);
            }}
          />
          <HardButton label="Cancel" variant="ghost" onPress={() => setBorrowFor(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function envelopeText(e: EnvelopeWeekState, fmt: (n: number) => string): string {
  const base = `${fmt(e.spent)} of ${fmt(e.planned)}`;
  switch (e.state) {
    case 'overflow':
      return `${base} · over by ${fmt(Math.abs(e.remaining))}`;
    case 'debt':
      return `${base} · carried ${fmt(e.carryover)}`;
    case 'bonus':
      return `${base} · +${fmt(e.carryover)} bonus`;
    case 'borrowed':
      return `${base} · borrowed ${fmt(e.borrowedFromNext)}`;
    case 'rolled':
      return `${base} · rolled over`;
    default:
      return `${base} · ${fmt(e.remaining)} left`;
  }
}

function SevenDayBars({
  days,
  paydays,
  onPick,
  formatMoney,
}: {
  days: DaySpend[];
  paydays: Set<string>;
  onPick: (date: string) => void;
  formatMoney: (n: number) => string;
}) {
  const maxSpent = Math.max(1, ...days.map((d) => d.spent));
  return (
    <View style={styles.barsRow}>
      {days.map((d) => {
        const pct = Math.round((d.spent / maxSpent) * 100);
        const isPayday = paydays.has(d.date);
        return (
          <Pressable
            key={d.date}
            style={styles.barCol}
            onPress={() => onPick(d.date)}
            accessibilityRole="button"
            accessibilityLabel={`${weekdayShort(d.date)} ${dayNumber(d.date)}: spent ${formatMoney(d.spent)}${isPayday ? ', payday' : ''}${d.hasFixedSpike ? ', fixed bill' : ''}`}
          >
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    height: `${Math.max(4, pct)}%`,
                    backgroundColor: d.hasFixedSpike ? colors.status.spend : colors.accent.base,
                  },
                ]}
              />
            </View>
            <Text style={styles.barDow}>{weekdayShort(d.date)[0]}</Text>
            <View
              style={[
                styles.paydayDot,
                { backgroundColor: isPayday ? colors.status.payday : colors.transparent },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  resetBox: {
    marginTop: space.sm,
    marginBottom: space.md,
  },
  resetTitle: {
    color: colors.text.primary,
    fontFamily: type.family.text,
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
  },
  resetBody: {
    color: colors.text.secondary,
    fontFamily: type.family.text,
    fontSize: type.size.body,
    marginTop: space.xs,
    marginBottom: space.md,
  },
  resetActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  hero: {
    marginTop: space.sm,
    alignItems: 'flex-start',
  },
  heroLabel: {
    color: colors.text.secondary,
    fontFamily: type.family.mono,
    fontSize: type.size.caption,
    letterSpacing: 2,
  },
  heroSub: {
    color: colors.text.secondary,
    fontFamily: type.family.mono,
    fontSize: type.size.caption,
    marginTop: space.sm,
  },
  envBox: {
    marginBottom: space.sm,
  },
  envAction: {
    marginTop: space.md,
    flexDirection: 'row',
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: 132,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    width: 18,
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.bg.sunken,
    borderWidth: metrics.hairline,
    borderColor: colors.border.hairline,
  },
  barFill: {
    width: '100%',
  },
  barDow: {
    color: colors.text.secondary,
    fontFamily: type.family.mono,
    fontSize: type.size.micro,
    marginTop: space.xs,
  },
  paydayDot: {
    width: 6,
    height: 6,
    marginTop: 3,
  },
  borrowBody: {
    color: colors.text.secondary,
    fontFamily: type.family.text,
    fontSize: type.size.body,
    marginBottom: space.lg,
    lineHeight: 22,
  },
  borrowActions: {
    flexDirection: 'row',
  },
});

export default HomeScreen;
