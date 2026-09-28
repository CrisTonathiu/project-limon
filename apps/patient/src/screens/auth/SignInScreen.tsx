import { useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { t } from '../../i18n/es-MX';
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
    <Screen title={config?.appName ?? t.auth.welcome}>
      <TextInput style={input} placeholder={t.auth.email} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={input} placeholder={t.auth.password} secureTextEntry value={password} onChangeText={setPassword} />
      <Button
        label={busy ? t.auth.signingIn : t.auth.signIn}
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          await session.signIn(email, password).finally(() => setBusy(false));
        }}
      />
      {session.status === 'signedOut' && session.error ? <Text style={{ color: theme.colors.danger }}>{session.error}</Text> : null}
      {/* Invite-only nutritionists: new patients start with their personal invite code. */}
      <Pressable onPress={() => navigation.navigate(config?.requiresInviteCode ? 'InviteCode' : 'SignUp')}>
        <Text style={{ color: theme.colors.primary }}>{t.auth.toSignUp}</Text>
      </Pressable>
    </Screen>
  );
}
