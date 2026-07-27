/**
 * CSV parser + column-mapping + value-parser edge cases (Import engine F11).
 * Pure logic — no DB, no JSX. Money exactness is asserted at the cent.
 */
import {
  tokenizeCsv,
  parseCsvDate,
  parseAmountToCents,
  looksLikeHeader,
  mapColumnsFromHeader,
  parseImportCsv,
} from '../csv';

describe('tokenizeCsv', () => {
  it('splits simple comma rows and LF newlines', () => {
    expect(tokenizeCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('honors CRLF line endings', () => {
    expect(tokenizeCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    expect(tokenizeCsv('"Smith, John",42')).toEqual([['Smith, John', '42']]);
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    expect(tokenizeCsv('"a ""b"" c",1')).toEqual([['a "b" c', '1']]);
  });

  it('handles a quoted field containing a newline', () => {
    expect(tokenizeCsv('"line1\nline2",x')).toEqual([['line1\nline2', 'x']]);
  });

  it('drops fully-blank lines between records', () => {
    expect(tokenizeCsv('a,b\n\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('captures a final row with no trailing newline', () => {
    expect(tokenizeCsv('x,y')).toEqual([['x', 'y']]);
  });
});

describe('parseCsvDate', () => {
  it('accepts ISO dates', () => {
    expect(parseCsvDate('2026-03-09')).toBe('2026-03-09');
  });
  it('converts US M/D/YYYY', () => {
    expect(parseCsvDate('3/9/2026')).toBe('2026-03-09');
    expect(parseCsvDate('12/31/2026')).toBe('2026-12-31');
  });
  it('expands 2-digit years', () => {
    expect(parseCsvDate('01/05/26')).toBe('2026-01-05');
  });
  it('rejects impossible calendar dates', () => {
    expect(parseCsvDate('02/30/2026')).toBeNull();
    expect(parseCsvDate('13/01/2026')).toBeNull();
  });
  it('rejects junk', () => {
    expect(parseCsvDate('not a date')).toBeNull();
    expect(parseCsvDate('')).toBeNull();
  });
});

describe('parseAmountToCents (exactness, float-free)', () => {
  it('parses plain decimals to exact cents', () => {
    expect(parseAmountToCents('12.85')).toBe(1285);
    expect(parseAmountToCents('0.10')).toBe(10);
    expect(parseAmountToCents('100')).toBe(10000);
  });
  it('is exact on values a float would drift on', () => {
    expect(parseAmountToCents('0.29')).toBe(29); // 0.29*100 !== 29 in float
    expect(parseAmountToCents('19.99')).toBe(1999);
  });
  it('strips currency symbols and thousands separators', () => {
    expect(parseAmountToCents('$1,234.56')).toBe(123456);
    expect(parseAmountToCents('  $45.00 ')).toBe(4500);
  });
  it('reads parentheses as negative', () => {
    expect(parseAmountToCents('(18.40)')).toBe(-1840);
    expect(parseAmountToCents('($5.00)')).toBe(-500);
  });
  it('reads a leading minus as negative', () => {
    expect(parseAmountToCents('-32.10')).toBe(-3210);
  });
  it('returns null on unparseable cells', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('1.234')).toBeNull(); // >2 decimals
  });
});

describe('header detection + mapping', () => {
  it('recognizes a header row', () => {
    expect(looksLikeHeader(['Date', 'Description', 'Amount'])).toBe(true);
    expect(looksLikeHeader(['2026-01-01', 'STARBUCKS', '-4.50'])).toBe(false);
  });

  it('maps a single-amount Chase-style header', () => {
    const map = mapColumnsFromHeader(['Transaction Date', 'Description', 'Amount']);
    expect(map.dateIdx).toBe(0);
    expect(map.descIdx).toBe(1);
    expect(map.amountIdx).toBe(2);
    expect(map.debitIdx).toBeNull();
  });

  it('maps a debit/credit split header', () => {
    const map = mapColumnsFromHeader(['Date', 'Payee', 'Debit', 'Credit']);
    expect(map.debitIdx).toBe(2);
    expect(map.creditIdx).toBe(3);
    expect(map.amountIdx).toBeNull(); // split wins
  });
});

describe('parseImportCsv end-to-end', () => {
  it('normalizes a single-amount statement to spend-positive cents', () => {
    const csv = [
      'Date,Description,Amount',
      '2026-01-02,STARBUCKS #123,-4.50', // purchase → spend +450
      '2026-01-05,PAYROLL,2000.00', // credit → spend -200000
    ].join('\n');
    const res = parseImportCsv(csv);
    expect(res.headerDetected).toBe(true);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].amountCents).toBe(450);
    expect(res.rows[1].amountCents).toBe(-200000);
  });

  it('normalizes a debit/credit split statement', () => {
    const csv = [
      'Date,Description,Debit,Credit',
      '01/02/2026,TRADER JOES,32.10,',
      '01/03/2026,REFUND,,5.00',
    ].join('\r\n');
    const res = parseImportCsv(csv);
    expect(res.rows[0].amountCents).toBe(3210); // debit → spend positive
    expect(res.rows[1].amountCents).toBe(-500); // credit → spend negative
  });

  it('collects malformed rows instead of throwing', () => {
    const csv = [
      'Date,Description,Amount',
      '2026-01-02,GOOD,-1.00',
      'bad-date,BROKEN,-2.00',
      '2026-01-04,NOAMOUNT,xyz',
    ].join('\n');
    const res = parseImportCsv(csv);
    expect(res.rows).toHaveLength(1);
    expect(res.malformed).toHaveLength(2);
    expect(res.malformed[0].reason).toMatch(/date/i);
    expect(res.malformed[1].reason).toMatch(/amount/i);
  });

  it('infers columns positionally when there is no header', () => {
    const csv = ['2026-01-02,STARBUCKS,-4.50', '2026-01-03,SHELL,-40.00'].join('\n');
    const res = parseImportCsv(csv);
    expect(res.headerDetected).toBe(false);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].date).toBe('2026-01-02');
    expect(res.rows[0].amountCents).toBe(450);
  });
});
