/**
 * Team 4 (Pond) — pay-period boundary math + recap trigger (v0.3 §1.4).
 *
 * Boundaries are derived from the real schedule engine (src/lib/schedule.ts) so
 * these tests exercise weekly/biweekly/monthly/semimonthly paydays end to end,
 * then the recap engine's pending/acknowledge round-trip over an in-memory ack
 * store. No duck mutation happens anywhere here — pay-period recaps are
 * verdict-less by design.
 */

import type { Chapter, DateRange, IncomeSchedule, ISODate } from '../../types/contracts';
import { paydaysBetween } from '../../lib/schedule';
import {
  payPeriodsFromPaydays,
  pendingRecaps,
  type PayPeriod,
} from '../payPeriods';
import { createPayPeriodRecapEngine, InMemoryRecapAckStore } from '../recap';

function chapter(startedAt = '2025-01-01'): Chapter {
  return { id: 'chap-1', name: 'Recap', startedAt, archivedAt: null };
}

// ---------------------------------------------------------------------------
// Pure boundary math
// ---------------------------------------------------------------------------

describe('payPeriodsFromPaydays: pairing + kind + verdictMonth', () => {
  test('weekly paydays within one month are all mid-month closes', () => {
    const paydays = paydaysBetween(
      { kind: 'weekly', anchorDate: '2025-01-03' },
      { from: '2025-01-01', to: '2025-01-31' },
    );
    // Jan 3, 10, 17, 24, 31
    const periods = payPeriodsFromPaydays(paydays);
    expect(periods.map((p) => p.closedOn)).toEqual(['2025-01-10', '2025-01-17', '2025-01-24', '2025-01-31']);
    expect(periods.every((p) => p.kind === 'pay_period')).toBe(true);
    expect(periods.every((p) => p.verdictMonth === null)).toBe(true);
    // A period ends the day before its closing payday.
    expect(periods[0]).toMatchObject({ start: '2025-01-03', end: '2025-01-09', closedOn: '2025-01-10' });
  });

  test('a close that crosses into a new month is a month_end recap carrying the prior month', () => {
    const paydays = paydaysBetween(
      { kind: 'biweekly', anchorDate: '2025-01-03' },
      { from: '2025-01-01', to: '2025-03-01' },
    );
    // Jan 3, 17, 31, Feb 14, Feb 28
    const periods = payPeriodsFromPaydays(paydays);
    const monthEnds = periods.filter((p) => p.kind === 'month_end');
    expect(monthEnds).toHaveLength(1);
    expect(monthEnds[0]).toMatchObject({
      start: '2025-01-31',
      closedOn: '2025-02-14',
      kind: 'month_end',
      verdictMonth: '2025-01',
    });
    // The other closes are mid-month, verdict-less.
    expect(periods.filter((p) => p.kind === 'pay_period').map((p) => p.closedOn)).toEqual([
      '2025-01-17',
      '2025-01-31',
      '2025-02-28',
    ]);
  });

  test('monthly paydays: every close is a month_end recap', () => {
    const paydays = paydaysBetween(
      { kind: 'monthly', anchorDate: '2025-01-15' },
      { from: '2025-01-01', to: '2025-04-01' },
    );
    // Jan 15, Feb 15, Mar 15
    const periods = payPeriodsFromPaydays(paydays);
    expect(periods.map((p) => ({ closedOn: p.closedOn, verdictMonth: p.verdictMonth }))).toEqual([
      { closedOn: '2025-02-15', verdictMonth: '2025-01' },
      { closedOn: '2025-03-15', verdictMonth: '2025-02' },
    ]);
    expect(periods.every((p) => p.kind === 'month_end')).toBe(true);
  });

  test('semimonthly [1,15]: closes alternate mid-month / month_end', () => {
    const paydays = paydaysBetween(
      { kind: 'semimonthly', anchorDate: '2025-01-01', semimonthlyDays: [1, 15] },
      { from: '2025-01-01', to: '2025-02-28' },
    );
    // Jan 1, Jan 15, Feb 1, Feb 15
    const periods = payPeriodsFromPaydays(paydays);
    expect(periods.map((p) => [p.closedOn, p.kind])).toEqual([
      ['2025-01-15', 'pay_period'],
      ['2025-02-01', 'month_end'],
      ['2025-02-15', 'pay_period'],
    ]);
    expect(periods.find((p) => p.kind === 'month_end')!.verdictMonth).toBe('2025-01');
  });

  test('fewer than two paydays yields no closed period (partial stub is never recapped)', () => {
    expect(payPeriodsFromPaydays([])).toEqual([]);
    expect(payPeriodsFromPaydays(['2025-01-03'])).toEqual([]);
  });

  test('unsorted / duplicate paydays are normalised before pairing', () => {
    const periods = payPeriodsFromPaydays(['2025-01-17', '2025-01-03', '2025-01-17', '2025-01-10']);
    expect(periods.map((p) => p.closedOn)).toEqual(['2025-01-10', '2025-01-17']);
  });
});

