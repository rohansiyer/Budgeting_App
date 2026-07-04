import { __setMockPermissionStatus } from '../../__mocks__/expo-notifications';
import { __mockScheduled } from '../../__mocks__/expo-notifications';
import { setNotificationKindEnabled } from '../settings';
import { cancelBillReminder, notify, schedulePaydayNote, scheduleBillReminder } from '../scheduler';

describe('notification scheduler gating', () => {
  beforeEach(() => {
    __mockScheduled.clear();
    __setMockPermissionStatus('granted');
  });

  it('does not schedule when OS permission is not granted, even if the type toggle is on', async () => {
    await setNotificationKindEnabled('billReminder', true);
    __setMockPermissionStatus('denied');
    const result = await scheduleBillReminder();
    expect(result).toBe(false);
    expect(__mockScheduled.size).toBe(0);
  });

  it('does not schedule when the type toggle is off, even if permission is granted', async () => {
    await setNotificationKindEnabled('billReminder', false);
    const result = await scheduleBillReminder();
    expect(result).toBe(false);
    expect(__mockScheduled.size).toBe(0);
  });

  it('schedules the bill reminder once permission + toggle both allow it', async () => {
    await setNotificationKindEnabled('billReminder', true);
    const result = await scheduleBillReminder();
    expect(result).toBe(true);
    expect(__mockScheduled.size).toBe(1);
  });

  it('cancelling removes the scheduled bill reminder', async () => {
    await setNotificationKindEnabled('billReminder', true);
    await scheduleBillReminder();
    await cancelBillReminder();
    expect(__mockScheduled.size).toBe(0);
  });

  it('notify() (envelope warning) fires immediately when enabled', async () => {
    await setNotificationKindEnabled('envelopeWarning', true);
    const ok = await notify('envelopeWarning', { title: 'Gas envelope', body: 'You are at 96% for the week.' });
    expect(ok).toBe(true);
    expect(__mockScheduled.size).toBe(1);
  });

  it('notify() is a no-op when the envelope-warning toggle is off', async () => {
    await setNotificationKindEnabled('envelopeWarning', false);
    const ok = await notify('envelopeWarning', { title: 'x', body: 'y' });
    expect(ok).toBe(false);
    expect(__mockScheduled.size).toBe(0);
  });

  it('does not schedule a payday note for a date in the past', async () => {
    await setNotificationKindEnabled('payday', true);
    const ok = await schedulePaydayNote('2000-01-01');
    expect(ok).toBe(false);
    expect(__mockScheduled.size).toBe(0);
  });

  it('schedules a payday note for a future date', async () => {
    await setNotificationKindEnabled('payday', true);
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days out
    const dateStr = future.toISOString().slice(0, 10);
    const ok = await schedulePaydayNote(dateStr, '$1,200');
    expect(ok).toBe(true);
    expect(__mockScheduled.size).toBe(1);
  });
});
