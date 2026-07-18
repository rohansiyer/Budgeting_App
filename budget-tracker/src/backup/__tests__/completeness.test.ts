/**
 * Backup completeness (F5-1). The real completeness check the old
 * drizzleBackupPort comment falsely claimed to have: iterate every SQLiteTable
 * exported from schema.ts and assert each is registered in the backup TABLES
 * registry, so adding a table to the schema without registering it for
 * backup/restore fails HERE instead of silently losing data on export.
 */
import { is, getTableName, Table } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as schema from '../../db/schema';
import { TABLES } from '../drizzleBackupPort';

const schemaTables = Object.values(schema).filter((v) => is(v, SQLiteTable)) as Table[];
const registeredNames = new Set<string>(Object.values(TABLES).map((t) => getTableName(t)));

describe('backup TABLES completeness', () => {
  it('registers every SQLiteTable exported from schema.ts', () => {
    // Sanity: the schema really does export tables (guards against a broken filter).
    expect(schemaTables.length).toBeGreaterThanOrEqual(14);
    const missing = schemaTables
      .map((t) => getTableName(t))
      .filter((name) => !registeredNames.has(name));
    expect(missing).toEqual([]);
  });

  it('registers no phantom table absent from the schema', () => {
    const schemaNames = new Set(schemaTables.map((t) => getTableName(t)));
    for (const table of Object.values(TABLES)) {
      expect(schemaNames).toContain(getTableName(table));
    }
  });

  it('explicitly covers the three tables the old registry omitted', () => {
    for (const name of ['merchant_corrections', 'recurring_bills', 'goals']) {
      expect(registeredNames).toContain(name);
    }
  });
});
