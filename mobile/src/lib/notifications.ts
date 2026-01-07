import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#22c55e',
    });

    await Notifications.setNotificationChannelAsync('task-updates', {
      name: 'Task Updates',
      description: 'Notifications about task status changes',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250],
      lightColor: '#3b82f6',
    });

    await Notifications.setNotificationChannelAsync('agent-activity', {
      name: 'Agent Activity',
      description: 'Notifications about AI agent progress',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 100],
      lightColor: '#eab308',
    });
  }

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: 'vibe-kanban-mobile',
  });

  return token.data;
}

export type TaskNotificationPayload = {
  taskId: string;
  taskTitle: string;
  projectId: string;
  type: 'completed' | 'failed' | 'needs_review' | 'started';
};

export async function scheduleTaskNotification(payload: TaskNotificationPayload) {
  const { taskId, taskTitle, type } = payload;

  const titles: Record<TaskNotificationPayload['type'], string> = {
    completed: 'Task Completed',
    failed: 'Task Failed',
    needs_review: 'Review Required',
    started: 'Task Started',
  };

  const bodies: Record<TaskNotificationPayload['type'], string> = {
    completed: `"${taskTitle}" has been completed successfully`,
    failed: `"${taskTitle}" encountered an error`,
    needs_review: `"${taskTitle}" is ready for review`,
    started: `AI agent started working on "${taskTitle}"`,
  };

  await Notifications.scheduleNotificationAsync({
    content: {
      title: titles[type],
      body: bodies[type],
      data: { taskId, type },
      sound: true,
    },
    trigger: null,
  });
}

export function addNotificationListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}
