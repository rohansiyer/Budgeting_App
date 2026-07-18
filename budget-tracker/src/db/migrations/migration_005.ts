/**
 * Migration 5 — soft-archival of accounts, categories, and income sources.
 *
 * Adds a nullable `archived_at` column to the three configurable entity tables
 * (Drizzle src/db/schema.ts is the source of truth; this DDL stays byte-aligned
 * with it). Archival is the wizard's "real delete" (precedent:
 * chapters.archived_at, transactions.deleted_at): the row is retained for
 * history/id-joins, its `archived_at` is stamped once, and read surfaces filter
 * it out of the active plan while by-id reads still resolve it.
 *
 * Pure additive migration: existing rows backfill NULL (active). No data to
 * convert.
 */
import type { Migration } from './types';

export const migration005: Migration = {
  version: 5,
  name: 'entity_archival',
  up(execSql) {
    execSql(`ALTER TABLE accounts ADD COLUMN archived_at TEXT`);
    execSql(`ALTER TABLE categories ADD COLUMN archived_at TEXT`);
    execSql(`ALTER TABLE income_sources ADD COLUMN archived_at TEXT`);
  },
};
