/**
 * Subscription-detection prompt — pure copy + payload building behind the
 * "Looks like a subscription" PixelBox (handoff v3 §3.8 mockup "Subscription
 * detection · an insight rule"). BillsScreen.tsx composes these with live
 * store reads and AsyncStorage-backed ignore persistence.
 */
import type { Cents } from '../../lib/money';
import { formatCents } from '../../lib/money';
import type { SubscriptionCandidate, DetectTxn } from '../../import';
import { normalizeMerchant } from '../../import';

/** "1st" / "2nd" / "3rd" / "4th" ... (11th/12th/13th are always "th"). */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "SPOTIFY" -> "Spotify"; "THE PAPER STORE" -> "The Paper Store". */
export function titleCaseMerchant(normalizedMerchant: string): string {
  return normalizedMerchant
    .toLowerCase()
    .split(' ')
    .filter((w) => w.length > 0)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * The PixelBox sentence, e.g. "Spotify has hit for the 3rd month running,
 * $11.99 each time. Want to track it as a bill so it's reserved before you
 * spend?" Second person, exact dollar amount, no em dashes.
 */
export function subscriptionPromptCopy(candidate: SubscriptionCandidate): string {
  const name = titleCaseMerchant(candidate.merchant);
  const amount = formatCents(candidate.amountCents);
  return (
    `${name} has hit for the ${ordinal(candidate.monthsSpanned)} month running, ${amount} each time. ` +
    `Want to track it as a bill so it's reserved before you spend?`
  );
}

/**
 * The typical day-of-month this merchant's transactions land on (mode; ties
 * broken by the smaller day), for the "dueDay" of the bill created from a
 * "Mark as bill" action. Falls back to 1 if nothing matches (shouldn't
 * happen for a real candidate, since it was itself derived from these
 * transactions).
 */
export function typicalDueDay(transactions: readonly DetectTxn[], merchant: string): number {
  const dayCounts = new Map<number, number>();
  for (const t of transactions) {
    if (normalizeMerchant(t.note ?? '') !== merchant) continue;
    const day = parseInt(t.date.slice(8, 10), 10);
    if (!Number.isFinite(day)) continue;
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }
  let best = 1;
  let bestN = 0;
  for (const [day, n] of dayCounts) {
    if (n > bestN || (n === bestN && day < best)) {
      best = day;
      bestN = n;
    }
  }
  return best;
}

export interface RecurringBillInput {
  name: string;
  categoryId: string;
  amountCents: Cents;
  dueDay: number;
}

/**
 * Build the store.addRecurringBill payload for "Mark as bill". A candidate's
 * `categoryId` is null when no matched transaction carried one; in that rare
 * case `fallbackCategoryId` (the screen's default) is used instead so the
 * write never fails validation.
 */
export function candidateToRecurringBillInput(
  candidate: SubscriptionCandidate,
  opts: { dueDay: number; fallbackCategoryId: string },
): RecurringBillInput {
  return {
    name: titleCaseMerchant(candidate.merchant),
    categoryId: candidate.categoryId ?? opts.fallbackCategoryId,
    amountCents: candidate.amountCents,
    dueDay: opts.dueDay,
  };
}

const IGNORED_SUBSCRIPTION_PREFIX = 'ducks_settings_ignored_subscription_';

/**
 * AsyncStorage key for a chapter+merchant "Ignore" decision, following the
 * ducks recap-ack pattern (src/ducks/appEngine.ts): a stable prefix plus the
 * keys that scope the decision, so the app never re-nags on the same
 * candidate. Never shipped as a persistence PORT since (like recap-ack) it's
 * the one small piece of state a purely-derived engine needs.
 */
export function ignoredSubscriptionKey(chapterId: string, merchant: string): string {
  return `${IGNORED_SUBSCRIPTION_PREFIX}${chapterId}::${merchant}`;
}
