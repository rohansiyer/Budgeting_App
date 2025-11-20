import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const requestNotificationPermissions = async (): Promise<boolean> => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get notification permissions');
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('recurring-expenses', {
        name: 'Monthly Bill Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#BB86FC',
      });
    }

    return true;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
};

export const scheduleRecurringExpenseNotification = async (
  month: string,
  notificationTime: string = '20:00'
): Promise<string | null> => {
  try {
    // Parse notification time
    const [hours, minutes] = notificationTime.split(':').map(Number);

    // Get the first day of the target month
    const [year, monthNum] = month.split('-').map(Number);
    const firstOfMonth = new Date(year, monthNum - 1, 1, hours, minutes, 0);

    // Don't schedule if the date is in the past
    if (firstOfMonth < new Date()) {
      console.log('Not scheduling notification for past date:', firstOfMonth);
      return null;
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 Monthly Bills Reminder',
        body: `Time to confirm your recurring expenses for ${new Date(firstOfMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        data: { type: 'recurring-expenses', month },
        sound: true,
      },
      trigger: {
        date: firstOfMonth,
        channelId: 'recurring-expenses',
      },
    });

    console.log('Scheduled notification:', notificationId, 'for', firstOfMonth);
    return notificationId;
  } catch (error) {
    console.error('Error scheduling notification:', error);
    return null;
  }
};

export const scheduleNextMonthNotification = async (
  notificationTime: string = '20:00'
): Promise<string | null> => {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const month = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

  return scheduleRecurringExpenseNotification(month, notificationTime);
};

export const cancelNotification = async (notificationId: string): Promise<void> => {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.error('Error canceling notification:', error);
  }
};

export const cancelAllNotifications = async (): Promise<void> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error canceling all notifications:', error);
  }
};

export const getScheduledNotifications = async () => {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return [];
  }
};
