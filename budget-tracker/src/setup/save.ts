/**
 * Review + Save — the wizard's only writes. Takes a validated
 * `WizardState` and a `SetupWriter` (real store at merge, in-memory fake
 * in this package's tests) and persists everything through
 * StoreContract-shaped calls in a stable order (accounts first, since
 * income splits and category/account references depend on real account
 * ids existing).
 *
 * Draft account keys (`AccountDraft.key`, wizard-local, never a store id)
 * are remapped to the writer's real `AccountConfig.id`s before income
 * splits are created — the wizard UI only ever sees draft keys, so this
 * function is the one seam where "draft id" becomes "real id".
 */
import type { AccountConfig, CategoryConfig, Chapter, IncomeSourceConfig } from '../types/contracts';
import type { SetupWriter } from './types';
import { validateStep, type WizardState } from './wizardState';

export interface SaveResult {
  chapter: Chapter;
  accounts: AccountConfig[];
  incomeSources: IncomeSourceConfig[];
  categories: CategoryConfig[];
}

export class SetupValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Setup is incomplete: ${errors.join('; ')}`);
  }
}

/**
 * v0.3 reconcile helper: the ids of currently-stored (active) rows that the
 * draft no longer keeps. A draft keeps a row by carrying its `existingId`;
 * anything stored-but-not-kept was removed in the wizard and must be archived
 * on Save (which is what stops F1-2's duplicate-name lockout from recurring).
 */
export function removedExistingIds(
  stored: readonly { id: string }[],
  keptExistingIds: ReadonlySet<string>,
): string[] {
  return stored.filter((row) => !keptExistingIds.has(row.id)).map((row) => row.id);
}

/**
 * Persists a fully-filled-out wizard against an already-active chapter
 * (created by the caller — first-run bootstrap or `startNewChapter`, see
 * `chapterFlow.ts`). Throws `SetupValidationError` if any step is invalid;
 * never partially writes on a validation failure.
 */
export async function saveSetup(
  writer: SetupWriter,
  state: WizardState,
  chapter: Chapter,
): Promise<SaveResult> {
  const validation = validateStep(state, 'review');
  if (!validation.valid) {
    throw new SetupValidationError(validation.errors);
  }

  // v0.3 reconcile semantics: drafts carrying existingId are UPDATED in place;
  // drafts without one are created. A prefilled row the user removed (stored,
  // but no longer kept in the draft) is ARCHIVED via the writer's remove*.
  // Removals run BEFORE updates/creates so "remove X then re-add X with the
  // same name" saves cleanly instead of tripping the unique-name validator.
  const [storedAccounts, storedIncomeSources, storedCategories] = await Promise.all([
    writer.listAccounts(),
    writer.listIncomeSources(),
    writer.listCategories(),
  ]);

  const keptAccountIds = new Set(
    state.accounts.flatMap((a) => (a.existingId ? [a.existingId] : [])),
  );
  for (const id of removedExistingIds(storedAccounts, keptAccountIds)) {
    try {
      await writer.removeAccount(id);
    } catch (e) {
      if (e instanceof Error && /last active account/i.test(e.message)) {
        throw new SetupValidationError([
          'Keep at least one account — a chapter needs somewhere for income to land.',
        ]);
      }
      throw e;
    }
  }

  const keptIncomeSourceIds = new Set(
    state.incomeSources.flatMap((s) => (s.existingId ? [s.existingId] : [])),
  );
  for (const id of removedExistingIds(storedIncomeSources, keptIncomeSourceIds)) {
    await writer.removeIncomeSource(id);
  }

  const keptCategoryIds = new Set(
    state.categories.flatMap((c) => (c.existingId ? [c.existingId] : [])),
  );
  for (const id of removedExistingIds(storedCategories, keptCategoryIds)) {
    await writer.removeCategory(id);
  }

  const accounts: AccountConfig[] = [];
  const draftKeyToRealId = new Map<string, string>();
  for (const draft of state.accounts) {
    const input = {
      name: draft.name.trim(),
      institution: draft.institution,
      kind: draft.kind,
      startingBalance: draft.startingBalance,
    };
    if (draft.existingId) {
      await writer.updateAccount(draft.existingId, input);
      accounts.push({ id: draft.existingId, openedOn: '', ...input });
      draftKeyToRealId.set(draft.key, draft.existingId);
    } else {
      const account = await writer.createAccount(input);
      accounts.push(account);
      draftKeyToRealId.set(draft.key, account.id);
    }
  }

  const incomeSources: IncomeSourceConfig[] = [];
  for (const draft of state.incomeSources) {
    const splits = draft.splits.map((split) => {
      const realAccountId = draftKeyToRealId.get(split.accountId);
      if (!realAccountId) {
        throw new SetupValidationError([
          `Income source "${draft.name}" references an account that was never saved.`,
        ]);
      }
      return { accountId: realAccountId, ratio: split.ratio };
    });
    const input = {
      name: draft.name.trim(),
      amount: draft.amount,
      schedule: draft.schedule,
      splits,
    };
    if (draft.existingId) {
      await writer.updateIncomeSource(draft.existingId, input);
      incomeSources.push({ id: draft.existingId, ...input });
    } else {
      const source = await writer.createIncomeSource(input);
      incomeSources.push(source);
    }
  }

  // Existing cadences, so an update whose draft omits cadence preserves the
  // stored value in the returned result (the store preserves it too — passing
  // cadence: undefined leaves the column untouched). Reuse the pre-remove
  // snapshot: only kept (still-active) category ids are ever looked up.
  const storedCadence = new Map(storedCategories.map((c) => [c.id, c.cadence] as const));
  const categories: CategoryConfig[] = [];
  for (const draft of state.categories) {
    const input = {
      name: draft.name.trim(),
      colorKey: draft.colorKey,
      fixed: draft.fixed,
      cadence: draft.cadence,
      envelope: draft.envelope,
    };
    if (draft.existingId) {
      await writer.updateCategory(draft.existingId, input);
      const cadence = draft.cadence ?? storedCadence.get(draft.existingId) ?? 'weekly';
      categories.push({ id: draft.existingId, ...input, cadence });
    } else {
      const category = await writer.createCategory(input);
      categories.push(category);
    }
  }

  return { chapter, accounts, incomeSources, categories };
}
