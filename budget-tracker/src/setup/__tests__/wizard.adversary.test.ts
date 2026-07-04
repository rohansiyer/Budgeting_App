/**
 * Team 2 ADVERSARY — wizard validation + save + engine-integration attacks.
 *
 * Convention: a FAILING test = CONFIRMED BUG (left in place). A PASSING test
 * documents verified-safe behavior.
 *
 * Central claim under attack: validateStep('review') is the ONLY gate before
 * saveSetup persists a config. Anything it lets through becomes durable, and
 * the engine (paydaysBetween / money.allocate) must then be able to consume
 * it. Where the gate is weaker than the engine, save persists a config that
 * the engine later rejects — an invariant break.
 */
import { allocate, cents } from '../../lib/money';
import { paydaysBetween } from '../../lib/schedule';
import { createInMemorySetupWriter } from '../inMemorySetupWriter';
import { saveSetup, SetupValidationError } from '../save';
import {
  initialWizardState,
  nextDraftKey,
  validateIncomeStep,
  validateStep,
  type AccountDraft,
  type CategoryDraft,
  type IncomeSourceDraft,
  type WizardState,
} from '../wizardState';

function account(overrides: Partial<AccountDraft> = {}): AccountDraft {
  return {
    key: nextDraftKey('account'),
    name: 'Checking',
    institution: null,
    kind: 'spending',
    startingBalance: cents(10000),
    ...overrides,
  };
}

function category(overrides: Partial<CategoryDraft> = {}): CategoryDraft {
  return {
    key: nextDraftKey('category'),
    name: 'Food',
    colorKey: 'amber',
    fixed: false,
    envelope: { period: 'weekly', budget: cents(4000), carryoverDefault: 'ask' },
    ...overrides,
  };
}

/** A fully-valid base state (1 account, 1 category) that passes review. */
function validBase(acc: AccountDraft): WizardState {
  return {
    ...initialWizardState(),
    accounts: [acc],
    categories: [category()],
  };
}

async function activeChapter(writer: ReturnType<typeof createInMemorySetupWriter>) {
  return writer.createChapter({ name: 'Chapter 1', startedAt: '2026-01-01' });
}

// ---------------------------------------------------------------------------
// CONFIRMED BUG: a NaN semimonthly day passes validation AND save, then
// crashes paydaysBetween. validateIncomeStep never inspects schedule at all,
// so a garbage semimonthlyDays value (e.g. Number('') paths in the UI, or any
// non-integer) is persisted and detonates when Home/Calendar projects paydays.
// ---------------------------------------------------------------------------
describe('[BUG] semimonthly schedule is never validated; a NaN day is saved then crashes the engine', () => {
  it('persists a config that paydaysBetween throws on', async () => {
    const acc = account();
    const bad: IncomeSourceDraft = {
      key: nextDraftKey('income'),
      name: 'Job',
      amount: cents(200000),
      // NaN is a `number`, so it satisfies the [number, number] type.
      schedule: { kind: 'semimonthly', anchorDate: '2024-01-01', semimonthlyDays: [NaN, 15] },
      splits: [{ accountId: acc.key, ratio: 1 }],
    };
    const state: WizardState = { ...validBase(acc), incomeSources: [bad] };

    // Amended post-fix (orchestrator-authorized): the original asserted the
    // vulnerable behavior (.toBe(true)) as a precondition; the gate now
    // correctly rejects non-integer semimonthly days, so this is a
    // regression test of the fixed invariant.
    expect(validateStep(state, 'review').valid).toBe(false);

    const writer = createInMemorySetupWriter();
    const chapter = await activeChapter(writer);
    // The invalid config must never be persisted for paydaysBetween to
    // detonate on: saveSetup rejects it at the gate.
    await expect(saveSetup(writer, state, chapter)).rejects.toBeInstanceOf(SetupValidationError);
  });
});

// ---------------------------------------------------------------------------
// CONFIRMED BUG: a non-finite split ratio passes validation AND save, then
// crashes money.allocate. validateIncomeStep guards ratio<0 and all-zero, but
// NOT non-finite. allocate rejects it, so income application later throws.
// ---------------------------------------------------------------------------
describe('[BUG] non-finite split ratio passes validation; money.allocate rejects it after save', () => {
  it('validateIncomeStep accepts an Infinity ratio the allocator will reject', () => {
    const acc = account();
    const src: IncomeSourceDraft = {
      key: nextDraftKey('income'),
      name: 'Job',
      amount: cents(200000),
      schedule: { kind: 'monthly', anchorDate: '2024-01-15' },
      splits: [{ accountId: acc.key, ratio: Number.POSITIVE_INFINITY }],
    };
    const state: WizardState = { ...validBase(acc), incomeSources: [src] };
    // FAILS: the gate should reject a ratio allocate() cannot use, but returns valid.
    expect(validateIncomeStep(state).valid).toBe(false);
  });

  it('the persisted Infinity-ratio config makes money.allocate throw at split time', async () => {
    const acc = account();
    const src: IncomeSourceDraft = {
      key: nextDraftKey('income'),
      name: 'Job',
      amount: cents(200000),
      schedule: { kind: 'monthly', anchorDate: '2024-01-15' },
      splits: [{ accountId: acc.key, ratio: Number.POSITIVE_INFINITY }],
    };
    const state: WizardState = { ...validBase(acc), incomeSources: [src] };
    // Amended post-fix (orchestrator-authorized): the original asserted the
    // vulnerable behavior (.toBe(true)) as a precondition; the gate now
    // mirrors money.allocate's finite-ratio guard, so this is a regression
    // test of the fixed invariant.
    expect(validateStep(state, 'review').valid).toBe(false);

    const writer = createInMemorySetupWriter();
    const chapter = await activeChapter(writer);
    // The Infinity-ratio config never reaches allocate(): saveSetup
    // rejects it at the gate.
    await expect(saveSetup(writer, state, chapter)).rejects.toBeInstanceOf(SetupValidationError);
  });
});

