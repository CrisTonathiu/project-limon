import { ApiError } from '@limon/api-client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { InviteCodeSchema } from '@limon/validation';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { t } from '../../i18n/es-MX';
import type { AuthStackParamList } from '../../navigation/types';
import { api } from '../../services/api';
import { useTenantTheme } from '../../theme/theme-context';

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'INVITE_CODE_INVALID':
        return t.invite.errors.invalid;
      case 'TENANT_SUSPENDED':
        return t.invite.errors.suspended;
      case 'RATE_LIMITED':
        return t.invite.errors.rateLimited;
    }
  }
  return t.common.networkError;
}

/**
 * First step of sign-up when the nutritionist is invite-only (and optional when open).
 * Each code belongs to one patient the nutritionist pre-registered. It is checked here,
 * before a login is created, so a typo doesn't leave the patient with an account the
 * API then refuses. The API checks it again and redeems it at registration.
 */
export function InviteCodeScreen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'InviteCode'>) {
  const { config, theme } = useTenantTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const input = {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: theme.spacing.md,
    marginTop: theme.spacing.lg, fontSize: theme.typography.fontSize.lg, letterSpacing: 2, textAlign: 'center' as const,
    color: theme.colors.text,
  };

  const submit = async () => {
    if (!code.trim() || busy) return;
    setError(undefined);
    const parsed = InviteCodeSchema.safeParse(code);
    if (!parsed.success) return setError(t.invite.errors.invalid);
    setBusy(true);
    try {
      await api.invites.check(parsed.data);
      navigation.navigate('SignUp', { inviteCode: parsed.data });
    } catch (err) {
      console.error('[invite] code check failed', err);
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.lg, backgroundColor: theme.colors.background }}>
      <Text style={{ fontSize: theme.typography.fontSize.xl, fontWeight: '700', color: theme.colors.text }}>{t.invite.title}</Text>
      <Text style={{ color: theme.colors.textMuted, marginTop: theme.spacing.sm }}>
        {config?.appName ? t.invite.subtitle(config.appName) : t.invite.subtitleFallback}
      </Text>
      <TextInput
        style={input}
        accessibilityLabel={t.invite.inputLabel}
        placeholder="ABCD-EFGH"
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        maxLength={33}
        returnKeyType="go"
        value={code}
        onChangeText={setCode}
        onSubmitEditing={submit}
      />
      <View style={{ marginTop: theme.spacing.md }}>
        <Button label={busy ? t.invite.checking : t.invite.continue} disabled={busy || !code.trim()} onPress={submit} />
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.danger, marginTop: theme.spacing.md }}>
          {error}
        </Text>
      ) : null}
      <Text style={{ color: theme.colors.textMuted, marginTop: theme.spacing.lg, textAlign: 'center' }}>{t.invite.noCode}</Text>
      <Pressable accessibilityRole="button" onPress={() => navigation.navigate('SignIn')} style={{ marginTop: theme.spacing.md }}>
        <Text style={{ color: theme.colors.primary, textAlign: 'center' }}>{t.invite.back}</Text>
      </Pressable>
    </View>
  );
}
