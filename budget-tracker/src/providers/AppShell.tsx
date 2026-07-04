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
import { colors, metrics, space, type } from '../theme/tokens';
import type { ISODate } from '../types/contracts';
import { DailyDetailScreen } from '../screens/DailyDetailScreen';

interface AppShellApi {
  /** Open the Daily detail overlay for a date. */
  openDay: (date: ISODate) => void;
  /** Show a transient snackbar with an optional Undo action. */
  showUndo: (message: string, onUndo?: () => void) => void;
}

const Ctx = createContext<AppShellApi | null>(null);

export function useAppShell(): AppShellApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useAppShell must be used within <AppShellProvider>');
  return api;
}

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [day, setDay] = useState<ISODate | null>(null);
  const [snack, setSnack] = useState<{ message: string; onUndo?: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openDay = useCallback((date: ISODate) => setDay(date), []);

  const showUndo = useCallback((message: string, onUndo?: () => void) => {
    setSnack({ message, onUndo });
  }, []);

  useEffect(() => {
    if (!snack) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSnack(null), 4000);
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
                snack.onUndo?.();
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
    left: space.lg,
    right: space.lg,
    bottom: space.xxl + space.xl,
    backgroundColor: colors.bg.raised,
    borderWidth: metrics.hairline,
    borderColor: colors.border.strong,
    borderRadius: metrics.radius,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  snackText: {
    color: colors.text.primary,
    fontFamily: type.family.text,
    fontSize: type.size.body,
    flexShrink: 1,
  },
  undo: {
    color: colors.accent.base,
    fontFamily: type.family.mono,
    fontSize: type.size.caption,
    fontWeight: type.weight.bold,
    letterSpacing: 1.5,
    marginLeft: space.lg,
  },
});
