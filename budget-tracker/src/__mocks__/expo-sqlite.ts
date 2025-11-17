// Mock for expo-sqlite in test environment
// In reality, tests that need actual database functionality should use better-sqlite3
// or skip database tests in unit testing and rely on integration tests

interface SQLiteDatabase {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, params?: any[]) => Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync: (sql: string, params?: any[]) => Promise<any[]>;
  getFirstAsync: (sql: string, params?: any[]) => Promise<any | null>;
}

const mockDb: Record<string, any[]> = {};

export const openDatabaseSync = (name: string): SQLiteDatabase => {
  return {
    execAsync: async (sql: string) => {
      // Simple mock - doesn't actually execute SQL
      console.log(`Mock execAsync: ${sql}`);
    },
    runAsync: async (sql: string, params?: any[]) => {
      console.log(`Mock runAsync: ${sql}`, params);
      return { lastInsertRowId: 1, changes: 1 };
    },
    getAllAsync: async (sql: string, params?: any[]) => {
      console.log(`Mock getAllAsync: ${sql}`, params);
      return [];
    },
    getFirstAsync: async (sql: string, params?: any[]) => {
      console.log(`Mock getFirstAsync: ${sql}`, params);
      return null;
    },
  };
};
