/**
 * Display-edge helpers around the canonical money contract. All parsing
 * delegates to money.parseDecimal (the ONLY string→cents crossing); this file
 * adds no money arithmetic.
 */
import { Cents, cents, parseDecimal, MoneyError } from '../lib/money';

/** Non-throwing probe for live form validation. Null = not (yet) a valid amount. */
export function tryParseCents(text: string): Cents | null {
  const trimmed = text.replace(/[$,\s]/g, '');
  if (trimmed === '') return null;
  try {
    return parseDecimal(trimmed);
  } catch (e) {
    if (e instanceof MoneyError) return null;
    throw e;
  }
}

/**
 * Pick a BlockMeter blockValue ("1 block = fixed dollar amount", §3) so a
 * budget renders as roughly 8–12 blocks. Integer comparison only — the
 * chosen value is one of the fixed denominations, never computed from cents.
 */
const DENOMINATIONS = [100, 250, 500, 1000, 2500, 5000, 10000] as const;

export function blockValueFor(budget: Cents): Cents {
  for (const d of DENOMINATIONS) {
    if (budget <= d * 12) return cents(d);
  }
  return cents(20000);
}
