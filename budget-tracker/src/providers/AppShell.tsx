import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { Modal, View, StyleSheet } from 'react-native';
import * as tokens from '../theme/tokens';
import { Snackbar } from '../components/kit';
import { UNDO_WINDOW_MS } from '../types/contracts';
import type { ISODate } from '../types/contracts';
import { DailyDetailScreen } from '../screens/DailyDetailScreen';

const { space } = tokens;

interface AppShellApi {
  /** Open the Daily detail overlay for a date. */
  openDay: (date: ISODate) => void;
  /**
   * Show a transient snackbar. Pass `onUndo` to render an UNDO action —
   * wired to StoreContract's deleteTransaction().undo closure.
   */
  showUndo: (message: string, onUndo?: () => void | Promise<void>) => void;
}

const Ctx = createContext<AppShellApi | null>(null);

export function useAppShell(): AppShellApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useAppShell must be used within <AppShellProvider>');
  return api;
}

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [day, setDay] = useState<ISODate | null>(null);
  // `id` keys the kit Snackbar so a new message remounts it and restarts its
  // self-dismiss timer (lifetime matches the store's undo window).
  const [snack, setSnack] = useState<{
    id: number;
    message: string;
    onUndo?: () => void | Promise<void>;
  } | null>(null);
  const nextId = useRef(0);

  const openDay = useCallback((date: ISODate) => setDay(date), []);
  const showUndo = useCallback((message: string, onUndo?: () => void | Promise<void>) => {
    nextId.current += 1;
    setSnack({ id: nextId.current, message, onUndo });
  }, []);

  return (
    <Ctx.Provider value={{ openDay, showUndo }}>
      {children}

      <Modal
        visible={day !== null}
        animationType="slide"
        onRequestClose={() => setDay(null)}
        presentationStyle="fullScreen"
      >
        {day !== null ? <DailyDetailScreen date={day} onClose={() => setDay(null)} /> : null}
      </Modal>

      {snack ? (
        <View style={styles.snackbarHost} pointerEvents="box-none">
          <Snackbar
            key={snack.id}
            visible
            message={snack.message}
            durationMs={UNDO_WINDOW_MS}
            onTimeout={() => setSnack(null)}
            onAction={
              snack.onUndo
                ? () => {
                    void snack.onUndo?.();
                    setSnack(null);
                  }
                : undefined
            }
          />
        </View>
      ) : null}
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  // Placement wrapper only — the bar itself is the kit Snackbar (the app's
  // single undo-bar implementation; a11y-v03 follow-up unified the ad hoc
  // duplicate that used to live here).
  snackbarHost: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: space.xl * 2 + space.md,
  },
});
