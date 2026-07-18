/**
 * First-run / "new chapter" wizard state machine (pure — no React, no
 * store I/O). `SetupWizard.tsx` drives a `useReducer(wizardReducer, ...)`
 * with this; `saveSetup` (see `save.ts`) is the only place drafts touch a
 * `SetupWriter`.
 */
import type { Cents } from '../lib/money';
import { toEpochDay } from '../lib/schedule';
import type { CadenceType, CategoryColorKey, EnvelopeConfig, IncomeSchedule, IncomeSplitConfig } from '../types/contracts';
import type { AccountConfig } from '../types/contracts';

export type WizardStep = 'accounts' | 'income' | 'envelopes' | 'review';

export const WIZARD_STEPS: readonly WizardStep[] = ['accounts', 'income', 'envelopes', 'review'];

export interface AccountDraft {
  /** Wizard-local key for list rendering/editing; not a store id. */
  key: string;
  /** Set when editing an existing account — save updates instead of inserting. */
  existingId?: string;
  name: string;
  institution: string | null;
  kind: AccountConfig['kind'];
  startingBalance: Cents;
}

export interface IncomeSourceDraft {
  key: string;
  existingId?: string;
  name: string;
  amount: Cents;
  schedule: IncomeSchedule;
  splits: IncomeSplitConfig[];
}

export interface CategoryDraft {
  key: string;
  existingId?: string;
  name: string;
  colorKey: CategoryColorKey;
  fixed: boolean;
  /** Optional; omitted at save defaults to 'weekly' (create) or preserves the stored value (edit). */
  cadence?: CadenceType;
  envelope: EnvelopeConfig | null;
}

export interface WizardState {
  step: WizardStep;
  chapterName: string;
  accounts: AccountDraft[];
  incomeSources: IncomeSourceDraft[];
  categories: CategoryDraft[];
  /**
   * F1-5: names of accounts whose in-session removal dropped a split from an
   * income source, keyed by that source's draft key. Surfaced as an inline
   * warning on the Income step until the source is touched (its splits/amount
   * edited) or the notice is dismissed. Optional so legacy state literals
   * (tests, prefill) stay valid; the reducer treats it as `{}` when absent.
   */
  splitDropNotices?: Record<string, string[]>;
}

