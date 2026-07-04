/**
 * Gate 4 wiring: the DuckEngine assembled from the real store's ports.
 * One engine per app session; consumers use the hooks below.
 */
import { useEffect, useState } from 'react';
import { createDuckEngine, DuckEngineImpl } from './engine';
import { useBudgetStore } from '../store';
import { generateId } from '../lib/ids';
import type { Duck } from '../types/contracts';

let engine: DuckEngineImpl | null = null;

export function getDuckEngine(): DuckEngineImpl {
  if (!engine) {
    const s = () => useBudgetStore.getState();
    engine = createDuckEngine({
      read: useBudgetStore.getState().evaluation,
      store: useBudgetStore.getState().duckPersistence,
      getActiveChapter: () => s().getActiveChapter(),
      generateId,
      categoryName: (id) => s().listCategories().find((c) => c.id === id)?.name ?? id,
    });
  }
  return engine;
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
