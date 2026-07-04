// Mock for expo-local-authentication in test environment. Tests can flip
// the mock module-level state via the `__mock*` setters to simulate a
// device with/without biometric hardware enrolled, and success/failure of
// an authentication prompt.

export enum AuthenticationType {
  FINGERPRINT = 1,
  FACIAL_RECOGNITION = 2,
  IRIS = 3,
}

let mockHasHardware = true;
let mockIsEnrolled = true;
let mockNextResult: { success: true } | { success: false; error: string } = { success: true };

export function __setMockHasHardware(v: boolean) {
  mockHasHardware = v;
}
export function __setMockIsEnrolled(v: boolean) {
  mockIsEnrolled = v;
}
export function __setMockNextResult(v: typeof mockNextResult) {
  mockNextResult = v;
}

export async function hasHardwareAsync(): Promise<boolean> {
  return mockHasHardware;
}

export async function isEnrolledAsync(): Promise<boolean> {
  return mockIsEnrolled;
}

export async function supportedAuthenticationTypesAsync(): Promise<AuthenticationType[]> {
  return mockHasHardware ? [AuthenticationType.FINGERPRINT] : [];
}

export async function authenticateAsync(_options?: {
  promptMessage?: string;
  fallbackLabel?: string;
  disableDeviceFallback?: boolean;
}) {
  return mockNextResult;
}
