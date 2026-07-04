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
      return accounts.slice();
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
      return incomeSources.slice();
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
      return categories.slice();
    },

    async createCategory(input: CategoryDraftInput) {
      const category: CategoryConfig = {
        id: fakeId('category', nextId),
        name: input.name,
        colorKey: input.colorKey,
        fixed: input.fixed,
        envelope: input.envelope,
      };
      categories.push(category);
      return category;
    },
  };
}
