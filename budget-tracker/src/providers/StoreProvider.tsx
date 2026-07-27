import React, { createContext, useContext, useSyncExternalStore, ReactNode } from 'react';
import type { StoreContract } from '../types/contracts';

/**
 * Reactive wrapper AROUND StoreContract (per orchestrator: reactivity is a
 * Team 3 UI concern, not part of the contract). Any StoreContract can be
 * lifted into the tree by pairing it with a change-notification source.
 */
export interface StoreChangeSource {
  /** Notify on any committed mutation. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Monotonic snapshot version; changes on every committed mutation. */
  getVersion(): number;
}

export type ReactiveStore = StoreContract & StoreChangeSource;

const StoreCtx = createContext<ReactiveStore | null>(null);

export function StoreProvider({
  store,
  children,
}: {
  store: ReactiveStore;
  children: ReactNode;
}) {
  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>;
}

/**
 * Returns the store and subscribes the caller to mutations, so any screen
 * that calls the sync read surface re-renders when the data changes.
 */
export function useStore(): StoreContract {
  const store = useContext(StoreCtx);
  if (!store) {
    throw new Error('useStore must be used within a <StoreProvider>');
  }
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return store;
}

/**
 * Subscribe to the store's monotonic version counter (bumps on every committed
 * mutation). Screens that memoize derived data over the (referentially stable)
 * store object key those memos on this value so they recompute after a mutation
 * — the F4-4 fix for stale GoalsScreen figures.
 */
export function useStoreVersion(): number {
  const store = useContext(StoreCtx);
  if (!store) {
    throw new Error('useStoreVersion must be used within a <StoreProvider>');
  }
  return useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
}
