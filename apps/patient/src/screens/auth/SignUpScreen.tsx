import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import type { AuthStackParamList } from '../../navigation/types';
import { useSession } from '../../state/session-context';
import { useTenantTheme } from '../../theme/theme-context';

/**
 * Patient self-signup. Consent is explicit and unticked by default: health data is
 * sensitive personal data under Mexico's LFPDPPP and needs express consent.
 */
export function SignUpScreen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'SignUp'>) {
  const session = useSession();
  const { config, theme } = useTenantTheme();
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '' });
  const [privacy, setPrivacy] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });
  const input = {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    padding: theme.spacing.sm, marginTop: theme.spacing.sm,
  };
  const ready = privacy && sensitive && terms && form.email && form.password && form.firstName && form.lastName;

  const Check = ({ value, onToggle, label }: { value: boolean; onToggle: () => void; label: string }) => (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={onToggle}
      style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md }}
    >
      <View
        style={{
          width: 22, height: 22, borderRadius: theme.radius.sm, borderWidth: 1,
          borderColor: theme.colors.border, backgroundColor: value ? theme.colors.primary : 'transparent',
        }}
      />
      <Text style={{ flex: 1, color: theme.colors.text }}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, backgroundColor: theme.colors.background }}>
      <Text style={{ fontSize: theme.typography.fontSize.xl, fontWeight: '700', color: theme.colors.text }}>
        Create your account
      </Text>
      <Text style={{ color: theme.colors.textMuted }}>{config?.appName ?? ''}</Text>

      <TextInput style={input} placeholder="First name" value={form.firstName} onChangeText={set('firstName')} />
      <TextInput style={input} placeholder="Last name" value={form.lastName} onChangeText={set('lastName')} />
      <TextInput style={input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={set('email')} />
      <TextInput style={input} placeholder="Password" secureTextEntry value={form.password} onChangeText={set('password')} />

      <Check value={privacy} onToggle={() => setPrivacy(!privacy)} label="I have read the privacy notice (aviso de privacidad)." />
      <Check
        value={sensitive}
        onToggle={() => setSensitive(!sensitive)}
        label="I expressly consent to my health and nutrition data being processed so my nutritionist can care for me."
      />
      <Check value={terms} onToggle={() => setTerms(!terms)} label="I accept the terms of service." />

      <View style={{ marginTop: theme.spacing.md }}>
        <Button
          label={busy ? 'Creating…' : 'Create account'}
          disabled={!ready || busy}
          onPress={async () => {
            setBusy(true);
            await session
              .signUp({
                email: form.email, password: form.password, firstName: form.firstName, lastName: form.lastName,
                acceptPrivacyNotice: true, acceptSensitiveDataProcessing: true, acceptTerms: true,
              })
              .finally(() => setBusy(false));
          }}
        />
      </View>
      {session.status === 'signedOut' && session.error ? (
        <Text style={{ color: theme.colors.danger, marginTop: theme.spacing.sm }}>{session.error}</Text>
      ) : null}
      <Pressable onPress={() => navigation.navigate('SignIn')} style={{ marginTop: theme.spacing.lg }}>
        <Text style={{ color: theme.colors.primary }}>Already have an account? Sign in</Text>
      </Pressable>
    </ScrollView>
  );
}
