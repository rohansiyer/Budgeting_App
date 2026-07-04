import { __mockStore } from '../../__mocks__/expo-secure-store';
import { PinError, clearPin, hasPinSet, setPin, verifyPin } from '../pinStorage';

describe('pinStorage', () => {
  beforeEach(() => {
    __mockStore.clear();
  });

  it('has no PIN set initially', async () => {
    expect(await hasPinSet()).toBe(false);
    expect(await verifyPin('1234')).toBe(false);
  });

  it('rejects non-4-digit PINs', async () => {
    await expect(setPin('123')).rejects.toThrow(PinError);
    await expect(setPin('123456')).rejects.toThrow(PinError);
    await expect(setPin('abcd')).rejects.toThrow(PinError);
  });

  it('sets a PIN and verifies the correct one', async () => {
    await setPin('4242');
    expect(await hasPinSet()).toBe(true);
    expect(await verifyPin('4242')).toBe(true);
  });

  it('rejects an incorrect PIN', async () => {
    await setPin('4242');
    expect(await verifyPin('0000')).toBe(false);
  });

  it('never stores the PIN in plaintext', async () => {
    await setPin('4242');
    const rawValues = Array.from(__mockStore.values());
    expect(rawValues.some((v) => v === '4242')).toBe(false);
    expect(rawValues.some((v) => v.includes('4242'))).toBe(false);
  });

  it('salts the hash so two users with the same PIN get different stored hashes', async () => {
    await setPin('1111');
    const firstHash = __mockStore.get('ducks_pin_hash_v1');
    __mockStore.clear();
    await setPin('1111');
    const secondHash = __mockStore.get('ducks_pin_hash_v1');
    expect(firstHash).not.toEqual(secondHash);
  });

  it('clearPin removes the stored PIN entirely', async () => {
    await setPin('4242');
    await clearPin();
    expect(await hasPinSet()).toBe(false);
    expect(await verifyPin('4242')).toBe(false);
  });

  it('replacing a PIN invalidates the old one', async () => {
    await setPin('1111');
    await setPin('2222');
    expect(await verifyPin('1111')).toBe(false);
    expect(await verifyPin('2222')).toBe(true);
  });
});
