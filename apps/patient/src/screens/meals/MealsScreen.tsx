import { Text } from 'react-native';
import { Screen } from '../../components/Screen';
import { t } from '../../i18n/es-MX';

export function MealsScreen() {
  return (
    <Screen title={t.nav.meals}>
      <Text>{t.common.comingSoon}</Text>
    </Screen>
  );
}
