/**
 * Collision-safe id generation (Team 1 owns this — CONTRACTS §8).
 *
 * A single `generateId()` used everywhere. NEVER `Date.now() + Math.random()`.
 * Backed by a cryptographic RNG (RFC 4122 v4 UUID):
 *   1. Web Crypto `crypto.randomUUID` (Node 22 test env, web).
 *   2. Web Crypto `crypto.getRandomValues` (polyfilled RN).
 *   3. `expo-crypto` `randomUUID` / `getRandomBytes` (device — Hermes has no
 *      global crypto by default).
 * Throws if no secure source exists rather than falling back to a weak RNG.
 */

function uuidFromBytes(bytes: Uint8Array): string {
  // Per RFC 4122 §4.4: set version (4) and variant (10xx) bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}

export function generateId(): string {
  const g = globalThis as unknown as {
    crypto?: {
      randomUUID?: () => string;
      getRandomValues?: <T extends ArrayBufferView>(a: T) => T;
    };
  };

  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    return g.crypto.randomUUID();
  }
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
    return uuidFromBytes(g.crypto.getRandomValues(new Uint8Array(16)));
  }

  // Device path: Expo's native crypto module.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const expoCrypto = require('expo-crypto') as {
      randomUUID?: () => string;
      getRandomBytes?: (n: number) => Uint8Array;
    };
    if (typeof expoCrypto.randomUUID === 'function') {
      return expoCrypto.randomUUID();
    }
    if (typeof expoCrypto.getRandomBytes === 'function') {
      return uuidFromBytes(Uint8Array.from(expoCrypto.getRandomBytes(16)));
    }
  } catch {
    // expo-crypto not resolvable in this environment; fall through to throw.
  }

  throw new Error('generateId: no cryptographically secure random source available');
}
