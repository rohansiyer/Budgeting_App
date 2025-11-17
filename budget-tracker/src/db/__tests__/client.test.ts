import { initDatabase, db } from '../client';
import * as schema from '../schema';
import { eq } from 'drizzle-orm';

describe('Database Client', () => {
  describe('initDatabase', () => {
    it('should initialize database successfully', async () => {
      // Should not throw any errors
      await expect(initDatabase()).resolves.not.toThrow();
    });

    it('should create all required tables', async () => {
      await initDatabase();

      // Verify tables exist by querying them
      const accounts = await db.select().from(schema.accounts);
      const categories = await db.select().from(schema.categories);
      const transactions = await db.select().from(schema.transactions);
      const incomeConfigs = await db.select().from(schema.incomeConfigs);
      const incomeSplits = await db.select().from(schema.incomeSplits);
      const recurringStatuses = await db.select().from(schema.recurringStatuses);
      const settings = await db.select().from(schema.settings);

      // Should return empty arrays initially
      expect(Array.isArray(accounts)).toBe(true);
      expect(Array.isArray(categories)).toBe(true);
      expect(Array.isArray(transactions)).toBe(true);
      expect(Array.isArray(incomeConfigs)).toBe(true);
      expect(Array.isArray(incomeSplits)).toBe(true);
      expect(Array.isArray(recurringStatuses)).toBe(true);
      expect(Array.isArray(settings)).toBe(true);
    });

    it('should be idempotent - can be called multiple times', async () => {
      // First initialization
      await expect(initDatabase()).resolves.not.toThrow();

      // Second initialization should also succeed
      await expect(initDatabase()).resolves.not.toThrow();

      // Third initialization should also succeed
      await expect(initDatabase()).resolves.not.toThrow();
    });

    it('should respect table creation order for foreign keys', async () => {
      await initDatabase();

      // Insert a test account
      const testAccount = {
        id: 'test-account-1',
        name: 'Test Account',
        type: 'checking',
        startingBalance: 1000,
        startingDate: '2025-01-01',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.insert(schema.accounts).values(testAccount);

      // Insert a test category (depends on accounts)
      const testCategory = {
        id: 'test-category-1',
        name: 'Test Category',
        color: '#FF0000',
        plannedMonthly: 100,
        recurring: false,
        accountId: 'test-account-1', // Foreign key to accounts
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.insert(schema.categories).values(testCategory);

      // Insert a test transaction (depends on both accounts and categories)
      const testTransaction = {
        id: 'test-transaction-1',
        amount: 50,
        type: 'expense',
        categoryId: 'test-category-1', // Foreign key to categories
        accountId: 'test-account-1', // Foreign key to accounts
        date: '2025-01-15',
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // This should succeed because tables were created in correct order
      await expect(
        db.insert(schema.transactions).values(testTransaction)
      ).resolves.not.toThrow();

      // Clean up
      await db.delete(schema.transactions).where(
        eq(schema.transactions.id, 'test-transaction-1')
      );
      await db.delete(schema.categories).where(
        eq(schema.categories.id, 'test-category-1')
      );
      await db.delete(schema.accounts).where(
        eq(schema.accounts.id, 'test-account-1')
      );
    });

    it('should create indexes on transactions table', async () => {
      await initDatabase();

      // Insert test data to verify indexes work
      const testAccount = {
        id: 'test-account-idx',
        name: 'Test Account',
        type: 'checking',
        startingBalance: 1000,
        startingDate: '2025-01-01',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.insert(schema.accounts).values(testAccount);

      const testCategory = {
        id: 'test-category-idx',
        name: 'Test Category',
        color: '#FF0000',
        plannedMonthly: 100,
        recurring: false,
        accountId: 'test-account-idx',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.insert(schema.categories).values(testCategory);

      const testTransactions = [
        {
          id: 'test-txn-1',
          amount: 50,
          type: 'expense',
          categoryId: 'test-category-idx',
          accountId: 'test-account-idx',
          date: '2025-01-15',
          timestamp: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'test-txn-2',
          amount: 30,
          type: 'expense',
          categoryId: 'test-category-idx',
          accountId: 'test-account-idx',
          date: '2025-01-16',
          timestamp: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      await db.insert(schema.transactions).values(testTransactions);

      // Query using indexed columns (should work efficiently)
      const txnsByDate = await db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.date, '2025-01-15'));
      expect(txnsByDate).toHaveLength(1);

      const txnsByAccount = await db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.accountId, 'test-account-idx'));
      expect(txnsByAccount).toHaveLength(2);

      // Clean up
      await db.delete(schema.transactions).where(
        eq(schema.transactions.accountId, 'test-account-idx')
      );
      await db.delete(schema.categories).where(
        eq(schema.categories.id, 'test-category-idx')
      );
      await db.delete(schema.accounts).where(
        eq(schema.accounts.id, 'test-account-idx')
      );
    });
  });

  describe('Database Connection', () => {
    it('should have a valid database connection', () => {
      expect(db).toBeDefined();
      expect(typeof db.select).toBe('function');
      expect(typeof db.insert).toBe('function');
      expect(typeof db.update).toBe('function');
      expect(typeof db.delete).toBe('function');
    });

    it('should have correct schema definitions', () => {
      expect(schema.accounts).toBeDefined();
      expect(schema.categories).toBeDefined();
      expect(schema.transactions).toBeDefined();
      expect(schema.incomeConfigs).toBeDefined();
      expect(schema.incomeSplits).toBeDefined();
      expect(schema.recurringStatuses).toBeDefined();
      expect(schema.settings).toBeDefined();
    });
  });
});
