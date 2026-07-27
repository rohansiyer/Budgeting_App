/**
 * Native-facing side of CSV import: picking a file (expo-document-picker) and
 * reading its text contents (expo-file-system/legacy). Mirrors the shape of
 * src/backup/fileIO.ts, but kept local to this module since backup/ is a
 * different agent's ownership this wave (CLAUDE.md: "Change contracts
 * deliberately"; same spirit applies to file boundaries mid-release).
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';

export interface PickedCsvFile {
  uri: string;
  name: string;
}

/** Prompt the user to pick a CSV (or plain text) file. Null if cancelled. */
export async function pickCsvFile(): Promise<PickedCsvFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return null;
  return { uri: asset.uri, name: asset.name ?? 'statement.csv' };
}

/** Read a picked file's full text contents. Nothing here uploads anything. */
export async function readCsvFile(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}
