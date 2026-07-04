import AsyncStorage from '@react-native-async-storage/async-storage';

import { getAllNotificationSettings, isNotificationKindEnabled, setNotificationKindEnabled } from '../settings';

describe('notification per-type settings', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('every kind defaults to OFF', async () => {
    expect(await getAllNotificationSettings()).toEqual({
      billReminder: false,
      envelopeWarning: false,
      payday: false,
    });
  });

  it('toggling one kind does not affect the others', async () => {
    await setNotificationKindEnabled('billReminder', true);
    expect(await isNotificationKindEnabled('billReminder')).toBe(true);
    expect(await isNotificationKindEnabled('envelopeWarning')).toBe(false);
    expect(await isNotificationKindEnabled('payday')).toBe(false);
  });

  it('can be disabled again after enabling', async () => {
    await setNotificationKindEnabled('payday', true);
    expect(await isNotificationKindEnabled('payday')).toBe(true);
    await setNotificationKindEnabled('payday', false);
    expect(await isNotificationKindEnabled('payday')).toBe(false);
  });
});
