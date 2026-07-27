/**
 * Migration 3 — import data layer.
 *
 * Adds two tables the CSV-import engine writes to (Drizzle src/db/schema.ts is
 * the source of truth; this DDL stays byte-aligned with it):
 *   - merchant_corrections: the learned "TRADER JOE'S -> Food forever" store.
 *     normalized_merchant is UNIQUE per chapter so an upsert re-points instead
 *     of duplicating.
 *   - recurring_bills: the explicit bill schedule the forecast + "Mark as bill"
 *     write to. due_day is 1..31 with clamp-to-month-end semantics documented on
 *     the schema; active=0 is the non-destructive remove.
 *
 * Pure additive migration: no legacy data to convert.
 */
import type { Migration } from './types';

export const migration003: Migration = {
  version: 3,
  name: 'import_data_layer',
  up(execSql) {
    execSql(`CREATE TABLE merchant_corrections (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      normalized_merchant TEXT NOT NULL,
      category_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    execSql(
      `CREATE UNIQUE INDEX idx_merchant_corrections_unique ON merchant_corrections(chapter_id, normalized_merchant)`,
    );

    execSql(`CREATE TABLE recurring_bills (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      due_day INTEGER NOT NULL,
      active INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`);
    execSql(`CREATE INDEX idx_recurring_bills_chapter ON recurring_bills(chapter_id)`);
  },
};
