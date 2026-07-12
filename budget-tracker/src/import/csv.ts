/**
 * Dependency-free CSV parser + bank-shape column mapping (Import engine, F11).
 *
 * Everything is on-device and float-free: money is parsed string → integer
 * Cents via money.ts (never parseFloat/Number). Malformed rows are COLLECTED,
 * never thrown, so one bad line can't abort a 12-month statement import.
 *
 * Sign convention (normalized to "spend positive out"):
 *   - debit/credit split columns: a debit (withdrawal) is a positive outflow;
 *     a credit (deposit) is a negative outflow (income/refund).
 *   - single signed "amount" column: banks (Chase, most issuers) render
 *     purchases as NEGATIVE. We negate so a purchase becomes a positive spend.
 *     This assumption is surfaced in `ColumnMap.assumptions`.
 */
import { cents, parseDecimal, type Cents } from '../lib/money';
import type { ISODate } from '../types/contracts';

// ---------------------------------------------------------------------------
// Low-level tokenizer: RFC-4180-ish. Handles quoted fields, escaped quotes
// (""), commas inside quotes, and CRLF or LF line endings.
// ---------------------------------------------------------------------------
export function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let started = false; // did the current row have any content/delimiter?
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      started = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      started = true;
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue; // fold CR of CRLF; a lone CR is treated the same
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
      started = false;
      i++;
      continue;
    }
    field += ch;
    started = true;
    i++;
  }
  // Trailing field/row when the text doesn't end in a newline.
  if (started || field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop rows that are entirely empty (blank lines between records).
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---------------------------------------------------------------------------
// Header detection + column mapping.
// ---------------------------------------------------------------------------
const HEADER_TOKENS = [
  'date',
  'description',
  'payee',
  'memo',
  'name',
  'details',
  'merchant',
  'amount',
  'debit',
  'credit',
  'withdrawal',
  'deposit',
  'transaction',
  'category',
  'balance',
  'type',
];

/** A row is a header when a cell matches a known header token AND no cell parses as a bare amount+date pair. */
export function looksLikeHeader(row: string[]): boolean {
  const cells = row.map((c) => c.trim().toLowerCase());
  const hasHeaderWord = cells.some((c) => HEADER_TOKENS.includes(c));
  if (!hasHeaderWord) return false;
  // Guard: if the row ALSO contains a parseable amount, it's probably data whose
  // text happens to include a header word; require a date-free header row.
  const hasParseableDate = row.some((c) => parseCsvDate(c) !== null);
  return !hasParseableDate;
}

export interface ColumnMap {
  dateIdx: number;
  descIdx: number;
  amountIdx: number | null; // single signed amount column
  debitIdx: number | null; // outflow column
  creditIdx: number | null; // inflow column
  assumptions: string[];
}

function matchHeader(headers: string[], re: RegExp): number {
  return headers.findIndex((h) => re.test(h.trim().toLowerCase()));
}

/** Column map from a detected header row. */
export function mapColumnsFromHeader(headers: string[]): ColumnMap {
  const assumptions: string[] = [];
  const dateIdx = matchHeader(headers, /date/);
  const descIdx = (() => {
    const i = matchHeader(headers, /description|payee|memo|merchant|name|details/);
    return i;
  })();
  const debitIdx = matchHeader(headers, /debit|withdrawal/);
  const creditIdx = matchHeader(headers, /credit|deposit/);
  let amountIdx = matchHeader(headers, /^amount$|amount/);
  // Prefer split columns when both exist; otherwise a single amount column.
  if (debitIdx >= 0 && creditIdx >= 0) {
    assumptions.push('Split debit/credit columns: debit is spend, credit is income.');
    amountIdx = -1;
  } else if (amountIdx >= 0) {
    assumptions.push(
      'Single amount column: negative values are treated as spend (bank convention).',
    );
  }
  return {
    dateIdx,
    descIdx,
    amountIdx: amountIdx >= 0 ? amountIdx : null,
    debitIdx: debitIdx >= 0 ? debitIdx : null,
    creditIdx: creditIdx >= 0 ? creditIdx : null,
    assumptions,
  };
}

/**
 * Positional fallback when no header row is present: probe the first few data
 * rows to find a column that parses as a date and one that parses as an amount;
 * the widest remaining text column is the description.
 */
export function inferColumnsPositional(rows: string[][]): ColumnMap {
  const assumptions: string[] = ['No header row detected: columns inferred by content.'];
  const sample = rows.slice(0, Math.min(rows.length, 10));
  const colCount = Math.max(...sample.map((r) => r.length), 0);
  let dateIdx = -1;
  let amountIdx = -1;
  for (let c = 0; c < colCount; c++) {
    const parsedDates = sample.filter((r) => parseCsvDate(r[c] ?? '') !== null).length;
    if (dateIdx < 0 && parsedDates >= Math.ceil(sample.length / 2)) dateIdx = c;
  }
  for (let c = 0; c < colCount; c++) {
    if (c === dateIdx) continue;
    const parsedAmts = sample.filter((r) => parseAmountToCents(r[c] ?? '') !== null).length;
    if (amountIdx < 0 && parsedAmts >= Math.ceil(sample.length / 2)) amountIdx = c;
  }
  // Description = the column with the most non-numeric text, excluding date/amount.
  let descIdx = -1;
  let bestLen = -1;
  for (let c = 0; c < colCount; c++) {
    if (c === dateIdx || c === amountIdx) continue;
    const textLen = sample.reduce((acc, r) => acc + (r[c] ?? '').trim().length, 0);
    const numericish = sample.every((r) => parseAmountToCents(r[c] ?? '') !== null);
    if (!numericish && textLen > bestLen) {
      bestLen = textLen;
      descIdx = c;
    }
  }
  assumptions.push('Single amount column: negative values are treated as spend (bank convention).');
  return {
    dateIdx,
    descIdx,
    amountIdx: amountIdx >= 0 ? amountIdx : null,
    debitIdx: null,
    creditIdx: null,
    assumptions,
  };
}

// ---------------------------------------------------------------------------
// Value parsers.
// ---------------------------------------------------------------------------
/** Parse a bank date cell to ISODate ('YYYY-MM-DD'), or null. Float-free. */
export function parseCsvDate(raw: string): ISODate | null {
  const s = raw.trim();
  if (s === '') return null;
  // ISO: YYYY-MM-DD (optionally with a time suffix we ignore).
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  // US: M/D/YYYY or M/D/YY (also accepts '-' separators).
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    let year = +m[3];
    if (m[3].length === 2) year += 2000;
    return validDate(year, +m[1], +m[2]);
  }
  return null;
}

