import { cents } from '../../lib/money';
import { createInMemorySetupWriter } from '../inMemorySetupWriter';
import { removedExistingIds, saveSetup, SetupValidationError } from '../save';
import {
  initialWizardState,
  nextDraftKey,
  prefilledWizardState,
  wizardReducer,
  type WizardState,
} from '../wizardState';

async function makeActiveChapter(writer: ReturnType<typeof createInMemorySetupWriter>) {
  return writer.createChapter({ name: 'Chapter 1', startedAt: '2026-01-01' });
}

describe('saveSetup', () => {
  it('throws SetupValidationError and writes nothing when the wizard is incomplete', async () => {
    const writer = createInMemorySetupWriter();
    const chapter = await makeActiveChapter(writer);

    await expect(saveSetup(writer, initialWizardState(), chapter)).rejects.toBeInstanceOf(
      SetupValidationError,
    );
    expect(await writer.listAccounts()).toEqual([]);
    expect(await writer.listCategories()).toEqual([]);
  });

  it('persists accounts, remaps draft keys to real ids in income splits, and persists categories', async () => {
    const writer = createInMemorySetupWriter();
    const chapter = await makeActiveChapter(writer);

    let state: WizardState = initialWizardState();
    // Prefixed distinctly from the writer's own "account_N" id format so
    // this test can assert the real ids are genuinely different values,
    // not just coincidentally-matching counters.
    const checkingKey = nextDraftKey('draft-account');
    const savingsKey = nextDraftKey('draft-account');

    state = wizardReducer(state, {
      type: 'ADD_ACCOUNT',
      draft: {
        key: checkingKey,
        name: 'Checking',
        institution: 'Local Bank',
        kind: 'spending',
        startingBalance: cents(50000),
      },
    });
    state = wizardReducer(state, {
      type: 'ADD_ACCOUNT',
      draft: {
        key: savingsKey,
        name: 'Savings',
        institution: 'Local Bank',
        kind: 'savings',
        startingBalance: cents(10000),
      },
    });
    state = wizardReducer(state, {
      type: 'ADD_INCOME_SOURCE',
      draft: {
        key: nextDraftKey('income'),
        name: 'Day Job',
        amount: cents(200000),
        schedule: { kind: 'biweekly', anchorDate: '2026-01-02' },
        splits: [
          { accountId: checkingKey, ratio: 0.7 },
          { accountId: savingsKey, ratio: 0.3 },
        ],
      },
    });
    state = wizardReducer(state, {
      type: 'ADD_CATEGORY',
      draft: {
        key: nextDraftKey('category'),
        name: 'Food',
        colorKey: 'amber',
        fixed: false,
        envelope: { period: 'weekly', budget: cents(4000), carryoverDefault: 'ask' },
      },
    });

    const result = await saveSetup(writer, state, chapter);

    expect(result.accounts).toHaveLength(2);
    expect(result.incomeSources).toHaveLength(1);
    expect(result.categories).toHaveLength(1);

    // Splits must reference the *real* account ids, not the wizard-local keys.
    const realAccountIds = new Set(result.accounts.map((a) => a.id));
    for (const split of result.incomeSources[0].splits) {
      expect(realAccountIds.has(split.accountId)).toBe(true);
      expect(split.accountId).not.toBe(checkingKey);
      expect(split.accountId).not.toBe(savingsKey);
    }

    expect(await writer.listAccounts()).toEqual(result.accounts);
    expect(await writer.listCategories()).toEqual(result.categories);
  });

  it('archives rows the user dropped from the draft on save (F1-1/F1-2)', async () => {
    const writer = createInMemorySetupWriter();
    const chapter = await makeActiveChapter(writer);

    // First-run: two accounts, two categories.
    let state: WizardState = initialWizardState();
    const keepAcct = nextDraftKey('acct');
    const dropAcct = nextDraftKey('acct');
    state = wizardReducer(state, {
      type: 'ADD_ACCOUNT',
      draft: { key: keepAcct, name: 'Checking', institution: null, kind: 'spending', startingBalance: cents(0) },
    });
    state = wizardReducer(state, {
      type: 'ADD_ACCOUNT',
      draft: { key: dropAcct, name: 'Old Savings', institution: null, kind: 'savings', startingBalance: cents(0) },
    });
    state = wizardReducer(state, {
      type: 'ADD_CATEGORY',
      draft: { key: nextDraftKey('cat'), name: 'Fun', colorKey: 'amber', fixed: false, envelope: { period: 'weekly', budget: cents(4000), carryoverDefault: 'ask' } },
    });
    await saveSetup(writer, state, chapter);

    // Edit mode: prefill, drop "Old Savings", re-add "Fun" with a new budget.
    const prefilled = prefilledWizardState(chapter.name, {
      accounts: await writer.listAccounts(),
      incomeSources: await writer.listIncomeSources(),
      categories: await writer.listCategories(),
    });
    const oldSavings = prefilled.accounts.find((a) => a.name === 'Old Savings')!;
    const funDraft = prefilled.categories.find((c) => c.name === 'Fun')!;

    let edited = wizardReducer(prefilled, { type: 'REMOVE_ACCOUNT', key: oldSavings.key });
    // Remove the prefilled Fun (carries existingId) and re-add a fresh Fun.
    edited = wizardReducer(edited, { type: 'REMOVE_CATEGORY', key: funDraft.key });
    edited = wizardReducer(edited, {
      type: 'ADD_CATEGORY',
      draft: { key: nextDraftKey('cat'), name: 'Fun', colorKey: 'mint', fixed: false, envelope: { period: 'weekly', budget: cents(9000), carryoverDefault: 'roll' } },
    });
    edited = { ...edited, step: 'review' };

    await saveSetup(writer, edited, chapter);

    const accountsAfter = await writer.listAccounts();
    const categoriesAfter = await writer.listCategories();
    // Old Savings is archived (gone from the active list); no duplicate Fun.
    expect(accountsAfter.map((a) => a.name)).toEqual(['Checking']);
    expect(categoriesAfter.map((c) => c.name)).toEqual(['Fun']);
    expect(categoriesAfter[0].envelope).toEqual({ period: 'weekly', budget: 9000, carryoverDefault: 'roll' });
    expect(categoriesAfter[0].id).not.toBe(funDraft.existingId); // genuinely a new row, old one archived
  });
});

describe('removedExistingIds', () => {
  it('returns stored ids the draft no longer keeps', () => {
    const stored = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(removedExistingIds(stored, new Set(['a', 'c']))).toEqual(['b']);
    expect(removedExistingIds(stored, new Set(['a', 'b', 'c']))).toEqual([]);
    expect(removedExistingIds(stored, new Set())).toEqual(['a', 'b', 'c']);
  });
});
