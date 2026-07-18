import { cents } from '../../../lib/money';
import type { CategoryConfig, RecurringBill } from '../../../types/contracts';
import type { SafeToSpendLine } from '../../../ledger';
import {
  nextOccurrence,
  resolveActiveBills,
  forecastWindowEnd,
  dueBeforePayday,
  totalDueCents,
  billsCoverageStatus,
  shortMonthDay,
  fixedCategoryNudges,
} from '../billsForecast.logic';

function bill(over: Partial<RecurringBill>): RecurringBill {
  return {
    id: over.id ?? 'b1',
    name: over.name ?? 'Rent',
    categoryId: over.categoryId ?? 'cat1',
    amountCents: over.amountCents ?? cents(85000),
    dueDay: over.dueDay ?? 1,
    active: over.active ?? true,
    createdAt: over.createdAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function category(over: Partial<CategoryConfig>): CategoryConfig {
  return {
    id: over.id ?? 'cat1',
    name: over.name ?? 'Rent',
    colorKey: over.colorKey ?? 'violet',
    fixed: over.fixed ?? true,
    cadence: over.cadence ?? 'monthly',
    envelope: over.envelope ?? null,
  };
}

describe('nextOccurrence', () => {
  it('clamps a 31 dueDay to Feb 28 in a non-leap year', () => {
    expect(nextOccurrence(31, '2026-02-01')).toBe('2026-02-28');
  });

  it('clamps a 31 dueDay to Feb 29 in a leap year', () => {
    expect(nextOccurrence(31, '2024-02-01')).toBe('2024-02-29');
  });

  it('rolls over to next month once this month\'s occurrence has passed', () => {
    expect(nextOccurrence(5, '2026-03-10')).toBe('2026-04-05');
  });

  it('resolves to today when today is the due day', () => {
    expect(nextOccurrence(15, '2026-07-15')).toBe('2026-07-15');
  });

  it('resolves to a later date this month when the due day has not passed', () => {
    expect(nextOccurrence(20, '2026-07-01')).toBe('2026-07-20');
  });

  it('resolves within a 30-day month when the clamped date has not yet passed', () => {
    // April has 30 days; dueDay 31 clamps to Apr 30, which is still ahead of the 5th.
    expect(nextOccurrence(31, '2026-04-05')).toBe('2026-04-30');
  });

  it('rolls December to January correctly', () => {
    expect(nextOccurrence(3, '2026-12-10')).toBe('2027-01-03');
  });
});

describe('resolveActiveBills', () => {
  it('excludes inactive bills', () => {
    const bills = [bill({ id: 'a', dueDay: 5, active: true }), bill({ id: 'b', dueDay: 6, active: false })];
    const resolved = resolveActiveBills(bills, '2026-07-01');
    expect(resolved.map((r) => r.bill.id)).toEqual(['a']);
  });

  it('sorts by resolved due date, then name', () => {
    const bills = [
      bill({ id: 'z', name: 'Zebra', dueDay: 10 }),
      bill({ id: 'a', name: 'Apple', dueDay: 5 }),
      bill({ id: 'b', name: 'Banana', dueDay: 5 }),
    ];
    const resolved = resolveActiveBills(bills, '2026-07-01');
    expect(resolved.map((r) => r.bill.id)).toEqual(['a', 'b', 'z']);
  });
});

describe('forecastWindowEnd', () => {
  it('picks the earliest projected payday on or after today', () => {
    expect(forecastWindowEnd('2026-07-10', ['2026-07-05', '2026-07-18', '2026-08-01'])).toBe(
      '2026-07-18',
    );
  });

  it('falls back to a 14-day window when no payday is projected', () => {
    expect(forecastWindowEnd('2026-07-10', [])).toBe('2026-07-24');
  });

  it('ignores paydays strictly before today', () => {
    expect(forecastWindowEnd('2026-07-10', ['2026-07-01', '2026-07-10'])).toBe('2026-07-10');
  });
});

describe('dueBeforePayday', () => {
  it('keeps only bills due strictly before the window end', () => {
    const bills = [
      bill({ id: 'a', dueDay: 12 }),
      bill({ id: 'b', dueDay: 18 }),
      bill({ id: 'c', dueDay: 25 }),
    ];
    const resolved = resolveActiveBills(bills, '2026-07-01');
    const due = dueBeforePayday(resolved, '2026-07-18');
    expect(due.map((r) => r.bill.id)).toEqual(['a']);
  });
});

describe('totalDueCents', () => {
  it('sums the resolved bills', () => {
    const bills = [bill({ id: 'a', amountCents: cents(85000) }), bill({ id: 'b', amountCents: cents(4500) })];
    const resolved = resolveActiveBills(bills, '2026-07-01');
    expect(totalDueCents(resolved)).toBe(89500);
  });

  it('is zero for an empty list', () => {
    expect(totalDueCents([])).toBe(0);
  });
});

describe('billsCoverageStatus', () => {
  const covered = 'All covered, already reserved out of safe-to-spend.';
  const notCovered = 'Reserve these from safe to spend.';

  it('is trivially covered when nothing is due', () => {
    const status = billsCoverageStatus(cents(0), [], cents(0));
    expect(status.covered).toBe(true);
    expect(status.caption).toBe(covered);
  });

  it('uses a matching reserved/bills line when present and sufficient', () => {
    const lines: SafeToSpendLine[] = [
      { label: 'Reserved for bills', amountCents: cents(90000), direction: 'out' },
    ];
    const status = billsCoverageStatus(cents(89500), lines, cents(0));
    expect(status.covered).toBe(true);
    expect(status.caption).toBe(covered);
  });

  it('uses a matching reserved/bills line when present but insufficient', () => {
    const lines: SafeToSpendLine[] = [
      { label: 'Reserved for bills', amountCents: cents(50000), direction: 'out' },
    ];
    const status = billsCoverageStatus(cents(89500), lines, cents(999999));
    expect(status.covered).toBe(false);
    expect(status.caption).toBe(notCovered);
  });

  it('falls back to plain safe-to-spend when no reserved line is found (sufficient)', () => {
    const status = billsCoverageStatus(cents(89500), [], cents(100000));
    expect(status.covered).toBe(true);
    expect(status.caption).toBe(covered);
  });

  it('falls back to plain safe-to-spend when no reserved line is found (insufficient)', () => {
    const status = billsCoverageStatus(cents(89500), [], cents(1000));
    expect(status.covered).toBe(false);
    expect(status.caption).toBe(notCovered);
  });

  it('ignores non-reserved, non-bill lines in the defensive match', () => {
    const lines: SafeToSpendLine[] = [
      { label: 'Envelopes funded', amountCents: cents(500000), direction: 'in' },
      { label: 'Spent so far this week', amountCents: cents(20000), direction: 'out' },
    ];
    const status = billsCoverageStatus(cents(89500), lines, cents(1000));
    expect(status.covered).toBe(false); // falls back to safeToSpend, which is too small
  });
});

describe('shortMonthDay', () => {
  it('formats without a weekday', () => {
    expect(shortMonthDay('2026-07-12')).toBe('Jul 12');
    expect(shortMonthDay('2026-01-01')).toBe('Jan 1');
    expect(shortMonthDay('2026-12-31')).toBe('Dec 31');
  });
});

describe('manually added bills appear in the forecast (F5-5)', () => {
  it('a bill added through the manual Add-bill form resolves and forecasts identically to any other bill', () => {
    // Shape produced by BillsScreen's Add-bill form -> store.addRecurringBill,
    // not the subscription-detection path — the forecast math must not care.
    const manuallyAdded = bill({ id: 'manual1', name: 'Rent', dueDay: 5, active: true });
    const resolved = resolveActiveBills([manuallyAdded], '2026-07-01');
    expect(resolved.map((r) => r.bill.id)).toEqual(['manual1']);

    const due = dueBeforePayday(resolved, '2026-07-18');
    expect(due.map((r) => r.bill.id)).toEqual(['manual1']);
    expect(totalDueCents(due)).toBe(manuallyAdded.amountCents);
  });
});

describe('fixedCategoryNudges', () => {
  it('nudges a fixed category with no active bill at all', () => {
    const cats = [category({ id: 'rent', name: 'Rent', fixed: true })];
    expect(fixedCategoryNudges(cats, [])).toEqual(cats);
  });

  it('does not nudge a fixed category that already has a matching active bill', () => {
    const cats = [category({ id: 'rent', name: 'Rent', fixed: true })];
    const bills = [bill({ id: 'b1', categoryId: 'rent', active: true })];
    expect(fixedCategoryNudges(cats, bills)).toEqual([]);
  });

  it('still nudges when the only matching bill is inactive (removed)', () => {
    const cats = [category({ id: 'rent', name: 'Rent', fixed: true })];
    const bills = [bill({ id: 'b1', categoryId: 'rent', active: false })];
    expect(fixedCategoryNudges(cats, bills)).toEqual(cats);
  });

  it('never nudges a non-fixed (variable/enveloped) category', () => {
    const cats = [category({ id: 'fun', name: 'Fun', fixed: false })];
    expect(fixedCategoryNudges(cats, [])).toEqual([]);
  });

  it('a bill on a DIFFERENT category does not cover this one (no name-matching)', () => {
    const cats = [category({ id: 'rent', name: 'Rent', fixed: true })];
    const bills = [bill({ id: 'b1', categoryId: 'utilities', name: 'Rent', active: true })];
    expect(fixedCategoryNudges(cats, bills)).toEqual(cats);
  });

  it('sorts nudges by category name', () => {
    const cats = [
      category({ id: 'water', name: 'Water', fixed: true }),
      category({ id: 'rent', name: 'Rent', fixed: true }),
    ];
    expect(fixedCategoryNudges(cats, []).map((c) => c.id)).toEqual(['rent', 'water']);
  });
});
