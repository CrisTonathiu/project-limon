import { Text } from 'react-native';
import { Screen } from '../../components/Screen';
import { t } from '../../i18n/es-MX';

export function ProgressScreen() {
  return (
    <Screen title={t.nav.progress}>
      <Text>{t.common.comingSoon}</Text>
    </Screen>
  );
}
