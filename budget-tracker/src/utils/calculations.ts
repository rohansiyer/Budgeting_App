import { Transaction, Category, Account, CategorySpending, WeeklyBreakdown } from '../types';
import { format, startOfMonth, endOfMonth } from 'date-fns';

export const calculateDailyTotal = (transactions: Transaction[]): number => {
  return transactions.reduce((total, txn) => {
    if (txn.type === 'income' || txn.type === 'adjustment') {
      return total + txn.amount;
    } else if (txn.type === 'expense') {
      return total - txn.amount;
    }
    return total;
  }, 0);
};

export const calculateIncomeTotal = (transactions: Transaction[]): number => {
  return transactions
    .filter((txn) => txn.type === 'income')
    .reduce((sum, txn) => sum + txn.amount, 0);
};

export const calculateExpenseTotal = (transactions: Transaction[]): number => {
  return transactions
    .filter((txn) => txn.type === 'expense')
    .reduce((sum, txn) => sum + txn.amount, 0);
};

export const calculateCategorySpending = (
  transactions: Transaction[],
  categoryId: string
): number => {
  return transactions
    .filter((txn) => txn.type === 'expense' && txn.categoryId === categoryId)
    .reduce((sum, txn) => sum + txn.amount, 0);
};

export const calculateCategorySpendingBreakdown = (
  transactions: Transaction[],
  categories: Category[]
): CategorySpending[] => {
  return categories.map((category) => {
    const actual = calculateCategorySpending(transactions, category.id);
    const planned = category.plannedMonthly;
    const percentage = planned > 0 ? (actual / planned) * 100 : 0;

    return {
      categoryId: category.id,
      planned,
      actual,
      percentage,
    };
  });
};

export const calculateWeeklyBreakdown = (
  transactions: Transaction[],
  accounts: Account[],
  startDate: string,
  endDate: string
): WeeklyBreakdown => {
  const weekTransactions = transactions.filter(
    (txn) => txn.date >= startDate && txn.date <= endDate
  );

  // Calculate starting balances (balance at the start of the week)
  const startingBalance: { [accountId: string]: number } = {};
  accounts.forEach((account) => {
    // Get all transactions before the start of the week
    const priorTransactions = transactions.filter((txn) => txn.date < startDate);
    let balance = account.startingBalance;

    priorTransactions.forEach((txn) => {
      if (txn.accountId === account.id) {
        if (txn.type === 'income' || txn.type === 'adjustment') {
          balance += txn.amount;
        } else if (txn.type === 'expense') {
          balance -= txn.amount;
        } else if (txn.type === 'transfer' && txn.toAccountId) {
          balance -= txn.amount;
        }
      }
      if (txn.type === 'transfer' && txn.toAccountId === account.id) {
        balance += txn.amount;
      }
    });

    startingBalance[account.id] = balance;
  });

  // Calculate ending balances
  const endingBalance: { [accountId: string]: number } = {};
  accounts.forEach((account) => {
    let balance = startingBalance[account.id];

    weekTransactions.forEach((txn) => {
      if (txn.accountId === account.id) {
        if (txn.type === 'income' || txn.type === 'adjustment') {
          balance += txn.amount;
        } else if (txn.type === 'expense') {
          balance -= txn.amount;
        } else if (txn.type === 'transfer' && txn.toAccountId) {
          balance -= txn.amount;
        }
      }
      if (txn.type === 'transfer' && txn.toAccountId === account.id) {
        balance += txn.amount;
      }
    });

    endingBalance[account.id] = balance;
  });

  // Calculate income and expenses
  const income = {
    total: calculateIncomeTotal(weekTransactions),
    byCategory: {} as { [categoryId: string]: number },
  };

  const expenses = {
    total: calculateExpenseTotal(weekTransactions),
    byCategory: {} as { [categoryId: string]: number },
  };

  weekTransactions.forEach((txn) => {
    if (txn.type === 'income' && txn.categoryId) {
      income.byCategory[txn.categoryId] =
        (income.byCategory[txn.categoryId] || 0) + txn.amount;
    } else if (txn.type === 'expense' && txn.categoryId) {
      expenses.byCategory[txn.categoryId] =
        (expenses.byCategory[txn.categoryId] || 0) + txn.amount;
    }
  });

  const totalStarting = Object.values(startingBalance).reduce((sum, val) => sum + val, 0);
  const totalEnding = Object.values(endingBalance).reduce((sum, val) => sum + val, 0);

  return {
    startDate,
    endDate,
    startingBalance,
    endingBalance,
    income,
    expenses,
    netChange: totalEnding - totalStarting,
  };
};

export const calculateMonthlyBudgetProgress = (
  transactions: Transaction[],
  category: Category,
  month: Date
): { spent: number; budget: number; percentage: number; remaining: number } => {
  const monthStart = format(startOfMonth(month), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd');

  const monthTransactions = transactions.filter(
    (txn) =>
      txn.date >= monthStart &&
      txn.date <= monthEnd &&
      txn.type === 'expense' &&
      txn.categoryId === category.id
  );

  const spent = monthTransactions.reduce((sum, txn) => sum + txn.amount, 0);
  const budget = category.plannedMonthly;
  const percentage = budget > 0 ? (spent / budget) * 100 : 0;
  const remaining = budget - spent;

  return { spent, budget, percentage, remaining };
};

export const calculateWeeklyBudgetProgress = (
  transactions: Transaction[],
  category: Category,
  startDate: string,
  endDate: string
): { spent: number; budget: number; percentage: number; remaining: number } => {
  const weekTransactions = transactions.filter(
    (txn) =>
      txn.date >= startDate &&
      txn.date <= endDate &&
      txn.type === 'expense' &&
      txn.categoryId === category.id
  );

  const spent = weekTransactions.reduce((sum, txn) => sum + txn.amount, 0);
  const budget = category.plannedWeekly || 0;
  const percentage = budget > 0 ? (spent / budget) * 100 : 0;
  const remaining = budget - spent;

  return { spent, budget, percentage, remaining };
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
};

export const calculateSavingsRate = (income: number, expenses: number): number => {
  if (income === 0) return 0;
  return ((income - expenses) / income) * 100;
};
