import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { StoreProvider } from './src/providers/StoreProvider';
import { AppShellProvider } from './src/providers/AppShell';
import { fakeStore } from './src/dev/fakeStore';
import { colors } from './src/theme/tokens';

// Midnight-themed navigation container background.
const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg.base,
    card: colors.bg.panel,
    text: colors.text.primary,
    border: colors.border.hairline,
    primary: colors.accent.base,
  },
};

/**
 * Team 3 dev entry. Boots against the in-memory fake store so every screen runs
 * in Expo Go today. TODO(orchestrator): swap `fakeStore` for Team 1's store
 * adapter at merge — no other change required (everything is StoreContract).
 */
export default function App() {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <StoreProvider store={fakeStore}>
          <NavigationContainer theme={navTheme}>
            <StatusBar style="light" />
            <AppShellProvider>
              <RootNavigator />
            </AppShellProvider>
          </NavigationContainer>
        </StoreProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
