import { create } from 'zustand';
import { db } from '../db/client';
import * as schema from '../db/schema';
import { Account, Transaction, Category, Settings, IncomeConfig } from '../types';
import { eq, and, between, desc } from 'drizzle-orm';
import { startOfMonth, endOfMonth, format } from 'date-fns';

const generateId = () => {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

interface BudgetStore {
  // State
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  incomeConfigs: IncomeConfig[];
  settings: Settings | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadData: () => Promise<void>;
  clearError: () => void;

  // Account actions
  addAccount: (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;

  // Transaction actions
  addTransaction: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  getTransactionsForDate: (date: string) => Transaction[];
  getTransactionsForDateRange: (startDate: string, endDate: string) => Transaction[];

  // Category actions
  addCategory: (category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  // Settings actions
  updateSettings: (updates: Partial<Settings>) => Promise<void>;

  // Computed values
  getAccountBalance: (accountId: string, asOfDate?: string) => number;
  getTotalBalance: (asOfDate?: string) => number;
}

export const useBudgetStore = create<BudgetStore>((set, get) => ({
  accounts: [],
  transactions: [],
  categories: [],
  incomeConfigs: [],
  settings: null,
  isLoading: false,
  error: null,

  loadData: async () => {
    set({ isLoading: true, error: null });
    try {
      const [accounts, transactions, categories, incomeConfigs, settings] = await Promise.all([
        db.select().from(schema.accounts),
        db.select().from(schema.transactions).orderBy(desc(schema.transactions.timestamp)),
        db.select().from(schema.categories),
        db.select().from(schema.incomeConfigs),
        db.select().from(schema.settings).limit(1),
      ]);

      set({
        accounts: accounts as Account[],
        transactions: transactions as Transaction[],
        categories: categories as Category[],
        incomeConfigs: incomeConfigs as IncomeConfig[],
        settings: settings.length > 0 ? (settings[0] as Settings) : null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error loading data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load data';
      set({ isLoading: false, error: errorMessage });
      throw error; // Re-throw so UI can handle it
    }
  },

  clearError: () => {
    set({ error: null });
  },

  // Account actions
  addAccount: async (account) => {
    try {
      const now = new Date().toISOString();
      const newAccount: Account = {
        ...account,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(schema.accounts).values(newAccount);
      set({ accounts: [...get().accounts, newAccount], error: null });
    } catch (error) {
      console.error('Error adding account:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to add account';
      set({ error: errorMessage });
      throw error;
    }
  },

  updateAccount: async (id, updates) => {
    try {
      const now = new Date().toISOString();
      await db
        .update(schema.accounts)
        .set({ ...updates, updatedAt: now })
        .where(eq(schema.accounts.id, id));

      set({
        accounts: get().accounts.map((acc) =>
          acc.id === id ? { ...acc, ...updates, updatedAt: now } : acc
        ),
        error: null,
      });
    } catch (error) {
      console.error('Error updating account:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update account';
      set({ error: errorMessage });
      throw error;
    }
  },

  deleteAccount: async (id) => {
    try {
      await db.delete(schema.accounts).where(eq(schema.accounts.id, id));
      set({ accounts: get().accounts.filter((acc) => acc.id !== id), error: null });
    } catch (error) {
      console.error('Error deleting account:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete account';
      set({ error: errorMessage });
      throw error;
    }
  },

  // Transaction actions
  addTransaction: async (transaction) => {
    try {
      const now = new Date().toISOString();
      const newTransaction: Transaction = {
        ...transaction,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(schema.transactions).values(newTransaction);
      set({ transactions: [newTransaction, ...get().transactions], error: null });
    } catch (error) {
      console.error('Error adding transaction:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to add transaction';
      set({ error: errorMessage });
      throw error;
    }
  },

  updateTransaction: async (id, updates) => {
    try {
      const now = new Date().toISOString();
      await db
        .update(schema.transactions)
        .set({ ...updates, updatedAt: now })
        .where(eq(schema.transactions.id, id));

      set({
        transactions: get().transactions.map((txn) =>
          txn.id === id ? { ...txn, ...updates, updatedAt: now } : txn
        ),
        error: null,
      });
    } catch (error) {
      console.error('Error updating transaction:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update transaction';
      set({ error: errorMessage });
      throw error;
    }
  },

  deleteTransaction: async (id) => {
    try {
      await db.delete(schema.transactions).where(eq(schema.transactions.id, id));
      set({ transactions: get().transactions.filter((txn) => txn.id !== id), error: null });
    } catch (error) {
      console.error('Error deleting transaction:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete transaction';
      set({ error: errorMessage });
      throw error;
    }
  },

  getTransactionsForDate: (date: string) => {
    return get().transactions.filter((txn) => txn.date === date);
  },

  getTransactionsForDateRange: (startDate: string, endDate: string) => {
    return get().transactions.filter(
      (txn) => txn.date >= startDate && txn.date <= endDate
    );
  },

  // Category actions
  addCategory: async (category) => {
    try {
      const now = new Date().toISOString();
      const newCategory: Category = {
        ...category,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(schema.categories).values(newCategory);
      set({ categories: [...get().categories, newCategory], error: null });
    } catch (error) {
      console.error('Error adding category:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to add category';
      set({ error: errorMessage });
      throw error;
    }
  },

  updateCategory: async (id, updates) => {
    try {
      const now = new Date().toISOString();
      await db
        .update(schema.categories)
        .set({ ...updates, updatedAt: now })
        .where(eq(schema.categories.id, id));

      set({
        categories: get().categories.map((cat) =>
          cat.id === id ? { ...cat, ...updates, updatedAt: now } : cat
        ),
        error: null,
      });
    } catch (error) {
      console.error('Error updating category:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update category';
      set({ error: errorMessage });
      throw error;
    }
  },

  deleteCategory: async (id) => {
    try {
      await db.delete(schema.categories).where(eq(schema.categories.id, id));
      set({ categories: get().categories.filter((cat) => cat.id !== id), error: null });
    } catch (error) {
      console.error('Error deleting category:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete category';
      set({ error: errorMessage });
      throw error;
    }
  },

  // Settings actions
  updateSettings: async (updates) => {
    try {
      const currentSettings = get().settings;
      if (!currentSettings) {
        const error = new Error('Settings not initialized');
        set({ error: error.message });
        throw error;
      }

      const now = new Date().toISOString();
      await db
        .update(schema.settings)
        .set({ ...updates, updatedAt: now })
        .where(eq(schema.settings.id, currentSettings.id));

      set({
        settings: { ...currentSettings, ...updates, updatedAt: now },
        error: null,
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update settings';
      set({ error: errorMessage });
      throw error;
    }
  },

  // Computed values
  getAccountBalance: (accountId: string, asOfDate?: string) => {
    const account = get().accounts.find((acc) => acc.id === accountId);
    if (!account) return 0;

    const cutoffDate = asOfDate || new Date().toISOString().split('T')[0];
    const relevantTransactions = get().transactions.filter(
      (txn) => txn.date <= cutoffDate
    );

    let balance = account.startingBalance;

    relevantTransactions.forEach((txn) => {
      if (txn.accountId === accountId) {
        if (txn.type === 'income' || txn.type === 'adjustment') {
          balance += txn.amount;
        } else if (txn.type === 'expense') {
          balance -= txn.amount;
        } else if (txn.type === 'transfer' && txn.toAccountId) {
          balance -= txn.amount; // Money leaving this account
        }
      }

      // For transfers, add money coming in
      if (txn.type === 'transfer' && txn.toAccountId === accountId) {
        balance += txn.amount;
      }
    });

    return balance;
  },

  getTotalBalance: (asOfDate?: string) => {
    const accounts = get().accounts;
    return accounts.reduce((total, account) => {
      return total + get().getAccountBalance(account.id, asOfDate);
    }, 0);
  },
}));
