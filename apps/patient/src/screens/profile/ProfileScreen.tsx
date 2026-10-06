import type { PatientDto, PatientProfileDto } from '@limon/types';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { t } from '../../i18n/es-MX';
import { formatCm, formatDate, formatKg, formatNumber } from '../../i18n/format';
import type { AppStackParamList } from '../../navigation/types';
import { api } from '../../services/api';
import { useSession } from '../../state/session-context';
import { useTenantTheme } from '../../theme/theme-context';
import { PerfilView, type PerfilProfile, type PerfilViewProps } from './PerfilView';

type Load =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; profile: PatientProfileDto | null };

/**
 * The patient's daily target and questionnaire answers, with edit, sign out and account
 * deletion. Reachable from the paywall too: deleting an account must not require paying.
 * A tab in the paid app and a stack screen on the paywall; either way the stack opens ProfileEdit.
 */
export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const session = useSession();
  const { config } = useTenantTheme();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [patient, setPatient] = useState<PatientDto | null>(null);
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

  // The name for the header; without it the header falls back to "Perfil".
  useEffect(() => {
    api.patients
      .me()
      .then(setPatient)
      .catch((err) => console.error('[profile] loading the patient failed', err));
  }, []);

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
    Alert.alert(
      t.profile.deleteConfirm.title,
      t.profile.deleteConfirm.body(config?.appName ?? t.common.yourNutritionist),
      [
        { text: t.profile.deleteConfirm.cancel, style: 'cancel' },
        {
          text: t.profile.deleteConfirm.confirm,
          style: 'destructive',
          onPress: () => void deleteAccount(),
        },
      ],
    );

  const entitlement = session.status === 'signedIn' ? session.me.entitlement : undefined;
  const state: PerfilViewProps['state'] =
    load.status === 'loaded'
      ? { status: 'loaded', profile: load.profile ? toPerfil(load.profile) : null }
      : load.status === 'failed'
        ? { status: 'failed', onRetry: fetchProfile }
        : load;

  return (
    <PerfilView
      name={patient?.firstName ?? null}
      email={patient?.email ?? (session.status === 'signedIn' ? session.me.user.email : null)}
      state={state}
      subscription={
        entitlement?.status
          ? { label: t.subscription.status[entitlement.status], active: entitlement.active }
          : null
      }
      supportEmail={config?.supportEmail ?? null}
      deleting={deleting}
      deleteError={deleteError}
      onEdit={
        load.status === 'loaded' && load.profile
          ? () => navigation.navigate('ProfileEdit', { profile: load.profile! })
          : undefined
      }
      onOpenSubscription={() => navigation.navigate('Subscription')}
      onSignOut={() => void session.signOut()}
      onDeleteAccount={confirmDelete}
    />
  );
}

function toPerfil(profile: PatientProfileDto): PerfilProfile {
  const target = profile.energyTarget;
  const f = t.profile.facts;
  return {
    target:
      target.status === 'READY'
        ? {
            kcal: target.targetKcal,
            proteinG: target.proteinG,
            carbsG: target.carbsG,
            fatG: target.fatG,
          }
        : { hold: t.profile.target.hold[target.reason] },
    facts: [
      { label: f.height, value: formatCm(profile.heightCm) },
      { label: f.weight, value: formatKg(profile.weightKg) },
      { label: f.birthDate, value: formatDate(profile.dateOfBirth, 'full') },
      { label: f.activity, value: f.activityLevels[profile.activityLevel] },
      { label: f.meals, value: formatNumber(profile.mealsPerDay) },
      {
        label: f.allergies,
        value: profile.allergies.length
          ? profile.allergies.map((a) => t.onboarding.allergies.names[a]).join(', ')
          : f.none,
      },
      ...(profile.dislikedFoods.length
        ? [{ label: f.dislikes, value: profile.dislikedFoods.map((d) => d.name).join(', ') }]
        : []),
      ...(profile.pregnantOrBreastfeeding ? [{ label: f.pregnant, value: f.yes }] : []),
    ],
  };
}