// ---------------------------------------------------------------------------
// VERIFIED-SAFE: things the gate correctly blocks / handles.
// ---------------------------------------------------------------------------
describe('[safe] validation correctly blocks the obvious invariant breaks', () => {
  it('zero accounts -> saveSetup throws SetupValidationError and writes nothing', async () => {
    const writer = createInMemorySetupWriter();
    const chapter = await activeChapter(writer);
    const state: WizardState = { ...initialWizardState(), categories: [category()] };
    await expect(saveSetup(writer, state, chapter)).rejects.toBeInstanceOf(SetupValidationError);
    expect(await writer.listAccounts()).toEqual([]);
  });

  it('all-zero split ratios are rejected by the gate (allocate would throw)', () => {
    const acc = account();
    const src: IncomeSourceDraft = {
      key: nextDraftKey('income'),
      name: 'Job',
      amount: cents(1000),
      schedule: { kind: 'weekly', anchorDate: '2024-01-03' },
      splits: [{ accountId: acc.key, ratio: 0 }],
    };
    expect(validateIncomeStep({ ...validBase(acc), incomeSources: [src] }).valid).toBe(false);
  });

  it('negative/zero envelope budget (e.g. parseDecimal("-5")) is rejected', () => {
    const neg = category({ envelope: { period: 'weekly', budget: cents(-500), carryoverDefault: 'reset' } });
    const zero = category({ name: 'Fun', envelope: { period: 'weekly', budget: cents(0), carryoverDefault: 'reset' } });
    expect(validateStep({ ...initialWizardState(), accounts: [account()], categories: [neg] }, 'envelopes').valid).toBe(false);
    expect(validateStep({ ...initialWizardState(), accounts: [account()], categories: [zero] }, 'envelopes').valid).toBe(false);
  });

  it('duplicate account names (case/whitespace-insensitive) are rejected', () => {
    const state: WizardState = {
      ...initialWizardState(),
      accounts: [account({ name: 'Checking' }), account({ name: ' checking ' })],
    };
    expect(validateStep(state, 'accounts').valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VERIFIED-SAFE: split preview (allocate in the UI) matches what save persists,
// because both feed the SAME ratios to the SAME allocate(). Extreme ratios
// like [1e-9, 1] are cent-conserving and deterministic.
// ---------------------------------------------------------------------------
describe('[safe] split-editor preview matches persisted allocation for extreme ratios', () => {
  it('allocate([1e-9, 1]) conserves every cent and is order-stable', () => {
    const amount = cents(123457);
    const ratios = [1e-9, 1];
    const first = allocate(amount, ratios);
    const second = allocate(amount, ratios);
    expect(first).toEqual(second); // deterministic: preview === persist
    expect(first.reduce((a, b) => a + b, 0)).toBe(amount); // conservation
    // The 1e-9 bucket rounds down to 0; the whole amount lands in bucket 2.
    expect(first[0]).toBe(0);
    expect(first[1]).toBe(amount);
  });
});

// ---------------------------------------------------------------------------
// VERIFIED-SAFE: out-of-range INTEGER semimonthly days. The contract says days
// are "clamped to month length", so [0,15] -> [1,15] and [1,32] -> [1,31] is
// documented behavior (not a crash). Recorded here to bound the NaN bug above:
// the crash is specifically about non-finite/non-integer days, not large ones.
// ---------------------------------------------------------------------------
describe('[safe] out-of-range integer semimonthly days are clamped (documented), not crashed', () => {
  it('[1,32] and [0,15] project without throwing', () => {
    const hi: IncomeSchedule32 = { kind: 'semimonthly', anchorDate: '2024-01-01', semimonthlyDays: [1, 32] };
    const lo: IncomeSchedule32 = { kind: 'semimonthly', anchorDate: '2024-01-01', semimonthlyDays: [0, 15] };
    expect(() => paydaysBetween(hi, { from: '2024-01-01', to: '2024-01-31' })).not.toThrow();
    expect(paydaysBetween(hi, { from: '2024-01-01', to: '2024-01-31' })).toEqual(['2024-01-01', '2024-01-31']);
    expect(paydaysBetween(lo, { from: '2024-01-01', to: '2024-01-31' })).toEqual(['2024-01-01', '2024-01-15']);
  });
});

// Local alias so the [number, number] literal above type-checks cleanly.
type IncomeSchedule32 = import('../../types/contracts').IncomeSchedule;
