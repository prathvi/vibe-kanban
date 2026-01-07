import { useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { Subscription } from 'expo-notifications';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  registerForPushNotifications,
  addNotificationListener,
  addNotificationResponseListener,
  type TaskNotificationPayload,
} from '@/lib/notifications';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function useNotifications() {
  const navigation = useNavigation<NavigationProp>();
  const [pushToken, setPushToken] = useState<string | null>(null);
  const notificationListener = useRef<Subscription | undefined>(undefined);
  const responseListener = useRef<Subscription | undefined>(undefined);

  useEffect(() => {
    registerForPushNotifications().then((token) => {
      if (token) {
        setPushToken(token);
      }
    });

    notificationListener.current = addNotificationListener((notification) => {
      console.log('Notification received:', notification);
    });

    responseListener.current = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data as TaskNotificationPayload;
      if (data?.taskId) {
        navigation.navigate('TaskDetails', {
          taskId: data.taskId,
          projectId: data.projectId || '',
        });
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [navigation]);

  return { pushToken };
}
