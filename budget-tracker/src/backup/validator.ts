/**
 * Shape + version validation for backup files. Deliberately dependency-free
 * (no zod/ajv) — this is a small, hand-rolled structural validator, per
 * Team 5's brief.
 */
import {
  BackupFile,
  BackupValidationError,
  SUPPORTED_BACKUP_SCHEMA_VERSIONS,
  TableDump,
} from './types';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate that `raw` (parsed JSON, i.e. untyped) is a well-formed
 * `BackupFile` of a version this build supports. Throws
 * `BackupValidationError` with a list of every problem found (not just the
 * first) so a failed import can show a useful diagnostic.
 */
export function validateBackupFile(raw: unknown): BackupFile {
  const issues: string[] = [];

  if (!isPlainObject(raw)) {
    throw new BackupValidationError('Backup file is not a JSON object.', [
      'root value must be an object',
    ]);
  }

  const { schemaVersion, exportedAt, tables, appVersion } = raw as Record<string, unknown>;

  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    issues.push('schemaVersion must be an integer');
  } else if (!(SUPPORTED_BACKUP_SCHEMA_VERSIONS as readonly number[]).includes(schemaVersion)) {
    issues.push(
      `schemaVersion ${schemaVersion} is not supported by this build (supported: ${SUPPORTED_BACKUP_SCHEMA_VERSIONS.join(', ')})`,
    );
  }

  if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) {
    issues.push('exportedAt must be an ISO date string');
  }

  if (appVersion !== undefined && typeof appVersion !== 'string') {
    issues.push('appVersion must be a string when present');
  }

  if (!isPlainObject(tables)) {
    issues.push('tables must be an object keyed by table name');
  } else {
    for (const [tableName, rows] of Object.entries(tables)) {
      if (!Array.isArray(rows)) {
        issues.push(`tables.${tableName} must be an array of rows`);
        continue;
      }
      rows.forEach((row, i) => {
        if (!isPlainObject(row)) {
          issues.push(`tables.${tableName}[${i}] must be a plain object row`);
        }
      });
    }
  }

  if (issues.length > 0) {
    throw new BackupValidationError(
      `Backup file failed validation (${issues.length} issue${issues.length === 1 ? '' : 's'}).`,
      issues,
    );
  }

  return {
    schemaVersion: schemaVersion as number,
    exportedAt: exportedAt as string,
    appVersion: appVersion as string | undefined,
    tables: tables as TableDump,
  };
}

/** Parse a raw JSON string produced by `serializeBackupFile` and validate it. */
export function parseBackupFile(json: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new BackupValidationError('Backup file is not valid JSON.', [
      e instanceof Error ? e.message : String(e),
    ]);
  }
  return validateBackupFile(raw);
}
