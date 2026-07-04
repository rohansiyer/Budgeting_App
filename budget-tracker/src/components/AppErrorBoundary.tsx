import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as tokens from '../theme/tokens';
import { HardButton } from './kit';

const { color, space } = tokens;
const typo = tokens.type;

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Midnight-styled error boundary (replaces the v1 Paper-based one). */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('AppErrorBoundary caught:', error, info);
  }

  reset = () => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something broke</Text>
          <Text style={styles.message}>The app hit an unexpected error.</Text>
          <Text style={styles.detail} numberOfLines={4}>
            {error.message}
          </Text>
          <HardButton label="Try again" onPress={this.reset} accessibilityLabel="Try again" />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: color.bg,
    padding: space.xl,
  },
  title: {
    color: color.danger,
    fontSize: typo.title.fontSize,
    fontWeight: typo.title.fontWeight,
    marginBottom: space.sm,
  },
  message: {
    color: color.textSecondary,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
    marginBottom: space.sm,
    textAlign: 'center',
  },
  detail: {
    color: color.textMuted,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginBottom: space.lg,
    textAlign: 'center',
  },
});

export default AppErrorBoundary;
