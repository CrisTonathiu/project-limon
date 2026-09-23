import { Text } from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { useSession } from '../../state/session-context';
import { useTenantTheme } from '../../theme/theme-context';

export function ProfileScreen() {
  const session = useSession();
  const { config } = useTenantTheme();
  return (
    <Screen title="Profile">
      {config?.supportEmail ? <Text>Support: {config.supportEmail}</Text> : null}
      <Button label="Sign out" onPress={() => void session.signOut()} />
    </Screen>
  );
}
