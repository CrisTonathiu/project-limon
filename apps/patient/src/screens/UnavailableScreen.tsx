import { Text } from 'react-native';
import { Screen } from '../components/Screen';
import { t } from '../i18n/es-MX';

/** Shown when the tenant is suspended/removed while the store app still exists. */
export function UnavailableScreen() {
  return (
    <Screen title={t.unavailable.title}>
      <Text>{t.unavailable.body}</Text>
    </Screen>
  );
}
