import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { useSession } from '../../state/session-context';
import { useTenantTheme } from '../../theme/theme-context';

/**
 * Cognito requires email verification before sign-in. Rendered directly by RootNavigator
 * while session.status === 'awaitingConfirmation' — the dev auth path never reaches this.
 */
export function ConfirmSignUpScreen({ email }: { email: string }) {
  const session = useSession();
  const { theme } = useTenantTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const input = { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: theme.spacing.sm, marginTop: theme.spacing.sm };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.lg, backgroundColor: theme.colors.background }}>
      <Text style={{ fontSize: theme.typography.fontSize.xl, fontWeight: '700', color: theme.colors.text }}>Check your email</Text>
      <Text style={{ color: theme.colors.textMuted, marginTop: theme.spacing.sm }}>
        We sent a verification code to {email}. Enter it below to finish creating your account.
      </Text>
      <TextInput style={input} placeholder="Verification code" keyboardType="number-pad" value={code} onChangeText={setCode} />
      <View style={{ marginTop: theme.spacing.md }}>
        <Button
          label={busy ? 'Confirming…' : 'Confirm'}
          disabled={busy || !code}
          onPress={async () => {
            setBusy(true);
            setError(undefined);
            try {
              await session.confirmSignUp(code);
            } catch {
              setError('That code didn’t work. Check your email and try again.');
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
      {error ? <Text style={{ color: theme.colors.danger, marginTop: theme.spacing.sm }}>{error}</Text> : null}
    </View>
  );
}