function validDate(y: number, mo: number, d: number): ISODate | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const daysInMonth = new Date(y, mo, 0).getDate();
  if (d > daysInMonth) return null;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Parse a money cell to signed Cents, or null. Strips currency symbols,
 * thousands separators, and parentheses-negatives, then delegates the numeric
 * part to money.ts parseDecimal — NEVER parseFloat. Sign here is the raw cell's
 * sign (not yet spend-normalized).
 */
export function parseAmountToCents(raw: string): Cents | null {
  let s = raw.trim();
  if (s === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/[$£€\s]/g, '').replace(/,/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  if (s === '') return null;
  try {
    const magnitude = parseDecimal(s);
    const value = negative ? -magnitude : magnitude;
    return cents(value === 0 ? 0 : value);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// High-level parse: text → normalized import rows + malformed collection.
// ---------------------------------------------------------------------------
export interface ImportRow {
  date: ISODate;
  description: string;
  /** Spend-positive: an outflow is > 0, an inflow (income/refund) is < 0. */
  amountCents: Cents;
  /** Original cells, for provenance/debugging. */
  raw: string[];
}

export interface MalformedRow {
  /** 1-based line number within the parsed rows (data rows, header excluded). */
  line: number;
  raw: string[];
  reason: string;
}

export interface ImportParseResult {
  rows: ImportRow[];
  malformed: MalformedRow[];
  columnMap: ColumnMap;
  headerDetected: boolean;
}

/** Resolve the spend-positive amount for a data row given the column map. */
function resolveAmount(cells: string[], map: ColumnMap): Cents | null {
  if (map.debitIdx != null || map.creditIdx != null) {
    const debit = map.debitIdx != null ? parseAmountToCents(cells[map.debitIdx] ?? '') : null;
    const credit = map.creditIdx != null ? parseAmountToCents(cells[map.creditIdx] ?? '') : null;
    // Debit = outflow (spend positive). Credit = inflow (spend negative).
    if (debit != null && debit !== 0) return cents(Math.abs(debit));
    if (credit != null && credit !== 0) return cents(-Math.abs(credit));
    return null;
  }
  if (map.amountIdx != null) {
    const signed = parseAmountToCents(cells[map.amountIdx] ?? '');
    if (signed == null) return null;
    // Bank convention: negative = outflow. Negate to spend-positive.
    return cents(-signed);
  }
  return null;
}

export function parseImportCsv(text: string): ImportParseResult {
  const allRows = tokenizeCsv(text);
  if (allRows.length === 0) {
    return {
      rows: [],
      malformed: [],
      columnMap: {
        dateIdx: -1,
        descIdx: -1,
        amountIdx: null,
        debitIdx: null,
        creditIdx: null,
        assumptions: ['Empty file.'],
      },
      headerDetected: false,
    };
  }

  const headerDetected = looksLikeHeader(allRows[0]);
  const dataRows = headerDetected ? allRows.slice(1) : allRows;
  const columnMap = headerDetected
    ? mapColumnsFromHeader(allRows[0])
    : inferColumnsPositional(dataRows);

  const rows: ImportRow[] = [];
  const malformed: MalformedRow[] = [];

  dataRows.forEach((cells, idx) => {
    const line = idx + 1;
    if (columnMap.dateIdx < 0 || columnMap.descIdx < 0) {
      malformed.push({ line, raw: cells, reason: 'Could not locate date/description columns.' });
      return;
    }
    const date = parseCsvDate(cells[columnMap.dateIdx] ?? '');
    if (date == null) {
      malformed.push({ line, raw: cells, reason: 'Unparseable or missing date.' });
      return;
    }
    const amountCents = resolveAmount(cells, columnMap);
    if (amountCents == null) {
      malformed.push({ line, raw: cells, reason: 'Unparseable or missing amount.' });
      return;
    }
    const description = (cells[columnMap.descIdx] ?? '').trim();
    if (description === '') {
      malformed.push({ line, raw: cells, reason: 'Empty description.' });
      return;
    }
    rows.push({ date, description, amountCents, raw: cells });
  });

  return { rows, malformed, columnMap, headerDetected };
}