export function initialWizardState(chapterName = 'Chapter 1'): WizardState {
  return {
    step: 'accounts',
    chapterName,
    accounts: [],
    incomeSources: [],
    categories: [],
    splitDropNotices: {},
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
  | { type: 'REMOVE_CATEGORY'; key: string }
  /** F1-5: dismiss the split-drop warning shown on an income source. */
  | { type: 'ACK_SPLIT_DROP'; key: string };

/** Drop one source's split-drop notice, returning a fresh map (F1-5). */
function withoutNotice(
  notices: Record<string, string[]> | undefined,
  key: string,
): Record<string, string[]> {
  if (!notices || !(key in notices)) return notices ?? {};
  const next = { ...notices };
  delete next[key];
  return next;
}

/**
 * F1-5: the inline warning shown on an income source whose splits shrank
 * because an account was removed this session. Returns null when there is
 * nothing to warn about.
 */
export function splitDropWarningText(removedNames: string[] | undefined): string | null {
  if (!removedNames || removedNames.length === 0) return null;
  const unique = Array.from(new Set(removedNames));
  const list =
    unique.length === 1
      ? unique[0]
      : `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`;
  return `This source no longer splits to ${list} — check its split.`;
}

/**
 * F1-6: case-insensitive, trimmed uniqueness check used at Add / Save-changes
 * time (before the coarser Continue-time validator). `existingNames` should be
 * every OTHER row's name (exclude the row being edited). Returns an inline
 * error string, or null when the name is free.
 */
export function duplicateNameError(
  candidate: string,
  existingNames: string[],
  noun: 'account' | 'category' = 'account',
): string | null {
  const norm = candidate.trim().toLowerCase();
  if (norm.length === 0) return null; // empty-name is a separate check
  const clash = existingNames.some((n) => n.trim().toLowerCase() === norm);
  return clash ? `That ${noun} name is already taken.` : null;
}

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
      const removedName = state.accounts.find((a) => a.key === action.key)?.name ?? 'an account';
      // F1-5: record which sources just lost a split so the Income step can
      // warn about silently-rerouted money until the user acts on it.
      const notices: Record<string, string[]> = { ...(state.splitDropNotices ?? {}) };
      for (const s of state.incomeSources) {
        if (s.splits.some((sp) => removedNoLongerValid.has(sp.accountId))) {
          notices[s.key] = [...(notices[s.key] ?? []), removedName];
        }
      }
      return {
        ...state,
        splitDropNotices: notices,
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
        // Touching the source (e.g. re-doing its splits) resolves any
        // pending split-drop warning for it (F1-5).
        splitDropNotices: withoutNotice(state.splitDropNotices, action.key),
        incomeSources: state.incomeSources.map((s) =>
          s.key === action.key ? { ...s, ...action.patch } : s,
        ),
      };

    case 'REMOVE_INCOME_SOURCE':
      return {
        ...state,
        splitDropNotices: withoutNotice(state.splitDropNotices, action.key),
        incomeSources: state.incomeSources.filter((s) => s.key !== action.key),
      };

    case 'SET_INCOME_SPLITS':
      return {
        ...state,
        splitDropNotices: withoutNotice(state.splitDropNotices, action.key),
        incomeSources: state.incomeSources.map((s) =>
          s.key === action.key ? { ...s, splits: action.splits } : s,
        ),
      };

    case 'ACK_SPLIT_DROP':
      return { ...state, splitDropNotices: withoutNotice(state.splitDropNotices, action.key) };

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
    // Mirror money.allocate's guard: the wizard gate, not the allocator,
    // must be what rejects a ratio allocate() cannot use (NaN, Infinity).
    if (source.splits.some((s) => !Number.isFinite(s.ratio))) {
      errors.push(`"${source.name || 'Income source'}" has a non-finite split ratio.`);
    }
    if (source.splits.every((s) => s.ratio === 0)) {
      errors.push(`"${source.name || 'Income source'}" splits must sum to more than zero.`);
    }
    const accountIds = new Set(state.accounts.map((a) => a.key));
    if (source.splits.some((s) => !accountIds.has(s.accountId))) {
      errors.push(`"${source.name || 'Income source'}" splits reference a removed account.`);
    }
    // Schedule must be projectable by paydaysBetween once persisted.
    if (source.schedule.kind === 'semimonthly') {
      const days = source.schedule.semimonthlyDays;
      if (
        !days ||
        days.length !== 2 ||
        days.some((d) => !Number.isInteger(d) || d < 1 || d > 31)
      ) {
        errors.push(
          `"${source.name || 'Income source'}" needs two semimonthly days of month between 1 and 31.`,
        );
      }
    } else {
      // Anchor-based kinds: the anchor must be a real calendar date
      // (toEpochDay rejects impossible dates like 2024-02-31).
      try {
        toEpochDay(source.schedule.anchorDate);
      } catch {
        errors.push(
          `"${source.name || 'Income source'}" needs a real calendar anchor date (YYYY-MM-DD).`,
        );
      }
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

/**
 * v0.2 edit mode: seed the wizard from existing config so "Edit setup"
 * edits in place instead of blank-slate re-entry (which duplicated
 * configs — verifier finding #1). Income splits are stored against real
 * account ids; drafts reference wizard-local keys, so map them through.
 */
export function prefilledWizardState(
  chapterName: string,
  config: {
    accounts: import('../types/contracts').AccountConfig[];
    incomeSources: import('../types/contracts').IncomeSourceConfig[];
    categories: import('../types/contracts').CategoryConfig[];
  },
): WizardState {
  const accountIdToKey = new Map<string, string>();
  const accounts: AccountDraft[] = config.accounts.map((a) => {
    const key = nextDraftKey('acct');
    accountIdToKey.set(a.id, key);
    return {
      key,
      existingId: a.id,
      name: a.name,
      institution: a.institution,
      kind: a.kind,
      startingBalance: a.startingBalance,
    };
  });
  const incomeSources: IncomeSourceDraft[] = config.incomeSources.map((src) => ({
    key: nextDraftKey('inc'),
    existingId: src.id,
    name: src.name,
    amount: src.amount,
    schedule: src.schedule,
    splits: src.splits.map((sp) => ({
      accountId: accountIdToKey.get(sp.accountId) ?? sp.accountId,
      ratio: sp.ratio,
    })),
  }));
  const categories: CategoryDraft[] = config.categories.map((c) => ({
    key: nextDraftKey('cat'),
    existingId: c.id,
    name: c.name,
    colorKey: c.colorKey,
    fixed: c.fixed,
    cadence: c.cadence,
    envelope: c.envelope,
  }));
  return { step: 'accounts', chapterName, accounts, incomeSources, categories, splitDropNotices: {} };
}
