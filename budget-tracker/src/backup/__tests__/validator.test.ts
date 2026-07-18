import { parseBackupFile, validateBackupFile } from '../validator';
import { BackupValidationError } from '../types';

describe('parseBackupFile — corrupt/unparseable input (F5-3)', () => {
  it('never surfaces the raw JS engine JSON.parse message', () => {
    try {
      parseBackupFile('not json{{{');
      fail('expected rejection');
    } catch (e) {
      expect(e).toBeInstanceOf(BackupValidationError);
      const err = e as BackupValidationError;
      // A raw V8/Hermes parse error looks like "Unexpected token o in JSON at
      // position 1" — none of that engine-specific text should ever appear.
      expect(err.message).not.toMatch(/unexpected token/i);
      expect(err.issues.join(' ')).not.toMatch(/unexpected token/i);
      expect(err.issues.join(' ')).not.toMatch(/position \d/i);
      expect(err.message).toBe('Backup file is not valid JSON.');
    }
  });

  it('a truncated/empty file also gets the human message, not a raw parser string', () => {
    try {
      parseBackupFile('');
      fail('expected rejection');
    } catch (e) {
      expect(e).toBeInstanceOf(BackupValidationError);
      expect((e as BackupValidationError).message).toBe('Backup file is not valid JSON.');
    }
  });
});

describe('validateBackupFile — shape/version issues stay human-readable', () => {
  it('rejects a non-object root with a plain-English issue', () => {
    expect(() => validateBackupFile([1, 2, 3])).toThrow(BackupValidationError);
  });

  it('an unsupported schema version keeps its specific, human-readable message', () => {
    try {
      validateBackupFile({ schemaVersion: 999, exportedAt: new Date().toISOString(), tables: {} });
      fail('expected rejection');
    } catch (e) {
      const err = e as BackupValidationError;
      expect(err.issues.some((i) => i.includes('schemaVersion 999'))).toBe(true);
    }
  });
});
