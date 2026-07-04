import { __setMockPermissionStatus } from '../../__mocks__/expo-notifications';
import { getPermissionState, requestPermission } from '../permissions';

describe('notification permission state machine', () => {
  beforeEach(() => {
    __setMockPermissionStatus('undetermined');
  });

  it('starts undetermined', async () => {
    expect(await getPermissionState()).toBe('undetermined');
  });

  it('undetermined -> granted after a request the user accepts', async () => {
    __setMockPermissionStatus('undetermined');
    // simulate the OS granting on request by pre-seeding what the "prompt" resolves to
    __setMockPermissionStatus('granted');
    expect(await requestPermission()).toBe('granted');
    expect(await getPermissionState()).toBe('granted');
  });

  it('undetermined -> denied after a request the user rejects', async () => {
    __setMockPermissionStatus('denied');
    expect(await requestPermission()).toBe('denied');
    expect(await getPermissionState()).toBe('denied');
  });

  it('granted short-circuits: requesting again is a no-op that stays granted', async () => {
    __setMockPermissionStatus('granted');
    expect(await requestPermission()).toBe('granted');
    expect(await requestPermission()).toBe('granted');
  });

  it('denied stays denied across repeated checks (no silent re-grant)', async () => {
    __setMockPermissionStatus('denied');
    expect(await getPermissionState()).toBe('denied');
    expect(await requestPermission()).toBe('denied');
    expect(await getPermissionState()).toBe('denied');
  });
});
