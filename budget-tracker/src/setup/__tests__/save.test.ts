import { cents } from '../../lib/money';
import { createInMemorySetupWriter } from '../inMemorySetupWriter';
import { saveSetup, SetupValidationError } from '../save';
import {
  initialWizardState,
  nextDraftKey,
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
});
