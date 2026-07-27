/**
 * Subscription detection (Import engine, F11) — the trigger behind the
 * "Looks like a subscription" insight rule.
 *
 * A merchant is a subscription candidate when the SAME normalized merchant
 * recurs at a STEADY amount (within 2%, or exactly equal), across >= 3 distinct
 * months, at roughly-monthly spacing. Merchants already tracked by an active
 * recurring bill are excluded (no point suggesting what's already a bill).
 *
 * Deterministic: same transactions in, same candidates out (sorted by merchant).
 */
import type { Cents } from '../lib/money';
import { cents } from '../lib/money';
import type { ISODate } from '../types/contracts';
import { normalizeMerchant } from './matching';

export interface DetectTxn {
  date: ISODate;
  /** Spend-positive cents. */
  amountCents: Cents;
  note: string | null;
  categoryId: string | null;
}

export interface SubscriptionCandidate {
  merchant: string; // normalized
  categoryId: string | null;
  amountCents: Cents; // representative (modal) amount
  hitCount: number;
  monthsSpanned: number;
}

export interface DetectOptions {
  /** Raw names of active recurring bills to exclude (normalized internally). */
  activeBillNames?: string[];
  /** Minimum distinct months required. Default 3. */
  minMonths?: number;
}

/** Within 2% of a reference (exact equality included). Integer math only. */
function within2pct(amount: Cents, ref: Cents): boolean {
  // |amount - ref| / ref <= 0.02  ⟺  |amount - ref| * 50 <= ref
  return Math.abs(amount - ref) * 50 <= ref;
}

function monthOf(date: ISODate): string {
  return date.slice(0, 7);
}

/** Consecutive-date gaps in days are all roughly monthly (20..40 days). */
function roughlyMonthly(datesSorted: ISODate[]): boolean {
  if (datesSorted.length < 2) return false;
  for (let i = 1; i < datesSorted.length; i++) {
    const gap = dayDiff(datesSorted[i - 1], datesSorted[i]);
    if (gap < 20 || gap > 40) return false;
  }
  return true;
}

function dayDiff(a: ISODate, b: ISODate): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((tb - ta) / 86400000);
}

function modeCategory(ids: Array<string | null>): string | null {
  const counts = new Map<string, number>();
  for (const id of ids) {
    if (id == null) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN || (n === bestN && best != null && id < best)) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

export function detectSubscriptions(
  transactions: DetectTxn[],
  opts: DetectOptions = {},
): SubscriptionCandidate[] {
  const minMonths = opts.minMonths ?? 3;
  const excluded = new Set((opts.activeBillNames ?? []).map((n) => normalizeMerchant(n)));

  // Group spend-positive txns by normalized merchant.
  const groups = new Map<string, DetectTxn[]>();
  for (const t of transactions) {
    if (t.amountCents <= 0) continue; // inflows aren't subscriptions
    const merchant = normalizeMerchant(t.note ?? '');
    if (merchant === '' || excluded.has(merchant)) continue;
    const arr = groups.get(merchant);
    if (arr) arr.push(t);
    else groups.set(merchant, [t]);
  }

  const candidates: SubscriptionCandidate[] = [];
  for (const [merchant, txns] of groups) {
    if (txns.length < minMonths) continue;

    // Reference = modal exact amount (ties → smaller amount) — deterministic.
    const amountCounts = new Map<number, number>();
    for (const t of txns) amountCounts.set(t.amountCents, (amountCounts.get(t.amountCents) ?? 0) + 1);
    let ref = txns[0].amountCents as number;
    let refN = 0;
    for (const [amt, n] of amountCounts) {
      if (n > refN || (n === refN && amt < ref)) {
        ref = amt;
        refN = n;
      }
    }

    // Cluster = txns within 2% of the modal amount.
    const cluster = txns.filter((t) => within2pct(t.amountCents, cents(ref)));
    if (cluster.length < minMonths) continue;

    const distinctMonths = new Set(cluster.map((t) => monthOf(t.date)));
    if (distinctMonths.size < minMonths) continue;

    // One representative txn per month (earliest), then check monthly spacing.
    const perMonth = new Map<string, ISODate>();
    for (const t of cluster) {
      const mk = monthOf(t.date);
      const cur = perMonth.get(mk);
      if (cur == null || t.date < cur) perMonth.set(mk, t.date);
    }
    const monthlyDates = [...perMonth.values()].sort();
    if (!roughlyMonthly(monthlyDates)) continue;

    candidates.push({
      merchant,
      categoryId: modeCategory(cluster.map((t) => t.categoryId)),
      amountCents: cents(ref),
      hitCount: cluster.length,
      monthsSpanned: distinctMonths.size,
    });
  }

  return candidates.sort((a, b) => (a.merchant < b.merchant ? -1 : a.merchant > b.merchant ? 1 : 0));
}
