/**
 * Drizzle schema — the SINGLE SOURCE OF TRUTH for the v2 data model.
 *
 * CONTRACTS §2/§3 + migrations/types.ts: Drizzle owns the schema; raw DDL in
 * client.ts is deleted. Every money column is INTEGER cents (never REAL).
 * Migration 1 (migrations/migration_001.ts) creates tables whose columns must
 * stay byte-for-byte aligned with the definitions below.
 */
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Applied-migration ledger. Managed by the MigrationRunner. */
export const schemaVersion = sqliteTable('schema_version', {
  version: integer('version').primaryKey(),
  name: text('name').notNull(),
  appliedAt: text('applied_at').notNull(),
});

/** A "chapter" = one life-configuration era (CategoryConfig/Chapter contract). */
export const chapters = sqliteTable('chapters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  startedAt: text('started_at').notNull(), // ISODate
  archivedAt: text('archived_at'), // ISODate | null
  createdAt: text('created_at').notNull(),
});

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  chapterId: text('chapter_id').notNull(),
  name: text('name').notNull(),
  institution: text('institution'), // string | null
  kind: text('kind').notNull(), // 'spending' | 'savings'
  startingBalance: integer('starting_balance').notNull(), // Cents — basis for getAccountBalance
  openedOn: text('opened_on').notNull(), // ISODate (AccountConfig.openedOn)
  createdAt: text('created_at').notNull(),
});

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  chapterId: text('chapter_id').notNull(),
  name: text('name').notNull(),
  colorKey: text('color_key').notNull(), // CategoryColorKey
  fixed: integer('fixed', { mode: 'boolean' }).notNull(),
  // Budget cadence the whole envelope UI respects (CadenceType). Migration 2
  // adds it with DEFAULT 'weekly' so legacy rows backfill; new inserts default
  // 'weekly' at the mutation boundary.
  cadence: text('cadence').notNull().default('weekly'), // 'weekly' | 'monthly'
  // Envelope config (null => fixed/no-envelope category). See EnvelopeConfig.
  envelopePeriod: text('envelope_period'), // 'weekly' | 'monthly' | null
  envelopeBudget: integer('envelope_budget'), // Cents | null
  envelopeCarryoverDefault: text('envelope_carryover_default'), // 'ask'|'roll'|'sweep'|'reset' | null
  createdAt: text('created_at').notNull(),
});

export const incomeSources = sqliteTable('income_sources', {
  id: text('id').primaryKey(),
  chapterId: text('chapter_id').notNull(),
  name: text('name').notNull(),
  amount: integer('amount').notNull(), // Cents
  // Embedded IncomeSchedule.
  scheduleKind: text('schedule_kind').notNull(), // 'weekly'|'biweekly'|'semimonthly'|'monthly'
  scheduleAnchorDate: text('schedule_anchor_date').notNull(), // ISODate
  scheduleSemimonthlyDay1: integer('schedule_semimonthly_day1'), // number | null
  scheduleSemimonthlyDay2: integer('schedule_semimonthly_day2'), // number | null
  createdAt: text('created_at').notNull(),
});

/** Per-account split weights for an income source. `ratio` is a weight, not money. */
export const incomeSplits = sqliteTable('income_splits', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').notNull(),
  accountId: text('account_id').notNull(),
  ratio: real('ratio').notNull(), // non-negative weight
  createdAt: text('created_at').notNull(),
});

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    chapterId: text('chapter_id').notNull(),
    accountId: text('account_id').notNull(),
    categoryId: text('category_id'), // null allowed (income/transfer rows)
    amount: integer('amount').notNull(), // Cents, always positive; sign implied by kind
    kind: text('kind').notNull(), // 'expense'|'income'|'transfer_out'|'transfer_in'
    date: text('date').notNull(), // ISODate
    note: text('note'),
    // Links the two legs of a transfer / the per-account legs of one income event.
    groupId: text('group_id'),
    incomeSourceId: text('income_source_id'),
    createdAt: text('created_at').notNull(),
    // Soft-delete: set on deleteTransaction; row is permanent-gone after UNDO_WINDOW_MS.
    deletedAt: text('deleted_at'),
  },
  (t) => ({
    dateIdx: index('idx_transactions_date').on(t.date),
    accountIdx: index('idx_transactions_account').on(t.accountId),
    groupIdx: index('idx_transactions_group').on(t.groupId),
  }),
);

