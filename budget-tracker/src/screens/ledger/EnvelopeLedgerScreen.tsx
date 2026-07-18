/**
 * Every number is a door (v0.3 handoff §3.7): the full drill-down behind one
 * envelope. Reads `envelopeLedger` (src/ledger/envelopeLedger.ts) for the
 * ordered transaction / carryover / borrow / repay rows with a running
 * balance, and renders them as a RuledList with date, label, signed amount
 * and running balance all in tabular mono. Borrow/repay/carryover rows carry
 * a small caption tag ("borrowed from next week" style labels) so they read
 * distinctly from ordinary spend.
 */
import React, { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import * as tokens from '../../theme/tokens';
import { formatCents } from '../../lib/money';
import { HardButton, RuledList, CategoryChip, EmptyState, PixelBox } from '../../components/kit';
import { Screen, MoneyText, Row } from '../../components/Primitives';
import { DuckSprite } from '../../ducks/DuckSprite';
import { useStore } from '../../providers/StoreProvider';
import { envelopeLedger } from '../../ledger';
import type { EnvelopeLedgerRow, EnvelopeLedgerRowKind } from '../../ledger';
import { todayISO, shortDate } from '../../format/dates';
import { periodStartFor, shiftPeriod, canGoToNextPeriod, periodLabel } from './EnvelopeLedgerScreen.logic';
import type { CadenceType, ISODate } from '../../types/contracts';

const { color, space } = tokens;
const typo = tokens.type;

/** Caption tag shown for non-plain-spend rows ("borrowed from next week" style labels). */
const KIND_TAG: Record<EnvelopeLedgerRowKind, string | null> = {
  transaction: null,
  carryover: 'CARRYOVER',
  borrow: 'BORROWED',
  repay: 'REPAYING',
};

const KIND_TAG_COLOR: Record<EnvelopeLedgerRowKind, string> = {
  transaction: color.textMuted,
  carryover: color.textMuted,
  borrow: color.warn,
  repay: color.danger,
};

export interface EnvelopeLedgerScreenProps {
  categoryId: string;
  onClose: () => void;
}

interface KeyedRow extends EnvelopeLedgerRow {
  key: string;
}

export function EnvelopeLedgerScreen({ categoryId, onClose }: EnvelopeLedgerScreenProps) {
  const store = useStore();
  // includeArchived: this is an id->name join on a history screen — an
  // archived category's past ledger must still resolve its name/color, not
  // silently fall back to "Envelope" (F1-2's archival filtering map).
  const cat = store.listCategories({ includeArchived: true }).find((c) => c.id === categoryId);
  const cadence: CadenceType = cat?.cadence ?? 'weekly';
  const today = todayISO();

  // F3-4: prior/next period chevrons. Defaults to the current period; ±7
  // days for weekly cadence, ±1 calendar month for monthly, clamped so
  // "Next" never looks ahead of the period containing today.
  const [viewedPeriodStart, setViewedPeriodStart] = useState<ISODate>(() =>
    periodStartFor(today, cadence),
  );
  const canNext = canGoToNextPeriod(viewedPeriodStart, cadence, today);
  const goPrev = () => setViewedPeriodStart((p) => shiftPeriod(p, cadence, -1));
  const goNext = () =>
    setViewedPeriodStart((p) => (canGoToNextPeriod(p, cadence, today) ? shiftPeriod(p, cadence, 1) : p));

  const ledger = envelopeLedger(categoryId, viewedPeriodStart);
  const rows: KeyedRow[] = ledger.rows.map((r, i) => ({ ...r, key: `${r.dateISO}_${i}` }));

  return (
    <Screen
      title={cat?.name ?? 'Envelope'}
      right={
        <HardButton
          label="Close"
          variant="ghost"
          onPress={onClose}
          accessibilityLabel="Close envelope ledger"
        />
      }
    >
      <Row style={styles.periodNav}>
        <HardButton
          label="< Prev"
          variant="ghost"
          onPress={goPrev}
          accessibilityLabel={cadence === 'monthly' ? 'Previous month' : 'Previous week'}
        />
        <Text style={styles.periodLabel} accessibilityRole="header">
          {periodLabel(viewedPeriodStart, cadence)}
        </Text>
        <HardButton
          label="Next >"
          variant="ghost"
          disabled={!canNext}
          onPress={goNext}
          accessibilityLabel={cadence === 'monthly' ? 'Next month' : 'Next week'}
        />
      </Row>

      {cat ? (
        <PixelBox style={styles.header}>
          <Row>
            <CategoryChip colorKey={cat.colorKey} size={14} />
            <Text style={styles.headerName}>{cat.name}</Text>
          </Row>
          <Text style={styles.headerLine}>
            {ledger.cadence === 'monthly' ? 'Monthly budget' : 'Weekly budget'},{' '}
            {formatCents(ledger.startingBalanceCents)}
          </Text>
        </PixelBox>
      ) : null}

      {rows.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            message={`No activity in ${cat?.name ?? 'this envelope'} for this period yet.`}
            actionLabel="Close"
            onAction={onClose}
            renderDuck={(p) => <DuckSprite {...p} />}
            accessibilityLabel="No envelope activity for this period"
          />
        </View>
      ) : (
        <RuledList<KeyedRow>
          data={rows}
          keyExtractor={(r) => r.key}
          renderRow={(row) => <LedgerRow row={row} />}
        />
      )}

      <Text style={styles.footer}>
        Every dollar is accounted for; nothing is ever invented or lost.
      </Text>
    </Screen>
  );
}

function LedgerRow({ row }: { row: EnvelopeLedgerRow }) {
  const tag = KIND_TAG[row.kind];
  return (
    <View
      accessible
      accessibilityLabel={`${shortDate(row.dateISO)}: ${row.label}, ${formatCents(row.amountCents)}, balance ${formatCents(row.runningBalanceCents)}`}
    >
      <Row style={styles.rowWrap}>
        <View style={styles.rowMeta}>
          <Row>
            <Text style={styles.rowDate}>{shortDate(row.dateISO)}</Text>
            {tag ? (
              <Text style={[styles.rowTag, { color: KIND_TAG_COLOR[row.kind] }]}>{tag}</Text>
            ) : null}
          </Row>
          <Text style={styles.rowLabel}>{row.label}</Text>
        </View>
        <View style={styles.rowAmounts}>
          <MoneyText amount={row.amountCents} kind="net" signed size={typo.body.fontSize} />
          <Text style={styles.rowBalance}>{formatCents(row.runningBalanceCents)}</Text>
        </View>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  periodNav: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  periodLabel: {
    flex: 1,
    textAlign: 'center',
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.title.fontWeight,
  },
  header: {
    marginBottom: space.md,
  },
  headerName: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.title.fontWeight,
    marginLeft: space.sm,
  },
  headerLine: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: space.sm,
    fontVariant: [...typo.tabularNums.fontVariant],
  },
  emptyWrap: {
    marginTop: space.sm,
  },
  rowWrap: {
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rowMeta: {
    flex: 1,
    marginRight: space.sm,
  },
  rowDate: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    fontVariant: [...typo.tabularNums.fontVariant],
    marginRight: space.sm,
  },
  rowTag: {
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    fontFamily: typo.sectionLabel.fontFamily,
  },
  rowLabel: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
    marginTop: 2,
  },
  rowAmounts: {
    alignItems: 'flex-end',
  },
  rowBalance: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    fontVariant: [...typo.tabularNums.fontVariant],
    marginTop: 2,
  },
  footer: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    lineHeight: 18,
    marginTop: space.lg,
  },
});

export default EnvelopeLedgerScreen;
