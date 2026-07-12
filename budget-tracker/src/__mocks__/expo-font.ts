// Mock for expo-font in test environment. useFonts resolves synchronously
// to "loaded" so App.tsx's font gate never blocks a test render.

export function useFonts(_map: Record<string, unknown>): [boolean, Error | null] {
  return [true, null];
}

export async function loadAsync(_map: Record<string, unknown>): Promise<void> {
  // no-op
}

export function isLoaded(_fontFamily: string): boolean {
  return true;
}
