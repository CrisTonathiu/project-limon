import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { t } from '../../i18n/es-MX';

/**
 * The notification permission. The system prompt can be shown only once on iOS, so it only
 * ever comes from the primer's "Sí" (onboarding, or once more after a check-off), never from
 * scheduling reminders or on launch.
 */

export const MEAL_CHECK_CHANNEL_ID = 'meal-check';

/** askable: the system prompt can still be shown. blocked: only the phone's settings can turn it on. */
export type NotificationPermission = 'granted' | 'askable' | 'blocked';

/** Android 13+ shows the prompt only once a channel exists; the channel also names the reminders in settings. */
export async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(MEAL_CHECK_CHANNEL_ID, {
    name: t.mealLog.reminderChannel,
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export async function notificationPermission(): Promise<NotificationPermission> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  return current.canAskAgain ? 'askable' : 'blocked';
}

/** The system prompt, after the primer's "Sí". True when the patient allowed notifications. */
export async function requestNotifications(): Promise<boolean> {
  await ensureNotificationChannels();
  return (await Notifications.requestPermissionsAsync()).granted;
}

// Per phone, not per account: it only decides whether to offer the primer again.
const REOFFERED_KEY = 'notifications.primerReoffered';

/**
 * After a check-off: offer the primer once more if notifications are off but can still be
 * asked for. Only once ever, so a patient who says "Ahora no" twice isn't asked again.
 */
export async function shouldReofferPrimer(): Promise<boolean> {
  try {
    if ((await AsyncStorage.getItem(REOFFERED_KEY)) !== null) return false;
    return (await notificationPermission()) === 'askable';
  } catch (err) {
    console.error('[notifications] checking the primer failed', err);
    return false;
  }
}

export async function markPrimerReoffered(): Promise<void> {
  await AsyncStorage.setItem(REOFFERED_KEY, new Date().toISOString());
}
