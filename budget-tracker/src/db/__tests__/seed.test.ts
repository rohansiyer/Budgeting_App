import { seedInitialData } from '../seed';
import { initDatabase, db } from '../client';
import * as schema from '../schema';
import { eq } from 'drizzle-orm';

describe('Database Seeding', () => {
  beforeEach(async () => {
    // Initialize database before each test
    await initDatabase();

    // Clean up any existing data
    await db.delete(schema.transactions);
    await db.delete(schema.recurringStatuses);
    await db.delete(schema.incomeSplits);
    await db.delete(schema.incomeConfigs);
    await db.delete(schema.categories);
    await db.delete(schema.accounts);
    await db.delete(schema.settings);
  });

  describe('seedInitialData', () => {
    it('should seed initial data successfully', async () => {
      await expect(seedInitialData()).resolves.not.toThrow();
    });

    it('should create default accounts', async () => {
      await seedInitialData();

      const accounts = await db.select().from(schema.accounts);
      expect(accounts.length).toBeGreaterThanOrEqual(2);

      // Check for PNC Spending account
      const pncAccount = accounts.find((acc) => acc.name === 'PNC Spending');
      expect(pncAccount).toBeDefined();
      expect(pncAccount?.type).toBe('checking');

      // Check for DCU Savings account
      const dcuAccount = accounts.find((acc) => acc.name === 'DCU Savings');
      expect(dcuAccount).toBeDefined();
      expect(dcuAccount?.type).toBe('savings');
    });

    it('should create default categories', async () => {
      await seedInitialData();

      const categories = await db.select().from(schema.categories);
      expect(categories.length).toBeGreaterThanOrEqual(9);

      // Check for required categories
      const categoryNames = categories.map((cat) => cat.name);
      expect(categoryNames).toContain('Rent');
      expect(categoryNames).toContain('Food');
      expect(categoryNames).toContain('Gas');
      expect(categoryNames).toContain('Fun Money');
    });

    it('should create categories with valid foreign keys to accounts', async () => {
      await seedInitialData();

      const accounts = await db.select().from(schema.accounts);
      const categories = await db.select().from(schema.categories);

      // All categories should reference valid accounts
      categories.forEach((category) => {
        const accountExists = accounts.some((acc) => acc.id === category.accountId);
        expect(accountExists).toBe(true);
      });
    });

    it('should create income configurations', async () => {
      await seedInitialData();

      const incomeConfigs = await db.select().from(schema.incomeConfigs);
      expect(incomeConfigs.length).toBeGreaterThanOrEqual(2);

      // Check for weekly paycheck
      const weeklyPaycheck = incomeConfigs.find((ic) => ic.type === 'weekly');
      expect(weeklyPaycheck).toBeDefined();
      expect(weeklyPaycheck?.dayOfWeek).toBeDefined();
    });

    it('should create income splits with valid foreign keys', async () => {
      await seedInitialData();

      const accounts = await db.select().from(schema.accounts);
      const incomeConfigs = await db.select().from(schema.incomeConfigs);
      const incomeSplits = await db.select().from(schema.incomeSplits);

      expect(incomeSplits.length).toBeGreaterThan(0);

      // All splits should reference valid income configs and accounts
      incomeSplits.forEach((split) => {
        const configExists = incomeConfigs.some((ic) => ic.id === split.incomeConfigId);
        const accountExists = accounts.some((acc) => acc.id === split.accountId);

        expect(configExists).toBe(true);
        expect(accountExists).toBe(true);
      });

      // Percentages should add up to 100
      const splitsByConfig = new Map<string, number>();
      incomeSplits.forEach((split) => {
        const current = splitsByConfig.get(split.incomeConfigId) || 0;
        splitsByConfig.set(split.incomeConfigId, current + split.percentage);
      });

      splitsByConfig.forEach((total) => {
        expect(total).toBeCloseTo(100, 1);
      });
    });

    it('should create default settings', async () => {
      await seedInitialData();

      const settings = await db.select().from(schema.settings);
      expect(settings).toHaveLength(1);

      const defaultSettings = settings[0];
      expect(defaultSettings.theme).toBe('dark');
      expect(defaultSettings.weekStart).toBe('sunday');
      expect(defaultSettings.notificationsEnabled).toBe(1);
      expect(defaultSettings.currency).toBe('USD');
    });

    it('should be idempotent - not duplicate data on multiple calls', async () => {
      // First seed
      await seedInitialData();
      const firstAccounts = await db.select().from(schema.accounts);
      const firstCategories = await db.select().from(schema.categories);
      const firstSettings = await db.select().from(schema.settings);

      // Second seed
      await seedInitialData();
      const secondAccounts = await db.select().from(schema.accounts);
      const secondCategories = await db.select().from(schema.categories);
      const secondSettings = await db.select().from(schema.settings);

      // Should have same counts
      expect(secondAccounts).toHaveLength(firstAccounts.length);
      expect(secondCategories).toHaveLength(firstCategories.length);
      expect(secondSettings).toHaveLength(firstSettings.length);

      // Third seed
      await seedInitialData();
      const thirdAccounts = await db.select().from(schema.accounts);
      const thirdCategories = await db.select().from(schema.categories);
      const thirdSettings = await db.select().from(schema.settings);

      // Should still have same counts
      expect(thirdAccounts).toHaveLength(firstAccounts.length);
      expect(thirdCategories).toHaveLength(firstCategories.length);
      expect(thirdSettings).toHaveLength(firstSettings.length);
    });

    it('should seed data in correct order respecting foreign keys', async () => {
      // This tests the entire seeding process doesn't violate FK constraints
      await expect(seedInitialData()).resolves.not.toThrow();

      // Verify all relationships are valid
      const accounts = await db.select().from(schema.accounts);
      const categories = await db.select().from(schema.categories);
      const incomeConfigs = await db.select().from(schema.incomeConfigs);
      const incomeSplits = await db.select().from(schema.incomeSplits);

      // Categories reference accounts
      for (const category of categories) {
        const accountExists = accounts.some((acc) => acc.id === category.accountId);
        expect(accountExists).toBe(true);
      }

      // Income splits reference income configs and accounts
      for (const split of incomeSplits) {
        const configExists = incomeConfigs.some((ic) => ic.id === split.incomeConfigId);
        const accountExists = accounts.some((acc) => acc.id === split.accountId);
        expect(configExists).toBe(true);
        expect(accountExists).toBe(true);
      }
    });

    it('should create categories with proper monthly/weekly planning values', async () => {
      await seedInitialData();

      const categories = await db.select().from(schema.categories);

      // All categories should have plannedMonthly values
      categories.forEach((category) => {
        expect(typeof category.plannedMonthly).toBe('number');
        expect(category.plannedMonthly).toBeGreaterThanOrEqual(0);
      });

      // Recurring categories should have proper configuration
      const recurringCategories = categories.filter((cat) => cat.recurring === true);
      recurringCategories.forEach((category) => {
        expect(category.recurringDay).toBeGreaterThanOrEqual(1);
        expect(category.recurringDay).toBeLessThanOrEqual(31);
      });
    });
  });

  describe('Database Integrity After Seeding', () => {
    it('should allow adding transactions after seeding', async () => {
      await seedInitialData();

      const accounts = await db.select().from(schema.accounts);
      const categories = await db.select().from(schema.categories);

      const testTransaction = {
        id: 'test-txn-after-seed',
        amount: 25.50,
        type: 'expense',
        categoryId: categories[0].id,
        accountId: accounts[0].id,
        date: '2025-01-20',
        timestamp: new Date().toISOString(),
        note: 'Test transaction after seeding',
        toAccountId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await expect(
        db.insert(schema.transactions).values(testTransaction)
      ).resolves.not.toThrow();

      // Verify it was inserted
      const transactions = await db.select().from(schema.transactions);
      expect(transactions).toHaveLength(1);
      expect(transactions[0].id).toBe('test-txn-after-seed');

      // Clean up
      await db.delete(schema.transactions).where(
        eq(schema.transactions.id, 'test-txn-after-seed')
      );
    });

    it('should allow updating settings after seeding', async () => {
      await seedInitialData();

      const settings = await db.select().from(schema.settings);
      const settingsId = settings[0].id;

      await db
        .update(schema.settings)
        .set({ theme: 'light', weekStart: 'monday' })
        .where(eq(schema.settings.id, settingsId));

      const updatedSettings = await db.select().from(schema.settings);
      expect(updatedSettings[0].theme).toBe('light');
      expect(updatedSettings[0].weekStart).toBe('monday');
    });
  });
});
