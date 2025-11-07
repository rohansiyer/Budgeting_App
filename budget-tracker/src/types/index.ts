export type AccountType = 'checking' | 'savings';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  startingBalance: number;
  startingDate: string; // ISO date
  createdAt: string;
  updatedAt: string;
}

export type TransactionType = 'income' | 'expense' | 'transfer' | 'adjustment';

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  categoryId: string | null;
  accountId: string;
  date: string; // ISO date
  timestamp: string; // ISO datetime
  note?: string;
  // For transfers
  toAccountId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  plannedMonthly: number;
  plannedWeekly?: number;
  recurring: boolean;
  recurringDay?: number; // 1-31
  accountId: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeSplit {
  accountId: string;
  amount: number;
  percentage: number;
}

export interface IncomeConfig {
  id: string;
  type: 'weekly_paycheck' | 'tutoring' | 'other';
  amount?: number; // For fixed income
  minAmount?: number; // For variable income
  maxAmount?: number; // For variable income
  dayOfWeek?: number; // 0-6 for weekly paycheck
  splits?: IncomeSplit[];
  editable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringStatus {
  id: string;
  month: string; // YYYY-MM
  categoryId: string;
  confirmed: boolean;
  skipped: boolean;
  amount: number;
  notificationSent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  id: string;
  theme: 'dark' | 'light';
  weekStart: 'sunday' | 'monday';
  notificationsEnabled: boolean;
  recurringNotificationTime: string; // HH:mm
  currency: string;
  createdAt: string;
  updatedAt: string;
}

// Computed types
export interface DailyTotal {
  date: string;
  income: number;
  expenses: number;
  net: number;
}

export interface WeeklyBreakdown {
  startDate: string;
  endDate: string;
  startingBalance: {
    [accountId: string]: number;
  };
  endingBalance: {
    [accountId: string]: number;
  };
  income: {
    total: number;
    byCategory: { [categoryId: string]: number };
  };
  expenses: {
    total: number;
    byCategory: { [categoryId: string]: number };
  };
  netChange: number;
}

export interface CategorySpending {
  categoryId: string;
  planned: number;
  actual: number;
  percentage: number;
}

export interface MonthlyAnalytics {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  savingsRate: number;
  categorySpending: CategorySpending[];
  accountBalances: { [accountId: string]: number };
}
