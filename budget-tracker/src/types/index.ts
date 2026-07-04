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

// NOTE: `IncomeSplit` and `IncomeConfig` were removed in the v2 re-founding.
// Import income domain types from `src/types/contracts.ts`
// (`IncomeSourceConfig`, `IncomeSplitConfig`) instead.

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

// ---------------------------------------------------------------------------
// DEPRECATED legacy view types. These back only the Team 3-owned screens/
// components/utils that have not yet migrated to `src/types/contracts.ts`.
// `DailyTotal` and `MonthlyAnalytics` were unused and removed; `CategorySpending`
// and `WeeklyBreakdown` are retained solely because `utils/calculations.ts` and
// `components/DualLayerPieChart.tsx` still consume them. TODO(team3): delete
// with the Pond/Analytics rewrite.
// ---------------------------------------------------------------------------

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

