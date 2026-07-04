/** The three notification kinds the design doc calls for (§7). */
export type NotificationKind = 'billReminder' | 'envelopeWarning' | 'payday';

export const NOTIFICATION_KINDS: readonly NotificationKind[] = ['billReminder', 'envelopeWarning', 'payday'];

/** Mirrors expo-notifications' PermissionStatus values. */
export type PermissionState = 'undetermined' | 'granted' | 'denied';