describe('pendingRecaps: now cutoff + acknowledgement filter', () => {
  const paydays: ISODate[] = ['2025-01-03', '2025-01-10', '2025-01-17', '2025-01-24'];

  test('a period whose close has not arrived yet is excluded', () => {
    const pending = pendingRecaps({ paydays, now: '2025-01-20', lastAcknowledged: null });
    expect(pending.map((p) => p.closedOn)).toEqual(['2025-01-10', '2025-01-17']);
  });

  test('closes at or before the last acknowledgement drop out', () => {
    const pending = pendingRecaps({ paydays, now: '2025-01-31', lastAcknowledged: '2025-01-10' });
    expect(pending.map((p) => p.closedOn)).toEqual(['2025-01-17', '2025-01-24']);
  });
});

// ---------------------------------------------------------------------------
// Recap engine: composed paydays + persisted acknowledgement
// ---------------------------------------------------------------------------

function buildEngine(opts: { startedAt?: string; schedule?: IncomeSchedule } = {}) {
  const ch = chapter(opts.startedAt);
  const schedule: IncomeSchedule = opts.schedule ?? { kind: 'weekly', anchorDate: '2025-01-03' };
  const ack = new InMemoryRecapAckStore();
  const getPaydays = (range: DateRange): ISODate[] => paydaysBetween(schedule, range);
  const engine = createPayPeriodRecapEngine({ getPaydays, getActiveChapter: () => ch, ack });
  return { engine, ack, chapter: ch };
}

describe('PayPeriodRecapEngine', () => {
  test('reports pending closes from chapter start to now, oldest-first', async () => {
    const { engine } = buildEngine({ startedAt: '2025-01-01' });
    const pending = await engine.getPendingRecaps('2025-02-10');
    // Weekly: closes Jan10,17,24,31 (mid-month) + Feb7 (month_end, Jan verdict).
    expect(pending.map((p: PayPeriod) => p.closedOn)).toEqual([
      '2025-01-10', '2025-01-17', '2025-01-24', '2025-01-31', '2025-02-07',
    ]);
    expect(pending.filter((p) => p.kind === 'month_end')).toHaveLength(1);
    expect(pending.find((p) => p.kind === 'month_end')!.verdictMonth).toBe('2025-01');
  });

  test('acknowledge then re-query returns nothing pending (round-trip)', async () => {
    const { engine, ack } = buildEngine({ startedAt: '2025-01-01' });
    const pending = await engine.getPendingRecaps('2025-02-10');
    const newest = pending[pending.length - 1].closedOn;
    await engine.acknowledge(newest);
    expect(await ack.getLastAcknowledged('chap-1')).toBe('2025-02-07');
    expect(await engine.getPendingRecaps('2025-02-10')).toHaveLength(0);
  });

  test('acknowledgePending clears the whole current surface in one step', async () => {
    const { engine } = buildEngine({ startedAt: '2025-01-01' });
    expect((await engine.getPendingRecaps('2025-02-10')).length).toBeGreaterThan(0);
    await engine.acknowledgePending('2025-02-10');
    expect(await engine.getPendingRecaps('2025-02-10')).toHaveLength(0);
  });

  test('a later close after acknowledgement reappears; earlier ones stay dismissed', async () => {
    const { engine } = buildEngine({ startedAt: '2025-01-01' });
    await engine.acknowledgePending('2025-01-20'); // acks through Jan 17
    const later = await engine.getPendingRecaps('2025-02-10');
    expect(later.map((p) => p.closedOn)).toEqual([
      '2025-01-24', '2025-01-31', '2025-02-07',
    ]);
  });

  test('acknowledge is monotonic: an older boundary never rewinds the pointer', async () => {
    const { engine, ack } = buildEngine({ startedAt: '2025-01-01' });
    await engine.acknowledge('2025-02-07');
    await engine.acknowledge('2025-01-10'); // stale caller, must be ignored
    expect(await ack.getLastAcknowledged('chap-1')).toBe('2025-02-07');
    expect(await engine.getPendingRecaps('2025-02-10')).toHaveLength(0);
  });

  test('acknowledgePending is a no-op when nothing is pending (no spurious write)', async () => {
    const { engine, ack } = buildEngine({ startedAt: '2025-01-01' });
    await engine.acknowledgePending('2025-01-05'); // before the first close (Jan 10)
    expect(ack.writes).toBe(0);
    expect(await ack.getLastAcknowledged('chap-1')).toBeNull();
  });

  test('the partial period before the first payday is never recapped', async () => {
    // Chapter starts Jan 1; first weekly payday is Jan 3. The Jan 1..Jan 2 stub
    // must not produce a recap (mirrors the engine partial first-month skip).
    const { engine } = buildEngine({ startedAt: '2025-01-01' });
    const pending = await engine.getPendingRecaps('2025-01-12');
    expect(pending.map((p) => p.start)).toEqual(['2025-01-03']);
    expect(pending.map((p) => p.closedOn)).toEqual(['2025-01-10']);
  });
});
