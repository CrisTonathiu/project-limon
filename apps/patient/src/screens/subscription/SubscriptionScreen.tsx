import { Text } from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
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
export function SubscriptionScreen() {
  const session = useSession();
  const { config, theme } = useTenantTheme();
  const entitlement = session.status === 'signedIn' ? session.me.entitlement : undefined;

  return (
    <Screen title="Subscribe">
      <Text style={{ color: theme.colors.text }}>
        Subscribe to unlock your meal plans, recipes and chat with {config?.appName ?? 'your nutritionist'}.
      </Text>
      {entitlement?.status ? (
        <Text style={{ color: theme.colors.textMuted }}>Current status: {entitlement.status}</Text>
      ) : null}
      <Button label="Subscribe (not available yet)" disabled onPress={() => undefined} />
      <Button label="Restore purchases" onPress={() => void session.refresh()} />
      <Button label="Sign out" onPress={() => void session.signOut()} />
    </Screen>
  );
}
