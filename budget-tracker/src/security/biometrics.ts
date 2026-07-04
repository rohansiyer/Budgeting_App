/**
 * Biometric unlock via expo-local-authentication. Always paired with a PIN
 * fallback in the UI (LockScreen) — biometrics never being the *only* way in.
 */
import * as LocalAuthentication from 'expo-local-authentication';

export async function isBiometricHardwareAvailable(): Promise<boolean> {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hasHardware && isEnrolled;
}

export interface BiometricAuthResult {
  success: boolean;
  /** Present on failure/cancel; not shown verbatim to the user (LockScreen falls back to PIN). */
  error?: string;
}

/**
 * Prompt for biometric auth. `disableDeviceFallback: true` because our own
 * PIN screen IS the fallback — we don't want the OS's own passcode UI
 * layered on top of it.
 */
export async function authenticateWithBiometrics(promptMessage = 'Unlock Ducks in a Row'): Promise<BiometricAuthResult> {
  const available = await isBiometricHardwareAvailable();
  if (!available) return { success: false, error: 'unavailable' };

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    disableDeviceFallback: true,
  });
  return result.success ? { success: true } : { success: false, error: result.error };
}
