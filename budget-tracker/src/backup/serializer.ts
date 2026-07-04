import { BackupFile, CURRENT_BACKUP_SCHEMA_VERSION, TableDump } from './types';

/** Build the versioned envelope around a raw table dump. */
export function buildBackupFile(tables: TableDump, opts: { now?: () => Date; appVersion?: string } = {}): BackupFile {
  const now = opts.now ?? (() => new Date());
  return {
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    exportedAt: now().toISOString(),
    appVersion: opts.appVersion,
    tables,
  };
}

/** Pretty-printed JSON serialization of a backup file. */
export function serializeBackupFile(file: BackupFile): string {
  return JSON.stringify(file, null, 2);
}

const BACKUP_FILE_PREFIX = 'ducks-in-a-row-backup';

/** e.g. "ducks-in-a-row-backup-2026-07-04T18-30-00.json" (colon-free for filesystems). */
export function backupFileName(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/:/g, '-').replace(/\..+$/, '');
  return `${BACKUP_FILE_PREFIX}-${stamp}.json`;
}
