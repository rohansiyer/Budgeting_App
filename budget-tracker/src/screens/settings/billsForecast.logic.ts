/**
 * Bills forecast — pure date/coverage math behind BillsScreen (handoff v3
 * §3.8, mockups "Bills forecast · next 14 days" / "Due before payday").
 *
 * Kept free of React/RN/store imports so it's unit-testable the same way
 * src/screens/settings/config.ts and csvExport.logic.ts are: BillsScreen.tsx
 * composes these functions with live store reads.
 */
import type { CategoryConfig, ISODate, RecurringBill } from '../../types/contracts';
import type { SafeToSpendLine } from '../../ledger';
import { addCents, ZERO, type Cents } from '../../lib/money';
import { toISO, daysInMonth, addDaysISO } from '../../format/dates';

/**
 * Resolve a 1..31 `dueDay` to its next occurrence on or after `today`,
 * CLAMPED TO MONTH END (a bill due on 31 falls on Feb 28/29 in February). If
 * this month's clamped date has already passed, rolls to next month's
 * clamped date. A due day equal to today resolves to today (not pushed out).
 */
export function nextOccurrence(dueDay: number, today: ISODate): ISODate {
  const [y, m] = today.split('-').map((n) => parseInt(n, 10));

  const thisMonthFirst = toISO(y, m, 1);
  const clampedThisMonth = Math.min(dueDay, daysInMonth(thisMonthFirst));
  const thisMonthDate = toISO(y, m, clampedThisMonth);
  if (thisMonthDate >= today) return thisMonthDate;

  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const nextMonthFirst = toISO(ny, nm, 1);
  const clampedNextMonth = Math.min(dueDay, daysInMonth(nextMonthFirst));
  return toISO(ny, nm, clampedNextMonth);
}

export interface ResolvedBill {
  bill: RecurringBill;
  dueDate: ISODate;
}

/** Active bills only, each resolved to its next occurrence, sorted by date then name. */
export function resolveActiveBills(bills: readonly RecurringBill[], today: ISODate): ResolvedBill[] {
  return bills
    .filter((b) => b.active)
    .map((b) => ({ bill: b, dueDate: nextOccurrence(b.dueDay, today) }))
    .sort((a, b) => {
      if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      return a.bill.name.localeCompare(b.bill.name);
    });
}

/**
 * The end of the "due before payday" window: the earliest projected payday
 * on or after `today`, or a 14-day fallback (matching the mockup's "next 14
 * days" framing) when no payday is projected in the caller's lookahead range.
 */
export function forecastWindowEnd(today: ISODate, upcomingPaydays: readonly ISODate[]): ISODate {
  const future = upcomingPaydays.filter((d) => d >= today).slice().sort();
  if (future.length > 0) return future[0];
  return addDaysISO(today, 14);
}

/** Resolved bills due strictly before `windowEnd` (the next payday). */
export function dueBeforePayday(resolved: readonly ResolvedBill[], windowEnd: ISODate): ResolvedBill[] {
  return resolved.filter((r) => r.dueDate < windowEnd);
}

export function totalDueCents(resolved: readonly ResolvedBill[]): Cents {
  return resolved.reduce<Cents>((acc, r) => addCents(acc, r.bill.amountCents), ZERO);
}

export interface CoverageStatus {
  covered: boolean;
  caption: string;
}

const ALL_COVERED_CAPTION = 'All covered, already reserved out of safe-to-spend.';
const RESERVE_THESE_CAPTION = 'Reserve these from safe to spend.';

/** Defensive match for a reserved-bills line, whatever another wave's integration ends up naming it. */
const RESERVED_LINE_PATTERN = /reserv|bill/i;

/**
 * Whether the bills due before payday are already covered.
 *
 * Primary path: sum the safeToSpendBreakdown's outflow lines that look like a
 * "reserved for bills" term (matched defensively by label, since that
 * integration may not have landed yet) and compare against the total due.
 * Fallback path (no matching line found): compare the total due directly
 * against the plain safe-to-spend figure.
 */
export function billsCoverageStatus(
  totalDue: Cents,
  breakdownLines: readonly SafeToSpendLine[],
  safeToSpendCents: Cents,
): CoverageStatus {
  if (totalDue <= 0) {
    return { covered: true, caption: ALL_COVERED_CAPTION };
  }

  const reservedLines = breakdownLines.filter(
    (l) => l.direction === 'out' && RESERVED_LINE_PATTERN.test(l.label),
  );
  const comparisonCents =
    reservedLines.length > 0
      ? reservedLines.reduce<Cents>((acc, l) => addCents(acc, l.amountCents), ZERO)
      : safeToSpendCents;

  const covered = comparisonCents >= totalDue;
  return { covered, caption: covered ? ALL_COVERED_CAPTION : RESERVE_THESE_CAPTION };
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-07-12" -> "Jul 12" (no weekday, matching the Bills forecast mockup rows). */
export function shortMonthDay(iso: ISODate): string {
  const [, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

/**
 * F5-5: the Setup wizard's "Fixed bill" categories (`category.fixed`) that
 * have no matching ACTIVE recurring bill yet — the wizard prompts a user to
 * flag rent/utilities/etc as fixed, but that flag alone never reached the
 * Bills forecast (no `recurring_bills` row), so those bills silently got no
 * "due before payday" coverage. "Matching" means an active bill whose
 * `categoryId` points at the category — never inferred by name. Sorted by
 * name so the nudge list renders in a stable order. No bill is ever
 * auto-created here; this only decides which categories to nudge about.
 */
export function fixedCategoryNudges(
  categories: readonly CategoryConfig[],
  bills: readonly RecurringBill[],
): CategoryConfig[] {
  // Defensive: filter to active bills here rather than trusting the caller,
  // so a removed (active:false) bill never counts as "coverage" — a nudge
  // should reappear the moment its bill is removed, not just when it never
  // existed.
  const coveredCategoryIds = new Set(bills.filter((b) => b.active).map((b) => b.categoryId));
  return categories
    .filter((c) => c.fixed && !coveredCategoryIds.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}
