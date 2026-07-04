// Mock for expo-crypto in test environment. Uses Node's real `crypto` module
// so digest behavior (determinism, hex encoding) matches production closely
// enough to exercise PIN-hashing logic meaningfully in tests.
import { createHash, randomBytes } from 'crypto';

export enum CryptoDigestAlgorithm {
  SHA256 = 'SHA-256',
  SHA512 = 'SHA-512',
}

export enum CryptoEncoding {
  HEX = 'hex',
  BASE64 = 'base64',
}

const algoToNode: Record<string, string> = {
  'SHA-256': 'sha256',
  'SHA-512': 'sha512',
};

export async function digestStringAsync(
  algorithm: CryptoDigestAlgorithm,
  data: string,
  options: { encoding?: CryptoEncoding } = {},
): Promise<string> {
  const nodeAlgo = algoToNode[algorithm] ?? 'sha256';
  const encoding = options.encoding === CryptoEncoding.BASE64 ? 'base64' : 'hex';
  return createHash(nodeAlgo).update(data, 'utf8').digest(encoding as 'hex' | 'base64');
}

export async function getRandomBytesAsync(byteCount: number): Promise<Uint8Array> {
  return new Uint8Array(randomBytes(byteCount));
}

export function getRandomBytes(byteCount: number): Uint8Array {
  return new Uint8Array(randomBytes(byteCount));
}
