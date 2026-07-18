/**
 * Real SetupWriter backed by the StoreContract config mutations
 * (contracts rev 3). Wired at Gate 2 of the merge train; replaces
 * createInMemorySetupWriter for production call sites.
 */
import { useBudgetStore } from '../store';
import type { SetupWriter } from './types';

export function createStoreSetupWriter(): SetupWriter {
  const store = () => useBudgetStore.getState();
  return {
    async getActiveChapter() {
      try {
        return store().getActiveChapter();
      } catch {
        return null; // pre-wizard: no chapter yet
      }
    },
    createChapter: (input) => store().createChapter(input),
    archiveChapter: (chapterId, archivedAt) => store().archiveChapter(chapterId, archivedAt),

    async listAccounts() {
      return store().listAccounts();
    },
    createAccount: (input) =>
      store().createAccount({
        name: input.name,
        institution: input.institution,
        kind: input.kind,
        startingBalance: input.startingBalance,
        openedOn: new Date().toISOString().slice(0, 10),
      }),
    renameAccount: (accountId, name) => store().renameAccount(accountId, name),

    async listIncomeSources() {
      return store().listIncomeSources();
    },
    createIncomeSource: (input) => store().createIncomeSource(input),

    async listCategories() {
      return store().listCategories();
    },
    createCategory: (input) => store().createCategory(input),

    updateAccount: (accountId, patch) => store().updateAccount(accountId, patch),
    updateIncomeSource: (sourceId, patch) => store().updateIncomeSource(sourceId, patch),
    updateCategory: async (categoryId, patch) => {
      const { envelope, ...rest } = patch;
      if (Object.keys(rest).length > 0) await store().updateCategory(categoryId, rest);
      if (envelope !== undefined) await store().updateEnvelope(categoryId, envelope);
    },

    // v0.3 real delete: thin delegates to the store's archival primitives.
    removeAccount: (accountId) => store().removeAccount(accountId),
    removeCategory: (categoryId) => store().removeCategory(categoryId),
    removeIncomeSource: (sourceId) => store().removeIncomeSource(sourceId),
  };
}
