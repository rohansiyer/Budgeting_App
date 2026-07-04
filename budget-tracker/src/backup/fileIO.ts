/**
 * Native-facing side of backup/restore: writing the export file
 * (expo-file-system), handing it to the OS share sheet (expo-sharing), and
 * picking a file back in for import (expo-document-picker).
 *
 * Kept separate from `exportImport.ts`'s orchestration logic so the pure
 * serialize/validate/restore pipeline can be unit-tested without touching
 * native modules at all.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { backupFileName } from './serializer';

/** Write `contents` to a fresh file in the app's document directory. Returns the file uri. */
export async function writeBackupFile(contents: string, now: Date = new Date()): Promise<string> {
  const uri = `${FileSystem.documentDirectory}${backupFileName(now)}`;
  await FileSystem.writeAsStringAsync(uri, contents, { encoding: FileSystem.EncodingType.UTF8 });
  return uri;
}

/** Hand the exported file to the OS share sheet (Save to Drive, email, etc). */
export async function shareBackupFile(uri: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    // Sharing not available on this platform/device — the file still exists
    // on disk at `uri` for the caller to surface another way.
    return;
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export Ducks in a Row backup',
  });
}

/**
 * Prompt the user to pick a backup JSON file. Returns the picked file's uri,
 * or null if the user cancelled.
 */
export async function pickBackupFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  return asset ? asset.uri : null;
}

/** Read a file's full text contents (used for the picked-import path). */
export async function readBackupFile(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}
