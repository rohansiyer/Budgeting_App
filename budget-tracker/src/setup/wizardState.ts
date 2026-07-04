/**
 * First-run / "new chapter" wizard state machine (pure — no React, no
 * store I/O). `SetupWizard.tsx` drives a `useReducer(wizardReducer, ...)`
 * with this; `saveSetup` (see `save.ts`) is the only place drafts touch a
 * `SetupWriter`.
 */
import type { Cents } from '../lib/money';
import type { CategoryColorKey, EnvelopeConfig, IncomeSchedule, IncomeSplitConfig } from '../types/contracts';
import type { AccountConfig } from '../types/contracts';

export type WizardStep = 'accounts' | 'income' | 'envelopes' | 'review';

export const WIZARD_STEPS: readonly WizardStep[] = ['accounts', 'income', 'envelopes', 'review'];

export interface AccountDraft {
  /** Wizard-local key for list rendering/editing; not a store id. */
  key: string;
  name: string;
  institution: string | null;
  kind: AccountConfig['kind'];
  startingBalance: Cents;
}

export interface IncomeSourceDraft {
  key: string;
  name: string;
  amount: Cents;
  schedule: IncomeSchedule;
  splits: IncomeSplitConfig[];
}

export interface CategoryDraft {
  key: string;
  name: string;
  colorKey: CategoryColorKey;
  fixed: boolean;
  envelope: EnvelopeConfig | null;
}

export interface WizardState {
  step: WizardStep;
  chapterName: string;
  accounts: AccountDraft[];
  incomeSources: IncomeSourceDraft[];
  categories: CategoryDraft[];
}

export function initialWizardState(chapterName = 'Chapter 1'): WizardState {
  return {
    step: 'accounts',
    chapterName,
    accounts: [],
    incomeSources: [],
    categories: [],
  };
}

