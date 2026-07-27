module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  // db/store suites are UN-HIDDEN (design v2 §2.5). They run against a real
  // in-memory SQLite via the node:sqlite-backed expo-sqlite mock.
  testPathIgnorePatterns: ['/node_modules/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!(expo-sqlite|expo|@expo|drizzle-orm)/)',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  moduleNameMapper: {
    '^expo-sqlite$': '<rootDir>/src/__mocks__/expo-sqlite.ts',
    '^expo-file-system$': '<rootDir>/src/__mocks__/expo-file-system.ts',
    '^expo-file-system/legacy$': '<rootDir>/src/__mocks__/expo-file-system.ts',
    '^expo-sharing$': '<rootDir>/src/__mocks__/expo-sharing.ts',
    '^expo-document-picker$': '<rootDir>/src/__mocks__/expo-document-picker.ts',
    '^expo-crypto$': '<rootDir>/src/__mocks__/expo-crypto.ts',
    '^expo-secure-store$': '<rootDir>/src/__mocks__/expo-secure-store.ts',
    '^expo-local-authentication$': '<rootDir>/src/__mocks__/expo-local-authentication.ts',
    '^expo-notifications$': '<rootDir>/src/__mocks__/expo-notifications.ts',
    '^expo-font$': '<rootDir>/src/__mocks__/expo-font.ts',
    '^@expo-google-fonts/space-grotesk$': '<rootDir>/src/__mocks__/expo-google-fonts.ts',
    '^@expo-google-fonts/space-mono$': '<rootDir>/src/__mocks__/expo-google-fonts.ts',
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/node_modules/@react-native-async-storage/async-storage/jest/async-storage-mock.js',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
  ],
};
