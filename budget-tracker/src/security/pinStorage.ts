/**
 * PIN storage: the PIN itself is never stored. We hash it (SHA-256, salted)
 * via expo-crypto and keep only the salt + hash in expo-secure-store
 * (Android Keystore / iOS Keychain backed).
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const HASH_KEY = 'ducks_pin_hash_v1';
const SALT_KEY = 'ducks_pin_salt_v1';

/** Fixed-length PIN, like most banking apps — keeps the keypad UI simple. */
export const PIN_LENGTH = 4;

export class PinError extends Error {}

function assertValidPin(pin: string): void {
  if (!/^\d+$/.test(pin) || pin.length !== PIN_LENGTH) {
    throw new PinError(`PIN must be exactly ${PIN_LENGTH} digits`);
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPin(pin: string, saltHex: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${saltHex}:${pin}`, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

/** Set (or replace) the app-lock PIN. */
export async function setPin(pin: string): Promise<void> {
  assertValidPin(pin);
  const saltBytes = await Crypto.getRandomBytesAsync(16);
  const saltHex = toHex(saltBytes);
  const hash = await hashPin(pin, saltHex);
  await SecureStore.setItemAsync(SALT_KEY, saltHex);
  await SecureStore.setItemAsync(HASH_KEY, hash);
}

/** Whether a PIN has been configured on this device. */
export async function hasPinSet(): Promise<boolean> {
  const hash = await SecureStore.getItemAsync(HASH_KEY);
  return hash !== null;
}

/** Check a candidate PIN against the stored hash. False if no PIN is set. */
export async function verifyPin(candidate: string): Promise<boolean> {
  if (!/^\d+$/.test(candidate) || candidate.length !== PIN_LENGTH) return false;
  const [saltHex, storedHash] = await Promise.all([
    SecureStore.getItemAsync(SALT_KEY),
    SecureStore.getItemAsync(HASH_KEY),
  ]);
  if (!saltHex || !storedHash) return false;
  const candidateHash = await hashPin(candidate, saltHex);
  return candidateHash === storedHash;
}

/** Remove the PIN entirely (e.g. user disables app lock). */
export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(HASH_KEY);
  await SecureStore.deleteItemAsync(SALT_KEY);
}
