import { FakeBackupPort } from '../fakeBackupPort';
import { buildBackupFile, serializeBackupFile } from '../serializer';
import { parseBackupFile } from '../validator';
import { importBackupFromJson } from '../exportImport';
import { BackupValidationError, TableDump } from '../types';

/** A representative dump across every kind of table the design doc calls out. */
function sampleDump(): TableDump {
  return {
    accounts: [
      { id: 'acc-1', name: 'Checking', kind: 'spending', institution: 'Local Bank' },
      { id: 'acc-2', name: 'Savings', kind: 'savings', institution: null },
    ],
    categories: [
      { id: 'cat-1', name: 'Food', colorKey: 'amber', fixed: false },
      { id: 'cat-2', name: 'Rent', colorKey: 'violet', fixed: true },
    ],
    transactions: [
      { id: 'txn-1', accountId: 'acc-1', categoryId: 'cat-1', amount: 1285, kind: 'expense', date: '2026-07-01' },
      { id: 'txn-2', accountId: 'acc-1', categoryId: 'cat-2', amount: 150000, kind: 'expense', date: '2026-07-01' },
    ],
    chapters: [{ id: 'chap-1', name: 'Default', startedAt: '2026-01-01', archivedAt: null }],
    carryoverEntries: [
      {
        id: 'co-1',
        categoryId: 'cat-1',
        weekStart: '2026-06-29',
        kind: 'roll_out',
        amount: 1240,
        pairId: 'pair-1',
        counterpartWeekStart: '2026-07-06',
        attributionMonth: '2026-06',
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    ducks: [{ id: 'duck-1', name: 'Gerald', earnedMonth: '2026-05' }],
    duckEvaluations: [
      {
        id: 'eval-1',
        chapterId: 'chap-1',
        month: '2026-05',
        outcome: 'gain',
        duckCountAfter: 3,
        accessoryTierAfter: 0,
        final: true,
      },
    ],
    settings: [{ id: 'settings-1', theme: 'dark', currency: 'USD' }],
  };
}

describe('backup round-trip', () => {
  it('export -> wipe -> import reproduces the original dump exactly', async () => {
    const port = new FakeBackupPort(sampleDump());
    const before = await port.dumpAll();

    const file = buildBackupFile(await port.dumpAll(), {
      now: () => new Date('2026-07-04T18:00:00.000Z'),
      appVersion: '1.1.0',
    });
    const json = serializeBackupFile(file);

    port.wipe();
    expect(await port.dumpAll()).toEqual({});

    const outcome = await importBackupFromJson(port, json);
    expect(outcome.imported).toBe(true);
    expect(outcome.file.schemaVersion).toBe(1);

    const after = await port.dumpAll();
    expect(after).toEqual(before);
  });

  it('round-trips through parseBackupFile directly (no port) byte-for-byte on tables', () => {
    const dump = sampleDump();
    const file = buildBackupFile(dump, { now: () => new Date('2026-07-04T18:00:00.000Z') });
    const json = serializeBackupFile(file);
    const parsed = parseBackupFile(json);
    expect(parsed.tables).toEqual(dump);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.exportedAt).toBe('2026-07-04T18:00:00.000Z');
  });

  it('rejects a future/unsupported schema version without touching the store', async () => {
    const port = new FakeBackupPort(sampleDump());
    const before = await port.dumpAll();

    const badJson = JSON.stringify({
      schemaVersion: 999,
      exportedAt: new Date().toISOString(),
      tables: { accounts: [] },
    });

    await expect(importBackupFromJson(port, badJson)).rejects.toThrow(BackupValidationError);
    expect(await port.dumpAll()).toEqual(before); // untouched — no partial import
  });

  it('rejects malformed shape (non-array table) with a diagnostic issue list', async () => {
    const port = new FakeBackupPort(sampleDump());
    const badJson = JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      tables: { accounts: { not: 'an array' } },
    });

    try {
      await importBackupFromJson(port, badJson);
      fail('expected rejection');
    } catch (e) {
      expect(e).toBeInstanceOf(BackupValidationError);
      const err = e as InstanceType<typeof BackupValidationError>;
      expect(err.issues.some((issue) => issue.includes('accounts'))).toBe(true);
    }
  });

  it('rejects non-JSON input', async () => {
    const port = new FakeBackupPort(sampleDump());
    await expect(importBackupFromJson(port, 'not json{{{')).rejects.toThrow(BackupValidationError);
  });

  it('restoreAll never partially mutates state when the dump itself is malformed', async () => {
    const port = new FakeBackupPort(sampleDump());
    const before = await port.dumpAll();

    // rows must be arrays; pass a non-array to force restoreAll's internal
    // clone/validate step to throw before any assignment happens.
    await expect(
      port.restoreAll({ accounts: 'nope' as unknown as never }),
    ).rejects.toThrow();

    expect(await port.dumpAll()).toEqual(before);
  });
});
