import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { StoreProvider } from './src/providers/StoreProvider';
import { AppShellProvider } from './src/providers/AppShell';
import { realStore } from './src/providers/realStore';
import { useBudgetStore } from './src/store';
import { initDatabase } from './src/db/client';
import { seedInitialData } from './src/db/seed';
import { createStoreSetupWriter } from './src/setup/storeSetupWriter';
import { DuckResultsGate } from './src/ducks/DuckResultsGate';
import { LockScreen } from './src/security/LockScreen';
import { useAutoLock } from './src/security/useAutoLock';
import { isAppLockEnabled } from './src/security/lockSettings';
import { color, space } from './src/theme/tokens';

const navigationRef = createNavigationContainerRef<Record<string, undefined>>();

// Midnight-themed navigation container (tokens only).
const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: color.bg,
    card: color.surface,
    text: color.text,
    border: color.border,
    primary: color.accent,
  },
};

type BootState = { phase: 'booting' } | { phase: 'ready' } | { phase: 'error'; message: string };

export default function App() {
  const [boot, setBoot] = useState<BootState>({ phase: 'booting' });
  const [locked, setLocked] = useState(false);
  useAutoLock(() => setLocked(true));
  useEffect(() => {
    void isAppLockEnabled().then((enabled) => {
      if (enabled) setLocked(true); // cold start behind the lock
    });
  }, []);

  const bootstrap = useCallback(async () => {
    setBoot({ phase: 'booting' });
    try {
      await initDatabase(); // opens sqlite + runs migrations
      await useBudgetStore.getState().loadData();
      await seedInitialData(createStoreSetupWriter()); // ensure default chapter only
      await useBudgetStore.getState().loadData();
      setBoot({ phase: 'ready' });
    } catch (e) {
      setBoot({ phase: 'error', message: e instanceof Error ? e.message : 'Failed to start' });
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (boot.phase !== 'ready') {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: color.bg,
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.md,
        }}
      >
        {boot.phase === 'booting' ? (
          <ActivityIndicator color={color.accent} accessibilityLabel="Loading Ducks in a Row" />
        ) : (
          <>
            <Text style={{ color: color.danger, fontWeight: '700' }}>Something went wrong</Text>
            <Text style={{ color: color.textMuted, paddingHorizontal: space.xl, textAlign: 'center' }}>
              {boot.message}
            </Text>
            <Text
              accessibilityRole="button"
              accessibilityLabel="Retry startup"
              onPress={() => void bootstrap()}
              style={{ color: color.accent, fontWeight: '800', padding: space.md }}
            >
              Retry
            </Text>
          </>
        )}
      </View>
    );
  }

  if (locked) {
    return (
      <SafeAreaProvider>
        <LockScreen onUnlock={() => setLocked(false)} />
      </SafeAreaProvider>
    );
  }

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <StoreProvider store={realStore}>
          <NavigationContainer ref={navigationRef} theme={navTheme}>
            <StatusBar style="light" />
            <AppShellProvider>
              <RootNavigator />
              <DuckResultsGate
                onGoToPond={() => {
                  if (navigationRef.isReady()) navigationRef.navigate('Pond');
                }}
              />
            </AppShellProvider>
          </NavigationContainer>
        </StoreProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
