/**
 * Cadence plumbing through the setup write path (A4).
 *
 * Proves against the REAL store that: a saved envelope's cadence persists,
 * prefill carries it back into the wizard, and an edit whose draft does NOT
 * specify cadence preserves the stored value rather than resetting it to
 * 'weekly'. Cadence is data plumbing for later waves; no borrow/carryover
 * semantics are exercised here.
 */
import { initDatabase, resetDatabaseForTests } from '../../db/client';
import { useBudgetStore } from '../../store';
import { createStoreSetupWriter } from '../storeSetupWriter';
import { saveSetup } from '../save';
import { prefilledWizardState, nextDraftKey, type WizardState } from '../wizardState';
import { cents } from '../../lib/money';

const store = () => useBudgetStore.getState();

async function bootstrap() {
  resetDatabaseForTests();
  await initDatabase();
  await store().init();
  return store().createChapter({ name: 'Chapter 1', startedAt: '2026-01-01' });
}

function baseState(chapterName: string): WizardState {
  return {
    step: 'review',
    chapterName,
    accounts: [
      {
        key: nextDraftKey('acct'),
        name: 'Checking',
        institution: null,
        kind: 'spending',
        startingBalance: cents(100000),
      },
    ],
    incomeSources: [],
    categories: [
      // A monthly-cadence envelope and a default (weekly) one.
      {
        key: nextDraftKey('cat'),
        name: 'Fun',
        colorKey: 'pink',
        fixed: false,
        cadence: 'monthly',
        envelope: { period: 'monthly', budget: cents(20000), carryoverDefault: 'ask' },
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
}

describe('cadence reconcile (setup write path)', () => {
  it('persists cadence on create and defaults omitted drafts to weekly', async () => {
    const chapter = await bootstrap();
    const writer = createStoreSetupWriter();

    await saveSetup(writer, baseState(chapter.name), chapter);

    const cats = store().listCategories();
    expect(cats.find((c) => c.name === 'Fun')!.cadence).toBe('monthly');
    expect(cats.find((c) => c.name === 'Food')!.cadence).toBe('weekly');
  });

  it('prefill carries cadence, and an edit that omits it preserves the stored value', async () => {
    const chapter = await bootstrap();
    const writer = createStoreSetupWriter();
    await saveSetup(writer, baseState(chapter.name), chapter);

    const funId = store().listCategories().find((c) => c.name === 'Fun')!.id;

    // Prefill exactly as the edit flow does — cadence must round-trip.
    const prefilled = prefilledWizardState(chapter.name, {
      accounts: await writer.listAccounts(),
      incomeSources: await writer.listIncomeSources(),
      categories: await writer.listCategories(),
    });
    expect(prefilled.categories.find((c) => c.existingId === funId)!.cadence).toBe('monthly');

    // Simulate a draft that lost its cadence (older UI / partial draft) and
    // renames Fun. The stored monthly cadence must survive the reconcile.
    const edited: WizardState = {
      ...prefilled,
      step: 'review',
      categories: prefilled.categories.map((c) =>
        c.existingId === funId ? { ...c, name: 'Fun Money', cadence: undefined } : c,
      ),
    };

    await saveSetup(writer, edited, chapter);

    const funAfter = store().listCategories().find((c) => c.id === funId)!;
    expect(funAfter.name).toBe('Fun Money'); // rename landed
    expect(funAfter.cadence).toBe('monthly'); // cadence preserved, not reset to weekly
  });
});
