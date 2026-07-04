import { BackupPort, TableDump, TableRows } from './types';

/**
 * In-memory `BackupPort` for tests (and for driving the round-trip test
 * without a real database). At merge, the orchestrator swaps this out for a
 * Drizzle-backed implementation wired to Team 1's `AtomicDb`.
 */
export class FakeBackupPort implements BackupPort {
  private tables: TableDump;

  constructor(initial: TableDump = {}) {
    this.tables = cloneDump(initial);
  }

  async dumpAll(): Promise<TableDump> {
    return cloneDump(this.tables);
  }

  /**
   * All-or-nothing: build the replacement in a local variable first (so a
   * throw while validating/cloning never touches `this.tables`), then swap
   * it in as the single last step. Mirrors the contract a real
   * `AtomicDb.withTransaction`-backed implementation must uphold.
   */
  async restoreAll(dump: TableDump): Promise<void> {
    const next = cloneDump(dump); // throws before any mutation if `dump` is malformed
    this.tables = next;
  }

  /** Test helper: simulate "lost phone" by wiping all state. */
  wipe(): void {
    this.tables = {};
  }

  /** Test helper: peek at current state without going through dumpAll(). */
  snapshot(): TableDump {
    return cloneDump(this.tables);
  }
}

function cloneDump(dump: TableDump): TableDump {
  const out: TableDump = {};
  for (const [table, rows] of Object.entries(dump)) {
    if (!Array.isArray(rows)) {
      throw new TypeError(`FakeBackupPort: table "${table}" is not an array of rows`);
    }
    out[table] = (rows as TableRows).map((row) => ({ ...row }));
  }
  return out;
}
