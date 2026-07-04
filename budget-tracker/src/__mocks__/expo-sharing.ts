// Mock for expo-sharing in test environment.

export async function isAvailableAsync(): Promise<boolean> {
  return false; // tests never expect the real OS share sheet to open
}

export async function shareAsync(
  _uri: string,
  _options?: { mimeType?: string; dialogTitle?: string },
): Promise<void> {
  // no-op
}
