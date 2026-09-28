import { Text } from 'react-native';
import { Screen } from '../../components/Screen';
import { t } from '../../i18n/es-MX';

export function AiChatScreen() {
  return (
    <Screen title={t.nav.ai}>
      <Text>{t.common.comingSoon}</Text>
    </Screen>
  );
}
