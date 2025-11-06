import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'checking' | 'savings'
  startingBalance: real('starting_balance').notNull(),
  startingDate: text('starting_date').notNull(), // ISO date
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  amount: real('amount').notNull(),
  type: text('type').notNull(), // 'income' | 'expense' | 'transfer' | 'adjustment'
  categoryId: text('category_id'),
  accountId: text('account_id').notNull(),
  date: text('date').notNull(), // ISO date
  timestamp: text('timestamp').notNull(), // ISO datetime
  note: text('note'),
  toAccountId: text('to_account_id'), // For transfers
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  plannedMonthly: real('planned_monthly').notNull(),
  plannedWeekly: real('planned_weekly'),
  recurring: integer('recurring', { mode: 'boolean' }).notNull(),
  recurringDay: integer('recurring_day'), // 1-31
  accountId: text('account_id').notNull(),
  icon: text('icon'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const incomeConfigs = sqliteTable('income_configs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'weekly_paycheck' | 'tutoring' | 'other'
  amount: real('amount'), // For fixed income
  minAmount: real('min_amount'), // For variable income
  maxAmount: real('max_amount'), // For variable income
  dayOfWeek: integer('day_of_week'), // 0-6 for weekly paycheck
  editable: integer('editable', { mode: 'boolean' }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const incomeSplits = sqliteTable('income_splits', {
  id: text('id').primaryKey(),
  incomeConfigId: text('income_config_id').notNull(),
  accountId: text('account_id').notNull(),
  amount: real('amount').notNull(),
  percentage: real('percentage').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const recurringStatuses = sqliteTable('recurring_statuses', {
  id: text('id').primaryKey(),
  month: text('month').notNull(), // YYYY-MM
  categoryId: text('category_id').notNull(),
  confirmed: integer('confirmed', { mode: 'boolean' }).notNull(),
  skipped: integer('skipped', { mode: 'boolean' }).notNull(),
  amount: real('amount').notNull(),
  notificationSent: integer('notification_sent', { mode: 'boolean' }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  theme: text('theme').notNull(), // 'dark' | 'light'
  weekStart: text('week_start').notNull(), // 'sunday' | 'monday'
  notificationsEnabled: integer('notifications_enabled', { mode: 'boolean' }).notNull(),
  recurringNotificationTime: text('recurring_notification_time').notNull(), // HH:mm
  currency: text('currency').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
