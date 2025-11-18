import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';
import { colors } from '../theme/colors';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error to console
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something Went Wrong</Text>
          <Text style={styles.message}>
            The app encountered an unexpected error and needs to restart.
          </Text>
          {this.state.error && (
            <Text style={styles.errorText}>{this.state.error.toString()}</Text>
          )}
          <Button
            mode="contained"
            onPress={this.handleReset}
            buttonColor={colors.accent.primary}
            style={styles.button}
          >
            Try Again
          </Button>
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
    backgroundColor: colors.background,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.status.error,
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: colors.text.secondary,
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorText: {
    fontSize: 12,
    color: colors.text.disabled,
    fontFamily: 'monospace',
    marginBottom: 24,
    textAlign: 'center',
    maxWidth: '80%',
  },
  button: {
    marginTop: 16,
    minWidth: 200,
  },
});
