import { Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { t } from '../../i18n/es-MX';
import { isScreenEnabled, type AppStackParamList } from '../../navigation/types';
import { useSession } from '../../state/session-context';

export function HomeScreen({ navigation }: NativeStackScreenProps<AppStackParamList, 'Home'>) {
  const session = useSession();
  if (session.status !== 'signedIn') return null;
  const links: [Exclude<keyof AppStackParamList, 'ProfileEdit'>, string][] = [
    ['Meals', t.nav.meals],
    ['Recipes', t.nav.recipes],
    ['Progress', t.nav.progress],
    ['AiChat', t.nav.ai],
    ['Profile', t.nav.profile],
  ];
  const visible = links.filter(([screen]) => isScreenEnabled(screen, session.hasFeature));
  return (
    <Screen title={t.home.title}>
      <Text>{t.home.signedInAs(session.me.user.email)}</Text>
      {visible.map(([screen, label]) => (
        <Button key={screen} label={label} onPress={() => navigation.navigate(screen)} />
      ))}
    </Screen>
  );
}
