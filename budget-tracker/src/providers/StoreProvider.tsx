import React, { createContext, useContext, useSyncExternalStore, ReactNode } from 'react';
import type { StoreContract } from '../types/contracts';

/**
 * Injects a StoreContract implementation into the tree. Dev boots with the fake
 * (src/dev/fakeStore.ts); at merge the orchestrator swaps in Team 1's adapter —
 * no screen changes because everything is typed against StoreContract.
 */
const StoreCtx = createContext<StoreContract | null>(null);

export function StoreProvider({
  store,
  children,
}: {
  store: StoreContract;
  children: ReactNode;
}) {
  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>;
}

/**
 * Returns the store and subscribes the caller to mutations, so any screen that
 * calls a read method re-renders when the underlying data changes.
 */
export function useStore(): StoreContract {
  const store = useContext(StoreCtx);
  if (!store) {
    throw new Error('useStore must be used within a <StoreProvider>');
  }
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return store;
}
