/**
 * Pure logic behind the CSV import review flow (v0.3 handoff §3.8, mockups
 * "CSV import · review screen" / "Import · chase_jan-jun.csv"). Split out of
 * the .tsx screens so it is unit-testable without rendering JSX (this repo's
 * Jest setup cannot transform .tsx — CLAUDE.md).
 *
 * Terminology note: src/import's `ImportSession.matched` rows already carry a
 * learned/keyword suggestion and are "safe to auto-import" (shown here only
 * as a collapsed summary line); `needsReview` rows carry NO suggestion from
 * the matching engine at all. This screen still gives every needsReview row a
 * starting category pick (the chapter's first configured category) so the
 * mockup's "Food?" chip pattern always has something to show and "Change"
 * always has something to change FROM. Duplicates get a best-effort category
 * guess the same way (via matchRow) purely so an opted-in duplicate has a
 * valid categoryId to commit with; that guess is a convenience, never a
 * confirmed user choice, so it is never taught as a merchant correction (see
 * `assembleCommitPayload`).
 */
import {
  matchRow,
  normalizeMerchant,
  type CommitResult,
  type DuplicateRow,
  type ImportDecision,
  type ImportSession,
  type MatchContext,
  type MatchResult,
  type SessionCounts,
} from '../../../import';
import type { Cents } from '../../../lib/money';
import type { ISODate, TransactionRecord } from '../../../types/contracts';

function plural(n: number, singular: string, pluralWord: string): string {
  return n === 1 ? singular : pluralWord;
}

// ---------------------------------------------------------------------------
// Header + summary copy.
// ---------------------------------------------------------------------------

export interface ReviewHeaderCopy {
  /** "Import · chase_jan-jun.csv" */
  fileLabel: string;
  /** "We sorted 142 of 151." */
  title: string;
  /** "Check these 9, we'll remember every correction." */
  subtitle: string;
}

/** Header copy per the mockup; exact counts from the session, singular/plural handled. */
export function reviewHeaderCopy(fileName: string, counts: SessionCounts): ReviewHeaderCopy {
  const title = `We sorted ${counts.sorted} of ${counts.total}.`;
  let subtitle: string;
  if (counts.needsReview === 0) {
    subtitle = "Nothing left to check, we'll remember every correction.";
  } else if (counts.needsReview === 1) {
    subtitle = "Check this 1, we'll remember every correction.";
  } else {
    subtitle = `Check these ${counts.needsReview}, we'll remember every correction.`;
  }
  return { fileLabel: `Import · ${fileName}`, title, subtitle };
}

/** "142 matched automatically." for the collapsed matched-section summary line. */
export function matchedSummaryLine(count: number): string {
  return `${count} ${plural(count, 'transaction', 'transactions')} matched automatically.`;
}

// ---------------------------------------------------------------------------
// Review state: built once from the classified session, then mutated only
// through the transition functions below (each returns a NEW state).
// ---------------------------------------------------------------------------

export interface ReviewRowState {
  result: MatchResult;
  /** Currently chosen category. Null only when the chapter has no
   * categories configured at all (defensive; setup should prevent this). */
  categoryId: string | null;
  /** Excludes this row from the import entirely. */
  skipped: boolean;
}

export interface DuplicateRowState {
  dupe: DuplicateRow;
  /** Best-effort guess (via matchRow), used only if opted back in; never
   * taught as a correction (see assembleCommitPayload). */
  suggestedCategoryId: string | null;
  included: boolean;
}

export interface ImportReviewState {
  fileName: string;
  matched: readonly MatchResult[];
  review: readonly ReviewRowState[];
  duplicates: readonly DuplicateRowState[];
}

/** Build the initial review state from a classified session. */
export function buildReviewState(
  fileName: string,
  session: ImportSession,
  ctx: MatchContext,
): ImportReviewState {
  const fallbackCategoryId = ctx.categories[0]?.id ?? null;
  return {
    fileName,
    matched: session.matched,
    review: session.needsReview.map((result) => ({
      result,
      categoryId: fallbackCategoryId,
      skipped: false,
    })),
    duplicates: session.duplicates.map((dupe) => ({
      dupe,
      suggestedCategoryId: matchRow(dupe.row, ctx).suggestedCategoryId,
      included: false,
    })),
  };
}

function patchReview(
  state: ImportReviewState,
  index: number,
  patch: Partial<ReviewRowState>,
): ImportReviewState {
  return {
    ...state,
    review: state.review.map((row, i) => (i === index ? { ...row, ...patch } : row)),
  };
}

