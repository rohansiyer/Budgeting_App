import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import * as tokens from '../theme/tokens';
import { UNDO_WINDOW_MS } from '../types/contracts';
import type { ISODate } from '../types/contracts';
import { DailyDetailScreen } from '../screens/DailyDetailScreen';

const { color, space, pixel } = tokens;
const typo = tokens.type;

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
  const [snack, setSnack] = useState<{
    message: string;
    onUndo?: () => void | Promise<void>;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openDay = useCallback((date: ISODate) => setDay(date), []);
  const showUndo = useCallback((message: string, onUndo?: () => void | Promise<void>) => {
    setSnack({ message, onUndo });
  }, []);

  useEffect(() => {
    if (!snack) return;
    if (timer.current) clearTimeout(timer.current);
    // Snackbar lifetime matches the store's undo window.
    timer.current = setTimeout(() => setSnack(null), UNDO_WINDOW_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [snack]);

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
        <View style={styles.snackbar} accessibilityLiveRegion="polite">
          <Text style={styles.snackText} numberOfLines={2}>
            {snack.message}
          </Text>
          {snack.onUndo ? (
            <Pressable
              onPress={() => {
                void snack.onUndo?.();
                setSnack(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Undo"
              hitSlop={12}
            >
              <Text style={styles.undo}>UNDO</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  snackbar: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: space.xl * 2 + space.md,
    backgroundColor: color.surfaceDeep,
    borderWidth: pixel.hairlineWidth,
    borderColor: color.border,
    paddingVertical: space.sm + space.xs,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  snackText: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.caption.fontWeight,
    flexShrink: 1,
  },
  undo: {
    color: color.accent,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    marginLeft: space.md,
  },
});
