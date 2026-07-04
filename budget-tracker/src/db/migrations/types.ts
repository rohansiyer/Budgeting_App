/**
 * WAVE-0 CONTRACT — Migrations (Team 1 implements the runner + migrations)
 *
 * Decision: Drizzle owns the schema (`src/db/schema.ts` is the single
 * source of truth); the raw-SQL DDL strings in client.ts are removed.
 * Schema changes ship as versioned migrations applied in order inside a
 * single transaction each, tracked in a `schema_version` table.
 */

export interface Migration {
  /** Monotonic, starting at 1. Gaps are a runner error. */
  version: number;
  name: string;
  /** Runs inside a transaction; throw to roll back and halt the app in a recoverable error state. */
  up(execSql: (sql: string) => void): void;
}

export interface MigrationRunner {
  /** Applies all pending migrations in order. Idempotent. Called once at app init, before any query. */
  migrateToLatest(): Promise<{ applied: number[]; currentVersion: number }>;
  currentVersion(): Promise<number>;
}

/**
 * Migration 1 re-founds the schema for v2 (INTEGER cents everywhere,
 * chapters, carryover_entries, duck tables, income schedule columns).
 * v1 installs are pre-release; migration 1 may rebuild tables, but must
 * preserve existing transaction/account rows, converting REAL dollars →
 * INTEGER cents via string-based conversion (never float multiply).
 */
