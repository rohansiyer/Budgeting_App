// Mock for expo-document-picker in test environment.
// Tests can set `__mockPickResult` to control what the "picker" returns.

export let __mockPickResult: { canceled: true } | { canceled: false; assets: { uri: string }[] } = {
  canceled: true,
};

export function __setMockPickResult(result: typeof __mockPickResult) {
  __mockPickResult = result;
}

export async function getDocumentAsync(_options?: {
  type?: string | string[];
  copyToCacheDirectory?: boolean;
  multiple?: boolean;
}) {
  return __mockPickResult;
}
