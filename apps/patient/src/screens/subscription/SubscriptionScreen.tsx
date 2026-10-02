import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { t } from '../../i18n/es-MX';
import type { AppStackParamList } from '../../navigation/types';
import { useSession } from '../../state/session-context';
import { useTenantTheme } from '../../theme/theme-context';

/**
 * Paywall. A signed-in patient without an active subscription sees only this.
 *
 * The purchase itself is NOT implemented: selling in-app access requires store
 * billing (Apple IAP / Google Play Billing) — see ADR-008. Whichever provider is
 * chosen, the flow is: purchase in the store SDK → server verifies the receipt or
 * notification → patient_subscriptions updated → refresh() unlocks the app.
 * The client never asserts its own entitlement.
 */
export function SubscriptionScreen({ navigation }: NativeStackScreenProps<AppStackParamList, 'Subscription'>) {
  const session = useSession();
  const { config, theme } = useTenantTheme();
  const entitlement = session.status === 'signedIn' ? session.me.entitlement : undefined;

  return (
    <Screen title={t.subscription.title}>
      <Text style={{ color: theme.colors.text }}>
        {t.subscription.body(config?.appName ?? t.common.yourNutritionist)}
      </Text>
      {entitlement?.status ? (
        <Text style={{ color: theme.colors.textMuted }}>{t.subscription.currentStatus(t.subscription.status[entitlement.status])}</Text>
      ) : null}
      <Button label={t.subscription.subscribe} disabled onPress={() => undefined} />
      <Button label={t.subscription.restore} onPress={() => void session.refresh()} />
      <Button label={t.profile.open} onPress={() => navigation.navigate('Profile')} />
      <Button label={t.common.signOut} onPress={() => void session.signOut()} />
    </Screen>
  );
}
