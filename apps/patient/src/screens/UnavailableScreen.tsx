import { Text } from 'react-native';
import { Screen } from '../components/Screen';

/** Shown when the tenant is suspended/removed while the store app still exists. */
export function UnavailableScreen() {
  return (
    <Screen title="Service unavailable">
      <Text>This service is currently unavailable. Please contact your nutritionist.</Text>
    </Screen>
  );
}
