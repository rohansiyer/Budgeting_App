import {
  ROOT_SETTINGS_ITEMS,
  LOCK_TIMEOUT_OPTIONS,
  lockTimeoutOptionForMs,
  NOTIFICATION_TOGGLES,
  formatExportTimestamp,
} from '../config';
import { LOCK_TIMEOUT_PRESETS } from '../../../security/lockSettings';
import { NOTIFICATION_KINDS } from '../../../notifications/types';

describe('ROOT_SETTINGS_ITEMS', () => {
  it('has exactly the spec entries, in order', () => {
    expect(ROOT_SETTINGS_ITEMS.map((i) => i.id)).toEqual([
      'setup',
      'backup',
      'security',
      'notifications',
      'bills',
      'searchLedger',
      'goals',
      'newChapter',
      'about',
    ]);
  });

  it('every item has a non-empty title and subtitle', () => {
    for (const item of ROOT_SETTINGS_ITEMS) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.subtitle.length).toBeGreaterThan(0);
    }
  });

  it('ids are unique', () => {
    const ids = ROOT_SETTINGS_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('LOCK_TIMEOUT_OPTIONS', () => {
  it('covers exactly the presets lockSettings.ts supports', () => {
    const presetMsValues = Object.values(LOCK_TIMEOUT_PRESETS).slice().sort((a, b) => a - b);
    const optionMsValues = LOCK_TIMEOUT_OPTIONS.map((o) => o.ms).slice().sort((a, b) => a - b);
    expect(optionMsValues).toEqual(presetMsValues);
  });

  it('lockTimeoutOptionForMs finds an exact match', () => {
    expect(lockTimeoutOptionForMs(LOCK_TIMEOUT_PRESETS.after5m).preset).toBe('after5m');
    expect(lockTimeoutOptionForMs(LOCK_TIMEOUT_PRESETS.never).preset).toBe('never');
    expect(lockTimeoutOptionForMs(LOCK_TIMEOUT_PRESETS.immediately).preset).toBe('immediately');
  });

  it('falls back to the first option for an unrecognized value', () => {
    expect(lockTimeoutOptionForMs(123456).preset).toBe(LOCK_TIMEOUT_OPTIONS[0].preset);
  });
});

describe('NOTIFICATION_TOGGLES', () => {
  it('has exactly one entry per NotificationKind', () => {
    expect(NOTIFICATION_TOGGLES.map((t) => t.kind).slice().sort()).toEqual(
      [...NOTIFICATION_KINDS].sort(),
    );
  });
});

describe('formatExportTimestamp', () => {
  it('returns null for missing or invalid input', () => {
    expect(formatExportTimestamp(null)).toBeNull();
    expect(formatExportTimestamp(undefined)).toBeNull();
    expect(formatExportTimestamp('not-a-date')).toBeNull();
    expect(formatExportTimestamp('')).toBeNull();
  });

  it('formats a known UTC instant deterministically', () => {
    expect(formatExportTimestamp('2026-07-04T20:05:00.000Z')).toBe('Jul 4, 2026 · 8:05 PM');
  });

  it('formats the midnight/noon boundary correctly', () => {
    expect(formatExportTimestamp('2026-01-01T00:00:00.000Z')).toBe('Jan 1, 2026 · 12:00 AM');
    expect(formatExportTimestamp('2026-01-01T12:00:00.000Z')).toBe('Jan 1, 2026 · 12:00 PM');
  });
});
