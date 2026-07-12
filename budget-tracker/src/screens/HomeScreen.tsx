import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import * as tokens from '../theme/tokens';
import { Cents, cents, formatCents, minCents, ZERO } from '../lib/money';
import { PixelBox, BlockMeter, HardButton, CategoryChip, DuckChipSlot, InsightRow } from '../components/kit';
import { DuckSprite } from '../ducks/DuckSprite';
import { useFlock } from '../ducks/appEngine';
import { Screen, SectionLabel, MoneyText, Row } from '../components/Primitives';
import { Sheet } from '../components/Sheet';
import { useStore } from '../providers/StoreProvider';
import { useAppShell } from '../providers/AppShell';
import { tryParseCents, blockValueFor } from '../format/moneyInput';
import {
  todayISO,
  weekStartOf,
  weekRange,
  addDaysISO,
  weekdayShort,
  eachDay,
  monthKeyOf,
} from '../format/dates';
import { getInsightPort } from '../insights';
import { GoalStrip } from './home/GoalStrip';
import { computePacingLine, daysToPaydayPhrase } from './home/pacing.logic';
import type { VariableEnvelopeInput } from './home/goalStatus.logic';
import type { CategoryConfig, EnvelopeWeekState, ISODate } from '../types/contracts';

const { color, space, pixel, font } = tokens;
const typo = tokens.type;

/** Lookahead window for the "days to payday" pacing line (covers monthly schedules). */
const PAYDAY_LOOKAHEAD_DAYS = 45;

export interface HomeScreenProps {
  /** Opens the safe-to-spend ledger drill-down. Screen arrives a later wave; no-op default. */
  onOpenLedger?: () => void;
}