let keySeq = 0;
/** Wizard-local key generator — never used as a store id. */
export function nextDraftKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}_${keySeq}`;
}

export type WizardAction =
  | { type: 'SET_CHAPTER_NAME'; name: string }
  | { type: 'GO_TO_STEP'; step: WizardStep }
  | { type: 'GO_NEXT' }
  | { type: 'GO_BACK' }
  | { type: 'ADD_ACCOUNT'; draft: AccountDraft }
  | { type: 'UPDATE_ACCOUNT'; key: string; patch: Partial<Omit<AccountDraft, 'key'>> }
  | { type: 'REMOVE_ACCOUNT'; key: string }
  | { type: 'ADD_INCOME_SOURCE'; draft: IncomeSourceDraft }
  | { type: 'UPDATE_INCOME_SOURCE'; key: string; patch: Partial<Omit<IncomeSourceDraft, 'key'>> }
  | { type: 'REMOVE_INCOME_SOURCE'; key: string }
  | { type: 'SET_INCOME_SPLITS'; key: string; splits: IncomeSplitConfig[] }
  | { type: 'ADD_CATEGORY'; draft: CategoryDraft }
  | { type: 'UPDATE_CATEGORY'; key: string; patch: Partial<Omit<CategoryDraft, 'key'>> }
  | { type: 'REMOVE_CATEGORY'; key: string };

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_CHAPTER_NAME':
      return { ...state, chapterName: action.name };

    case 'GO_TO_STEP':
      return { ...state, step: action.step };

    case 'GO_NEXT': {
      const idx = WIZARD_STEPS.indexOf(state.step);
      const next = WIZARD_STEPS[Math.min(idx + 1, WIZARD_STEPS.length - 1)];
      return { ...state, step: next };
    }

    case 'GO_BACK': {
      const idx = WIZARD_STEPS.indexOf(state.step);
      const prev = WIZARD_STEPS[Math.max(idx - 1, 0)];
      return { ...state, step: prev };
    }

    case 'ADD_ACCOUNT':
      return { ...state, accounts: [...state.accounts, action.draft] };

    case 'UPDATE_ACCOUNT':
      return {
        ...state,
        accounts: state.accounts.map((a) => (a.key === action.key ? { ...a, ...action.patch } : a)),
      };

    case 'REMOVE_ACCOUNT': {
      const removedNoLongerValid = new Set([action.key]);
      return {
        ...state,
        accounts: state.accounts.filter((a) => a.key !== action.key),
        // Any income split pointing at the removed (draft-local) account
        // key is dropped too — an orphaned split would silently misroute
        // money, so we scrub it rather than leave dangling references.
        incomeSources: state.incomeSources.map((s) => ({
          ...s,
          splits: s.splits.filter((sp) => !removedNoLongerValid.has(sp.accountId)),
        })),
      };
    }

    case 'ADD_INCOME_SOURCE':
      return { ...state, incomeSources: [...state.incomeSources, action.draft] };

    case 'UPDATE_INCOME_SOURCE':
      return {
        ...state,
        incomeSources: state.incomeSources.map((s) =>
          s.key === action.key ? { ...s, ...action.patch } : s,
        ),
      };

    case 'REMOVE_INCOME_SOURCE':
      return { ...state, incomeSources: state.incomeSources.filter((s) => s.key !== action.key) };

    case 'SET_INCOME_SPLITS':
      return {
        ...state,
        incomeSources: state.incomeSources.map((s) =>
          s.key === action.key ? { ...s, splits: action.splits } : s,
        ),
      };

    case 'ADD_CATEGORY':
      return { ...state, categories: [...state.categories, action.draft] };

    case 'UPDATE_CATEGORY':
      return {
        ...state,
        categories: state.categories.map((c) =>
          c.key === action.key ? { ...c, ...action.patch } : c,
        ),
      };

    case 'REMOVE_CATEGORY':
      return { ...state, categories: state.categories.filter((c) => c.key !== action.key) };

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Validation — gates the "Next"/"Save" affordances per step.
// ---------------------------------------------------------------------------

export interface StepValidation {
  valid: boolean;
  errors: string[];
}

function namesAreUnique(names: string[]): boolean {
  const trimmed = names.map((n) => n.trim().toLowerCase());
  return new Set(trimmed).size === trimmed.length;
}

export function validateAccountsStep(state: WizardState): StepValidation {
  const errors: string[] = [];
  if (state.accounts.length === 0) errors.push('Add at least one account.');
  if (state.accounts.some((a) => a.name.trim().length === 0)) {
    errors.push('Every account needs a name.');
  }
  if (!namesAreUnique(state.accounts.map((a) => a.name))) {
    errors.push('Account names must be unique.');
  }
  return { valid: errors.length === 0, errors };
}

export function validateIncomeStep(state: WizardState): StepValidation {
  const errors: string[] = [];
  // Income sources are optional (e.g. a chapter funded entirely by
  // existing balances/transfers), but any that exist must be well formed.
  for (const source of state.incomeSources) {
    if (source.name.trim().length === 0) errors.push('Every income source needs a name.');
    if (source.amount <= 0) errors.push(`"${source.name || 'Income source'}" needs a positive amount.`);
    if (source.splits.length === 0) {
      errors.push(`"${source.name || 'Income source'}" needs at least one split account.`);
    }
    if (source.splits.some((s) => s.ratio < 0)) {
      errors.push(`"${source.name || 'Income source'}" has a negative split ratio.`);
    }
    if (source.splits.every((s) => s.ratio === 0)) {
      errors.push(`"${source.name || 'Income source'}" splits must sum to more than zero.`);
    }
    const accountIds = new Set(state.accounts.map((a) => a.key));
    if (source.splits.some((s) => !accountIds.has(s.accountId))) {
      errors.push(`"${source.name || 'Income source'}" splits reference a removed account.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateEnvelopesStep(state: WizardState): StepValidation {
  const errors: string[] = [];
  if (state.categories.length === 0) errors.push('Add at least one category.');
  if (state.categories.some((c) => c.name.trim().length === 0)) {
    errors.push('Every category needs a name.');
  }
  if (!namesAreUnique(state.categories.map((c) => c.name))) {
    errors.push('Category names must be unique.');
  }
  for (const c of state.categories) {
    if (!c.fixed && c.envelope === null) {
      errors.push(`"${c.name || 'Category'}" is variable-spend and needs an envelope budget.`);
    }
    if (c.envelope && c.envelope.budget <= 0) {
      errors.push(`"${c.name || 'Category'}" needs a positive envelope budget.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateStep(state: WizardState, step: WizardStep): StepValidation {
  switch (step) {
    case 'accounts':
      return validateAccountsStep(state);
    case 'income':
      return validateIncomeStep(state);
    case 'envelopes':
      return validateEnvelopesStep(state);
    case 'review': {
      const results = [
        validateAccountsStep(state),
        validateIncomeStep(state),
        validateEnvelopesStep(state),
      ];
      return {
        valid: results.every((r) => r.valid),
        errors: results.flatMap((r) => r.errors),
      };
    }
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}

export function canGoNext(state: WizardState): boolean {
  return validateStep(state, state.step).valid;
}
