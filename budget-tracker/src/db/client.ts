import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

// Lazy-initialized database instances
let expoDb: any = null;
let db: any = null;

// Get or initialize database connection
export const getDb = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

const statements = [
      `CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        starting_balance REAL NOT NULL,
        starting_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        planned_monthly REAL NOT NULL,
        planned_weekly REAL,
        recurring INTEGER NOT NULL,
        recurring_day INTEGER,
        account_id TEXT NOT NULL,
        icon TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      )`,
      `CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        category_id TEXT,
        account_id TEXT NOT NULL,
        date TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        note TEXT,
        to_account_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id),
        FOREIGN KEY (category_id) REFERENCES categories(id),
        FOREIGN KEY (to_account_id) REFERENCES accounts(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id)`,
      `CREATE TABLE IF NOT EXISTS income_configs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        amount REAL,
        min_amount REAL,
        max_amount REAL,
        day_of_week INTEGER,
        editable INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS income_splits (
        id TEXT PRIMARY KEY,
        income_config_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        amount REAL NOT NULL,
        percentage REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (income_config_id) REFERENCES income_configs(id),
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      )`,
      `CREATE TABLE IF NOT EXISTS recurring_statuses (
        id TEXT PRIMARY KEY,
        month TEXT NOT NULL,
        category_id TEXT NOT NULL,
        confirmed INTEGER NOT NULL,
        skipped INTEGER NOT NULL,
        amount REAL NOT NULL,
        notification_sent INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_recurring_month ON recurring_statuses(month)`,
      `CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        theme TEXT NOT NULL,
        week_start TEXT NOT NULL,
        notifications_enabled INTEGER NOT NULL,
        recurring_notification_time TEXT NOT NULL,
        currency TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
];


// Initialize database connection and tables
// Note: Kept as async for API consistency, even though operations are synchronous
export const initDatabase = async () => {
  try {
    console.log('Opening database connection...');

    // Open database if not already opened
    if (!expoDb) {
      expoDb = openDatabaseSync('budget_tracker.db');
      db = drizzle(expoDb, { schema });
      console.log('Database connection established');
    }

    // Create tables using synchronous API
    console.log('Creating database tables...');
    for (const statement of statements) {
      expoDb.runSync(statement);
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    // Reset state on error so retry can work
    expoDb = null;
    db = null;
    throw error;
  }
};

// Check if database is initialized
export const isDatabaseInitialized = () => {
  return db !== null;
};