export const carryoverEntries = sqliteTable(
  'carryover_entries',
  {
    id: text('id').primaryKey(),
    chapterId: text('chapter_id').notNull(),
    categoryId: text('category_id').notNull(),
    weekStart: text('week_start').notNull(), // WeekStart (Monday ISODate)
    kind: text('kind').notNull(), // CarryoverKind
    amount: integer('amount').notNull(), // Cents, always positive
    counterpartWeekStart: text('counterpart_week_start'), // WeekStart | null
    pairId: text('pair_id'), // links the two legs of a roll/borrow pair; null for sweeps
    attributionMonth: text('attribution_month').notNull(), // MonthKey (duck guard §5.4)
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    catWeekIdx: index('idx_carryover_cat_week').on(t.categoryId, t.weekStart),
    monthIdx: index('idx_carryover_month').on(t.attributionMonth),
    pairIdx: index('idx_carryover_pair').on(t.pairId),
  }),
);

export const ducks = sqliteTable('ducks', {
  id: text('id').primaryKey(),
  chapterId: text('chapter_id').notNull(),
  name: text('name'), // optional user-given name
  earnedMonth: text('earned_month').notNull(), // MonthKey
  createdAt: text('created_at').notNull(),
});

export const duckEvaluations = sqliteTable(
  'duck_evaluations',
  {
    id: text('id').primaryKey(),
    chapterId: text('chapter_id').notNull(),
    month: text('month').notNull(), // MonthKey
    evaluatedAt: text('evaluated_at').notNull(),
    goalFixedBillsMet: integer('goal_fixed_bills_met', { mode: 'boolean' }).notNull(),
    goalFixedBillsDetail: text('goal_fixed_bills_detail').notNull(),
    goalVariableBudgetsMet: integer('goal_variable_budgets_met', { mode: 'boolean' }).notNull(),
    goalVariableBudgetsDetail: text('goal_variable_budgets_detail').notNull(),
    goalSavingsRateMet: integer('goal_savings_rate_met', { mode: 'boolean' }).notNull(),
    goalSavingsRateDetail: text('goal_savings_rate_detail').notNull(),
    outcome: text('outcome').notNull(), // 'gain'|'hold'|'lose'|'fancy_upgrade'
    duckCountAfter: integer('duck_count_after').notNull(),
    accessoryTierAfter: integer('accessory_tier_after').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    monthIdx: index('idx_duck_eval_month').on(t.chapterId, t.month),
  }),
);

/**
 * Learned merchant → category corrections (Import engine, migration 3).
 * "Assign TRADER JOE'S to Food once, it's Food forever." `normalizedMerchant`
 * is the output of matching.normalizeMerchant and is UNIQUE per chapter, so an
 * upsert re-points an existing merchant instead of duplicating it.
 */
export const merchantCorrections = sqliteTable(
  'merchant_corrections',
  {
    id: text('id').primaryKey(),
    chapterId: text('chapter_id').notNull(),
    normalizedMerchant: text('normalized_merchant').notNull(),
    categoryId: text('category_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    merchantIdx: uniqueIndex('idx_merchant_corrections_unique').on(
      t.chapterId,
      t.normalizedMerchant,
    ),
  }),
);

/**
 * The explicit recurring-bill schedule the forecast and "Mark as bill" write
 * to (Import engine, migration 3). `dueDay` is 1..31 with clamp-to-month-end
 * semantics: a bill due on 31 resolves to the LAST day of a shorter month
 * (Feb 28/29, Apr 30). Consumers resolve the concrete date per month via
 * min(dueDay, daysInMonth). `active:false` is the non-destructive remove — the
 * row is retained (history), just excluded from the forecast.
 */
export const recurringBills = sqliteTable(
  'recurring_bills',
  {
    id: text('id').primaryKey(),
    chapterId: text('chapter_id').notNull(),
    name: text('name').notNull(),
    categoryId: text('category_id').notNull(),
    amountCents: integer('amount_cents').notNull(), // Cents
    dueDay: integer('due_day').notNull(), // 1..31, clamp-to-month-end
    active: integer('active', { mode: 'boolean' }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    chapterIdx: index('idx_recurring_bills_chapter').on(t.chapterId),
  }),
);

/** App-level settings. Single-row (id = 'main'). */
export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  theme: text('theme').notNull(), // 'dark' | 'light'
  weekStart: text('week_start').notNull(), // 'sunday' | 'monday'
  notificationsEnabled: integer('notifications_enabled', { mode: 'boolean' }).notNull(),
  currency: text('currency').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
