/**
 * Migration 1 — re-found the schema for v2.
 *
 * Per migrations/types.ts: Drizzle (src/db/schema.ts) is the source of truth;
 * this migration's DDL must stay aligned with it. INTEGER cents everywhere.
 *
 * v1 installs are pre-release. Where legacy REAL-dollar tables exist we
 * preserve existing account + transaction rows, converting dollars → cents via
 * a STRING conversion (`printf('%.2f')` → strip '.'), never a float multiply
 * (`amount * 100`), then drop the legacy tables. A default chapter owns the
 * migrated rows.
 *
 * The migration contract only hands us `execSql` (no query capability), so it
 * cannot branch on "is this a legacy install?". We make every statement valid
 * in BOTH cases:
 *   - `CREATE TABLE IF NOT EXISTS <legacy>` guarantees the copy's FROM-table
 *     exists (a no-op when the real legacy table is already there).
 *   - copy INTO a `_v2` staging table, then DROP the legacy name and RENAME —
 *     so a fresh install simply copies zero rows.
 */
import type { Migration } from './types';

const CH = 'chapter_default';

export const migration001: Migration = {
  version: 1,
  name: 'refound_v2_schema',
  up(execSql) {
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    // --- chapters -----------------------------------------------------------
    execSql(`CREATE TABLE chapters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      archived_at TEXT,
      created_at TEXT NOT NULL
    )`);

    // --- accounts (preserve legacy rows) -----------------------------------
    // Ensure a legacy-shaped source table exists so the copy compiles even on
    // fresh installs (no-op if the real legacy table is present).
    execSql(`CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      starting_balance REAL,
      starting_date TEXT,
      created_at TEXT
    )`);
    // Default chapter only when there is legacy data to own.
    execSql(
      `INSERT INTO chapters (id, name, started_at, archived_at, created_at)
       SELECT '${CH}', 'My budget', '${today}', NULL, '${now}'
       WHERE (SELECT COUNT(*) FROM accounts) > 0`,
    );
    execSql(`CREATE TABLE accounts_v2 (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      name TEXT NOT NULL,
      institution TEXT,
      kind TEXT NOT NULL,
      starting_balance INTEGER NOT NULL,
      opened_on TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    execSql(
      `INSERT INTO accounts_v2 (id, chapter_id, name, institution, kind, starting_balance, opened_on, created_at)
       SELECT id, '${CH}', name, NULL,
              CASE WHEN type = 'savings' THEN 'savings' ELSE 'spending' END,
              CAST(REPLACE(printf('%.2f', COALESCE(starting_balance, 0)), '.', '') AS INTEGER),
              COALESCE(starting_date, '${today}'), COALESCE(created_at, '${now}')
       FROM accounts`,
    );
    execSql(`DROP TABLE accounts`);
    execSql(`ALTER TABLE accounts_v2 RENAME TO accounts`);

    // --- transactions (preserve legacy rows) -------------------------------
    execSql(`CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      amount REAL,
      type TEXT,
      category_id TEXT,
      account_id TEXT,
      date TEXT,
      note TEXT,
      to_account_id TEXT,
      created_at TEXT
    )`);
    execSql(`CREATE TABLE transactions_v2 (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      category_id TEXT,
      amount INTEGER NOT NULL,
      kind TEXT NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      group_id TEXT,
      income_source_id TEXT,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    )`);
    // Expense / income / transfer_out legs (category refs dropped — legacy
    // categories don't survive the re-founding).
    execSql(
      `INSERT INTO transactions_v2 (id, chapter_id, account_id, category_id, amount, kind, date, note, group_id, income_source_id, created_at, deleted_at)
       SELECT id, '${CH}', account_id, NULL,
              CAST(REPLACE(printf('%.2f', COALESCE(amount, 0)), '.', '') AS INTEGER),
              CASE
                WHEN type = 'income' THEN 'income'
                WHEN type = 'transfer' THEN 'transfer_out'
                ELSE 'expense'
              END,
              COALESCE(date, '${today}'), note,
              CASE WHEN type = 'transfer' THEN id ELSE NULL END,
              NULL, COALESCE(created_at, '${now}'), NULL
       FROM transactions
       WHERE account_id IS NOT NULL`,
    );
    // Paired transfer_in leg so both accounts move.
    execSql(
      `INSERT INTO transactions_v2 (id, chapter_id, account_id, category_id, amount, kind, date, note, group_id, income_source_id, created_at, deleted_at)
       SELECT id || '_in', '${CH}', to_account_id, NULL,
              CAST(REPLACE(printf('%.2f', COALESCE(amount, 0)), '.', '') AS INTEGER),
              'transfer_in', COALESCE(date, '${today}'), note, id, NULL,
              COALESCE(created_at, '${now}'), NULL
       FROM transactions
       WHERE type = 'transfer' AND to_account_id IS NOT NULL`,
    );
    execSql(`DROP TABLE transactions`);
    execSql(`ALTER TABLE transactions_v2 RENAME TO transactions`);
    execSql(`CREATE INDEX idx_transactions_date ON transactions(date)`);
    execSql(`CREATE INDEX idx_transactions_account ON transactions(account_id)`);
    execSql(`CREATE INDEX idx_transactions_group ON transactions(group_id)`);

    // --- categories (not preserved) ----------------------------------------
    execSql(`DROP TABLE IF EXISTS categories`);
    execSql(`CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color_key TEXT NOT NULL,
      fixed INTEGER NOT NULL,
      envelope_period TEXT,
      envelope_budget INTEGER,
      envelope_carryover_default TEXT,
      created_at TEXT NOT NULL
    )`);

    // --- income sources + splits (not preserved) ---------------------------
    execSql(`CREATE TABLE income_sources (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      schedule_kind TEXT NOT NULL,
      schedule_anchor_date TEXT NOT NULL,
      schedule_semimonthly_day1 INTEGER,
      schedule_semimonthly_day2 INTEGER,
      created_at TEXT NOT NULL
    )`);
    execSql(`DROP TABLE IF EXISTS income_splits`);
    execSql(`CREATE TABLE income_splits (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      ratio REAL NOT NULL,
      created_at TEXT NOT NULL
    )`);

    // --- carryover ---------------------------------------------------------
    execSql(`CREATE TABLE carryover_entries (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      kind TEXT NOT NULL,
      amount INTEGER NOT NULL,
      counterpart_week_start TEXT,
      pair_id TEXT,
      attribution_month TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    execSql(`CREATE INDEX idx_carryover_cat_week ON carryover_entries(category_id, week_start)`);
    execSql(`CREATE INDEX idx_carryover_month ON carryover_entries(attribution_month)`);
    execSql(`CREATE INDEX idx_carryover_pair ON carryover_entries(pair_id)`);

    // --- duck tables -------------------------------------------------------
    execSql(`CREATE TABLE ducks (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      name TEXT,
      earned_month TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    execSql(`CREATE TABLE duck_evaluations (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      month TEXT NOT NULL,
      evaluated_at TEXT NOT NULL,
      goal_fixed_bills_met INTEGER NOT NULL,
      goal_fixed_bills_detail TEXT NOT NULL,
      goal_variable_budgets_met INTEGER NOT NULL,
      goal_variable_budgets_detail TEXT NOT NULL,
      goal_savings_rate_met INTEGER NOT NULL,
      goal_savings_rate_detail TEXT NOT NULL,
      outcome TEXT NOT NULL,
      duck_count_after INTEGER NOT NULL,
      accessory_tier_after INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`);
    execSql(`CREATE INDEX idx_duck_eval_month ON duck_evaluations(chapter_id, month)`);

    // --- settings (not preserved) ------------------------------------------
    execSql(`DROP TABLE IF EXISTS settings`);
    execSql(`CREATE TABLE settings (
      id TEXT PRIMARY KEY,
      theme TEXT NOT NULL,
      week_start TEXT NOT NULL,
      notifications_enabled INTEGER NOT NULL,
      currency TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);

    // --- drop remaining legacy-only tables ---------------------------------
    execSql(`DROP TABLE IF EXISTS income_configs`);
    execSql(`DROP TABLE IF EXISTS recurring_statuses`);
  },
};
