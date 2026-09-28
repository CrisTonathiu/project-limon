import { Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { t } from '../../i18n/es-MX';
import type { AppStackParamList } from '../../navigation/types';
import { useSession } from '../../state/session-context';

export function HomeScreen({ navigation }: NativeStackScreenProps<AppStackParamList, 'Home'>) {
  const session = useSession();
  if (session.status !== 'signedIn') return null;
  return (
    <Screen title={t.home.title}>
      <Text>{t.home.signedInAs(session.me.user.email)}</Text>
      <Button label={t.nav.meals} onPress={() => navigation.navigate('Meals')} />
      <Button label={t.nav.recipes} onPress={() => navigation.navigate('Recipes')} />
      <Button label={t.nav.progress} onPress={() => navigation.navigate('Progress')} />
      <Button label={t.nav.ai} onPress={() => navigation.navigate('AiChat')} />
      <Button label={t.nav.profile} onPress={() => navigation.navigate('Profile')} />
    </Screen>
  );
}
