import { Text } from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { t } from '../../i18n/es-MX';
import { useSession } from '../../state/session-context';
import { useTenantTheme } from '../../theme/theme-context';

export function ProfileScreen() {
  const session = useSession();
  const { config } = useTenantTheme();
  return (
    <Screen title={t.nav.profile}>
      {config?.supportEmail ? <Text>{t.profile.support(config.supportEmail)}</Text> : null}
      <Button label={t.common.signOut} onPress={() => void session.signOut()} />
    </Screen>
  );
}
