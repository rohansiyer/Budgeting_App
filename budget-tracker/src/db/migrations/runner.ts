/**
 * MigrationRunner implementation (migrations/types.ts contract).
 *
 * - `schema_version` table tracks applied migrations.
 * - Pending migrations apply in ascending version order, each inside its own
 *   transaction; a throw rolls that migration back and halts (the app surfaces
 *   a recoverable error). Gaps in the version sequence are a runner error.
 * - Idempotent: already-applied versions are skipped.
 */
import type { Migration, MigrationRunner } from './types';

/** Minimal synchronous handle the runner needs (satisfied by expo-sqlite). */
export interface RawSqlDb {
  execSync(sql: string): void;
  getFirstSync<T = Record<string, unknown>>(sql: string): T | null;
}

export class SqliteMigrationRunner implements MigrationRunner {
  constructor(
    private readonly db: RawSqlDb,
    private readonly migrations: readonly Migration[],
  ) {}

  private ensureVersionTable(): void {
    this.db.execSync(
      `CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )`,
    );
  }

  async currentVersion(): Promise<number> {
    this.ensureVersionTable();
    const row = this.db.getFirstSync<{ v: number | null }>(
      'SELECT MAX(version) AS v FROM schema_version',
    );
    return row && row.v != null ? Number(row.v) : 0;
  }

  async migrateToLatest(): Promise<{ applied: number[]; currentVersion: number }> {
    this.ensureVersionTable();

    const ordered = [...this.migrations].sort((a, b) => a.version - b.version);
    for (let i = 0; i < ordered.length; i++) {
      const expected = i + 1;
      if (ordered[i].version !== expected) {
        throw new Error(
          `Migration version gap: expected ${expected}, found ${ordered[i].version} (${ordered[i].name})`,
        );
      }
    }

    let current = await this.currentVersion();
    const applied: number[] = [];

    for (const migration of ordered) {
      if (migration.version <= current) continue;

      this.db.execSync('BEGIN');
      try {
        migration.up((sql) => this.db.execSync(sql));
        this.db.execSync(
          `INSERT INTO schema_version (version, name, applied_at) VALUES (${migration.version}, '${migration.name.replace(
            /'/g,
            "''",
          )}', '${new Date().toISOString()}')`,
        );
        this.db.execSync('COMMIT');
      } catch (err) {
        try {
          this.db.execSync('ROLLBACK');
        } catch {
          // ignore rollback failures; original error is what matters
        }
        throw new Error(
          `Migration ${migration.version} (${migration.name}) failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      applied.push(migration.version);
      current = migration.version;
    }

    return { applied, currentVersion: current };
  }
}
