/**
 * Migration 4 — named savings goals (handoff §3.10).
 *
 * Adds the `goals` table the goal-card UI and projection math read/write
 * (Drizzle src/db/schema.ts is the source of truth; this DDL stays byte-aligned
 * with it):
 *   - target_cents: the goal amount, a positive INTEGER of cents.
 *   - savings_account_id: the linked savings account, or NULL to track the sum
 *     of all savings-kind account balances.
 *   - active: 1 by default; active=0 is the non-destructive remove (row kept for
 *     history, excluded from the goal list), consistent with recurring_bills.
 *   - achieved_at: nullable ISO timestamp, stamped when the goal is first met.
 *
 * Pure additive migration: no legacy data to convert.
 */
import type { Migration } from './types';

export const migration004: Migration = {
  version: 4,
  name: 'named_goals',
  up(execSql) {
    execSql(`CREATE TABLE goals (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      name TEXT NOT NULL,
      target_cents INTEGER NOT NULL,
      savings_account_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      achieved_at TEXT
    )`);
    execSql(`CREATE INDEX idx_goals_chapter ON goals(chapter_id)`);
  },
};
