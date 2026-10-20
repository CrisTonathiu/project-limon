import type { MealPlanDto } from '@limon/types';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { t } from '../../i18n/es-MX';
import { mealCheckSchedule } from './meal-check-schedule';

/**
 * "¿Comiste tu desayuno?" reminders, scheduled on the phone (local notifications: no server,
 * no push credentials). One per unanswered meal, 30 minutes after its usual hour. They are
 * rescheduled whenever the plan loads, and a meal's reminder is cancelled once it's answered.
 */

const KIND = 'meal-check';
const CHANNEL_ID = 'meal-check';
const identifier = (mealId: string) => `${KIND}:${mealId}`;

/** What a meal reminder carries, for the tap. */
export type MealCheckData = { kind: typeof KIND; mealId: string; recipeTitle: string | null };

export function isMealCheck(data: unknown): data is MealCheckData {
  return typeof data === 'object' && data !== null && (data as { kind?: unknown }).kind === KIND;
}

// Shown as a banner even when the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Asks for permission the first time only. Android 13+ asks at runtime and needs the channel
 * to exist first. To do (MVP.2 Phase 2): the primer screen before the system prompt.
 */
async function canNotify(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: t.mealLog.reminderChannel,
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function cancelAll(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => isMealCheck(n.content.data))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

async function schedule(plan: MealPlanDto): Promise<void> {
  if (!(await canNotify())) return;
  await cancelAll();
  for (const check of mealCheckSchedule(plan, new Date())) {
    const data: MealCheckData = { kind: KIND, mealId: check.mealId, recipeTitle: check.recipeTitle };
    await Notifications.scheduleNotificationAsync({
      identifier: identifier(check.mealId),
      content: { title: t.mealLog.question(t.recipes.mealTypes[check.mealType]), body: t.mealLog.reminderBody, data },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: check.fireAt, channelId: CHANNEL_ID },
    });
  }
}

// One change at a time: Inicio and Comidas can both load the plan at once.
let queue: Promise<void> = Promise.resolve();
const enqueue = (label: string, task: () => Promise<void>) => {
  queue = queue.then(task).catch((err) => console.error(`[notifications] ${label} failed`, err));
  return queue;
};

/** Replaces the scheduled meal reminders with the ones this plan calls for. */
export const syncMealReminders = (plan: MealPlanDto) => enqueue('scheduling the meal reminders', () => schedule(plan));

/** After a check-off: that meal's reminder must not fire. */
export const cancelMealReminder = (mealId: string) =>
  enqueue('cancelling a meal reminder', () => Notifications.cancelScheduledNotificationAsync(identifier(mealId)));

/** On sign-out and account deletion. */
export const clearMealReminders = () => enqueue('clearing the meal reminders', cancelAll);

/**
 * Calls `open` when the patient taps a meal reminder, including the tap that launched the app.
 * Each tap is handled once, even if the screen using this mounts again.
 */
export function useMealReminderTaps(open: (data: MealCheckData) => void): void {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const { data } = response.notification.request.content;
    if (!isMealCheck(data)) return;
    Notifications.clearLastNotificationResponse();
    open(data);
    // Only a new tap should run this, not a new `open`.
  }, [response]);
}
