import { Box, Card, Icon, Text } from '../../design-system';
import { t } from '../../i18n/es-MX';

export type NotificationPrimerProps = {
  /** The clinic's app name, so the patient knows who will send the reminders. */
  clinic: string | null;
  /** The sheet that offers it again has its own title. */
  showTitle?: boolean;
};

/**
 * What the meal reminders are, before the system prompt: a sample reminder, who sends it,
 * and that it never shows what the patient eats. The buttons belong to the screen or sheet
 * around it, and only "Sí" shows the system prompt.
 */
export function NotificationPrimer({ clinic, showTitle = true }: NotificationPrimerProps) {
  return (
    <Box gap="l">
      <Card variant="tint" borderRadius="l" padding="l" gap="m" alignItems="center">
        <Box width={52} height={52} borderRadius="pill" backgroundColor="surface" alignItems="center" justifyContent="center">
          <Icon name="bell" color="primary" size={28} />
        </Box>
        {/* A sample of the reminder as it shows on the lock screen. */}
        <Box
          alignSelf="stretch"
          flexDirection="row"
          gap="m"
          padding="m"
          borderRadius="m"
          backgroundColor="surface"
          accessible
          accessibilityLabel={`${t.mealLog.question(t.recipes.mealTypes.BREAKFAST)} ${t.mealLog.reminderBody}`}
        >
          <Box width={36} height={36} borderRadius="s" backgroundColor="primary" alignItems="center" justifyContent="center">
            <Icon name="bowl" color="onPrimary" size={20} />
          </Box>
          <Box flex={1} gap="xs">
            <Box flexDirection="row" justifyContent="space-between">
              <Text variant="caption">{clinic ?? ''}</Text>
              <Text variant="caption">{t.notificationPrimer.sampleApp}</Text>
            </Box>
            <Text variant="bodyStrong">{t.mealLog.question(t.recipes.mealTypes.BREAKFAST)}</Text>
            <Text variant="label">{t.mealLog.reminderBody}</Text>
          </Box>
        </Box>
      </Card>
      {showTitle ? (
        <Text variant="title" accessibilityRole="header">
          {t.notificationPrimer.title}
        </Text>
      ) : null}
      <Text variant="body">{clinic ? t.notificationPrimer.body(clinic) : t.notificationPrimer.bodyFallback}</Text>
      <Text variant="label">{t.notificationPrimer.note}</Text>
    </Box>
  );
}
