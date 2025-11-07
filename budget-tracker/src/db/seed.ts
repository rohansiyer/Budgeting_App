import { db } from './client';
import * as schema from './schema';
import { Account, Category, IncomeConfig, Settings } from '../types';

const generateId = () => {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const seedInitialData = async () => {
  const now = new Date().toISOString();
  const today = new Date().toISOString().split('T')[0];

  try {
    // Check if already seeded
    const existingSettings = await db.select().from(schema.settings).limit(1);
    if (existingSettings.length > 0) {
      console.log('Database already seeded');
      return;
    }

    // Create default accounts
    const pncAccount: Account = {
      id: 'pnc',
      name: 'PNC Spending',
      type: 'checking',
      startingBalance: 810.63,
      startingDate: today,
      createdAt: now,
      updatedAt: now,
    };

    const dcuAccount: Account = {
      id: 'dcu',
      name: 'DCU Savings',
      type: 'savings',
      startingBalance: 347.42,
      startingDate: today,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.accounts).values([pncAccount, dcuAccount]);

    // Create default categories
    const defaultCategories: Category[] = [
      {
        id: 'rent',
        name: 'Rent',
        color: '#2196F3',
        plannedMonthly: 975,
        recurring: true,
        recurringDay: 1,
        accountId: 'pnc',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'electricity',
        name: 'Electricity',
        color: '#009688',
        plannedMonthly: 30,
        recurring: true,
        recurringDay: 1,
        accountId: 'pnc',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'internet',
        name: 'Internet',
        color: '#009688',
        plannedMonthly: 65,
        recurring: true,
        recurringDay: 1,
        accountId: 'pnc',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'phone',
        name: 'Phone',
        color: '#009688',
        plannedMonthly: 55,
        recurring: true,
        recurringDay: 1,
        accountId: 'pnc',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'car_payment',
        name: 'Car Payment',
        color: '#9C27B0',
        plannedMonthly: 400,
        recurring: true,
        recurringDay: 1,
        accountId: 'pnc',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'car_insurance',
        name: 'Car Insurance',
        color: '#3F51B5',
        plannedMonthly: 90,
        recurring: true,
        recurringDay: 1,
        accountId: 'pnc',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'gas',
        name: 'Gas',
        color: '#FFC107',
        plannedMonthly: 173,
        plannedWeekly: 40,
        recurring: false,
        accountId: 'pnc',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'food',
        name: 'Food',
        color: '#4CAF50',
        plannedMonthly: 152,
        plannedWeekly: 35,
        recurring: false,
        accountId: 'pnc',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'fun_money',
        name: 'Fun Money',
        color: '#FF9800',
        plannedMonthly: 400,
        recurring: false,
        accountId: 'pnc',
        createdAt: now,
        updatedAt: now,
      },
    ];

    await db.insert(schema.categories).values(defaultCategories);

    // Create weekly paycheck income config
    const paycheckConfig: IncomeConfig = {
      id: 'weekly_paycheck',
      type: 'weekly_paycheck',
      amount: 1158.05,
      dayOfWeek: 3, // Wednesday (0=Sunday, 3=Wednesday)
      editable: true,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.incomeConfigs).values(paycheckConfig);

    // Create income splits
    await db.insert(schema.incomeSplits).values([
      {
        id: generateId(),
        incomeConfigId: 'weekly_paycheck',
        accountId: 'dcu',
        amount: 347.42,
        percentage: 30,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: generateId(),
        incomeConfigId: 'weekly_paycheck',
        accountId: 'pnc',
        amount: 810.63,
        percentage: 70,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Create tutoring income config
    const tutoringConfig: IncomeConfig = {
      id: 'tutoring',
      type: 'tutoring',
      minAmount: 200,
      maxAmount: 400,
      editable: true,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.incomeConfigs).values(tutoringConfig);

    // Create default settings
    const defaultSettings: Settings = {
      id: 'main',
      theme: 'dark',
      weekStart: 'sunday',
      notificationsEnabled: true,
      recurringNotificationTime: '20:00',
      currency: 'USD',
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.settings).values(defaultSettings);

    console.log('Database seeded successfully');
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
};
