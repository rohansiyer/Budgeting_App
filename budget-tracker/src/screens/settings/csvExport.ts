/**
 * Native-facing side of the CSV export (v0.3 handoff §3.7 F10). Writes the
 * built CSV text to a file in the app's document directory and, when the OS
 * share sheet is available, hands it off; otherwise the caller shows the
 * on-device path (BackupScreen does this via a Snackbar-style inline line).
 * Mirrors src/backup/fileIO.ts's expo-file-system/legacy + expo-sharing
 * pattern (CLAUDE.md: expo-file-system imports go through the /legacy path
 * on SDK 54; jest's moduleNameMapper mirrors both).
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { buildTransactionsCsv } from './csvExport.logic';
import type { CategoryConfig, TransactionRecord } from '../../types/contracts';

export interface CsvExportResult {
  uri: string;
  /** True if the OS share sheet was opened; false means only `uri` exists on disk. */
  shared: boolean;
}

function fileNameFor(now: Date): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `ducks-in-a-row-transactions-${stamp}.csv`;
}

/**
 * Write every transaction in `transactions` to a CSV file (no new heavy
 * deps: expo-file-system + expo-sharing are both already in package.json).
 */
export async function exportTransactionsCsv(
  transactions: readonly TransactionRecord[],
  categories: readonly CategoryConfig[],
  now: Date = new Date(),
): Promise<CsvExportResult> {
  const csv = buildTransactionsCsv(transactions, categories);
  const uri = `${FileSystem.documentDirectory ?? ''}${fileNameFor(now)}`;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export transactions' });
    return { uri, shared: true };
  }
  return { uri, shared: false };
}
