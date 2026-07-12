/**
 * Pure config + helpers for the Settings screen and its subscreens.
 * Deliberately free of React/RN imports so it's trivially unit-testable
 * (same style as src/security/__tests__ and src/notifications/__tests__).
 */
import { LOCK_TIMEOUT_PRESETS, LockTimeoutPreset } from '../../security/lockSettings';
import { NOTIFICATION_KINDS, NotificationKind } from '../../notifications/types';

/** Setup wizard entry mode — the seam `onOpenSetup` on SettingsScreen accepts. */
export type SetupMode = 'edit' | 'newChapter';

/** Subscreens this module owns and pushes onto its local, in-tab "stack". */
export type SettingsRouteName =
  | 'root'
  | 'backup'
  | 'security'
  | 'notifications'
  | 'bills'
  | 'searchLedger'
  | 'about';

/** Every id the root list can produce, including the two that don't push a
 * local subscreen (they call the `onOpenSetup` seam instead). */
export type RootSettingsItemId = SettingsRouteName | 'setup' | 'newChapter';

export interface RootSettingsItem {
  id: RootSettingsItemId;
  title: string;
  subtitle: string;
}

/** The six root-list entries, in display order (design doc §4.6). */
export const ROOT_SETTINGS_ITEMS: readonly RootSettingsItem[] = [
  { id: 'setup', title: 'Your setup', subtitle: 'Accounts, income, envelopes, savings target' },
  { id: 'backup', title: 'Backup', subtitle: 'Export or import your data' },
  { id: 'security', title: 'Security', subtitle: 'App lock, PIN, biometrics' },
  { id: 'notifications', title: 'Notifications', subtitle: 'Bill reminders, payday, envelope warnings' },
  { id: 'bills', title: 'Bills', subtitle: 'Upcoming bills and subscriptions' },
  { id: 'searchLedger', title: 'Search ledger', subtitle: 'Find any transaction, filter by category' },
  { id: 'newChapter', title: 'New chapter', subtitle: 'Archive this setup, keep the flock' },
  { id: 'about', title: 'About', subtitle: 'App info' },
];

export const NEW_CHAPTER_CONFIRM_TITLE = 'Start a new chapter?';
/** Archiving copy per DucksInARow_DesignDoc_v2.md §4.6 / §7. */
export const NEW_CHAPTER_CONFIRM_MESSAGE =
  'Start a new chapter — your history and your ducks survive. This archives your current ' +
  'accounts, income, and envelopes, then walks you through setting up fresh ones.';

export const IMPORT_CONFIRM_TITLE = 'Replace everything?';
export const IMPORT_CONFIRM_MESSAGE =
  "Importing a backup REPLACES every account, transaction, envelope, and duck currently in " +
  "the app with the contents of the backup file. This can't be undone.";

/** AsyncStorage key for the "last export" timestamp shown in the Backup subscreen. */
export const LAST_BACKUP_EXPORT_KEY = 'ducks_settings_last_backup_export_at';

/** One row of the "lock after backgrounded for…" picker. */
export interface LockTimeoutOption {
  preset: LockTimeoutPreset;
  ms: number;
  label: string;
}

/** Ordered timeout presets for the picker — every preset lockSettings.ts supports. */
export const LOCK_TIMEOUT_OPTIONS: readonly LockTimeoutOption[] = [
  { preset: 'immediately', ms: LOCK_TIMEOUT_PRESETS.immediately, label: 'Immediately' },
  { preset: 'after30s', ms: LOCK_TIMEOUT_PRESETS.after30s, label: 'After 30 seconds' },
  { preset: 'after1m', ms: LOCK_TIMEOUT_PRESETS.after1m, label: 'After 1 minute' },
  { preset: 'after5m', ms: LOCK_TIMEOUT_PRESETS.after5m, label: 'After 5 minutes' },
  { preset: 'never', ms: LOCK_TIMEOUT_PRESETS.never, label: 'Never (lock on cold start only)' },
];

/** Find the option matching a stored ms value; falls back to the first option. */
export function lockTimeoutOptionForMs(ms: number): LockTimeoutOption {
  return LOCK_TIMEOUT_OPTIONS.find((o) => o.ms === ms) ?? LOCK_TIMEOUT_OPTIONS[0];
}

export interface NotificationToggleConfig {
  kind: NotificationKind;
  title: string;
  subtitle: string;
}

/** Per-type notification toggles shown in the Notifications subscreen. */
export const NOTIFICATION_TOGGLES: readonly NotificationToggleConfig[] = [
  { kind: 'billReminder', title: 'Bill reminders', subtitle: '8 PM on the 1st of the month' },
  { kind: 'payday', title: 'Payday', subtitle: '8 AM on scheduled payday' },
  { kind: 'envelopeWarning', title: 'Envelope warnings', subtitle: 'When a category nears its limit' },
];

// Sanity check at module load: every NotificationKind has exactly one toggle config entry.
if (NOTIFICATION_TOGGLES.length !== NOTIFICATION_KINDS.length) {
  throw new Error('NOTIFICATION_TOGGLES is out of sync with NOTIFICATION_KINDS');
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Format an export ISO timestamp for display. UTC-based (device-timezone
 * independent, matching src/format/dates.ts's convention) so it's
 * deterministic in tests. Returns null for a missing/invalid value.
 */
export function formatExportTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const month = MONTHS_SHORT[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  let hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const mm = String(minutes).padStart(2, '0');
  return `${month} ${day}, ${year} · ${hours}:${mm} ${ampm}`;
}
