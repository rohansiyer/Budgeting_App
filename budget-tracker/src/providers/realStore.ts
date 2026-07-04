/**
 * ReactiveStore adapter over Team 1's Zustand store (Gate 3 wiring).
 * Reactivity is a UI concern layered on top of StoreContract: Zustand's
 * subscribe drives useSyncExternalStore via a monotonic version counter.
 */
import { useBudgetStore } from '../store';
import type { ReactiveStore } from './StoreProvider';

let version = 0;
useBudgetStore.subscribe(() => {
  version += 1;
});

export const realStore: ReactiveStore = new Proxy({} as ReactiveStore, {
  get(_target, prop: string | symbol) {
    if (prop === 'subscribe') {
      return (listener: () => void) => useBudgetStore.subscribe(listener);
    }
    if (prop === 'getVersion') {
      return () => version;
    }
    // Contract methods live on live state so post-mutation reads are fresh.
    return (useBudgetStore.getState() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
