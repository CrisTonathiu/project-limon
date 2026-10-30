import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomSheet, Box, Button, motion } from '../../design-system';
import { t } from '../../i18n/es-MX';
import { api } from '../../services/api';
import { useTenantTheme } from '../../theme/theme-context';
import { syncMealReminders } from './meal-reminders';
import { NotificationPrimer } from './NotificationPrimer';
import { markPrimerReoffered, requestNotifications, shouldReofferPrimer } from './notification-permission';

/**
 * The primer once more, in context: right after a check-off, for a patient who said "Ahora no"
 * in onboarding (or never saw it). Shown at most once per phone. Returns the call to make after
 * a saved check-off and the sheet to render.
 */
export function usePrimerReoffer() {
  const { config } = useTenantTheme();
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const afterCheckOff = useCallback(() => {
    void shouldReofferPrimer().then((offer) => {
      if (!offer) return;
      void markPrimerReoffered().catch((err) => console.error('[notifications] saving the primer state failed', err));
      // After the check-off sheet has finished closing: two modals at once don't stack on iOS.
      timer.current = setTimeout(() => setVisible(true), motion.sheet.duration);
    });
  }, []);

  const allow = async () => {
    setRequesting(true);
    try {
      if (await requestNotifications()) {
        const week = await api.mealPlans.current();
        if (week.status === 'READY') void syncMealReminders(week.plan);
      }
    } catch (err) {
      console.error('[notifications] turning reminders on failed', err);
    }
    setRequesting(false);
    setVisible(false);
  };

  const sheet = (
    <BottomSheet
      visible={visible}
      onClose={() => setVisible(false)}
      title={t.notificationPrimer.reofferTitle}
      closeLabel={t.common.close}
      footer={
        <Box gap="s">
          <Button label={t.notificationPrimer.allow} icon="bell" busy={requesting} onPress={() => void allow()} />
          <Button variant="outline" label={t.notificationPrimer.later} disabled={requesting} onPress={() => setVisible(false)} />
        </Box>
      }
    >
      <NotificationPrimer clinic={config?.appName ?? null} showTitle={false} />
    </BottomSheet>
  );

  return { afterCheckOff, sheet };
}
