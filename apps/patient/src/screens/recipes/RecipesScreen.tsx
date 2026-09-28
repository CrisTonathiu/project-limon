import { Text } from 'react-native';
import { Screen } from '../../components/Screen';
import { t } from '../../i18n/es-MX';

export function RecipesScreen() {
  return (
    <Screen title={t.nav.recipes}>
      <Text>{t.common.comingSoon}</Text>
    </Screen>
  );
}
