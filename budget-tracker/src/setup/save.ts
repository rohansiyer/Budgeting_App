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

  // v0.2 reconcile semantics: drafts carrying existingId are UPDATED in
  // place; drafts without one are created. Removing a prefilled row from
  // the wizard does NOT delete the stored entity (no destructive edits
  // from the wizard in v0.2).
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
  // cadence: undefined leaves the column untouched).
  const storedCadence = new Map(
    (await writer.listCategories()).map((c) => [c.id, c.cadence] as const),
  );
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
