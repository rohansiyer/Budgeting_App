import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, space, type } from '../theme/tokens';
import { HardButton } from './kit';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Midnight-styled error boundary (no react-native-paper). */
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
          <HardButton label="Try again" onPress={this.reset} />
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
    backgroundColor: colors.bg.base,
    padding: space.xl,
  },
  title: {
    color: colors.status.spend,
    fontFamily: type.family.text,
    fontSize: type.size.title,
    fontWeight: type.weight.bold,
    marginBottom: space.md,
  },
  message: {
    color: colors.text.secondary,
    fontFamily: type.family.text,
    fontSize: type.size.body,
    marginBottom: space.md,
    textAlign: 'center',
  },
  detail: {
    color: colors.text.muted,
    fontFamily: type.family.mono,
    fontSize: type.size.caption,
    marginBottom: space.xl,
    textAlign: 'center',
  },
});

export default AppErrorBoundary;
