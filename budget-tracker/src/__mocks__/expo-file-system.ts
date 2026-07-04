// Mock for expo-file-system in test environment.
// Backs `writeAsStringAsync`/`readAsStringAsync` with an in-memory map keyed
// by uri, so backup export/import round-trip tests can run without touching
// the real filesystem.

export enum EncodingType {
  UTF8 = 'utf8',
  Base64 = 'base64',
}

export const documentDirectory = 'file:///mock-documents/';
export const cacheDirectory = 'file:///mock-cache/';

const files = new Map<string, string>();

export const __mockFiles = files; // test-only escape hatch

export async function writeAsStringAsync(
  uri: string,
  contents: string,
  _options?: { encoding?: EncodingType },
): Promise<void> {
  files.set(uri, contents);
}

export async function readAsStringAsync(
  uri: string,
  _options?: { encoding?: EncodingType },
): Promise<string> {
  const contents = files.get(uri);
  if (contents === undefined) {
    throw new Error(`Mock expo-file-system: no file at ${uri}`);
  }
  return contents;
}

export async function getInfoAsync(uri: string) {
  return { exists: files.has(uri), uri, isDirectory: false };
}

export async function deleteAsync(uri: string): Promise<void> {
  files.delete(uri);
}
