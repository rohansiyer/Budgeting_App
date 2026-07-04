import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  LOCK_TIMEOUT_PRESETS,
  getLockTimeoutMs,
  isAppLockEnabled,
  setAppLockEnabled,
  setLockTimeoutMs,
  shouldLockAfterBackground,
} from '../lockSettings';

describe('lockSettings defaults', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('app lock is OFF by default', async () => {
    expect(await isAppLockEnabled()).toBe(false);
  });

  it('persists the app-lock toggle', async () => {
    await setAppLockEnabled(true);
    expect(await isAppLockEnabled()).toBe(true);
    await setAppLockEnabled(false);
    expect(await isAppLockEnabled()).toBe(false);
  });

  it('persists a lock timeout preset', async () => {
    await setLockTimeoutMs(LOCK_TIMEOUT_PRESETS.after5m);
    expect(await getLockTimeoutMs()).toBe(LOCK_TIMEOUT_PRESETS.after5m);
  });
});

describe('shouldLockAfterBackground', () => {
  it('locks immediately when timeout is 0', () => {
    expect(shouldLockAfterBackground(1000, 1000, LOCK_TIMEOUT_PRESETS.immediately)).toBe(true);
  });

  it('does not lock before the timeout elapses', () => {
    const bg = 1_000_000;
    const resumed = bg + 10_000; // 10s later
    expect(shouldLockAfterBackground(bg, resumed, LOCK_TIMEOUT_PRESETS.after1m)).toBe(false);
  });

  it('locks once the timeout has elapsed', () => {
    const bg = 1_000_000;
    const resumed = bg + 61_000; // 61s later
    expect(shouldLockAfterBackground(bg, resumed, LOCK_TIMEOUT_PRESETS.after1m)).toBe(true);
  });

  it('never locks when the preset is "never"', () => {
    const bg = 0;
    const resumed = Number.MAX_SAFE_INTEGER;
    expect(shouldLockAfterBackground(bg, resumed, LOCK_TIMEOUT_PRESETS.never)).toBe(false);
  });
});
