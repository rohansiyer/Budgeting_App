/**
 * Pure CSV row/line serialization for the Settings "Export CSV" row (v0.3
 * handoff §3.7 F10: "CSV export in Settings"). Split out of csvExport.ts so
 * the row-building math is unit testable without touching native modules
 * (this repo's Jest setup cannot transform JSX and keeps native-facing I/O
 * separate from pure logic — see backup/exportImport.ts for the same split).
 *
 * Columns: date, category, title, amount (a formatCents display string, per
 * spec), note. Money never touches float arithmetic here — the only crossing
 * is formatCents at the display edge (money.ts contract).
 */
import { Cents, cents, formatCents } from '../../lib/money';
import type { CategoryConfig, ISODate, TransactionRecord } from '../../types/contracts';

export interface CsvRow {
  date: ISODate;
  category: string;
  title: string;
  /** Signed formatCents display string, e.g. "-$12.40" or "$640.00". */
  amountText: string;
  note: string;
}

const CSV_HEADER = ['Date', 'Category', 'Title', 'Amount', 'Note'] as const;

/**
 * Signed cents for a transaction row: expenses and outgoing transfers are
 * outflows (negative); income and incoming transfers are inflows (positive).
 */
export function signedAmount(t: Pick<TransactionRecord, 'kind' | 'amount'>): Cents {
  const outflow = t.kind === 'expense' || t.kind === 'transfer_out';
  return cents(outflow ? -t.amount : t.amount);
}

/** Category column: the configured category name, or a kind fallback. */
function categoryName(t: TransactionRecord, catById: Map<string, CategoryConfig>): string {
  if (t.kind === 'income') return 'Income';
  if (t.kind === 'transfer_in' || t.kind === 'transfer_out') return 'Transfer';
  return catById.get(t.categoryId)?.name ?? 'Uncategorized';
}

/** Title column: mirrors DailyDetailScreen's TxnRow title derivation. */
function titleFor(t: TransactionRecord, catById: Map<string, CategoryConfig>): string {
  if (t.kind === 'income') return t.note && t.note.length > 0 ? t.note : 'Income';
  return catById.get(t.categoryId)?.name ?? 'Uncategorized';
}

/** One transaction -> one CSV row. */
export function transactionToCsvRow(
  t: TransactionRecord,
  categories: readonly CategoryConfig[],
): CsvRow {
  const catById = new Map(categories.map((c) => [c.id, c] as const));
  return {
    date: t.date,
    category: categoryName(t, catById),
    title: titleFor(t, catById),
    amountText: formatCents(signedAmount(t), { signDisplay: 'auto' }),
    note: t.note ?? '',
  };
}

/**
 * Escape one CSV field per RFC 4180: quote (and double-up embedded quotes)
 * whenever the field contains a comma, quote, or line break.
 */
export function csvEscape(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function rowToLine(row: CsvRow): string {
  return [row.date, row.category, row.title, row.amountText, row.note].map(csvEscape).join(',');
}

/**
 * Full CSV text: header row + one line per transaction, CRLF line endings
 * (RFC 4180), trailing CRLF. Deterministic in the input's given order — the
 * caller decides the transaction ordering (chronological, in this app).
 */
export function buildTransactionsCsv(
  transactions: readonly TransactionRecord[],
  categories: readonly CategoryConfig[],
): string {
  const lines = [
    CSV_HEADER.join(','),
    ...transactions.map((t) => rowToLine(transactionToCsvRow(t, categories))),
  ];
  return lines.join('\r\n') + '\r\n';
}
