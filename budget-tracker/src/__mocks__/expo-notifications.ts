// Mock for expo-notifications in test environment. Enough surface to drive
// the permission-state machine and schedule/cancel helpers under test.

export enum AndroidImportance {
  MIN = 1,
  LOW = 2,
  DEFAULT = 3,
  HIGH = 4,
  MAX = 5,
}

export type PermissionStatus = 'undetermined' | 'granted' | 'denied';

interface PermissionResponse {
  status: PermissionStatus;
  granted: boolean;
  canAskAgain: boolean;
}

let mockStatus: PermissionStatus = 'undetermined';
let mockCanAskAgain = true;

export function __setMockPermissionStatus(status: PermissionStatus, canAskAgain = true) {
  mockStatus = status;
  mockCanAskAgain = canAskAgain;
}

function toResponse(status: PermissionStatus): PermissionResponse {
  return { status, granted: status === 'granted', canAskAgain: mockCanAskAgain };
}

export async function getPermissionsAsync(): Promise<PermissionResponse> {
  return toResponse(mockStatus);
}

export async function requestPermissionsAsync(): Promise<PermissionResponse> {
  if (mockStatus === 'undetermined' && mockCanAskAgain) {
    // Mimic a real OS prompt: tests drive the outcome via __setMockPermissionStatus
    // called *before* requestPermissionsAsync, or default to granted.
  }
  return toResponse(mockStatus);
}

export async function setNotificationChannelAsync(_channelId: string, _channel: unknown): Promise<void> {
  // no-op
}

let idCounter = 0;
const scheduled = new Map<string, unknown>();

export const __mockScheduled = scheduled;

export async function scheduleNotificationAsync(request: {
  content: unknown;
  trigger: unknown;
  identifier?: string;
}): Promise<string> {
  const id = request.identifier ?? `mock-notification-${++idCounter}`;
  scheduled.set(id, request);
  return id;
}

export async function cancelScheduledNotificationAsync(identifier: string): Promise<void> {
  scheduled.delete(identifier);
}

export async function cancelAllScheduledNotificationsAsync(): Promise<void> {
  scheduled.clear();
}

export async function getAllScheduledNotificationsAsync(): Promise<unknown[]> {
  return Array.from(scheduled.values());
}

export function setNotificationHandler(_handler: unknown): void {
  // no-op
}

export const SchedulableTriggerInputTypes = {
  CALENDAR: 'calendar',
  DAILY: 'daily',
  DATE: 'date',
};
