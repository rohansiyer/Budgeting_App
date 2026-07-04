/**
 * App-lock settings (master toggle, biometric toggle, background timeout).
 * Non-sensitive by nature (the PIN itself lives only in secure-store, see
 * pinStorage.ts) so these are plain AsyncStorage flags.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  appLockEnabled: 'ducks_settings_app_lock_enabled',
  biometricEnabled: 'ducks_settings_biometric_enabled',
  lockTimeoutMs: 'ducks_settings_lock_timeout_ms',
} as const;

/** Named presets for the "lock after backgrounded for…" setting. */
export const LOCK_TIMEOUT_PRESETS = {
  immediately: 0,
  after30s: 30_000,
  after1m: 60_000,
  after5m: 300_000,
  never: -1,
} as const;

export type LockTimeoutPreset = keyof typeof LOCK_TIMEOUT_PRESETS;

const DEFAULT_LOCK_TIMEOUT_MS: number = LOCK_TIMEOUT_PRESETS.immediately;

async function getBool(key: string, fallback: boolean): Promise<boolean> {
  const raw = await AsyncStorage.getItem(key);
  return raw === null ? fallback : raw === 'true';
}

export async function isAppLockEnabled(): Promise<boolean> {
  return getBool(KEYS.appLockEnabled, false); // default OFF — matches notifications' default-off posture
}

export async function setAppLockEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.appLockEnabled, String(enabled));
}

export async function isBiometricEnabled(): Promise<boolean> {
  return getBool(KEYS.biometricEnabled, false);
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.biometricEnabled, String(enabled));
}

export async function getLockTimeoutMs(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEYS.lockTimeoutMs);
  if (raw === null) return DEFAULT_LOCK_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_LOCK_TIMEOUT_MS;
}

export async function setLockTimeoutMs(ms: number): Promise<void> {
  await AsyncStorage.setItem(KEYS.lockTimeoutMs, String(ms));
}

/**
 * Pure decision function for "should the lock screen show after coming back
 * from background?" — kept free of AppState so it's trivially unit-testable.
 * `never` (-1) means the timer setting is disabled (only cold start locks).
 */
export function shouldLockAfterBackground(
  backgroundedAtMs: number,
  resumedAtMs: number,
  timeoutMs: number,
): boolean {
  if (timeoutMs === LOCK_TIMEOUT_PRESETS.never) return false;
  const elapsed = resumedAtMs - backgroundedAtMs;
  return elapsed >= timeoutMs;
}
