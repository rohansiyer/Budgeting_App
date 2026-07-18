/**
 * Ordered migration registry. Append new migrations here (version N+1).
 */
import type { Migration } from './types';
import { migration001 } from './migration_001';
import { migration002 } from './migration_002';
import { migration003 } from './migration_003';
import { migration004 } from './migration_004';
import { migration005 } from './migration_005';

export { SqliteMigrationRunner } from './runner';
export type { RawSqlDb } from './runner';
export type { Migration, MigrationRunner } from './types';

export const MIGRATIONS: readonly Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
];
