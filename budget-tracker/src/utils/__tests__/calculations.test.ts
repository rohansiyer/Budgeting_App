import {
  calculateDailyTotal,
  calculateIncomeTotal,
  calculateExpenseTotal,
  calculateCategorySpending,
  calculateCategorySpendingBreakdown,
  calculateWeeklyBreakdown,
  calculateMonthlyBudgetProgress,
  calculateWeeklyBudgetProgress,
  formatCurrency,
  calculateSavingsRate,
} from '../calculations';
import { Transaction, Category, Account } from '../../types';

const mockTransactions: Transaction[] = [
  {
    id: '1',
    amount: 1000,
    type: 'income',
    categoryId: 'paycheck',
    accountId: 'pnc',
    date: '2025-11-07',
    timestamp: '2025-11-07T12:00:00Z',
    createdAt: '2025-11-07T12:00:00Z',
    updatedAt: '2025-11-07T12:00:00Z',
  },
  {
    id: '2',
    amount: 50,
    type: 'expense',
    categoryId: 'food',
    accountId: 'pnc',
    date: '2025-11-07',
    timestamp: '2025-11-07T14:00:00Z',
    createdAt: '2025-11-07T14:00:00Z',
    updatedAt: '2025-11-07T14:00:00Z',
  },
  {
    id: '3',
    amount: 30,
    type: 'expense',
    categoryId: 'gas',
    accountId: 'pnc',
    date: '2025-11-07',
    timestamp: '2025-11-07T15:00:00Z',
    createdAt: '2025-11-07T15:00:00Z',
    updatedAt: '2025-11-07T15:00:00Z',
  },
  {
    id: '4',
    amount: 200,
    type: 'income',
    categoryId: 'tutoring',
    accountId: 'dcu',
    date: '2025-11-08',
    timestamp: '2025-11-08T10:00:00Z',
    createdAt: '2025-11-08T10:00:00Z',
    updatedAt: '2025-11-08T10:00:00Z',
  },
];

