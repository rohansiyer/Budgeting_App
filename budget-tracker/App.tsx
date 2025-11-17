import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { Button } from 'react-native-paper';
import { RootNavigator } from './src/navigation/RootNavigator';
import { initDatabase } from './src/db/client';
import { seedInitialData } from './src/db/seed';
import { colors } from './src/theme/colors';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const initialize = async () => {
    try {
      setInitError(null);
      setIsRetrying(false);
      await initDatabase();
      await seedInitialData();
      setIsReady(true);
    } catch (error) {
      console.error('Failed to initialize app:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setInitError(`Database initialization failed: ${errorMessage}`);
    }
  };

  useEffect(() => {
    initialize();
  }, []);

  const handleRetry = () => {
    setIsRetrying(true);
    initialize();
  };

  // Show error screen with retry option
  if (initError && !isRetrying) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorContent}>
          <ActivityIndicator size="large" color={colors.status.error} style={styles.errorIcon} />
          <Text style={styles.errorTitle}>Initialization Failed</Text>
          <Text style={styles.errorMessage}>{initError}</Text>
          <View style={styles.buttonContainer}>
            <View style={styles.retryButton}>
              <Button mode="contained" onPress={handleRetry} buttonColor={colors.accent.primary}>
                Retry Initialization
              </Button>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Show loading screen
  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Initializing database...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <RootNavigator />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 16,
    color: colors.text.primary,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 20,
  },
  errorContent: {
    alignItems: 'center',
    maxWidth: 400,
  },
  errorIcon: {
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.status.error,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: colors.text.secondary,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonContainer: {
    width: '100%',
  },
  retryButton: {
    marginTop: 8,
  },
});
