import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';

import * as tokens from '../../theme/tokens';
import { HardButton, RuledList } from '../../components/kit';
import { Screen, Row } from '../../components/Primitives';
import { SubscreenHeader } from './SubscreenHeader';
import { PinPad } from './PinPad';
import { hasPinSet, setPin, PinError } from '../../security/pinStorage';
import { isBiometricHardwareAvailable } from '../../security/biometrics';
import {
  isAppLockEnabled,
  setAppLockEnabled,
  isBiometricEnabled,
  setBiometricEnabled,
  getLockTimeoutMs,
  setLockTimeoutMs,
} from '../../security/lockSettings';
import { LOCK_TIMEOUT_OPTIONS, LockTimeoutOption, lockTimeoutOptionForMs } from './config';

const { color, space } = tokens;
const typo = tokens.type;

type Feedback = { kind: 'success' | 'error'; text: string } | null;

/** Why the two-step PIN entry flow is currently open, if it is. */
interface PinFlow {
  purpose: 'enableLock' | 'changePin';
  step: 'enter' | 'confirm';
  firstPin?: string;
  /** Bumped on mismatch so <PinPad key=…> remounts (clears digits) for a retry. */
  attempt: number;
}

export function SecurityScreen({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [lockTimeoutMs, setLockTimeoutMsState] = useState<number>(LOCK_TIMEOUT_OPTIONS[0].ms);
  const [pinFlow, setPinFlow] = useState<PinFlow | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [lockEnabled, bioEnabled, bioSupported, pinSet, timeoutMs] = await Promise.all([
        isAppLockEnabled(),
        isBiometricEnabled(),
        isBiometricHardwareAvailable(),
        hasPinSet(),
        getLockTimeoutMs(),
      ]);
      if (cancelled) return;
      setAppLockEnabledState(lockEnabled);
      setBiometricEnabledState(bioEnabled);
      setBiometricSupported(bioSupported);
      setHasPin(pinSet);
      setLockTimeoutMsState(timeoutMs);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMasterToggle = useCallback(
    async (value: boolean) => {
      setFeedback(null);
      if (value && !hasPin) {
        // Can't enable app lock without a PIN to unlock with — set one first.
        setPinError(null);
        setPinFlow({ purpose: 'enableLock', step: 'enter', attempt: 0 });
        return;
      }
      setAppLockEnabledState(value);
      await setAppLockEnabled(value);
    },
    [hasPin],
  );

  const handleBiometricToggle = useCallback(async (value: boolean) => {
    if (!biometricSupported) return;
    setBiometricEnabledState(value);
    await setBiometricEnabled(value);
  }, [biometricSupported]);

  const handleTimeoutSelect = useCallback(async (option: LockTimeoutOption) => {
    setLockTimeoutMsState(option.ms);
    await setLockTimeoutMs(option.ms);
  }, []);

  const openPinFlow = useCallback((purpose: PinFlow['purpose']) => {
    setFeedback(null);
    setPinError(null);
    setPinFlow({ purpose, step: 'enter', attempt: 0 });
  }, []);

  const cancelPinFlow = useCallback(() => {
    setPinFlow(null);
    setPinError(null);
  }, []);

  const handlePinDigits = useCallback(
    async (pin: string) => {
      if (!pinFlow) return;

      if (pinFlow.step === 'enter') {
        setPinError(null);
        setPinFlow({ ...pinFlow, step: 'confirm', firstPin: pin });
        return;
      }

      // Confirm step.
      if (pin !== pinFlow.firstPin) {
        setPinError('PINs did not match. Try again.');
        setPinFlow({ purpose: pinFlow.purpose, step: 'enter', attempt: pinFlow.attempt + 1 });
        return;
      }

      const purpose = pinFlow.purpose;
      try {
        await setPin(pin);
        setHasPin(true);
        setPinError(null);
        if (purpose === 'enableLock') {
          setAppLockEnabledState(true);
          await setAppLockEnabled(true);
        }
        setFeedback({ kind: 'success', text: 'PIN saved.' });
      } catch (e) {
        const message = e instanceof PinError ? e.message : (e as Error).message;
        setFeedback({ kind: 'error', text: `Could not save PIN: ${message}` });
      } finally {
        setPinFlow(null);
      }
    },
    [pinFlow],
  );

  if (loading) {
    return (
      <Screen scroll>
        <SubscreenHeader title="Security" onBack={onBack} />
        <Text style={styles.hint}>Loading…</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <SubscreenHeader title="Security" onBack={onBack} />

      <Row style={styles.toggleRow}>
        <View style={styles.toggleMeta}>
          <Text style={styles.rowTitle}>App lock</Text>
          <Text style={styles.rowSub}>
            {appLockEnabled ? 'On — PIN required to open the app.' : 'Off — anyone can open the app.'}
          </Text>
        </View>
        <Switch
          value={appLockEnabled}
          onValueChange={(v) => void handleMasterToggle(v)}
          trackColor={{ false: color.surface, true: color.accent }}
          thumbColor={color.text}
          accessibilityLabel={`App lock, currently ${appLockEnabled ? 'on' : 'off'}`}
        />
      </Row>

      <View style={styles.actionRow}>
        <HardButton
          label={hasPin ? 'Change PIN' : 'Set PIN'}
          variant="ghost"
          onPress={() => openPinFlow('changePin')}
          accessibilityLabel={hasPin ? 'Change your app-lock PIN' : 'Set an app-lock PIN'}
        />
      </View>

      {pinFlow ? (
        <View style={styles.pinFlow}>
          <Text style={styles.rowTitle}>
            {pinFlow.step === 'enter' ? 'Enter a new 4-digit PIN' : 'Confirm your new PIN'}
          </Text>
          {pinError ? (
            <Text style={styles.feedbackError} accessibilityLiveRegion="polite">
              {pinError}
            </Text>
          ) : null}
          <PinPad key={`${pinFlow.step}-${pinFlow.attempt}`} onComplete={(pin) => void handlePinDigits(pin)} />
          <View style={styles.actionRow}>
            <HardButton label="Cancel" variant="ghost" onPress={cancelPinFlow} accessibilityLabel="Cancel PIN setup" />
          </View>
        </View>
      ) : null}

      {feedback ? (
        <Text
          style={feedback.kind === 'error' ? styles.feedbackError : styles.feedbackSuccess}
          accessibilityLiveRegion="polite"
        >
          {feedback.text}
        </Text>
      ) : null}

      <Row style={[styles.toggleRow, styles.sectionGap]}>
        <View style={styles.toggleMeta}>
          <Text style={styles.rowTitle}>Unlock with biometrics</Text>
          <Text style={styles.rowSub}>
            {biometricSupported
              ? 'Use your device fingerprint or face unlock instead of the PIN.'
              : "This device doesn't support biometric unlock."}
          </Text>
        </View>
        <Switch
          value={biometricEnabled}
          onValueChange={(v) => void handleBiometricToggle(v)}
          disabled={!biometricSupported}
          trackColor={{ false: color.surface, true: color.accent }}
          thumbColor={color.text}
          accessibilityLabel={`Biometric unlock, currently ${biometricEnabled ? 'on' : 'off'}${
            biometricSupported ? '' : ', unavailable on this device'
          }`}
        />
      </Row>

      <Text style={[styles.sectionLabel, styles.sectionGap]} accessibilityRole="header">
        Lock after backgrounded
      </Text>
      <RuledList<LockTimeoutOption>
        data={LOCK_TIMEOUT_OPTIONS}
        keyExtractor={(o) => o.preset}
        renderRow={(option) => {
          const selected = option.ms === lockTimeoutMs;
          return (
            <Pressable
              onPress={() => void handleTimeoutSelect(option)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${option.label}${selected ? ', selected' : ''}`}
            >
              <Row style={styles.timeoutRow}>
                <Text style={styles.rowTitle}>{option.label}</Text>
                <Text style={styles.selectedMark}>{selected ? 'SELECTED' : ''}</Text>
              </Row>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: color.textMuted,
    fontSize: typo.body.fontSize,
    fontWeight: typo.caption.fontWeight,
  },
  toggleRow: {
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  toggleMeta: {
    flex: 1,
    marginRight: space.md,
  },
  rowTitle: {
    color: color.text,
    fontSize: typo.body.fontSize,
    fontWeight: typo.body.fontWeight,
  },
  rowSub: {
    color: color.textSecondary,
    fontSize: typo.caption.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: 2,
  },
  actionRow: {
    marginTop: space.xs,
    marginBottom: space.sm,
  },
  pinFlow: {
    marginBottom: space.md,
  },
  sectionGap: {
    marginTop: space.lg,
  },
  sectionLabel: {
    color: color.textMuted,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
    textTransform: typo.sectionLabel.textTransform,
    marginBottom: space.sm,
  },
  timeoutRow: {
    justifyContent: 'space-between',
  },
  selectedMark: {
    color: color.accent,
    fontSize: typo.sectionLabel.fontSize,
    fontWeight: typo.sectionLabel.fontWeight,
    letterSpacing: typo.sectionLabel.letterSpacing,
  },
  feedbackSuccess: {
    color: color.accent,
    fontSize: typo.body.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: space.sm,
  },
  feedbackError: {
    color: color.danger,
    fontSize: typo.body.fontSize,
    fontWeight: typo.caption.fontWeight,
    marginTop: space.sm,
  },
});

export default SecurityScreen;
