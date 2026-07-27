/**
 * Migration 2 — envelope cadence column.
 *
 * Adds `categories.cadence` (CadenceType). DEFAULT 'weekly' backfills every
 * existing row, so a v1 install upgrades to weekly-only behavior unchanged.
 * Drizzle (src/db/schema.ts) is the source of truth; this DDL stays aligned
 * with the column defined there.
 */
import type { Migration } from './types';

export const migration002: Migration = {
  version: 2,
  name: 'category_cadence',
  up(execSql) {
    execSql(`ALTER TABLE categories ADD COLUMN cadence TEXT NOT NULL DEFAULT 'weekly'`);
  },
};
