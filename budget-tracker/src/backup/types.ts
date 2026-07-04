/**
 * Team 5 (Shipping) — Backup & restore port.
 *
 * Team 1's schema (chapters, carryover, ducks, evaluations, …) lands in
 * parallel. Rather than importing `src/db/schema.ts` directly, this module
 * builds against a small port that the orchestrator wires to the real
 * Drizzle-backed store at merge time. Until then, `FakeBackupPort` (see
 * `fakeBackupPort.ts`) stands in for tests.
 *
 * A "table dump" is intentionally generic — `{ [tableName]: row[] }` — so it
 * survives schema churn. The export must include every table (accounts,
 * categories, transactions, income sources/splits, chapters, carryover
 * entries, ducks, duck evaluations, settings, …); which exact tables exist is
 * Team 1's call, not this module's.
 */

/** One table's full contents: an array of plain row objects. */
export type TableRows = Record<string, unknown>[];

/** The entire database, keyed by table name. */
export type TableDump = Record<string, TableRows>;

/**
 * Implemented against the real db at merge time (Team 1's `AtomicDb`).
 *
 * `restoreAll` MUST be all-or-nothing: a real implementation wraps the
 * delete-then-insert sequence in `AtomicDb.withTransaction` so that a throw
 * partway through (bad row shape, FK violation, disk error) leaves the
 * existing database completely untouched — never partially overwritten.
 */
export interface BackupPort {
  /** Serialize every table to plain rows. Amounts must already be integer cents. */
  dumpAll(): Promise<TableDump>;
  /**
   * Replace the entire database with `dump`. All-or-nothing: either every
   * table is replaced, or (on any failure) nothing changes.
   */
  restoreAll(dump: TableDump): Promise<void>;
}

/** Bumped whenever the on-disk backup shape changes in a breaking way. */
export const CURRENT_BACKUP_SCHEMA_VERSION = 1;

/** Versions this build can still read (for forward migrations later). */
export const SUPPORTED_BACKUP_SCHEMA_VERSIONS = [1] as const;

/** The versioned JSON file written to disk / shared. */
export interface BackupFile {
  schemaVersion: number;
  /** ISO 8601 timestamp of when the export was produced. */
  exportedAt: string;
  /** App version string (informational only; not validated on import). */
  appVersion?: string;
  tables: TableDump;
}

export class BackupValidationError extends Error {
  constructor(
    message: string,
    /** Human-readable list of specific problems found, for diagnostics/UI. */
    public readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'BackupValidationError';
  }
}
