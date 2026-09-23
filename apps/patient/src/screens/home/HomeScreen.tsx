import { Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import type { AppStackParamList } from '../../navigation/types';
import { useSession } from '../../state/session-context';

export function HomeScreen({ navigation }: NativeStackScreenProps<AppStackParamList, 'Home'>) {
  const session = useSession();
  if (session.status !== 'signedIn') return null;
  return (
    <Screen title="Your plan">
      <Text>Signed in as {session.me.user.email}</Text>
      <Button label="Meals" onPress={() => navigation.navigate('Meals')} />
      <Button label="Recipes" onPress={() => navigation.navigate('Recipes')} />
      <Button label="Progress" onPress={() => navigation.navigate('Progress')} />
      <Button label="Ask AI" onPress={() => navigation.navigate('AiChat')} />
      <Button label="Profile" onPress={() => navigation.navigate('Profile')} />
    </Screen>
  );
}
