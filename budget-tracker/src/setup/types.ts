/**
 * SetupWriter — the write/read seam the first-run wizard and "new
 * chapter" flow are built against (Team 2 / New Chapter).
 *
 * `StoreContract` (src/types/contracts.ts) does not expose config
 * mutations — it has transaction/carryover mutations plus a read-only
 * `list*`/`getActiveChapter` surface, but nothing to create an account,
 * income source, category, or chapter. That's a real gap (see Team 2's
 * report / contract-change proposal), not an oversight in this file.
 * Until the orchestrator resolves it, `SetupWriter` is the thin,
 * self-contained interface this package needs; Team 1's real store
 * implements it at merge, and `createInMemorySetupWriter` (see
 * `inMemorySetupWriter.ts`) is the fake this package tests against today.
 */
import type { Cents } from '../lib/money';
import type {
  AccountConfig,
  CategoryColorKey,
  CategoryConfig,
  Chapter,
  EnvelopeConfig,
  IncomeSchedule,
  IncomeSourceConfig,
  IncomeSplitConfig,
  ISODate,
} from '../types/contracts';

/**
 * Wizard-side draft of an account. Carries `startingBalance`, which
 * `AccountConfig` does not model (see contract-change proposal). The real
 * writer decides how this becomes durable (opening-balance transaction
 * vs. a schema column) — the wizard only needs to hand the number over
 * once, at Save.
 */
export interface AccountDraftInput {
  name: string;
  institution: string | null;
  kind: AccountConfig['kind'];
  startingBalance: Cents;
}

export interface IncomeSourceDraftInput {
  name: string;
  amount: Cents;
  schedule: IncomeSchedule;
  splits: IncomeSplitConfig[];
}

export interface CategoryDraftInput {
  name: string;
  colorKey: CategoryColorKey;
  fixed: boolean;
  envelope: EnvelopeConfig | null;
}

export interface SetupWriter {
  // --- chapters --------------------------------------------------------
  getActiveChapter(): Promise<Chapter | null>;
  createChapter(input: { name: string; startedAt: ISODate }): Promise<Chapter>;
  /** Marks `chapterId` archived; does not touch history/ducks (read-only across chapters). */
  archiveChapter(chapterId: string, archivedAt: ISODate): Promise<void>;

  // --- accounts ----------------------------------------------------------
  listAccounts(): Promise<AccountConfig[]>;
  createAccount(input: AccountDraftInput): Promise<AccountConfig>;
  renameAccount(accountId: string, name: string): Promise<void>;

  // --- income sources ------------------------------------------------------
  listIncomeSources(): Promise<IncomeSourceConfig[]>;
  createIncomeSource(input: IncomeSourceDraftInput): Promise<IncomeSourceConfig>;

  // --- categories / envelopes ----------------------------------------------
  listCategories(): Promise<CategoryConfig[]>;
  createCategory(input: CategoryDraftInput): Promise<CategoryConfig>;
}
