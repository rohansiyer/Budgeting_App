/**
 * Per-type user toggles. All default OFF — the user must opt in from
 * Settings before any notification (of any kind) fires, even once OS
 * permission is granted.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { NotificationKind } from './types';

function storageKey(kind: NotificationKind): string {
  return `ducks_notifications_enabled_${kind}`;
}

export async function isNotificationKindEnabled(kind: NotificationKind): Promise<boolean> {
  const raw = await AsyncStorage.getItem(storageKey(kind));
  return raw === 'true'; // null (never set) -> false: default OFF
}

export async function setNotificationKindEnabled(kind: NotificationKind, enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(storageKey(kind), String(enabled));
}

export async function getAllNotificationSettings(): Promise<Record<NotificationKind, boolean>> {
  const [billReminder, envelopeWarning, payday] = await Promise.all([
    isNotificationKindEnabled('billReminder'),
    isNotificationKindEnabled('envelopeWarning'),
    isNotificationKindEnabled('payday'),
  ]);
  return { billReminder, envelopeWarning, payday };
}
