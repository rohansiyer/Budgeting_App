import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { StoreProvider } from './src/providers/StoreProvider';
import { AppShellProvider } from './src/providers/AppShell';
import { fakeStore } from './src/dev/fakeStore';
import { color } from './src/theme/tokens';

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

/**
 * Team 3 dev entry. Boots against the in-memory fake store so every screen
 * runs in Expo Go today. TODO(orchestrator): swap `fakeStore` for Team 1's
 * store (wrapped in the same ReactiveStore change-source) at merge — no other
 * change required, everything is typed against StoreContract.
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
