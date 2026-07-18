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
import {
  prefilledWizardState,
  nextDraftKey,
  validateStep,
  wizardReducer,
  type WizardState,
} from '../wizardState';
import { cents } from '../../lib/money';
import type { Chapter } from '../../types/contracts';

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

// ---------------------------------------------------------------------------
// v0.3 — real deletion on save (F1-1/F1-2/F1-3) against the REAL store.
// ---------------------------------------------------------------------------

async function bootChapter(name = 'Chapter 1') {
  resetDatabaseForTests();
  await initDatabase();
  await store().init();
  return store().createChapter({ name, startedAt: '2026-01-01' });
}

/** Seed a minimal valid config: 2 accounts + Fun (enveloped) + Rent (fixed). */
async function seedBase(writer: ReturnType<typeof createStoreSetupWriter>, chapter: Chapter) {
  const state: WizardState = {
    step: 'review',
    chapterName: chapter.name,
    accounts: [
      { key: nextDraftKey('acct'), name: 'Checking', institution: null, kind: 'spending', startingBalance: cents(0) },
      { key: nextDraftKey('acct'), name: 'Savings', institution: null, kind: 'savings', startingBalance: cents(0) },
    ],
    incomeSources: [],
    categories: [
      { key: nextDraftKey('cat'), name: 'Fun', colorKey: 'amber', fixed: false, envelope: { period: 'weekly', budget: cents(4000), carryoverDefault: 'ask' } },
      { key: nextDraftKey('cat'), name: 'Rent', colorKey: 'violet', fixed: true, envelope: null },
    ],
  };
  await saveSetup(writer, state, chapter);
  return state;
}

