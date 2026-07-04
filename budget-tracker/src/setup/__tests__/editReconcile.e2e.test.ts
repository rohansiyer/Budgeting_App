/**
 * Verifier re-check of finding #1 (edit-setup duplicated config).
 *
 * Proves the fixed edit flow end-to-end against the REAL store (not the
 * in-memory writer): first-run save creates config; then edit mode
 * prefills the wizard from the writer's lists (prefilledWizardState),
 * the user mutates a name and an envelope budget, and saveSetup UPDATES
 * in place — same row counts, same ids, new values. No duplicates.
 */
import { initDatabase, resetDatabaseForTests } from '../../db/client';
import { useBudgetStore } from '../../store';
import { createStoreSetupWriter } from '../storeSetupWriter';
import { saveSetup } from '../save';
import { prefilledWizardState, nextDraftKey, validateStep, type WizardState } from '../wizardState';
import { cents } from '../../lib/money';

const store = () => useBudgetStore.getState();

describe('edit setup reconciles in place (verifier finding #1)', () => {
  it('prefill -> mutate -> save: same counts and ids, updated values, no duplicates', async () => {
    resetDatabaseForTests();
    await initDatabase();
    await store().init();
    const chapter = await store().createChapter({ name: 'Chapter 1', startedAt: '2026-01-01' });
    const writer = createStoreSetupWriter();

    // --- first-run save: all drafts are new (no existingId) ---------------
    const firstRun: WizardState = {
      step: 'review',
      chapterName: chapter.name,
      accounts: [
        {
          key: nextDraftKey('acct'),
          name: 'Checking',
          institution: 'Local Bank',
          kind: 'spending',
          startingBalance: cents(100000),
        },
        {
          key: nextDraftKey('acct'),
          name: 'Savings',
          institution: null,
          kind: 'savings',
          startingBalance: cents(50000),
        },
      ],
      incomeSources: [],
      categories: [
        {
          key: nextDraftKey('cat'),
          name: 'Rent',
          colorKey: 'violet',
          fixed: true,
          envelope: null,
        },
        {
          key: nextDraftKey('cat'),
          name: 'Food',
          colorKey: 'amber',
          fixed: false,
          envelope: { period: 'weekly', budget: cents(10000), carryoverDefault: 'ask' },
        },
      ],
    };
    // Income source references the checking draft key (as the wizard UI does).
    firstRun.incomeSources.push({
      key: nextDraftKey('inc'),
      name: 'Paycheck',
      amount: cents(200000),
      schedule: { kind: 'biweekly', anchorDate: '2026-01-02' },
      splits: [
        { accountId: firstRun.accounts[0].key, ratio: 65 },
        { accountId: firstRun.accounts[1].key, ratio: 35 },
      ],
    });

    await saveSetup(writer, firstRun, chapter);

    const accountsBefore = store().listAccounts();
    const categoriesBefore = store().listCategories();
    const sourcesBefore = store().listIncomeSources();
    expect(accountsBefore).toHaveLength(2);
    expect(categoriesBefore).toHaveLength(2);
    expect(sourcesBefore).toHaveLength(1);
    const checkingId = accountsBefore.find((a) => a.name === 'Checking')!.id;
    const foodId = categoriesBefore.find((c) => c.name === 'Food')!.id;
    const paycheckId = sourcesBefore[0].id;

    // --- edit mode: prefill exactly as SetupRoute does ---------------------
    const prefilled = prefilledWizardState(chapter.name, {
      accounts: await writer.listAccounts(),
      incomeSources: await writer.listIncomeSources(),
      categories: await writer.listCategories(),
    });
    // Every prefilled draft carries its store id.
    expect(prefilled.accounts.every((a) => a.existingId)).toBe(true);
    expect(prefilled.categories.every((c) => c.existingId)).toBe(true);
    expect(prefilled.incomeSources.every((s) => s.existingId)).toBe(true);
    // Splits were remapped from real account ids to wizard-local draft keys.
    const draftKeys = new Set(prefilled.accounts.map((a) => a.key));
    expect(prefilled.incomeSources[0].splits.every((sp) => draftKeys.has(sp.accountId))).toBe(true);

    // --- user edits: rename the checking account, re-budget Food -----------
    const edited: WizardState = {
      ...prefilled,
      step: 'review',
      accounts: prefilled.accounts.map((a) =>
        a.existingId === checkingId ? { ...a, name: 'Everyday Checking' } : a,
      ),
      categories: prefilled.categories.map((c) =>
        c.existingId === foodId
          ? { ...c, envelope: { period: 'weekly' as const, budget: cents(15000), carryoverDefault: 'ask' as const } }
          : c,
      ),
    };
    expect(validateStep(edited, 'review').valid).toBe(true);

    await saveSetup(writer, edited, chapter);

    // --- reconcile proof: SAME counts, SAME ids, NEW values ----------------
    const accountsAfter = store().listAccounts();
    const categoriesAfter = store().listCategories();
    const sourcesAfter = store().listIncomeSources();

    expect(accountsAfter).toHaveLength(2); // no duplicates
    expect(categoriesAfter).toHaveLength(2); // no duplicates
    expect(sourcesAfter).toHaveLength(1); // no duplicates

    const checkingAfter = accountsAfter.find((a) => a.id === checkingId)!;
    expect(checkingAfter.name).toBe('Everyday Checking'); // renamed in place
    expect(checkingAfter.startingBalance).toBe(100000); // untouched fields preserved

    const foodAfter = categoriesAfter.find((c) => c.id === foodId)!;
    expect(foodAfter.envelope).toEqual({
      period: 'weekly',
      budget: 15000,
      carryoverDefault: 'ask',
    }); // re-budgeted in place
    expect(foodAfter.name).toBe('Food');

    const paycheckAfter = sourcesAfter[0];
    expect(paycheckAfter.id).toBe(paycheckId); // same source row
    expect(paycheckAfter.amount).toBe(200000);
    // Splits still point at the REAL account ids (draft keys remapped back).
    expect(paycheckAfter.splits.map((s) => s.accountId).sort()).toEqual(
      accountsBefore.map((a) => a.id).sort(),
    );
    expect(paycheckAfter.splits.find((s) => s.accountId === checkingId)!.ratio).toBe(65);

    // Untouched rows keep their identity too.
    const savingsAfter = accountsAfter.find((a) => a.name === 'Savings')!;
    expect(accountsBefore.some((a) => a.id === savingsAfter.id)).toBe(true);
  });
});
