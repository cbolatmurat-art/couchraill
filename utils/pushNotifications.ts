import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function setupPushNotifications(currentUser: any, updateProfile: (updates: any) => Promise<any>) {
  if (Platform.OS === 'web') return;

  const isExpoGo = Constants.executionEnvironment === 'store-client';
  if (isExpoGo) {
    console.warn("Expo Go ortamında push bildirimleri devre dışı.");
    return;
  }

  try {
    // Set notification handler
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    // Register push token
    registerForPushNotificationsAsync().then(token => {
      if (token && token !== currentUser.pushToken) {
        console.log('[PUSH] Registering/updating push token:', token);
        updateProfile({ pushToken: token }).catch(err => {
          console.error('[PUSH] Failed to save push token to server:', err);
        });
      }
    });

    // Listen for clicked notifications
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('[NOTIFICATION CLICKED] payload:', data);
      
      if (data && data.conversationId) {
        const { router } = require('expo-router');
        setTimeout(() => {
          router.push(`/messages/${data.conversationId}`);
        }, 100);
      }
    });

    return () => {
      subscription.remove();
    };
  } catch (err) {
    console.error('[PUSH_SETUP_ERROR]', err);
  }
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    if (!projectId) {
      console.warn('Project ID not found in expo config, cannot get push token');
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return token.data;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}
