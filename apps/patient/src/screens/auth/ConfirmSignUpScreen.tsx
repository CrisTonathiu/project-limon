import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { authErrorMessage } from '../../features/auth/auth-errors';
import { t } from '../../i18n/es-MX';
import { useSession } from '../../state/session-context';
import { useTenantTheme } from '../../theme/theme-context';

/**
 * Identity Platform emails a confirmation link after sign-up. Rendered directly by RootNavigator
 * while session.status === 'awaitingConfirmation' — the dev auth path never reaches this.
 * The patient opens the link (in any browser), comes back and taps "Ya lo confirmé".
 */
export function ConfirmSignUpScreen({ email }: { email: string }) {
  const session = useSession();
  const { theme } = useTenantTheme();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();

  const attempt = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice(undefined);
    try {
      await fn();
    } catch (err) {
      setNotice({ text: authErrorMessage(err), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.lg, backgroundColor: theme.colors.background }}>
      <Text style={{ fontSize: theme.typography.fontSize.xl, fontWeight: '700', color: theme.colors.text }}>{t.auth.confirmTitle}</Text>
      <Text style={{ color: theme.colors.textMuted, marginTop: theme.spacing.sm }}>{t.auth.confirmBody(email)}</Text>
      <View style={{ marginTop: theme.spacing.md }}>
        <Button
          label={busy ? t.auth.confirmChecking : t.auth.confirmDone}
          disabled={busy}
          onPress={() =>
            attempt(async () => {
              if (!(await session.checkConfirmation())) setNotice({ text: t.auth.confirmNotYet, error: true });
            })
          }
        />
      </View>
      <Pressable
        disabled={busy}
        style={{ marginTop: theme.spacing.md }}
        onPress={() =>
          attempt(async () => {
            await session.resendConfirmation();
            setNotice({ text: t.auth.confirmResent, error: false });
          })
        }
      >
        <Text style={{ color: theme.colors.primary }}>{t.auth.confirmResend}</Text>
      </Pressable>
      {notice ? (
        <Text style={{ color: notice.error ? theme.colors.danger : theme.colors.textMuted, marginTop: theme.spacing.sm }}>{notice.text}</Text>
      ) : null}
    </View>
  );
}
