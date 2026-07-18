/**
 * In-memory fake for `SetupWriter`. Used by this package's own tests, and
 * by the orchestrator/other teams to exercise the wizard before Team 1's
 * real store lands. NOT wired into the shipping app — App.tsx's real
 * writer is swapped in at merge.
 *
 * Its id generation is local and test-only; production code must go
 * through the real writer, which is responsible for using the shared
 * `generateId()` (src/lib/ids.ts, Team 1) once that exists.
 */
import type {
  AccountConfig,
  CategoryConfig,
  Chapter,
  IncomeSourceConfig,
} from '../types/contracts';
import type {
  AccountDraftInput,
  CategoryDraftInput,
  IncomeSourceDraftInput,
  SetupWriter,
} from './types';

function fakeId(prefix: string, counter: () => number): string {
  return `${prefix}_${counter()}`;
}

export function createInMemorySetupWriter(): SetupWriter {
  let seq = 0;
  const nextId = () => ++seq;

  let chapters: Chapter[] = [];
  let accounts: AccountConfig[] = [];
  let incomeSources: IncomeSourceConfig[] = [];
  let categories: CategoryConfig[] = [];
  // v0.3 archival: rows are retained (history/id-joins still resolve) but
  // excluded from the default list reads, mirroring the real store.
  const archivedAccounts = new Set<string>();
  const archivedIncomeSources = new Set<string>();
  const archivedCategories = new Set<string>();

  return {
    async getActiveChapter() {
      return chapters.find((c) => c.archivedAt === null) ?? null;
    },

    async createChapter({ name, startedAt }) {
      const existing = chapters.find((c) => c.archivedAt === null);
      if (existing) {
        throw new Error(
          `createChapter: chapter "${existing.name}" (${existing.id}) is still active; archive it first`,
        );
      }
      const chapter: Chapter = {
        id: fakeId('chapter', nextId),
        name,
        startedAt,
        archivedAt: null,
      };
      chapters.push(chapter);
      return chapter;
    },

    async archiveChapter(chapterId, archivedAt) {
      const chapter = chapters.find((c) => c.id === chapterId);
      if (!chapter) throw new Error(`archiveChapter: unknown chapter "${chapterId}"`);
      if (chapter.archivedAt !== null) {
        throw new Error(`archiveChapter: chapter "${chapterId}" is already archived`);
      }
      chapter.archivedAt = archivedAt;
    },

    async listAccounts() {
      return accounts.filter((a) => !archivedAccounts.has(a.id));
    },

    async createAccount(input: AccountDraftInput) {
      const account: AccountConfig = {
        id: fakeId('account', nextId),
        name: input.name,
        institution: input.institution,
        kind: input.kind,
        startingBalance: input.startingBalance,
        openedOn: new Date().toISOString().slice(0, 10),
      };
      accounts.push(account);
      return account;
    },

    async renameAccount(accountId, name) {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) throw new Error(`renameAccount: unknown account "${accountId}"`);
      account.name = name;
    },

    async listIncomeSources() {
      return incomeSources.filter((s) => !archivedIncomeSources.has(s.id));
    },

    async createIncomeSource(input: IncomeSourceDraftInput) {
      for (const split of input.splits) {
        if (!accounts.some((a) => a.id === split.accountId)) {
          throw new Error(`createIncomeSource: unknown split account "${split.accountId}"`);
        }
      }
      const source: IncomeSourceConfig = {
        id: fakeId('income', nextId),
        name: input.name,
        amount: input.amount,
        schedule: input.schedule,
        splits: input.splits,
      };
      incomeSources.push(source);
      return source;
    },

    async listCategories() {
      return categories.filter((c) => !archivedCategories.has(c.id));
    },

    async createCategory(input: CategoryDraftInput) {
      const category: CategoryConfig = {
        id: fakeId('category', nextId),
        name: input.name,
        colorKey: input.colorKey,
        fixed: input.fixed,
        cadence: input.cadence ?? 'weekly',
        envelope: input.envelope,
      };
      categories.push(category);
      return category;
    },

    async updateAccount(accountId, patch) {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) throw new Error(`updateAccount: unknown account "${accountId}"`);
      if (patch.name !== undefined) account.name = patch.name;
      if (patch.institution !== undefined) account.institution = patch.institution;
      if (patch.kind !== undefined) account.kind = patch.kind;
      if (patch.startingBalance !== undefined) account.startingBalance = patch.startingBalance;
    },
    async updateIncomeSource(sourceId, patch) {
      const source = incomeSources.find((i) => i.id === sourceId);
      if (!source) throw new Error(`updateIncomeSource: unknown income source "${sourceId}"`);
      if (patch.name !== undefined) source.name = patch.name;
      if (patch.amount !== undefined) source.amount = patch.amount;
      if (patch.schedule !== undefined) source.schedule = patch.schedule;
      if (patch.splits !== undefined) source.splits = patch.splits;
    },
    async updateCategory(categoryId, patch) {
      const category = categories.find((c) => c.id === categoryId);
      if (!category) throw new Error(`updateCategory: unknown category "${categoryId}"`);
      if (patch.name !== undefined) category.name = patch.name;
      if (patch.colorKey !== undefined) category.colorKey = patch.colorKey;
      if (patch.fixed !== undefined) category.fixed = patch.fixed;
      // Undefined cadence preserves the stored value (edit-reconcile).
      if (patch.cadence !== undefined) category.cadence = patch.cadence;
      if (patch.envelope !== undefined) category.envelope = patch.envelope;
    },

    // --- removal (v0.3): archive; mirror the store's semantics ---------------
    async removeAccount(accountId) {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) throw new Error(`removeAccount: unknown account "${accountId}"`);
      if (archivedAccounts.has(accountId)) {
        throw new Error(`removeAccount: account "${accountId}" is already archived`);
      }
      const activeCount = accounts.filter((a) => !archivedAccounts.has(a.id)).length;
      if (activeCount <= 1) {
        throw new Error('removeAccount: cannot archive the last active account');
      }
      archivedAccounts.add(accountId);
      // Same as the store: drop this account's income_splits so an orphaned
      // split can't misroute money.
      for (const source of incomeSources) {
        source.splits = source.splits.filter((sp) => sp.accountId !== accountId);
      }
    },
    async removeCategory(categoryId) {
      const category = categories.find((c) => c.id === categoryId);
      if (!category) throw new Error(`removeCategory: unknown category "${categoryId}"`);
      if (archivedCategories.has(categoryId)) {
        throw new Error(`removeCategory: category "${categoryId}" is already archived`);
      }
      archivedCategories.add(categoryId);
    },
    async removeIncomeSource(sourceId) {
      const source = incomeSources.find((s) => s.id === sourceId);
      if (!source) throw new Error(`removeIncomeSource: unknown income source "${sourceId}"`);
      if (archivedIncomeSources.has(sourceId)) {
        throw new Error(`removeIncomeSource: income source "${sourceId}" is already archived`);
      }
      // Splits retained inert (historical income rows keep their split).
      archivedIncomeSources.add(sourceId);
    },
  };
}
