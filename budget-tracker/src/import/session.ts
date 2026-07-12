/**
 * Import session build + commit (Import engine, F11).
 *
 * `buildImportSession` classifies parsed rows into { matched, needsReview,
 * duplicates } WITHOUT writing anything — the review screen consumes this. A row
 * is a duplicate when an existing transaction shares its date, its spend-positive
 * amount, and its normalized merchant; duplicates are NEVER silently imported.
 *
 * `commitImportSession` is the only thing that writes: it runs every insert
 * inside a single withTransaction, adds each decided row via the store's
 * addExpense, and records a merchant correction for every user override (that's
 * how "TRADER JOE'S -> Food" becomes permanent). It returns counts for the
 * "We sorted 142 of 151" copy.
 */
import type { Cents } from '../lib/money';
import type { ISODate } from '../types/contracts';
import type { ImportRow } from './csv';
import { matchRow, normalizeMerchant, type MatchContext, type MatchResult } from './matching';

export interface ExistingTxn {
  id: string;
  date: ISODate;
  /** Spend-positive cents (an expense outflow). */
  amountCents: Cents;
  normalizedMerchant: string;
}

export interface ImportStoreReads extends MatchContext {
  existingTransactions: ExistingTxn[];
}

export interface DuplicateRow {
  row: ImportRow;
  normalizedMerchant: string;
  existingTransactionId: string;
}

export interface ImportSession {
  /** Rows with a suggestion (learned or keyword) that are safe to auto-import. */
  matched: MatchResult[];
  /** Rows with no suggestion — the review screen must resolve these. */
  needsReview: MatchResult[];
  /** Rows that duplicate an existing transaction; excluded from import unless the user opts in. */
  duplicates: DuplicateRow[];
}

/**
 * Classify parsed rows. Inflows (spend-negative, e.g. refunds/income) never
 * carry a keyword category and land in needsReview, so an import can't silently
 * file a paycheck as an expense.
 */
export function buildImportSession(
  parsedRows: ImportRow[],
  reads: ImportStoreReads,
): ImportSession {
  const matched: MatchResult[] = [];
  const needsReview: MatchResult[] = [];
  const duplicates: DuplicateRow[] = [];

  for (const row of parsedRows) {
    const normalizedMerchant = normalizeMerchant(row.description);
    const dupe = reads.existingTransactions.find(
      (t) =>
        t.date === row.date &&
        t.amountCents === row.amountCents &&
        t.normalizedMerchant === normalizedMerchant,
    );
    if (dupe) {
      duplicates.push({ row, normalizedMerchant, existingTransactionId: dupe.id });
      continue;
    }
    const result = matchRow(row, reads);
    if (result.suggestedCategoryId != null) matched.push(result);
    else needsReview.push(result);
  }

  return { matched, needsReview, duplicates };
}

export interface SessionCounts {
  /** Rows with a suggestion (the "sorted" number). */
  sorted: number;
  /** Rows the user must resolve. */
  needsReview: number;
  /** Rows skipped as duplicates. */
  duplicates: number;
  /** sorted + needsReview — the importable universe ("of 151"). */
  total: number;
}

/** Counts for the "We sorted {sorted} of {total}. Check these {needsReview}." copy. */
export function sessionCounts(session: ImportSession): SessionCounts {
  const sorted = session.matched.length;
  const needsReview = session.needsReview.length;
  return {
    sorted,
    needsReview,
    duplicates: session.duplicates.length,
    total: sorted + needsReview,
  };
}

/**
 * A resolved row ready to write. `overridden` marks a row whose category the
 * user changed from the suggestion (or supplied for a needsReview row) — those
 * teach a merchant correction on commit.
 */
export interface ImportDecision {
  row: ImportRow;
  normalizedMerchant: string;
  categoryId: string;
  accountId: string;
  overridden: boolean;
}

/** The store surface commit needs (injected so this stays unit-testable). */
export interface ImportCommitPort {
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
  addExpense(input: {
    accountId: string;
    categoryId: string;
    amount: Cents;
    date: ISODate;
    note?: string;
  }): Promise<string>;
  upsertMerchantCorrection(input: {
    normalizedMerchant: string;
    categoryId: string;
  }): Promise<unknown>;
}

export interface CommitResult {
  imported: number;
  corrections: number;
}

/**
 * Write decided rows. All inserts + corrections run in ONE transaction, so a
 * failure imports nothing. Only spend-positive rows are written as expenses;
 * inflow rows (amount <= 0) are skipped defensively (the review screen should
 * not hand those to addExpense). Corrections are de-duplicated by normalized
 * merchant so N overrides of the same merchant learn it once.
 */
export async function commitImportSession(
  decisions: ImportDecision[],
  port: ImportCommitPort,
): Promise<CommitResult> {
  let imported = 0;
  const correctionsToLearn = new Map<string, string>(); // normalizedMerchant → categoryId

  await port.withTransaction(async () => {
    for (const d of decisions) {
      if (d.row.amountCents <= 0) continue; // not an expense; skip
      await port.addExpense({
        accountId: d.accountId,
        categoryId: d.categoryId,
        amount: d.row.amountCents,
        date: d.row.date,
        note: d.row.description,
      });
      imported++;
      if (d.overridden && d.normalizedMerchant.length > 0) {
        correctionsToLearn.set(d.normalizedMerchant, d.categoryId);
      }
    }
    for (const [normalizedMerchant, categoryId] of correctionsToLearn) {
      await port.upsertMerchantCorrection({ normalizedMerchant, categoryId });
    }
  });

  return { imported, corrections: correctionsToLearn.size };
}