export function HomeScreen({ onOpenLedger = () => {} }: HomeScreenProps = {}) {
  const store = useStore();
  const flock = useFlock();
  const { openDay, showUndo } = useAppShell();

  const today = todayISO();
  const week = weekStartOf(today);
  const prevWeek = addDaysISO(week, -7);
  const month = monthKeyOf(today);

  const categories = store.listCategories();
  const enveloped = categories.filter((c) => c.envelope !== null);
  const accounts = store.listAccounts();
  const savingsAccount = accounts.find((a) => a.kind === 'savings') ?? accounts[0];

  const safeToSpend = store.getSafeToSpend(week);

  // Pacing line: days to the next payday + a cent-exact "about $X a day"
  // figure over that span (v0.3 §3.5). Null hides the line gracefully
  // (e.g. no income schedule configured yet).
  const paydayWindow = { from: today, to: addDaysISO(today, PAYDAY_LOOKAHEAD_DAYS) };
  const upcomingPaydays = store.getPaydays(paydayWindow);
  const pacing = computePacingLine({ today, paydays: upcomingPaydays, remaining: safeToSpend });

  // Goal strip inputs: this month's enveloped plan vs actual (sync read).
  const planVsActual = store.getPlanVsActual(month);
  const variableSlices: VariableEnvelopeInput[] = enveloped.map((c) => {
    const row = planVsActual.find((r) => r.categoryId === c.id);
    return {
      categoryId: c.id,
      categoryName: c.name,
      planned: row?.planned ?? ZERO,
      actual: row?.actual ?? ZERO,
    };
  });

  // Today's answer: at most one delivered insight, silence when null (F5).
  const homeInsight = getInsightPort().getHomeInsight(today);

  // 7-day bars: today-6 .. today.
  const barsRange = { from: addDaysISO(today, -6), to: today };
  const dayTotals = store.getDaySpendTotals(barsRange);
  const paydays = new Set(store.getPaydays(barsRange));
  const fixedHitDays = useMemo(() => {
    const fixedIds = new Set(categories.filter((c) => c.fixed).map((c) => c.id));
    const out = new Set<ISODate>();
    for (const t of store.getTransactions(barsRange)) {
      if (t.kind === 'expense' && fixedIds.has(t.categoryId)) out.add(t.date);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, barsRange.from, barsRange.to]);

  // Monday prompt: previous week's envelopes with un-dispatched leftover.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const leftovers = enveloped
    .map((c) => ({ cat: c, st: store.getEnvelopeWeekState(c.id, prevWeek) }))
    .filter(
      ({ cat, st }) =>
        st.remaining > 0 && st.rolledOut === 0 && st.sweptOut === 0 && !dismissed.has(cat.id),
    );

  const [borrowFor, setBorrowFor] = useState<CategoryConfig | null>(null);

  return (
    <Screen title={greeting()} right={<DuckChipSlot
          duckCount={flock?.ducks.length ?? 0}
          duckProps={{ accessoryTier: flock?.accessoryTier ?? 0 }}
          renderDuck={(p) => <DuckSprite {...p} />}
        />}>
      {/* Monday reset prompt (PixelBox — it's a prompt, a game object). */}
      {leftovers.length > 0 ? (
        <PixelBox style={styles.promptBox}>
          <Text style={styles.promptTitle}>New week — settle last week's envelopes</Text>
          {leftovers.map(({ cat, st }) => (
            <View key={cat.id} style={styles.promptRow}>
              <Row>
                <CategoryChip colorKey={cat.colorKey} />
                <Text style={styles.promptCat}>{cat.name}</Text>
                <MoneyText amount={st.remaining} kind="income" signed />
              </Row>
              <Row style={styles.promptActions}>
                <HardButton
                  label="Roll forward"
                  variant="primary"
                  onPress={() => {
                    void store.rollForward(cat.id, prevWeek);
                  }}
                  accessibilityLabel={`Roll ${cat.name} leftover forward into this week`}
                />
                <HardButton
                  label="To savings"
                  variant="ghost"
                  onPress={() => {
                    if (!savingsAccount) return; // no savings account configured
                    void store.sweepToSavings(cat.id, prevWeek, savingsAccount.id);
                    showUndo(`${cat.name} leftover swept to ${savingsAccount.name}`);
                  }}
                  accessibilityLabel={`Sweep ${cat.name} leftover to savings`}
                />
                <HardButton
                  label="Let it go"
                  variant="ghost"
                  onPress={() => setDismissed((d) => new Set(d).add(cat.id))}
                  accessibilityLabel={`Let ${cat.name} leftover go`}
                />
              </Row>
            </View>
          ))}
        </PixelBox>
      ) : null}

      {/* Hero: safe to spend this week, with the pacing line beneath (v0.3 §3.5).
          Every number is a door (F10) — tapping opens the ledger behind it;
          the ledger screen itself arrives a later wave, so onOpenLedger is an
          optional no-op seam for now. */}
      <Pressable
        style={styles.hero}
        onPress={onOpenLedger}
        accessibilityRole="button"
        accessibilityLabel="Safe to spend, tap for the math"
      >
        <Text style={styles.heroLabel}>SAFE TO SPEND THIS WEEK</Text>
        <Text style={styles.heroAmount}>{formatCents(safeToSpend)}</Text>
        {pacing ? (
          <Text style={styles.pacingLine}>
            {daysToPaydayPhrase(pacing.daysToPayday)}, about{' '}
            <Text style={styles.pacingAmount}>{formatCents(pacing.perDay)}</Text> a day keeps you
            green, tap for the math
          </Text>
        ) : null}
      </Pressable>

      {/* Goal strip: this month's duck at a glance (v0.3 §3.5). */}
      <GoalStrip month={month} variable={variableSlices} />

      {/* Today's answer: at most one delivered insight, silence when null (F5). */}
      {homeInsight ? (
        <View style={styles.insightSection}>
          <SectionLabel style={styles.insightLabel}>Today's answer</SectionLabel>
          <InsightRow
            colorKey={homeInsight.colorKey ?? 'mint'}
            prefix={homeInsight.prefix}
            amountText={homeInsight.amountText ?? ''}
            suffix={homeInsight.suffix}
          />
        </View>
      ) : null}

      {/* 7-day spend bars: mint = payday, coral = big fixed hit. */}
      <SectionLabel>Last 7 days</SectionLabel>
      <View style={styles.barsRow}>
        {eachDay(barsRange).map((d) => {
          const spent = dayTotals.get(d) ?? ZERO;
          const max = Math.max(1, ...Array.from(dayTotals.values()));
          const pct = Math.round((spent / max) * 100);
          const isPayday = paydays.has(d);
          const isFixedHit = fixedHitDays.has(d);
          return (
            <Pressable
              key={d}
              style={styles.barCol}
              onPress={() => openDay(d)}
              accessibilityRole="button"
              accessibilityLabel={`${weekdayShort(d)}: spent ${formatCents(spent)}${isPayday ? ', payday' : ''}${isFixedHit ? ', fixed bill hit' : ''}. Opens day detail.`}
            >
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: `${Math.max(4, pct)}%`,
                      backgroundColor: isFixedHit
                        ? color.danger
                        : isPayday
                          ? color.accent
                          : color.spendFill,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barDow, d === today && styles.barDowToday]}>
                {weekdayShort(d)[0]}
              </Text>
              <View
                style={[
                  styles.paydayDot,
                  { backgroundColor: isPayday ? color.accent : color.bg },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      {/* Envelopes (PixelBoxes — game objects). */}
      <SectionLabel>Envelopes this week</SectionLabel>
      {enveloped.map((cat) => {
        const st = store.getEnvelopeWeekState(cat.id, week);
        return (
          <EnvelopeCard
            key={cat.id}
            cat={cat}
            st={st}
            onBorrow={() => setBorrowFor(cat)}
          />
        );
      })}

      {/* Add expense — opens today's Daily detail (the add form lives there). */}
      <View style={styles.addRow}>
        <HardButton
          label="+ Add expense"
          onPress={() => openDay(today)}
          accessibilityLabel="Add an expense for today"
        />
      </View>

      {/* Borrow-from-next-week confirm sheet (amount is user input). */}
      {borrowFor ? (
        <BorrowSheet
          cat={borrowFor}
          week={week}
          alreadyBorrowed={store.getEnvelopeWeekState(borrowFor.id, week).borrowedIn}
          onClose={() => setBorrowFor(null)}
          onConfirm={async (amount) => {
            try {
              await store.borrowFromNextWeek(borrowFor.id, week, amount);
              setBorrowFor(null);
            } catch (e) {
              showUndo(e instanceof Error ? e.message : 'Borrow failed');
            }
          }}
        />
      ) : null}
    </Screen>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function EnvelopeCard({
  cat,
  st,
  onBorrow,
}: {
  cat: CategoryConfig;
  st: EnvelopeWeekState;
  onBorrow: () => void;
}) {
  const budget = st.configuredBudget;
  const detail = envelopeDetailText(st);
  return (
    <PixelBox style={styles.envBox}>
      <Row style={styles.envHead}>
        <Row>
          <CategoryChip colorKey={cat.colorKey} />
          <Text style={styles.envName}>{cat.name}</Text>
        </Row>
        <MoneyText
          amount={st.remaining}
          kind={st.remaining < 0 ? 'spend' : 'plain'}
          size={typo.kpi.fontSize}
          style={{ fontFamily: font.monoBold }}
        />
      </Row>
      <BlockMeter
        budget={budget}
        spent={st.spent}
        blockValue={blockValueFor(budget)}
        bonus={st.rolledIn}
        debt={st.repaying}
        accessibilityLabel={`${cat.name} envelope`}
      />
      <Text style={styles.envDetail}>{detail}</Text>
      {st.remaining < 0 ? (
        <View style={styles.envAction}>
          <HardButton
            label="Borrow from next week"
            variant="ghost"
            onPress={onBorrow}
            accessibilityLabel={`Borrow from next week's ${cat.name} envelope`}
          />
        </View>
      ) : null}
    </PixelBox>
  );
}

/** Text fallback so no envelope state is color-only. */
function envelopeDetailText(st: EnvelopeWeekState): string {
  const parts: string[] = [
    `${formatCents(st.spent)} spent of ${formatCents(cents(st.configuredBudget + st.rolledIn + st.borrowedIn))}`,
  ];
  if (st.rolledIn > 0) parts.push(`${formatCents(st.rolledIn)} rolled in`);
  if (st.borrowedIn > 0) parts.push(`${formatCents(st.borrowedIn)} borrowed`);
  if (st.repaying > 0) parts.push(`repaying ${formatCents(st.repaying)}`);
  if (st.sweptOut > 0) parts.push(`${formatCents(st.sweptOut)} swept to savings`);
  if (st.remaining < 0) parts.push(`${formatCents(cents(-st.remaining))} over`);
  return parts.join(' · ');
}

function BorrowSheet({
  cat,
  week,
  alreadyBorrowed,
  onClose,
  onConfirm,
}: {
  cat: CategoryConfig;
  week: ISODate;
  alreadyBorrowed: Cents;
  onClose: () => void;
  onConfirm: (amount: Cents) => void;
}) {
  const [text, setText] = useState('');
  const parsed = tryParseCents(text);
  const nextBudget = cat.envelope?.budget ?? ZERO;
  const cap = cents(Math.max(0, Math.floor(nextBudget / 2) - alreadyBorrowed));
  const amount = parsed !== null && parsed > 0 ? minCents(parsed, cap) : null;

  return (
    <Sheet visible onClose={onClose} title={`Borrow for ${cat.name}`}>
      <Text style={styles.borrowBody}>
        Pull budget forward from next week's {cat.name} envelope. Cap: {formatCents(cap)} (one
        week ahead, at most half of next week's budget). Next week starts lower by the same
        amount.
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={color.textMuted}
        autoFocus
        accessibilityLabel="Amount to borrow"
        style={styles.input}
      />
      <Row>
        <HardButton
          label={amount !== null ? `Borrow ${formatCents(amount)}` : 'Borrow'}
          disabled={amount === null || amount === 0}
          onPress={() => {
            if (amount !== null && amount > 0) onConfirm(amount);
          }}
          accessibilityLabel={`Confirm borrowing for ${cat.name} for week of ${week}`}
        />
        <HardButton label="Cancel" variant="ghost" onPress={onClose} accessibilityLabel="Cancel borrow" />
      </Row>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  promptBox: {
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  promptTitle: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.title.fontWeight,
    marginBottom: space.sm,
  },
  promptRow: {
    marginTop: space.sm,
  },
  promptCat: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
    marginLeft: space.sm,
    marginRight: space.sm,
  },
  promptActions: {
    marginTop: space.sm,
    flexWrap: 'wrap',
  },
  hero: {
    marginTop: space.md,
    marginBottom: space.sm,
  },
  heroLabel: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    fontFamily: typo.sectionLabel.fontFamily,
    marginBottom: space.xs,
  },
  heroAmount: {
    color: color.accent,
    fontSize: 44,
    fontFamily: font.monoBold,
    fontVariant: [...typo.tabularNums.fontVariant],
    letterSpacing: -1.5,
  },
  pacingLine: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    fontFamily: typo.caption.fontFamily,
    marginTop: space.sm,
    lineHeight: 18,
  },
  pacingAmount: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.body.fontWeight,
    fontFamily: font.monoBold,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
  insightSection: {
    marginTop: space.sm,
  },
  insightLabel: {
    marginTop: 0,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: 120,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    width: 16,
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: color.surfaceDeep,
    borderWidth: pixel.hairlineWidth,
    borderColor: color.hairline,
  },
  barFill: {
    width: '100%',
  },
  barDow: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: space.xs,
  },
  barDowToday: {
    color: color.text,
    fontWeight: typo.title.fontWeight,
  },
  paydayDot: {
    width: 6,
    height: 6,
    marginTop: 2,
  },
  envBox: {
    marginBottom: space.sm,
  },
  envHead: {
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  envName: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
    marginLeft: space.sm,
  },
  envDetail: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: space.sm,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
  envAction: {
    marginTop: space.sm,
    flexDirection: 'row',
  },
  addRow: {
    marginTop: space.md,
    flexDirection: 'row',
  },
  borrowBody: {
    color: color.textSecondary,
    fontSize: typo.body.fontSize,
    fontWeight: typo.caption.fontWeight,
    lineHeight: 20,
    marginBottom: space.md,
  },
  input: {
    backgroundColor: color.surfaceDeep,
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    color: color.text,
    fontSize: typo.title.fontSize,
    fontVariant: [...typo.tabularNums.fontVariant],
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
    marginBottom: space.md,
  },
});

export default HomeScreen;
