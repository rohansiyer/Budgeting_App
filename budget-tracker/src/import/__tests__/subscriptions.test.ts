/**
 * Subscription detection thresholds (Import engine F11): >=3 distinct months at
 * a steady amount (within 2%) and roughly-monthly spacing. Active bills excluded.
 */
import { cents, type Cents } from '../../lib/money';
import { detectSubscriptions, type DetectTxn } from '../subscriptions';

function tx(note: string, amount: number, date: string, categoryId: string | null = 'fun'): DetectTxn {
  return { note, amountCents: cents(amount) as Cents, date, categoryId };
}

describe('detectSubscriptions thresholds', () => {
  it('does NOT fire on 2 monthly hits', () => {
    const out = detectSubscriptions([
      tx('SPOTIFY', 1199, '2026-01-05'),
      tx('SPOTIFY', 1199, '2026-02-05'),
    ]);
    expect(out).toHaveLength(0);
  });

  it('fires on 3 monthly hits at a steady amount', () => {
    const out = detectSubscriptions([
      tx('SPOTIFY', 1199, '2026-01-05'),
      tx('SPOTIFY', 1199, '2026-02-05'),
      tx('SPOTIFY', 1199, '2026-03-05'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].merchant).toBe('SPOTIFY');
    expect(out[0].amountCents).toBe(1199);
    expect(out[0].hitCount).toBe(3);
    expect(out[0].monthsSpanned).toBe(3);
    expect(out[0].categoryId).toBe('fun');
  });

  it('tolerates amount drift within 2%', () => {
    // 1020 is exactly 2% above the modal 1000 → still clustered.
    const out = detectSubscriptions([
      tx('GYM', 1000, '2026-01-10'),
      tx('GYM', 1000, '2026-02-10'),
      tx('GYM', 1020, '2026-03-10'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].hitCount).toBe(3);
  });

  it('drops an outlier beyond 2%, falling below the month threshold', () => {
    // 1050 is 5% off the modal 1000 → excluded → only 2 remain → no candidate.
    const out = detectSubscriptions([
      tx('GYM', 1000, '2026-01-10'),
      tx('GYM', 1000, '2026-02-10'),
      tx('GYM', 1050, '2026-03-10'),
    ]);
    expect(out).toHaveLength(0);
  });

  it('requires roughly-monthly spacing', () => {
    // Three distinct months but bi-monthly (~60 day) gaps → not a subscription.
    const out = detectSubscriptions([
      tx('THING', 500, '2026-01-05'),
      tx('THING', 500, '2026-03-05'),
      tx('THING', 500, '2026-05-05'),
    ]);
    expect(out).toHaveLength(0);
  });

  it('excludes merchants already tracked as an active bill', () => {
    const txns = [
      tx('SPOTIFY', 1199, '2026-01-05'),
      tx('SPOTIFY', 1199, '2026-02-05'),
      tx('SPOTIFY', 1199, '2026-03-05'),
    ];
    expect(detectSubscriptions(txns, { activeBillNames: ['Spotify'] })).toHaveLength(0);
  });

  it('ignores inflows and blank merchants', () => {
    const out = detectSubscriptions([
      tx('', 1199, '2026-01-05'),
      tx('REFUND', -1199, '2026-02-05'),
    ]);
    expect(out).toHaveLength(0);
  });
});
