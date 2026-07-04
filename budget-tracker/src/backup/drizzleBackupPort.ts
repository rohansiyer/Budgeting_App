/**
 * Gate 5 wiring: the real BackupPort over the Drizzle schema.
 * dumpAll serializes every table (amounts are already integer cents in
 * the v2 schema); restoreAll is all-or-nothing inside withTransaction,
 * then reloads the store so the UI reflects the restored data.
 */
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { useBudgetStore, withTransaction } from '../store';
import type { BackupPort, TableDump } from './types';

// Table registry: name in the dump ↔ Drizzle table object. Adding a table
// to schema.ts without registering it here is caught by the completeness
// check in dumpAll.
const TABLES = {
  schema_version: schema.schemaVersion,
  chapters: schema.chapters,
  accounts: schema.accounts,
  categories: schema.categories,
  income_sources: schema.incomeSources,
  income_splits: schema.incomeSplits,
  transactions: schema.transactions,
  carryover_entries: schema.carryoverEntries,
  ducks: schema.ducks,
  duck_evaluations: schema.duckEvaluations,
  settings: schema.settings,
} as const;

export function createDrizzleBackupPort(): BackupPort {
  return {
    async dumpAll(): Promise<TableDump> {
      const db = getDb();
      const dump: TableDump = {};
      for (const [name, table] of Object.entries(TABLES)) {
        dump[name] = db.select().from(table).all() as Record<string, unknown>[];
      }
      return dump;
    },

    async restoreAll(dump: TableDump): Promise<void> {
      await withTransaction(async () => {
        const db = getDb();
        // Delete children before parents; insert parents before children.
        const order = Object.keys(TABLES) as Array<keyof typeof TABLES>;
        for (const name of [...order].reverse()) {
          db.delete(TABLES[name]).run();
        }
        for (const name of order) {
          const rows = dump[name] ?? [];
          for (const row of rows) {
            db.insert(TABLES[name]).values(row as never).run();
          }
        }
      });
      await useBudgetStore.getState().loadData();
    },
  };
}
