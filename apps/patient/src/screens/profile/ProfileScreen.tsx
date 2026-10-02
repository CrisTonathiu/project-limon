import type { PatientProfileDto } from '@limon/types';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { t } from '../../i18n/es-MX';
import { formatCm, formatDate, formatGrams, formatKcal, formatKg } from '../../i18n/format';
import type { AppStackParamList } from '../../navigation/types';
import { api } from '../../services/api';
import { useSession } from '../../state/session-context';
import { useTenantTheme } from '../../theme/theme-context';

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; profile: PatientProfileDto | null };

/**
 * The patient's daily target and questionnaire answers, with edit, sign out and account
 * deletion. Reachable from the paywall too: deleting an account must not require paying.
 */
export function ProfileScreen({ navigation }: NativeStackScreenProps<AppStackParamList, 'Profile'>) {
  const session = useSession();
  const { config, theme } = useTenantTheme();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchProfile = useCallback(() => {
    setLoad((l) => (l.status === 'loaded' ? l : { status: 'loading' }));
    api.patients
      .myProfile()
      .then(({ profile }) => setLoad({ status: 'loaded', profile }))
      .catch((err) => {
        console.error('[profile] loading the profile failed', err);
        setLoad({ status: 'failed' });
      });
  }, []);
  // Reloads when coming back from the edit screen, so the target follows the changes.
  useFocusEffect(fetchProfile);

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      // Signs out on success; the navigator then leaves this screen.
      await session.deleteAccount();
    } catch (err) {
      console.error('[profile] deleting the account failed', err);
      setDeleteError(t.common.networkError);
      setDeleting(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(t.profile.deleteConfirm.title, t.profile.deleteConfirm.body(config?.appName ?? t.common.yourNutritionist), [
      { text: t.profile.deleteConfirm.cancel, style: 'cancel' },
      { text: t.profile.deleteConfirm.confirm, style: 'destructive', onPress: () => void deleteAccount() },
    ]);

  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: theme.spacing.xs }}>
      <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: theme.typography.fontSize.lg }}>{title}</Text>
      {children}
    </View>
  );
  const Line = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
    <Text style={{ color: muted ? theme.colors.textMuted : theme.colors.text }}>{children}</Text>
  );

  const profileSections = (profile: PatientProfileDto) => {
    const target = profile.energyTarget;
    return (
      <>
        <Section title={t.profile.target.title}>
          {target.status === 'READY' ? (
            <>
              <Text style={{ color: theme.colors.text, fontSize: theme.typography.fontSize.xl, fontWeight: '700' }}>
                {formatKcal(target.targetKcal)}
              </Text>
              <Line>{t.profile.target.macros(formatGrams(target.proteinG), formatGrams(target.carbsG), formatGrams(target.fatG))}</Line>
              <Line muted>{t.profile.target.note}</Line>
            </>
          ) : (
            <Line>{t.profile.target.hold[target.reason]}</Line>
          )}
        </Section>

        <Section title={t.profile.data.title}>
          <Line>{t.profile.data.birthDate(formatDate(profile.dateOfBirth, 'full'))}</Line>
          <Line>{t.profile.data.heightWeight(formatCm(profile.heightCm), formatKg(profile.weightKg))}</Line>
          <Line>{t.onboarding.activity.levels[profile.activityLevel].label}</Line>
          <Line>{t.onboarding.meals.option(profile.mealsPerDay)}</Line>
          {profile.pregnantOrBreastfeeding ? <Line>{t.profile.data.pregnant}</Line> : null}
          <Line>
            {profile.allergies.length
              ? t.profile.data.allergies(profile.allergies.map((a) => t.onboarding.allergies.names[a]).join(', '))
              : t.profile.data.noAllergies}
          </Line>
          {profile.dislikedFoods.length ? <Line>{t.profile.data.dislikes(profile.dislikedFoods.join(', '))}</Line> : null}
        </Section>

        <Button label={t.profile.edit} onPress={() => navigation.navigate('ProfileEdit', { profile })} />
      </>
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
    >
      {load.status === 'loading' ? <ActivityIndicator /> : null}
      {load.status === 'failed' ? (
        <>
          <Line>{t.profile.loadFailed}</Line>
          <Button label={t.profile.retry} onPress={fetchProfile} />
        </>
      ) : null}
      {load.status === 'loaded' && load.profile ? profileSections(load.profile) : null}

      {config?.supportEmail ? <Line muted>{t.profile.support(config.supportEmail)}</Line> : null}
      <Button label={t.common.signOut} disabled={deleting} onPress={() => void session.signOut()} />

      <Pressable
        accessibilityRole="button"
        onPress={confirmDelete}
        disabled={deleting}
        style={{ padding: theme.spacing.md, marginTop: theme.spacing.lg }}
      >
        <Text style={{ color: theme.colors.danger, textAlign: 'center', fontWeight: '600' }}>
          {deleting ? t.profile.deleting : t.profile.deleteAccount}
        </Text>
      </Pressable>
      {deleteError ? <Text style={{ color: theme.colors.danger, textAlign: 'center' }}>{deleteError}</Text> : null}
    </ScrollView>
  );
}
