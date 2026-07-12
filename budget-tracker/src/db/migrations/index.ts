/**
 * Ordered migration registry. Append new migrations here (version N+1).
 */
import type { Migration } from './types';
import { migration001 } from './migration_001';
import { migration002 } from './migration_002';

export { SqliteMigrationRunner } from './runner';
export type { RawSqlDb } from './runner';
export type { Migration, MigrationRunner } from './types';

export const MIGRATIONS: readonly Migration[] = [migration001, migration002];