/** "accept suggestion": keep the row's current category pick, un-skip it if it was skipped. */
export function acceptReviewSuggestion(state: ImportReviewState, index: number): ImportReviewState {
  return patchReview(state, index, { skipped: false });
}

/** "Change": the category picker sets an explicit category for a review row. */
export function changeReviewCategory(
  state: ImportReviewState,
  index: number,
  categoryId: string,
): ImportReviewState {
  return patchReview(state, index, { categoryId, skipped: false });
}

/** Excludes a review row from the import entirely (reversible via acceptReviewSuggestion). */
export function skipReviewRow(state: ImportReviewState, index: number): ImportReviewState {
  return patchReview(state, index, { skipped: true });
}

/** "include duplicate": toggle (or explicitly set) whether a duplicate row imports. */
export function setDuplicateIncluded(
  state: ImportReviewState,
  index: number,
  included: boolean,
): ImportReviewState {
  return {
    ...state,
    duplicates: state.duplicates.map((d, i) => (i === index ? { ...d, included } : d)),
  };
}

// ---------------------------------------------------------------------------
// Commit assembly.
// ---------------------------------------------------------------------------

/** How many rows would actually be written if the user confirmed right now. */
export function importableCount(state: ImportReviewState): number {
  const review = state.review.filter((r) => !r.skipped && r.categoryId != null).length;
  const duplicates = state.duplicates.filter(
    (d) => d.included && d.suggestedCategoryId != null,
  ).length;
  return state.matched.length + review + duplicates;
}

/** "Import N transactions" — always names the count, never silent (§4 copy rules). */
export function confirmImportLabel(state: ImportReviewState): string {
  const n = importableCount(state);
  return `Import ${n} ${plural(n, 'transaction', 'transactions')}`;
}

/**
 * Assemble the exact ImportDecision[] `commitImportSession` needs.
 *  - Matched rows import as-is with `overridden: false` (the engine's own
 *    learned/keyword suggestion, never touched by the user here).
 *  - Non-skipped review rows import with `overridden: true` ALWAYS: by
 *    construction a needsReview row carried no engine suggestion, so
 *    whatever category lands here was supplied by the user (session.ts's
 *    `ImportDecision.overridden` doc) and should be learned as a correction.
 *  - Included duplicates import with their best-effort guess and
 *    `overridden: false`, since that guess was never confirmed by the user
 *    and must never be taught as a correction.
 */
export function assembleCommitPayload(state: ImportReviewState, accountId: string): ImportDecision[] {
  const decisions: ImportDecision[] = [];

  for (const result of state.matched) {
    if (result.suggestedCategoryId == null) continue; // defensive; matched always has one
    decisions.push({
      row: result.row,
      normalizedMerchant: result.normalizedMerchant,
      categoryId: result.suggestedCategoryId,
      accountId,
      overridden: false,
    });
  }

  for (const row of state.review) {
    if (row.skipped || row.categoryId == null) continue;
    decisions.push({
      row: row.result.row,
      normalizedMerchant: row.result.normalizedMerchant,
      categoryId: row.categoryId,
      accountId,
      overridden: true,
    });
  }

  for (const d of state.duplicates) {
    if (!d.included || d.suggestedCategoryId == null) continue;
    decisions.push({
      row: d.dupe.row,
      normalizedMerchant: d.dupe.normalizedMerchant,
      categoryId: d.suggestedCategoryId,
      accountId,
      overridden: false,
    });
  }

  return decisions;
}

/** Result copy after a commit; never silent about what actually happened. */
export function commitResultCopy(result: CommitResult): string {
  const importedPart = `Imported ${result.imported} ${plural(result.imported, 'transaction', 'transactions')}.`;
  if (result.corrections === 0) return importedPart;
  return `${importedPart} ${result.corrections} ${plural(result.corrections, 'correction', 'corrections')} learned.`;
}

// ---------------------------------------------------------------------------
// TransactionRecord -> ExistingTxn bridge (the store read side of dedupe).
// ---------------------------------------------------------------------------

export interface ExistingTxnLike {
  id: string;
  date: ISODate;
  amountCents: Cents;
  normalizedMerchant: string;
}

/**
 * TransactionRecord -> import engine's dedupe shape. Only expense rows can
 * duplicate a CSV row (income/transfers never do, and a CSV row's
 * spend-positive amount only ever compares against an expense's positive
 * amount).
 */
export function toExistingTxns(transactions: readonly TransactionRecord[]): ExistingTxnLike[] {
  return transactions
    .filter((t) => t.kind === 'expense')
    .map((t) => ({
      id: t.id,
      date: t.date,
      amountCents: t.amount,
      normalizedMerchant: normalizeMerchant(t.note ?? ''),
    }));
}
