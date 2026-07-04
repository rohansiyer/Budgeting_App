/**
 * Permission-state machine for local notifications.
 *
 * States: 'undetermined' -> (request) -> 'granted' | 'denied'.
 * 'granted' short-circuits future requests (no re-prompt). 'denied' also
 * short-circuits — expo-notifications/the OS won't re-show the system
 * prompt once denied; the only way back is `canAskAgain` (Android lets the
 * user flip it in system Settings, which `getPermissionState` will observe
 * on next check).
 */
import * as Notifications from 'expo-notifications';

import { PermissionState } from './types';

const DEFAULT_CHANNEL_ID = 'default';

/** Current OS permission state, without prompting. */
export async function getPermissionState(): Promise<PermissionState> {
  const { status } = await Notifications.getPermissionsAsync();
  return status as PermissionState;
}

/**
 * Request permission if not already granted. On Android 13+ this is what
 * triggers the POST_NOTIFICATIONS runtime prompt (handled internally by
 * expo-notifications); on older Android/iOS it's a no-op success.
 */
export async function requestPermission(): Promise<PermissionState> {
  const current = await getPermissionState();
  if (current === 'granted') return current;
  const { status } = await Notifications.requestPermissionsAsync();
  return status as PermissionState;
}

/** Must be called before scheduling any Android notification. Idempotent. */
export async function ensureAndroidChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: 'Ducks in a Row',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export { DEFAULT_CHANNEL_ID };
