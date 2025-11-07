import {
  calculateDailyTotal,
  calculateIncomeTotal,
  calculateExpenseTotal,
  calculateCategorySpending,
  formatCurrency,
  calculateSavingsRate,
} from '../calculations';
import { Transaction } from '../../types';

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
});
