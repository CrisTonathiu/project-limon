import { useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { useSession } from '../../state/session-context';
import { useTenantTheme } from '../../theme/theme-context';
import type { AuthStackParamList } from '../../navigation/types';

export function SignInScreen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'SignIn'>) {
  const session = useSession();
  const { config, theme } = useTenantTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const input = { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: theme.spacing.sm };

  return (
    <Screen title={config?.appName ?? 'Welcome'}>
      <TextInput style={input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <Button
        label={busy ? 'Signing in…' : 'Sign in'}
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          await session.signIn(email, password).finally(() => setBusy(false));
        }}
      />
      {session.status === 'signedOut' && session.error ? <Text style={{ color: theme.colors.danger }}>{session.error}</Text> : null}
      <Pressable onPress={() => navigation.navigate('SignUp')}>
        <Text style={{ color: theme.colors.primary }}>New here? Create an account</Text>
      </Pressable>
    </Screen>
  );
}