describe('Calculation Utils', () => {
  describe('calculateDailyTotal', () => {
    it('should calculate net total for a day', () => {
      const dayTransactions = mockTransactions.filter((t) => t.date === '2025-11-07');
      const total = calculateDailyTotal(dayTransactions);

      expect(total).toBe(920); // 1000 income - 50 - 30 expenses
    });

    it('should return 0 for empty transactions', () => {
      const total = calculateDailyTotal([]);
      expect(total).toBe(0);
    });

    it('should handle only income', () => {
      const incomeOnly = [mockTransactions[0]];
      const total = calculateDailyTotal(incomeOnly);

      expect(total).toBe(1000);
    });

    it('should handle only expenses', () => {
      const expensesOnly = [mockTransactions[1], mockTransactions[2]];
      const total = calculateDailyTotal(expensesOnly);

      expect(total).toBe(-80); // -50 - 30
    });
  });

  describe('calculateIncomeTotal', () => {
    it('should sum all income transactions', () => {
      const total = calculateIncomeTotal(mockTransactions);
      expect(total).toBe(1200); // 1000 + 200
    });

    it('should return 0 for no income', () => {
      const expensesOnly = [mockTransactions[1], mockTransactions[2]];
      const total = calculateIncomeTotal(expensesOnly);
      expect(total).toBe(0);
    });
  });

  describe('calculateExpenseTotal', () => {
    it('should sum all expense transactions', () => {
      const total = calculateExpenseTotal(mockTransactions);
      expect(total).toBe(80); // 50 + 30
    });

    it('should return 0 for no expenses', () => {
      const incomeOnly = [mockTransactions[0]];
      const total = calculateExpenseTotal(incomeOnly);
      expect(total).toBe(0);
    });
  });

  describe('calculateCategorySpending', () => {
    it('should calculate spending for a specific category', () => {
      const foodSpending = calculateCategorySpending(mockTransactions, 'food');
      expect(foodSpending).toBe(50);
    });

    it('should return 0 for category with no spending', () => {
      const rentSpending = calculateCategorySpending(mockTransactions, 'rent');
      expect(rentSpending).toBe(0);
    });

    it('should only count expenses, not income', () => {
      const paycheckSpending = calculateCategorySpending(mockTransactions, 'paycheck');
      expect(paycheckSpending).toBe(0);
    });
  });

  describe('formatCurrency', () => {
    it('should format positive amounts correctly', () => {
      expect(formatCurrency(1000)).toBe('$1,000.00');
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
      expect(formatCurrency(100)).toBe('$100.00');
    });

    it('should format negative amounts correctly', () => {
      expect(formatCurrency(-100)).toBe('-$100.00');
      expect(formatCurrency(-1234.56)).toBe('-$1,234.56');
    });

    it('should format zero correctly', () => {
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('should handle decimal precision', () => {
      expect(formatCurrency(10.5)).toBe('$10.50');
      expect(formatCurrency(10.123)).toBe('$10.12');
    });
  });

  describe('calculateSavingsRate', () => {
    it('should calculate savings rate correctly', () => {
      const income = 5000;
      const expenses = 3000;
      const rate = calculateSavingsRate(income, expenses);

      expect(rate).toBe(40); // (5000 - 3000) / 5000 * 100 = 40%
    });

    it('should handle zero income', () => {
      const rate = calculateSavingsRate(0, 1000);
      expect(rate).toBe(0);
    });

    it('should handle expenses exceeding income', () => {
      const rate = calculateSavingsRate(1000, 1500);
      expect(rate).toBe(-50); // Negative savings rate
    });

    it('should handle zero expenses', () => {
      const rate = calculateSavingsRate(5000, 0);
      expect(rate).toBe(100); // 100% savings
    });

    it('should handle equal income and expenses', () => {
      const rate = calculateSavingsRate(1000, 1000);
      expect(rate).toBe(0); // 0% savings
    });
  });

  describe('calculateCategorySpendingBreakdown', () => {
    it('should calculate spending breakdown for all categories', () => {
      const categories: Category[] = [
        {
          id: 'food',
          name: 'Food',
          color: '#00FF00',
          plannedMonthly: 500,
          recurring: false,
          accountId: 'pnc',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'gas',
          name: 'Gas',
          color: '#0000FF',
          plannedMonthly: 200,
          recurring: false,
          accountId: 'pnc',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      const breakdown = calculateCategorySpendingBreakdown(mockTransactions, categories);

      expect(breakdown).toHaveLength(2);
      expect(breakdown[0].categoryId).toBe('food');
      expect(breakdown[0].planned).toBe(500);
      expect(breakdown[0].actual).toBe(50);
      expect(breakdown[0].percentage).toBe(10);
    });

    it('should handle zero planned budget', () => {
      const categories: Category[] = [
        {
          id: 'food',
          name: 'Food',
          color: '#00FF00',
          plannedMonthly: 0,
          recurring: false,
          accountId: 'pnc',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      const breakdown = calculateCategorySpendingBreakdown(mockTransactions, categories);

      expect(breakdown[0].percentage).toBe(0);
    });
  });

  describe('calculateWeeklyBreakdown', () => {
    it('should calculate weekly breakdown correctly', () => {
      const accounts: Account[] = [
        {
          id: 'pnc',
          name: 'PNC',
          type: 'checking',
          startingBalance: 1000,
          startingDate: '2025-01-01',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'dcu',
          name: 'DCU',
          type: 'savings',
          startingBalance: 500,
          startingDate: '2025-01-01',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      const breakdown = calculateWeeklyBreakdown(
        mockTransactions,
        accounts,
        '2025-11-07',
        '2025-11-08'
      );

      expect(breakdown.startDate).toBe('2025-11-07');
      expect(breakdown.endDate).toBe('2025-11-08');
      expect(breakdown.income.total).toBe(1200);
      expect(breakdown.expenses.total).toBe(80);
      expect(breakdown.netChange).toBe(1120);
    });

    it('should calculate account balances correctly', () => {
      const accounts: Account[] = [
        {
          id: 'pnc',
          name: 'PNC',
          type: 'checking',
          startingBalance: 1000,
          startingDate: '2025-01-01',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      const breakdown = calculateWeeklyBreakdown(
        mockTransactions,
        accounts,
        '2025-11-07',
        '2025-11-07'
      );

      // Mock transactions are on 11/07-11/08, so starting balance before 11/07 is just the starting balance + prior txns
      // Transaction 1 (income 1000) is on 11/07, Transaction 2 (expense 50) is on 11/07, Transaction 3 (expense 30) is on 11/07
      expect(breakdown.startingBalance.pnc).toBe(1000); // Just starting balance
      expect(breakdown.endingBalance.pnc).toBe(1920); // 1000 + 1000 income - 50 - 30 expenses on 11/07
    });
  });

  describe('calculateMonthlyBudgetProgress', () => {
    it('should calculate monthly budget progress', () => {
      const category: Category = {
        id: 'food',
        name: 'Food',
        color: '#00FF00',
        plannedMonthly: 500,
        recurring: false,
        accountId: 'pnc',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };

      const progress = calculateMonthlyBudgetProgress(
        mockTransactions,
        category,
        new Date('2025-11-15')
      );

      expect(progress.budget).toBe(500);
      expect(progress.spent).toBe(50);
      expect(progress.percentage).toBe(10);
      expect(progress.remaining).toBe(450);
    });

    it('should handle zero budget', () => {
      const category: Category = {
        id: 'food',
        name: 'Food',
        color: '#00FF00',
        plannedMonthly: 0,
        recurring: false,
        accountId: 'pnc',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };

      const progress = calculateMonthlyBudgetProgress(
        mockTransactions,
        category,
        new Date('2025-11-15')
      );

      expect(progress.percentage).toBe(0);
    });
  });

  describe('calculateWeeklyBudgetProgress', () => {
    it('should calculate weekly budget progress', () => {
      const category: Category = {
        id: 'food',
        name: 'Food',
        color: '#00FF00',
        plannedMonthly: 500,
        plannedWeekly: 100,
        recurring: false,
        accountId: 'pnc',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };

      const progress = calculateWeeklyBudgetProgress(
        mockTransactions,
        category,
        '2025-11-07',
        '2025-11-07'
      );

      expect(progress.budget).toBe(100);
      expect(progress.spent).toBe(50);
      expect(progress.percentage).toBe(50);
      expect(progress.remaining).toBe(50);
    });

    it('should handle missing weekly budget', () => {
      const category: Category = {
        id: 'food',
        name: 'Food',
        color: '#00FF00',
        plannedMonthly: 500,
        recurring: false,
        accountId: 'pnc',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };

      const progress = calculateWeeklyBudgetProgress(
        mockTransactions,
        category,
        '2025-11-07',
        '2025-11-07'
      );

      expect(progress.budget).toBe(0);
      expect(progress.percentage).toBe(0);
    });
  });

  describe('Edge Cases and Precision', () => {
    it('should handle empty transaction arrays', () => {
      const empty: Transaction[] = [];

      expect(calculateDailyTotal(empty)).toBe(0);
      expect(calculateIncomeTotal(empty)).toBe(0);
      expect(calculateExpenseTotal(empty)).toBe(0);
    });

    it('should handle very large amounts', () => {
      const largeTransactions: Transaction[] = [
        {
          id: '1',
          amount: 1000000.50,
          type: 'income',
          categoryId: null,
          accountId: 'test',
          date: '2025-11-07',
          timestamp: '2025-11-07T12:00:00Z',
          createdAt: '2025-11-07T12:00:00Z',
          updatedAt: '2025-11-07T12:00:00Z',
        },
        {
          id: '2',
          amount: 999999.75,
          type: 'expense',
          categoryId: 'test',
          accountId: 'test',
          date: '2025-11-07',
          timestamp: '2025-11-07T12:00:00Z',
          createdAt: '2025-11-07T12:00:00Z',
          updatedAt: '2025-11-07T12:00:00Z',
        },
      ];

      const total = calculateDailyTotal(largeTransactions);
      expect(total).toBe(0.75);
    });

    it('should handle decimal precision correctly', () => {
      const precisionTransactions: Transaction[] = [
        {
          id: '1',
          amount: 10.11,
          type: 'expense',
          categoryId: 'test',
          accountId: 'test',
          date: '2025-11-07',
          timestamp: '2025-11-07T12:00:00Z',
          createdAt: '2025-11-07T12:00:00Z',
          updatedAt: '2025-11-07T12:00:00Z',
        },
        {
          id: '2',
          amount: 10.22,
          type: 'expense',
          categoryId: 'test',
          accountId: 'test',
          date: '2025-11-07',
          timestamp: '2025-11-07T12:00:00Z',
          createdAt: '2025-11-07T12:00:00Z',
          updatedAt: '2025-11-07T12:00:00Z',
        },
        {
          id: '3',
          amount: 10.33,
          type: 'expense',
          categoryId: 'test',
          accountId: 'test',
          date: '2025-11-07',
          timestamp: '2025-11-07T12:00:00Z',
          createdAt: '2025-11-07T12:00:00Z',
          updatedAt: '2025-11-07T12:00:00Z',
        },
      ];

      const total = calculateExpenseTotal(precisionTransactions);
      expect(total).toBeCloseTo(30.66, 2);
    });

    it('should handle formatCurrency with very small amounts', () => {
      expect(formatCurrency(0.01)).toBe('$0.01');
      expect(formatCurrency(0.05)).toBe('$0.05');
      expect(formatCurrency(0.99)).toBe('$0.99');
    });

    it('should handle formatCurrency with very large amounts', () => {
      expect(formatCurrency(1000000)).toBe('$1,000,000.00');
      expect(formatCurrency(9999999.99)).toBe('$9,999,999.99');
    });

    it('should handle negative savings rate when overspending', () => {
      const rate = calculateSavingsRate(500, 1000);
      expect(rate).toBe(-100);
    });

    it('should handle calculateCategorySpending with no matching transactions', () => {
      const spending = calculateCategorySpending(mockTransactions, 'nonexistent');
      expect(spending).toBe(0);
    });

    it('should handle budget progress when spending exceeds budget', () => {
      const category: Category = {
        id: 'overspend',
        name: 'Overspend',
        color: '#FF0000',
        plannedMonthly: 100,
        recurring: false,
        accountId: 'test',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };

      const overspendTransactions: Transaction[] = [
        {
          id: '1',
          amount: 150,
          type: 'expense',
          categoryId: 'overspend',
          accountId: 'test',
          date: '2025-11-15',
          timestamp: '2025-11-15T12:00:00Z',
          createdAt: '2025-11-15T12:00:00Z',
          updatedAt: '2025-11-15T12:00:00Z',
        },
      ];

      const progress = calculateMonthlyBudgetProgress(
        overspendTransactions,
        category,
        new Date('2025-11-20')
      );

      expect(progress.spent).toBe(150);
      expect(progress.budget).toBe(100);
      expect(progress.percentage).toBe(150);
      expect(progress.remaining).toBe(-50);
    });
  });
});