describe('v0.3 wizard real deletion (F1-1/F1-2/F1-3)', () => {
  it('removing a prefilled row archives it — it no longer appears on the next prefill', async () => {
    const chapter = await bootChapter();
    const writer = createStoreSetupWriter();
    await seedBase(writer, chapter);

    // Prefill, drop the "Savings" account (Checking remains as the last active).
    const prefilled = prefilledWizardState(chapter.name, {
      accounts: await writer.listAccounts(),
      incomeSources: await writer.listIncomeSources(),
      categories: await writer.listCategories(),
    });
    const savingsDraft = prefilled.accounts.find((a) => a.name === 'Savings')!;
    const edited = { ...wizardReducer(prefilled, { type: 'REMOVE_ACCOUNT', key: savingsDraft.key }), step: 'review' as const };

    await saveSetup(writer, edited, chapter);

    // Store's default (active-only) list no longer has Savings.
    expect(store().listAccounts().map((a) => a.name)).toEqual(['Checking']);
    // Crucially, a fresh prefill (as SetupRoute does) does NOT resurrect it.
    const reprefilled = prefilledWizardState(chapter.name, {
      accounts: await writer.listAccounts(),
      incomeSources: await writer.listIncomeSources(),
      categories: await writer.listCategories(),
    });
    expect(reprefilled.accounts.map((a) => a.name)).toEqual(['Checking']);
    // But history/id-joins still resolve the archived row.
    expect(store().listAccounts({ includeArchived: true }).some((a) => a.name === 'Savings')).toBe(true);
  });

  it('remove "Fun" + re-add "Fun" with a new budget saves clean, no duplicate, no uniqueness trip', async () => {
    const chapter = await bootChapter();
    const writer = createStoreSetupWriter();
    await seedBase(writer, chapter);

    const prefilled = prefilledWizardState(chapter.name, {
      accounts: await writer.listAccounts(),
      incomeSources: await writer.listIncomeSources(),
      categories: await writer.listCategories(),
    });
    const funDraft = prefilled.categories.find((c) => c.name === 'Fun')!;
    let edited = wizardReducer(prefilled, { type: 'REMOVE_CATEGORY', key: funDraft.key });
    edited = wizardReducer(edited, {
      type: 'ADD_CATEGORY',
      draft: { key: nextDraftKey('cat'), name: 'Fun', colorKey: 'mint', fixed: false, envelope: { period: 'weekly', budget: cents(12000), carryoverDefault: 'roll' } },
    });
    edited = { ...edited, step: 'review' };

    // The remove happens before the create at save time, so uniqueness holds.
    expect(validateStep(edited, 'review').valid).toBe(true);
    await saveSetup(writer, edited, chapter);

    const cats = store().listCategories();
    expect(cats.filter((c) => c.name === 'Fun')).toHaveLength(1);
    const fun = cats.find((c) => c.name === 'Fun')!;
    expect(fun.envelope).toEqual({ period: 'weekly', budget: 12000, carryoverDefault: 'roll' });
    expect(fun.id).not.toBe(funDraft.existingId); // the original was archived, this is fresh
  });

  it('tap-to-edit (UPDATE_CATEGORY) re-budgets in place — row count unchanged, same id', async () => {
    const chapter = await bootChapter();
    const writer = createStoreSetupWriter();
    await seedBase(writer, chapter);

    const prefilled = prefilledWizardState(chapter.name, {
      accounts: await writer.listAccounts(),
      incomeSources: await writer.listIncomeSources(),
      categories: await writer.listCategories(),
    });
    const funDraft = prefilled.categories.find((c) => c.name === 'Fun')!;
    // This is exactly what the tap-to-edit UI dispatches.
    let edited = wizardReducer(prefilled, {
      type: 'UPDATE_CATEGORY',
      key: funDraft.key,
      patch: { name: 'Fun Money', envelope: { period: 'weekly', budget: cents(7000), carryoverDefault: 'sweep' } },
    });
    edited = { ...edited, step: 'review' };

    await saveSetup(writer, edited, chapter);

    const cats = store().listCategories();
    expect(cats).toHaveLength(2); // no new row
    const fun = cats.find((c) => c.id === funDraft.existingId)!;
    expect(fun.name).toBe('Fun Money');
    expect(fun.envelope).toEqual({ period: 'weekly', budget: 7000, carryoverDefault: 'sweep' });
  });

  it('recovers a pre-corrupted store: two same-name categories are fixable via Remove', async () => {
    const chapter = await bootChapter();
    // Corrupt the store directly (as a pre-v0.3 build could): two "Fun" rows.
    await store().createAccount({ name: 'Checking', institution: null, kind: 'spending', startingBalance: cents(0), openedOn: '2026-01-01' });
    await store().createCategory({ name: 'Fun', colorKey: 'amber', fixed: false, envelope: { period: 'weekly', budget: cents(4000), carryoverDefault: 'ask' } });
    await store().createCategory({ name: 'Fun', colorKey: 'mint', fixed: false, envelope: { period: 'weekly', budget: cents(5000), carryoverDefault: 'roll' } });

    const writer = createStoreSetupWriter();
    const prefilled = prefilledWizardState(chapter.name, {
      accounts: await writer.listAccounts(),
      incomeSources: await writer.listIncomeSources(),
      categories: await writer.listCategories(),
    });
    // Both duplicates render, so review validation is blocked initially...
    expect(prefilled.categories.filter((c) => c.name === 'Fun')).toHaveLength(2);
    expect(validateStep(prefilled, 'review').valid).toBe(false);

    // ...but the user can Remove one dup BEFORE that block matters.
    const firstFun = prefilled.categories.find((c) => c.name === 'Fun')!;
    let fixed = wizardReducer(prefilled, { type: 'REMOVE_CATEGORY', key: firstFun.key });
    fixed = { ...fixed, step: 'review' };
    expect(validateStep(fixed, 'review').valid).toBe(true);

    await saveSetup(writer, fixed, chapter);

    // One Fun remains active; the corrupt duplicate is archived.
    expect(store().listCategories().filter((c) => c.name === 'Fun')).toHaveLength(1);
  });
});
