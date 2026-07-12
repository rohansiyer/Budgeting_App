/**
 * Team 4 (Pond) — pay-period recap trigger (v0.3 §1.4).
 *
 * Reports which pay-period closes are pending a recap for the active chapter,
 * and persists the user's acknowledgement so a recap is presented once and only
 * once. This module NEVER mutates the flock: duck verdicts stay FINAL and
 * monthly (engine.ts). A month-end close carries the completed month's verdict
 * (the UI reads it from the engine's issued evaluations via `verdictMonth`); a
 * mid-month close carries none.
 *
 * The engine composes paydays from the store's income schedule (StoreContract
 * getPaydays) and reads/writes the acknowledgement through a RecapAckPort. The
 * ducks module keeps no key-value table of its own — evaluation bookkeeping is
 * derived from the evaluations list — so the acknowledgement is the one small
 * piece of recap state, persisted via the port (AsyncStorage in the app, an
 * in-memory fake in tests; assembled in appEngine.ts).
 */

import type { Chapter, DateRange, ISODate } from '../types/contracts';
import { pendingRecaps, type PayPeriod } from './payPeriods';

/**
 * Persists the last-acknowledged pay-period close per chapter. `closedOn` is the
 * boundary date of the newest recap the user has seen. Returns null before the
 * first acknowledgement.
 */
export interface RecapAckPort {
  getLastAcknowledged(chapterId: string): Promise<ISODate | null>;
  setLastAcknowledged(chapterId: string, closedOn: ISODate): Promise<void>;
}

export interface PayPeriodRecapDeps {
  /** Union of paydays for a range (StoreContract.getPaydays in the app). */
  getPaydays: (range: DateRange) => ISODate[];
  /** The chapter currently being lived in (StoreContract.getActiveChapter). */
  getActiveChapter: () => Chapter;
  ack: RecapAckPort;
}

export class PayPeriodRecapEngine {
  private readonly getPaydays: (range: DateRange) => ISODate[];
  private readonly getActiveChapter: () => Chapter;
  private readonly ack: RecapAckPort;

  constructor(deps: PayPeriodRecapDeps) {
    this.getPaydays = deps.getPaydays;
    this.getActiveChapter = deps.getActiveChapter;
    this.ack = deps.ack;
  }

  /**
   * Pay-period closes awaiting a recap, oldest-first. The window runs from the
   * chapter start (a partial period before the first payday is never recapped)
   * to `now`. Idempotent with respect to the persisted acknowledgement: once a
   * close is acknowledged it never reappears.
   */
  async getPendingRecaps(now: ISODate): Promise<PayPeriod[]> {
    const chapter = this.getActiveChapter();
    const paydays = this.getPaydays({ from: chapter.startedAt, to: now });
    const lastAcknowledged = await this.ack.getLastAcknowledged(chapter.id);
    return pendingRecaps({ paydays, now, lastAcknowledged });
  }

  /**
   * Record that the user has seen every pending recap up to `closedOn`.
   * Monotonic: an older boundary never rewinds the acknowledgement (so a stale
   * caller can never resurface already-seen recaps).
   */
  async acknowledge(closedOn: ISODate): Promise<void> {
    const chapter = this.getActiveChapter();
    const current = await this.ack.getLastAcknowledged(chapter.id);
    if (current !== null && closedOn <= current) return;
    await this.ack.setLastAcknowledged(chapter.id, closedOn);
  }

  /**
   * Convenience: acknowledge every currently-pending recap in one step (the
   * newest pending close). No-op when nothing is pending.
   */
  async acknowledgePending(now: ISODate): Promise<void> {
    const pending = await this.getPendingRecaps(now);
    if (pending.length === 0) return;
    await this.acknowledge(pending[pending.length - 1].closedOn);
  }
}

export function createPayPeriodRecapEngine(deps: PayPeriodRecapDeps): PayPeriodRecapEngine {
  return new PayPeriodRecapEngine(deps);
}

/** In-memory RecapAckPort for tests and previews (never shipped). */
export class InMemoryRecapAckStore implements RecapAckPort {
  private byChapter = new Map<string, ISODate>();
  writes = 0;

  async getLastAcknowledged(chapterId: string): Promise<ISODate | null> {
    return this.byChapter.get(chapterId) ?? null;
  }
  async setLastAcknowledged(chapterId: string, closedOn: ISODate): Promise<void> {
    this.writes += 1;
    this.byChapter.set(chapterId, closedOn);
  }
}
