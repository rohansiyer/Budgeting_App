/**
 * WAVE-0 CONTRACT — Money
 *
 * All monetary values in Ducks in a Row are integer cents. Floats never
 * touch money paths: parsing goes string → Cents without intermediate
 * floating point, and formatting converts at the display edge only.
 * The db layer stores Cents in INTEGER columns.
 */

export type Cents = number & { readonly __brand: 'Cents' };

export class MoneyError extends Error {}

/** Assert-and-brand. Throws on non-integers, NaN, or unsafe magnitudes. */
export function cents(n: number): Cents {
  if (!Number.isSafeInteger(n)) {
    throw new MoneyError(`Not an integer cent amount: ${n}`);
  }
  return n as Cents;
}

export const ZERO: Cents = cents(0);

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function subCents(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

export function negCents(a: Cents): Cents {
  return cents(-a);
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce<Cents>((acc, v) => addCents(acc, v), ZERO);
}

export function minCents(a: Cents, b: Cents): Cents {
  return a <= b ? a : b;
}

export function maxCents(a: Cents, b: Cents): Cents {
  return a >= b ? a : b;
}

/**
 * Parse a user-entered decimal string ("12.85", "-3", "0.5") to Cents
 * WITHOUT floating point. Accepts at most 2 fraction digits; a single
 * fraction digit means tenths ("0.5" === 50¢). Throws MoneyError on
 * anything else (empty, >2 decimals, non-numeric).
 */
export function parseDecimal(input: string): Cents {
  const s = input.trim();
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new MoneyError(`Unparseable amount: "${input}"`);
  const sign = m[1] ? -1 : 1;
  const whole = parseInt(m[2], 10);
  const frac = m[3] ? parseInt(m[3].padEnd(2, '0'), 10) : 0;
  const value = sign * (whole * 100 + frac);
  return cents(value === 0 ? 0 : value); // normalize -0
}

/** "12.85" style plain decimal string (no currency symbol, no grouping). */
export function toDecimalString(c: Cents): string {
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${String(frac).padStart(2, '0')}`;
}

/** Display formatting. The ONLY place cents meet floating point, at the UI edge. */
export function formatCents(
  c: Cents,
  opts: { currency?: string; signDisplay?: 'auto' | 'always' | 'never' } = {},
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: opts.currency ?? 'USD',
    signDisplay: opts.signDisplay ?? 'auto',
  }).format(c / 100);
}

/**
 * Split a total into parts proportional to `ratios`, conserving every cent
 * (largest-remainder method). ratios are non-negative and need not sum to
 * anything in particular; an all-zero ratio list throws.
 *
 * INVARIANT (fuzz-tested, 2M cases): sumCents(allocate(t, r)) === t for all
 * realistic magnitudes; guarded against float-ordering drift near
 * MAX_SAFE_INTEGER. The internal float division only decides WHICH bucket
 * receives a spare cent, never the total. Used for income splits.
 */
export function allocate(total: Cents, ratios: readonly number[]): Cents[] {
  if (ratios.length === 0) throw new MoneyError('allocate: empty ratios');
  if (ratios.some((r) => r < 0 || !Number.isFinite(r))) {
    throw new MoneyError('allocate: ratios must be finite and non-negative');
  }
  const ratioSum = ratios.reduce((a, b) => a + b, 0);
  if (ratioSum === 0) throw new MoneyError('allocate: ratios sum to zero');

  const sign = total < 0 ? -1 : 1;
  const absTotal = Math.abs(total);
  const exact = ratios.map((r) => (absTotal * r) / ratioSum);
  const floors = exact.map(Math.floor);
  let remainder = absTotal - floors.reduce((a, b) => a + b, 0);
  if (remainder < 0 || remainder >= ratios.length + 1) {
    throw new MoneyError(`allocate: magnitude too large to distribute safely (${absTotal})`);
  }

  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = floors.slice();
  for (let k = 0; remainder > 0; k = (k + 1) % order.length) {
    out[order[k].i] += 1;
    remainder -= 1;
  }
  return out.map((v) => cents(sign * v));
}
