import { cents } from '../../lib/money';
import {
  canGoNext,
  initialWizardState,
  nextDraftKey,
  validateAccountsStep,
  validateEnvelopesStep,
  validateIncomeStep,
  validateStep,
  wizardReducer,
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

describe('wizardReducer — navigation', () => {
  it('starts on the accounts step', () => {
    expect(initialWizardState().step).toBe('accounts');
  });

  it('GO_NEXT advances through the fixed step order and stops at review', () => {
    let state = initialWizardState();
    state = wizardReducer(state, { type: 'GO_NEXT' });
    expect(state.step).toBe('income');
    state = wizardReducer(state, { type: 'GO_NEXT' });
    expect(state.step).toBe('envelopes');
    state = wizardReducer(state, { type: 'GO_NEXT' });
    expect(state.step).toBe('review');
    state = wizardReducer(state, { type: 'GO_NEXT' });
    expect(state.step).toBe('review'); // clamps, does not overflow
  });

  it('GO_BACK retreats and clamps at accounts', () => {
    let state = initialWizardState();
    state = wizardReducer(state, { type: 'GO_BACK' });
    expect(state.step).toBe('accounts');
  });

  it('GO_TO_STEP jumps directly', () => {
    const state = wizardReducer(initialWizardState(), { type: 'GO_TO_STEP', step: 'review' });
    expect(state.step).toBe('review');
  });
});

describe('wizardReducer — accounts', () => {
  it('adds, updates, and removes an account by key', () => {
    const draft = account({ name: 'Checking' });
    let state = wizardReducer(initialWizardState(), { type: 'ADD_ACCOUNT', draft });
    expect(state.accounts).toHaveLength(1);

    state = wizardReducer(state, {
      type: 'UPDATE_ACCOUNT',
      key: draft.key,
      patch: { name: 'Renamed' },
    });
    expect(state.accounts[0].name).toBe('Renamed');

    state = wizardReducer(state, { type: 'REMOVE_ACCOUNT', key: draft.key });
    expect(state.accounts).toHaveLength(0);
  });

  it('removing an account scrubs income splits that referenced it', () => {
    const acc = account();
    const source: IncomeSourceDraft = {
      key: nextDraftKey('income'),
      name: 'Job',
      amount: cents(100000),
      schedule: { kind: 'weekly', anchorDate: '2024-01-03' },
      splits: [{ accountId: acc.key, ratio: 1 }],
    };
    let state: WizardState = initialWizardState();
    state = wizardReducer(state, { type: 'ADD_ACCOUNT', draft: acc });
    state = wizardReducer(state, { type: 'ADD_INCOME_SOURCE', draft: source });
    state = wizardReducer(state, { type: 'REMOVE_ACCOUNT', key: acc.key });

    expect(state.incomeSources[0].splits).toEqual([]);
  });
});

describe('wizardReducer — income sources', () => {
  it('adds, updates splits, and removes', () => {
    const source: IncomeSourceDraft = {
      key: nextDraftKey('income'),
      name: 'Job',
      amount: cents(100000),
      schedule: { kind: 'biweekly', anchorDate: '2024-01-05' },
      splits: [],
    };
    let state = wizardReducer(initialWizardState(), { type: 'ADD_INCOME_SOURCE', draft: source });
    state = wizardReducer(state, {
      type: 'SET_INCOME_SPLITS',
      key: source.key,
      splits: [{ accountId: 'a1', ratio: 0.5 }, { accountId: 'a2', ratio: 0.5 }],
    });
    expect(state.incomeSources[0].splits).toHaveLength(2);

    state = wizardReducer(state, { type: 'REMOVE_INCOME_SOURCE', key: source.key });
    expect(state.incomeSources).toHaveLength(0);
  });
});

describe('wizardReducer — categories', () => {
  it('adds, updates, and removes', () => {
    const draft: CategoryDraft = {
      key: nextDraftKey('category'),
      name: 'Food',
      colorKey: 'amber',
      fixed: false,
      envelope: { period: 'weekly', budget: cents(4000), carryoverDefault: 'ask' },
    };
    let state = wizardReducer(initialWizardState(), { type: 'ADD_CATEGORY', draft });
    state = wizardReducer(state, {
      type: 'UPDATE_CATEGORY',
      key: draft.key,
      patch: { name: 'Groceries' },
    });
    expect(state.categories[0].name).toBe('Groceries');

    state = wizardReducer(state, { type: 'REMOVE_CATEGORY', key: draft.key });
    expect(state.categories).toHaveLength(0);
  });
});

describe('validateAccountsStep', () => {
  it('requires at least one account', () => {
    const state = initialWizardState();
    expect(validateAccountsStep(state).valid).toBe(false);
  });

  it('rejects blank names and duplicate names', () => {
    const state: WizardState = {
      ...initialWizardState(),
      accounts: [account({ name: '' }), account({ name: 'Dup' }), account({ name: 'dup' })],
    };
    const result = validateAccountsStep(state);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('passes with one well-formed account', () => {
    const state: WizardState = { ...initialWizardState(), accounts: [account()] };
    expect(validateAccountsStep(state).valid).toBe(true);
  });
});

describe('validateIncomeStep', () => {
  it('is valid with zero income sources (optional step)', () => {
    expect(validateIncomeStep(initialWizardState()).valid).toBe(true);
  });

  it('rejects a source with no splits, a non-positive amount, or an all-zero ratio', () => {
    const acc = account();
    const base: WizardState = { ...initialWizardState(), accounts: [acc] };

    const noSplits: IncomeSourceDraft = {
      key: nextDraftKey('income'),
      name: 'Job',
      amount: cents(1000),
      schedule: { kind: 'weekly', anchorDate: '2024-01-03' },
      splits: [],
    };
    expect(
      validateIncomeStep({ ...base, incomeSources: [noSplits] }).valid,
    ).toBe(false);

    const zeroAmount: IncomeSourceDraft = {
      ...noSplits,
      amount: cents(0),
      splits: [{ accountId: acc.key, ratio: 1 }],
    };
    expect(validateIncomeStep({ ...base, incomeSources: [zeroAmount] }).valid).toBe(false);

    const zeroRatios: IncomeSourceDraft = {
      ...noSplits,
      amount: cents(1000),
      splits: [{ accountId: acc.key, ratio: 0 }],
    };
    expect(validateIncomeStep({ ...base, incomeSources: [zeroRatios] }).valid).toBe(false);
  });

  it('rejects a split pointing at a removed account', () => {
    const acc = account();
    const base: WizardState = { ...initialWizardState(), accounts: [acc] };
    const dangling: IncomeSourceDraft = {
      key: nextDraftKey('income'),
      name: 'Job',
      amount: cents(1000),
      schedule: { kind: 'weekly', anchorDate: '2024-01-03' },
      splits: [{ accountId: 'not-a-real-key', ratio: 1 }],
    };
    expect(validateIncomeStep({ ...base, incomeSources: [dangling] }).valid).toBe(false);
  });

  it('accepts a well-formed split across two accounts', () => {
    const a1 = account({ name: 'Checking' });
    const a2 = account({ name: 'Savings' });
    const source: IncomeSourceDraft = {
      key: nextDraftKey('income'),
      name: 'Job',
      amount: cents(200000),
      schedule: { kind: 'monthly', anchorDate: '2024-01-01' },
      splits: [
        { accountId: a1.key, ratio: 0.7 },
        { accountId: a2.key, ratio: 0.3 },
      ],
    };
    const state: WizardState = {
      ...initialWizardState(),
      accounts: [a1, a2],
      incomeSources: [source],
    };
    expect(validateIncomeStep(state).valid).toBe(true);
  });
});

describe('validateEnvelopesStep', () => {
  it('requires at least one category', () => {
    expect(validateEnvelopesStep(initialWizardState()).valid).toBe(false);
  });

  it('requires an envelope on non-fixed categories with a positive budget', () => {
    const noEnvelope: CategoryDraft = {
      key: nextDraftKey('category'),
      name: 'Food',
      colorKey: 'amber',
      fixed: false,
      envelope: null,
    };
    expect(
      validateEnvelopesStep({ ...initialWizardState(), categories: [noEnvelope] }).valid,
    ).toBe(false);

    const zeroBudget: CategoryDraft = {
      ...noEnvelope,
      envelope: { period: 'weekly', budget: cents(0), carryoverDefault: 'reset' },
    };
    expect(
      validateEnvelopesStep({ ...initialWizardState(), categories: [zeroBudget] }).valid,
    ).toBe(false);
  });

  it('allows fixed categories with envelope: null', () => {
    const fixed: CategoryDraft = {
      key: nextDraftKey('category'),
      name: 'Rent',
      colorKey: 'violet',
      fixed: true,
      envelope: null,
    };
    expect(validateEnvelopesStep({ ...initialWizardState(), categories: [fixed] }).valid).toBe(
      true,
    );
  });
});

describe('validateStep(review) / canGoNext', () => {
  it('aggregates errors from all three prior steps', () => {
    const result = validateStep(initialWizardState(), 'review');
    expect(result.valid).toBe(false);
    // Missing account AND missing category, at minimum.
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('canGoNext reflects the current step only', () => {
    const withAccount: WizardState = { ...initialWizardState(), accounts: [account()] };
    expect(canGoNext(withAccount)).toBe(true); // valid on the accounts step
    const onIncome: WizardState = { ...withAccount, step: 'income' };
    expect(canGoNext(onIncome)).toBe(true); // income step has no items, which is valid
  });
});
