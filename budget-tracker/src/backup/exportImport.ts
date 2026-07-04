/**
 * Top-level export/import entry points. These are the functions
 * screens/orchestrator code should call; everything else in this directory
 * is a building block for these two flows.
 */
import { BackupPort, BackupFile } from './types';
import { buildBackupFile, serializeBackupFile } from './serializer';
import { parseBackupFile } from './validator';
import { writeBackupFile, shareBackupFile, pickBackupFile, readBackupFile } from './fileIO';

export interface ExportResult {
  uri: string;
  file: BackupFile;
}

/**
 * Dump the whole database, write it to a versioned JSON file, and open the
 * OS share sheet so the user can save it wherever they like (Drive, email,
 * local storage, …). Export is always user-initiated — nothing is
 * auto-uploaded anywhere.
 */
export async function exportBackup(port: BackupPort, opts: { share?: boolean } = {}): Promise<ExportResult> {
  const tables = await port.dumpAll();
  const file = buildBackupFile(tables);
  const json = serializeBackupFile(file);
  const uri = await writeBackupFile(json);
  if (opts.share ?? true) {
    await shareBackupFile(uri);
  }
  return { uri, file };
}

export interface ImportOutcome {
  imported: true;
  file: BackupFile;
}

/**
 * Full import flow: prompt for a file, read it, validate version + shape,
 * then restore. Restoration goes through `port.restoreAll`, which MUST be
 * atomic — see `BackupPort.restoreAll`'s contract. Returns null if the user
 * cancelled the file picker. Throws `BackupValidationError` for a malformed
 * file (caller should show its `.issues` to the user) — nothing is written
 * to the store in that case.
 */
export async function importBackupFromPicker(port: BackupPort): Promise<ImportOutcome | null> {
  const uri = await pickBackupFile();
  if (!uri) return null;
  return importBackupFromUri(port, uri);
}

/** Same as `importBackupFromPicker` but for a known file uri (e.g. deep link, test). */
export async function importBackupFromUri(port: BackupPort, uri: string): Promise<ImportOutcome> {
  const json = await readBackupFile(uri);
  return importBackupFromJson(port, json);
}

/** Validate + restore a raw JSON string. The pure core of import, easy to unit test. */
export async function importBackupFromJson(port: BackupPort, json: string): Promise<ImportOutcome> {
  const file = parseBackupFile(json); // throws BackupValidationError on any problem
  await port.restoreAll(file.tables); // all-or-nothing, per BackupPort contract
  return { imported: true, file };
}
