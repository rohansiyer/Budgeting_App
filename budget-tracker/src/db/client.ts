/**
 * Database client. Drizzle owns the schema; there is NO raw DDL here anymore
 * (CONTRACTS §2/§3). Schema is created/updated exclusively by the migration
 * runner at init.
 */
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';
import { MIGRATIONS, SqliteMigrationRunner, type RawSqlDb } from './migrations';

type ExpoDb = ReturnType<typeof openDatabaseSync>;
type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const DB_NAME = 'ducks_in_a_row.db';

let expoDb: ExpoDb | null = null;
let db: DrizzleDb | null = null;

/** The drizzle instance (query builder). Throws if not initialized. */
export const getDb = (): DrizzleDb => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

/**
 * The raw expo-sqlite handle. Used by the store's AtomicDb to bracket
 * multi-row mutations with BEGIN/COMMIT/ROLLBACK on the single connection.
 */
export const getRawDb = (): ExpoDb => {
  if (!expoDb) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return expoDb;
};

/**
 * Open the connection (if needed) and run all pending migrations. Idempotent —
 * safe to call multiple times. Must run before any query.
 */
export const initDatabase = async (): Promise<void> => {
  try {
    if (!expoDb) {
      expoDb = openDatabaseSync(DB_NAME);
      db = drizzle(expoDb, { schema });
    }
    const runner = new SqliteMigrationRunner(expoDb as unknown as RawSqlDb, MIGRATIONS);
    await runner.migrateToLatest();
  } catch (error) {
    // Reset so a retry can re-open cleanly.
    expoDb = null;
    db = null;
    throw error;
  }
};

export const isDatabaseInitialized = (): boolean => db !== null;

/**
 * Test-only: drop the singletons so the next initDatabase() opens a fresh
 * database. The expo-sqlite mock hands out a new in-memory DB per open, so this
 * gives each test suite an isolated schema.
 */
export const resetDatabaseForTests = (): void => {
  expoDb = null;
  db = null;
};

export { db };
