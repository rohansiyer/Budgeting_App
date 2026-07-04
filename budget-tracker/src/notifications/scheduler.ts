/**
 * Schedule/cancel helpers for the three notification kinds. Every entry
 * point is gated on (a) OS permission being granted and (b) the per-type
 * user toggle being on — a caller can call these freely without
 * re-checking, they just silently no-op (return false) when gated.
 */
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';

import { ensureAndroidChannel, getPermissionState } from './permissions';
import { isNotificationKindEnabled } from './settings';
import { NotificationKind } from './types';

const BILL_REMINDER_ID = 'ducks-bill-reminder-1st-8pm';

function paydayId(date: string): string {
  return `ducks-payday-${date}`;
}

async function canSend(kind: NotificationKind): Promise<boolean> {
  const [permission, enabled] = await Promise.all([getPermissionState(), isNotificationKindEnabled(kind)]);
  return permission === 'granted' && enabled;
}

/**
 * Fire an immediate local notification, gated on the given kind's
 * permission + user toggle. Callers (envelope-warning logic lives
 * elsewhere — Team 1/4's store/duck code) decide WHEN to call this; this
 * module just owns whether/how it actually reaches the OS.
 */
export async function notify(kind: NotificationKind, content: { title: string; body: string }): Promise<boolean> {
  if (!(await canSend(kind))) return false;
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    content,
    trigger: null, // fire immediately
  });
  return true;
}

/**
 * Next 8PM-on-the-1st occurrence from `now`. Exported for testing; also
 * lets a caller show "next reminder: …" in settings without scheduling.
 */
export function nextBillReminderDate(now: Date = new Date()): Date {
  const candidate = new Date(now.getFullYear(), now.getMonth(), 1, 20, 0, 0, 0);
  if (candidate.getTime() > now.getTime()) return candidate;
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 20, 0, 0, 0);
}

/**
 * "Bills due" reminder — 8PM on the 1st of every month.
 *
 * expo-notifications' `CalendarTriggerInput` (day-of-month recurrence) is
 * iOS-only; this app is Android-first, so instead we schedule a one-shot
 * `DateTriggerInput` for the *next* occurrence and re-arm it for the
 * following month each time the app is opened (call this again on launch —
 * cheap and idempotent since it always replaces the same identifier).
 */
export async function scheduleBillReminder(now: Date = new Date()): Promise<boolean> {
  if (!(await canSend('billReminder'))) return false;
  await ensureAndroidChannel();
  await Notifications.cancelScheduledNotificationAsync(BILL_REMINDER_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: BILL_REMINDER_ID,
    content: {
      title: 'Bills due this month',
      body: 'Check your fixed bills for the month ahead.',
    },
    trigger: { type: SchedulableTriggerInputTypes.DATE, date: nextBillReminderDate(now) },
  });
  return true;
}

export async function cancelBillReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(BILL_REMINDER_ID);
}

/** Payday morning note for a specific ISODate ("YYYY-MM-DD"), fired at 8AM that day. */
export async function schedulePaydayNote(date: string, amountLabel?: string): Promise<boolean> {
  if (!(await canSend('payday'))) return false;
  const [year, month, day] = date.split('-').map(Number);
  const fireAt = new Date(year, month - 1, day, 8, 0, 0);
  if (fireAt.getTime() <= Date.now()) return false; // don't schedule into the past

  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: paydayId(date),
    content: {
      title: 'Payday!',
      body: amountLabel ? `${amountLabel} is landing today.` : 'Income is landing today.',
    },
    trigger: { type: SchedulableTriggerInputTypes.DATE, date: fireAt },
  });
  return true;
}

export async function cancelPaydayNote(date: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(paydayId(date));
}

export async function cancelAllScheduled(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
