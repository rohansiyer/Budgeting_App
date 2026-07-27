/**
 * Gate 4 wiring: the DuckEngine assembled from the real store's ports.
 * One engine per app session; consumers use the hooks below.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDuckEngine, DuckEngineImpl } from './engine';
import {
  createPayPeriodRecapEngine,
  PayPeriodRecapEngine,
  type RecapAckPort,
} from './recap';
import type { PayPeriod } from './payPeriods';
import { useBudgetStore } from '../store';
import { generateId } from '../lib/ids';
import type { Duck, ISODate } from '../types/contracts';

let engine: DuckEngineImpl | null = null;
let recapEngine: PayPeriodRecapEngine | null = null;

/**
 * Pay-period recap acknowledgement, keyed by chapter. The ducks module keeps no
 * key-value table of its own (evaluation bookkeeping is derived from the
 * evaluations list), so this one small piece of recap state rides on
 * AsyncStorage, the same durable KV the notifications/security modules use.
 */
const RECAP_ACK_PREFIX = 'ducks_recap_ack_';
const asyncStorageAckPort: RecapAckPort = {
  async getLastAcknowledged(chapterId) {
    const raw = await AsyncStorage.getItem(RECAP_ACK_PREFIX + chapterId);
    return raw && raw.length > 0 ? (raw as ISODate) : null;
  },
  async setLastAcknowledged(chapterId, closedOn) {
    await AsyncStorage.setItem(RECAP_ACK_PREFIX + chapterId, closedOn);
  },
};

export function getDuckEngine(): DuckEngineImpl {
  if (!engine) {
    const s = () => useBudgetStore.getState();
    engine = createDuckEngine({
      read: useBudgetStore.getState().evaluation,
      store: useBudgetStore.getState().duckPersistence,
      getActiveChapter: () => s().getActiveChapter(),
      generateId,
      // includeArchived: the duck engine evaluates history, so an archived
      // category must still resolve its name for past-month verdicts.
      categoryName: (id) =>
        s().listCategories({ includeArchived: true }).find((c) => c.id === id)?.name ?? id,
    });
  }
  return engine;
}

/**
 * The pay-period recap engine, composed from the store's payday projection
 * (StoreContract.getPaydays) and the AsyncStorage acknowledgement port. One per
 * session, mirroring getDuckEngine.
 */
export function getPayPeriodRecapEngine(): PayPeriodRecapEngine {
  if (!recapEngine) {
    const s = () => useBudgetStore.getState();
    recapEngine = createPayPeriodRecapEngine({
      getPaydays: (range) => s().getPaydays(range),
      getActiveChapter: () => s().getActiveChapter(),
      ack: asyncStorageAckPort,
    });
  }
  return recapEngine;
}

export interface FlockState {
  ducks: readonly Duck[];
  accessoryTier: 0 | 1 | 2 | 3;
}

/** Load the flock; re-loads when `refreshKey` changes. */
export function useFlock(refreshKey = 0): FlockState | null {
  const [flock, setFlock] = useState<FlockState | null>(null);
  useEffect(() => {
    let alive = true;
    getDuckEngine()
      .getFlock()
      .then((f) => {
        if (alive) {
          setFlock({ ducks: f.ducks, accessoryTier: (f.accessoryTier as 0 | 1 | 2 | 3) ?? 0 });
        }
      })
      .catch(() => {
        if (alive) setFlock({ ducks: [], accessoryTier: 0 });
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  return flock;
}

/**
 * Pay-period closes awaiting a recap for the active chapter (v0.3 §1.4), oldest
 * first. Recomputes when `refreshKey` changes (bump it after acknowledging).
 * `null` while loading; `[]` once loaded with nothing pending. Never throws into
 * the UI (pre-wizard / no-chapter states resolve to `[]`).
 */
export function usePendingRecaps(refreshKey = 0): readonly PayPeriod[] | null {
  const [pending, setPending] = useState<readonly PayPeriod[] | null>(null);
  useEffect(() => {
    let alive = true;
    const today = new Date().toISOString().slice(0, 10);
    getPayPeriodRecapEngine()
      .getPendingRecaps(today)
      .then((recaps) => {
        if (alive) setPending(recaps);
      })
      .catch(() => {
        if (alive) setPending([]);
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  return pending;
}
