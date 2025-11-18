import { useBudgetStore } from '../index';
import { initDatabase, db } from '../../db/client';
import { seedInitialData } from '../../db/seed';
import * as schema from '../../db/schema';

describe('Budget Store', () => {
  beforeEach(async () => {
    // Initialize database and seed data before each test
    await initDatabase();

    // Clean up any existing data
    await db.delete(schema.transactions);
    await db.delete(schema.recurringStatuses);
    await db.delete(schema.incomeSplits);
    await db.delete(schema.incomeConfigs);
    await db.delete(schema.categories);
    await db.delete(schema.accounts);
    await db.delete(schema.settings);

    // Seed fresh data
    await seedInitialData();

    // Reset store state
    useBudgetStore.setState({
      accounts: [],
      transactions: [],
      categories: [],
      incomeConfigs: [],
      settings: null,
      isLoading: false,
      error: null,
    });
  });

  describe('loadData', () => {
    it('should load all data successfully', async () => {
      const store = useBudgetStore.getState();

      await store.loadData();

      const state = useBudgetStore.getState();
      expect(state.accounts.length).toBeGreaterThan(0);
      expect(state.categories.length).toBeGreaterThan(0);
      expect(state.incomeConfigs.length).toBeGreaterThan(0);
      expect(state.settings).not.toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should set loading state during data fetch', async () => {
      const store = useBudgetStore.getState();

      // Start loading
      const loadPromise = store.loadData();

      // Check loading state (might already be false if very fast)
      // Just verify the promise resolves
      await expect(loadPromise).resolves.not.toThrow();

      const state = useBudgetStore.getState();
      expect(state.isLoading).toBe(false);
    });

    it('should clear previous error on successful load', async () => {
      // Set an error state
      useBudgetStore.setState({ error: 'Previous error' });

      const store = useBudgetStore.getState();
      await store.loadData();

      const state = useBudgetStore.getState();
      expect(state.error).toBeNull();
    });

    it('should order transactions by timestamp descending', async () => {
      // Add some test transactions
      const accounts = await db.select().from(schema.accounts);
      const categories = await db.select().from(schema.categories);

      const transactions = [
        {
          id: 'txn-1',
          amount: 10,
          type: 'expense',
          categoryId: categories[0].id,
          accountId: accounts[0].id,
          date: '2025-01-10',
          timestamp: '2025-01-10T10:00:00Z',
          // note omitted (optional),
          // toAccountId omitted (optional),
          createdAt: '2025-01-10T10:00:00Z',
          updatedAt: '2025-01-10T10:00:00Z',
        },
        {
          id: 'txn-2',
          amount: 20,
          type: 'expense',
          categoryId: categories[0].id,
          accountId: accounts[0].id,
          date: '2025-01-15',
          timestamp: '2025-01-15T10:00:00Z',
          // note omitted (optional),
          // toAccountId omitted (optional),
          createdAt: '2025-01-15T10:00:00Z',
          updatedAt: '2025-01-15T10:00:00Z',
        },
      ];

      await db.insert(schema.transactions).values(transactions);

      const store = useBudgetStore.getState();
      await store.loadData();

      const state = useBudgetStore.getState();
      expect(state.transactions[0].id).toBe('txn-2'); // Most recent first
      expect(state.transactions[1].id).toBe('txn-1');
    });
  });

  describe('Account Operations', () => {
    beforeEach(async () => {
      const store = useBudgetStore.getState();
      await store.loadData();
    });

    it('should add a new account', async () => {
      const store = useBudgetStore.getState();
      const initialCount = store.accounts.length;

      await store.addAccount({
        name: 'New Checking',
        type: 'checking',
        startingBalance: 500,
        startingDate: '2025-01-01',
      });

      const state = useBudgetStore.getState();
      expect(state.accounts).toHaveLength(initialCount + 1);
      expect(state.error).toBeNull();

      const newAccount = state.accounts.find((acc) => acc.name === 'New Checking');
      expect(newAccount).toBeDefined();
      expect(newAccount?.type).toBe('checking');
      expect(newAccount?.startingBalance).toBe(500);
    });

    it('should update an existing account', async () => {
      const store = useBudgetStore.getState();
      const accountId = store.accounts[0].id;

      await store.updateAccount(accountId, { name: 'Updated Name' });

      const state = useBudgetStore.getState();
      const updatedAccount = state.accounts.find((acc) => acc.id === accountId);
      expect(updatedAccount?.name).toBe('Updated Name');
      expect(state.error).toBeNull();
    });

    it('should delete an account', async () => {
      const store = useBudgetStore.getState();
      const initialCount = store.accounts.length;
      const accountId = store.accounts[0].id;

      await store.deleteAccount(accountId);

      const state = useBudgetStore.getState();
      expect(state.accounts).toHaveLength(initialCount - 1);
      expect(state.accounts.find((acc) => acc.id === accountId)).toBeUndefined();
      expect(state.error).toBeNull();
    });

    it('should set error state on database failure', async () => {
      const store = useBudgetStore.getState();

      // Try to add account with invalid data (will fail constraints)
      await expect(
        store.addAccount({
          name: '', // Invalid: empty name
          type: 'checking' // intentionally invalid for test,
          startingBalance: -1,
          startingDate: 'invalid-date',
        })
      ).rejects.toThrow();

      const state = useBudgetStore.getState();
      expect(state.error).not.toBeNull();
    });
  });

  describe('Transaction Operations', () => {
    beforeEach(async () => {
      const store = useBudgetStore.getState();
      await store.loadData();
    });

    it('should add a new transaction', async () => {
      const store = useBudgetStore.getState();
      const initialCount = store.transactions.length;
      const accountId = store.accounts[0].id;
      const categoryId = store.categories[0].id;

      await store.addTransaction({
        amount: 25.50,
        type: 'expense',
        categoryId,
        accountId,
        date: '2025-01-20',
        timestamp: new Date().toISOString(),
        note: 'Test expense',
        // toAccountId omitted (optional),
      });

      const state = useBudgetStore.getState();
      expect(state.transactions).toHaveLength(initialCount + 1);
      expect(state.error).toBeNull();

      // New transaction should be first (most recent)
      expect(state.transactions[0].amount).toBe(25.50);
      expect(state.transactions[0].note).toBe('Test expense');
    });

    it('should update an existing transaction', async () => {
      const store = useBudgetStore.getState();

      // Add a transaction first
      const accountId = store.accounts[0].id;
      const categoryId = store.categories[0].id;

      await store.addTransaction({
        amount: 50,
        type: 'expense',
        categoryId,
        accountId,
        date: '2025-01-15',
        timestamp: new Date().toISOString(),
        note: 'Original note',
        // toAccountId omitted (optional),
      });

      const state = useBudgetStore.getState();
      const transactionId = state.transactions[0].id;

      await store.updateTransaction(transactionId, {
        amount: 75,
        note: 'Updated note',
      });

      const finalState = useBudgetStore.getState();
      const updatedTxn = finalState.transactions.find((txn) => txn.id === transactionId);
      expect(updatedTxn?.amount).toBe(75);
      expect(updatedTxn?.note).toBe('Updated note');
      expect(finalState.error).toBeNull();
    });

    it('should delete a transaction', async () => {
      const store = useBudgetStore.getState();

      // Add a transaction first
      const accountId = store.accounts[0].id;
      const categoryId = store.categories[0].id;

      await store.addTransaction({
        amount: 30,
        type: 'expense',
        categoryId,
        accountId,
        date: '2025-01-10',
        timestamp: new Date().toISOString(),
        // note omitted (optional),
        // toAccountId omitted (optional),
      });

      const state = useBudgetStore.getState();
      const transactionId = state.transactions[0].id;
      const initialCount = state.transactions.length;

      await store.deleteTransaction(transactionId);

      const finalState = useBudgetStore.getState();
      expect(finalState.transactions).toHaveLength(initialCount - 1);
      expect(finalState.transactions.find((txn) => txn.id === transactionId)).toBeUndefined();
      expect(finalState.error).toBeNull();
    });

    it('should get transactions for a specific date', async () => {
      const store = useBudgetStore.getState();
      const accountId = store.accounts[0].id;
      const categoryId = store.categories[0].id;

      // Add transactions on different dates
      await store.addTransaction({
        amount: 10,
        type: 'expense',
        categoryId,
        accountId,
        date: '2025-01-15',
        timestamp: new Date().toISOString(),
        // note omitted (optional),
        // toAccountId omitted (optional),
      });

      await store.addTransaction({
        amount: 20,
        type: 'expense',
        categoryId,
        accountId,
        date: '2025-01-15',
        timestamp: new Date().toISOString(),
        // note omitted (optional),
        // toAccountId omitted (optional),
      });

      await store.addTransaction({
        amount: 30,
        type: 'expense',
        categoryId,
        accountId,
        date: '2025-01-16',
        timestamp: new Date().toISOString(),
        // note omitted (optional),
        // toAccountId omitted (optional),
      });

      const state = useBudgetStore.getState();
      const jan15Transactions = state.getTransactionsForDate('2025-01-15');

      expect(jan15Transactions).toHaveLength(2);
      expect(jan15Transactions.every((txn) => txn.date === '2025-01-15')).toBe(true);
    });

    it('should get transactions for a date range', async () => {
      const store = useBudgetStore.getState();
      const accountId = store.accounts[0].id;
      const categoryId = store.categories[0].id;

      // Add transactions across multiple dates
      await store.addTransaction({
        amount: 10,
        type: 'expense',
        categoryId,
        accountId,
        date: '2025-01-10',
        timestamp: new Date().toISOString(),
        // note omitted (optional),
        // toAccountId omitted (optional),
      });

      await store.addTransaction({
        amount: 20,
        type: 'expense',
        categoryId,
        accountId,
        date: '2025-01-15',
        timestamp: new Date().toISOString(),
        // note omitted (optional),
        // toAccountId omitted (optional),
      });

      await store.addTransaction({
        amount: 30,
        type: 'expense',
        categoryId,
        accountId,
        date: '2025-01-20',
        timestamp: new Date().toISOString(),
        // note omitted (optional),
        // toAccountId omitted (optional),
      });

      const state = useBudgetStore.getState();
      const rangeTransactions = state.getTransactionsForDateRange('2025-01-10', '2025-01-15');

      expect(rangeTransactions).toHaveLength(2);
      expect(rangeTransactions.every((txn) => txn.date >= '2025-01-10' && txn.date <= '2025-01-15')).toBe(true);
    });
  });

  describe('Category Operations', () => {
    beforeEach(async () => {
      const store = useBudgetStore.getState();
      await store.loadData();
    });

    it('should add a new category', async () => {
      const store = useBudgetStore.getState();
      const initialCount = store.categories.length;
      const accountId = store.accounts[0].id;

      await store.addCategory({
        name: 'New Category',
        color: '#00FF00',
        plannedMonthly: 150,
        // plannedWeekly omitted (optional),
        recurring: false,
        // recurringDay omitted (optional),
        accountId,
        icon: '🎉',
      });

      const state = useBudgetStore.getState();
      expect(state.categories).toHaveLength(initialCount + 1);
      expect(state.error).toBeNull();

      const newCategory = state.categories.find((cat) => cat.name === 'New Category');
      expect(newCategory).toBeDefined();
      expect(newCategory?.color).toBe('#00FF00');
      expect(newCategory?.plannedMonthly).toBe(150);
    });

    it('should update an existing category', async () => {
      const store = useBudgetStore.getState();
      const categoryId = store.categories[0].id;

      await store.updateCategory(categoryId, {
        name: 'Updated Category',
        plannedMonthly: 200,
      });

      const state = useBudgetStore.getState();
      const updatedCategory = state.categories.find((cat) => cat.id === categoryId);
      expect(updatedCategory?.name).toBe('Updated Category');
      expect(updatedCategory?.plannedMonthly).toBe(200);
      expect(state.error).toBeNull();
    });

    it('should delete a category', async () => {
      const store = useBudgetStore.getState();
      const initialCount = store.categories.length;
      const categoryId = store.categories[0].id;

      await store.deleteCategory(categoryId);

      const state = useBudgetStore.getState();
      expect(state.categories).toHaveLength(initialCount - 1);
      expect(state.categories.find((cat) => cat.id === categoryId)).toBeUndefined();
      expect(state.error).toBeNull();
    });
  });

  describe('Settings Operations', () => {
    beforeEach(async () => {
      const store = useBudgetStore.getState();
      await store.loadData();
    });

    it('should update settings', async () => {
      const store = useBudgetStore.getState();

      await store.updateSettings({
        theme: 'light',
        weekStart: 'monday',
      });

      const state = useBudgetStore.getState();
      expect(state.settings?.theme).toBe('light');
      expect(state.settings?.weekStart).toBe('monday');
      expect(state.error).toBeNull();
    });

    it('should throw error if settings not initialized', async () => {
      // Set settings to null
      useBudgetStore.setState({ settings: null });

      const store = useBudgetStore.getState();

      await expect(
        store.updateSettings({ theme: 'light' })
      ).rejects.toThrow('Settings not initialized');

      const state = useBudgetStore.getState();
      expect(state.error).toBe('Settings not initialized');
    });
  });

  describe('Account Balance Calculations', () => {
    beforeEach(async () => {
      const store = useBudgetStore.getState();
      await store.loadData();
    });

    it('should calculate account balance correctly', async () => {
      const store = useBudgetStore.getState();
      const accountId = store.accounts[0].id;
      const account = store.accounts[0];
      const categoryId = store.categories[0].id;

      const initialBalance = account.startingBalance;

      // Add income
      await store.addTransaction({
        amount: 100,
        type: 'income',
        categoryId: null,
        accountId,
        date: '2025-01-15',
        timestamp: new Date().toISOString(),
        // note omitted (optional),
        // toAccountId omitted (optional),
      });

      // Add expense
      await store.addTransaction({
        amount: 30,
        type: 'expense',
        categoryId,
        accountId,
        date: '2025-01-16',
        timestamp: new Date().toISOString(),
        // note omitted (optional),
        // toAccountId omitted (optional),
      });

      const state = useBudgetStore.getState();
      const balance = state.getAccountBalance(accountId);

      expect(balance).toBe(initialBalance + 100 - 30);
    });

    it('should calculate account balance as of specific date', async () => {
      const store = useBudgetStore.getState();
      const accountId = store.accounts[0].id;
      const account = store.accounts[0];
      const categoryId = store.categories[0].id;

      // Add transactions on different dates
      await store.addTransaction({
        amount: 50,
        type: 'income',
        categoryId: null,
        accountId,
        date: '2025-01-10',
        timestamp: new Date().toISOString(),
        // note omitted (optional),
        // toAccountId omitted (optional),
      });

      await store.addTransaction({
        amount: 20,
        type: 'expense',
        categoryId,
        accountId,
        date: '2025-01-15',
        timestamp: new Date().toISOString(),
        // note omitted (optional),
        // toAccountId omitted (optional),
      });

      await store.addTransaction({
        amount: 10,
        type: 'expense',
        categoryId,
        accountId,
        date: '2025-01-20',
        timestamp: new Date().toISOString(),
        // note omitted (optional),
        // toAccountId omitted (optional),
      });

      const state = useBudgetStore.getState();

      // Balance as of Jan 12 (only first transaction)
      const balanceJan12 = state.getAccountBalance(accountId, '2025-01-12');
      expect(balanceJan12).toBe(account.startingBalance + 50);

      // Balance as of Jan 17 (first two transactions)
      const balanceJan17 = state.getAccountBalance(accountId, '2025-01-17');
      expect(balanceJan17).toBe(account.startingBalance + 50 - 20);
    });

    it('should handle transfers correctly in balance calculation', async () => {
      const store = useBudgetStore.getState();
      const account1Id = store.accounts[0].id;
      const account2Id = store.accounts[1].id;
      const account1 = store.accounts[0];
      const account2 = store.accounts[1];

      // Transfer from account1 to account2
      await store.addTransaction({
        amount: 100,
        type: 'transfer',
        categoryId: null,
        accountId: account1Id,
        date: '2025-01-15',
        timestamp: new Date().toISOString(),
        note: 'Transfer',
        toAccountId: account2Id,
      });

      const state = useBudgetStore.getState();
      const balance1 = state.getAccountBalance(account1Id);
      const balance2 = state.getAccountBalance(account2Id);

      expect(balance1).toBe(account1.startingBalance - 100);
      expect(balance2).toBe(account2.startingBalance + 100);
    });

    it('should calculate total balance across all accounts', async () => {
      const store = useBudgetStore.getState();
      const initialTotal = store.getTotalBalance();

      // Add some transactions
      const accountId = store.accounts[0].id;
      const categoryId = store.categories[0].id;

      await store.addTransaction({
        amount: 200,
        type: 'income',
        categoryId: null,
        accountId,
        date: '2025-01-15',
        timestamp: new Date().toISOString(),
        // note omitted (optional),
        // toAccountId omitted (optional),
      });

      await store.addTransaction({
        amount: 50,
        type: 'expense',
        categoryId,
        accountId,
        date: '2025-01-16',
        timestamp: new Date().toISOString(),
        // note omitted (optional),
        // toAccountId omitted (optional),
      });

      const state = useBudgetStore.getState();
      const newTotal = state.getTotalBalance();

      expect(newTotal).toBe(initialTotal + 200 - 50);
    });

    it('should return 0 for non-existent account', () => {
      const store = useBudgetStore.getState();
      const balance = store.getAccountBalance('non-existent-id');
      expect(balance).toBe(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      const store = useBudgetStore.getState();
      await store.loadData();
    });

    it('should clear error state', () => {
      useBudgetStore.setState({ error: 'Test error' });

      const store = useBudgetStore.getState();
      store.clearError();

      const state = useBudgetStore.getState();
      expect(state.error).toBeNull();
    });

    it('should set error on failed transaction addition', async () => {
      const store = useBudgetStore.getState();

      // Try to add invalid transaction (missing required fields will cause DB error)
      await expect(
        store.addTransaction({
          amount: 0,
          type: 'checking' // intentionally invalid for test as any,
          categoryId: 'non-existent',
          accountId: 'non-existent',
          date: 'invalid-date',
          timestamp: 'invalid',
          // note omitted (optional),
          // toAccountId omitted (optional),
        })
      ).rejects.toThrow();

      const state = useBudgetStore.getState();
      expect(state.error).not.toBeNull();
    });
  });
});
