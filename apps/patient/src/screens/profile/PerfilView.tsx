import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import {
  Box,
  Card,
  Chip,
  Entering,
  Icon,
  LoadState,
  ScreenScroll,
  Text,
  type AppTheme,
  type IconName,
} from '../../design-system';
import { t } from '../../i18n/es-MX';
import { formatGrams, formatKcal } from '../../i18n/format';

export type PerfilProfile = {
  /** The daily target, or why the nutritionist sets it instead. */
  target: { kcal: number; proteinG: number; carbsG: number; fatG: number } | { hold: string };
  facts: { label: string; value: string }[];
};

export type PerfilViewProps = {
  name: string | null;
  email: string | null;
  /** The questionnaire. `null` profile: onboarding not done (only on the paywall). */
  state:
    | { status: 'loading' }
    | { status: 'failed'; onRetry: () => void }
    | { status: 'loaded'; profile: PerfilProfile | null };
  /** "Activa", or null when the patient has never subscribed. */
  subscription: { label: string; active: boolean } | null;
  supportEmail: string | null;
  deleting: boolean;
  deleteError: string | null;
  onEdit?: () => void;
  onOpenSubscription?: () => void;
  onSignOut: () => void;
  /** Must stay reachable here and on the paywall (store rules). */
  onDeleteAccount: () => void;
};

/** Perfil (docs/ui/mockups/07-perfil.html): who you are, your daily target, your data and your account. */
export function PerfilView(props: PerfilViewProps) {
  const { state } = props;
  const initial = props.name?.trim().charAt(0).toLocaleUpperCase('es-MX');
  return (
    <ScreenScroll>
      <Entering delay={0}>
        <Box flexDirection="row" alignItems="center" gap="l">
          <Box
            width={60}
            height={60}
            borderRadius="pill"
            backgroundColor="primaryTint"
            alignItems="center"
            justifyContent="center"
          >
            {initial ? (
              <Text variant="title" color="primary">
                {initial}
              </Text>
            ) : (
              <Icon name="profile" color="primary" size={28} />
            )}
          </Box>
          <Box flex={1}>
            <Text variant="title" accessibilityRole="header" numberOfLines={2}>
              {props.name ?? t.nav.profile}
            </Text>
            {props.email ? (
              <Text variant="label" numberOfLines={1}>
                {props.email}
              </Text>
            ) : null}
          </Box>
        </Box>
      </Entering>

      {state.status === 'loading' ? <LoadState status="loading" /> : null}
      {state.status === 'failed' ? (
        <LoadState
          status="failed"
          message={t.profile.loadFailed}
          retryLabel={t.profile.retry}
          onRetry={state.onRetry}
        />
      ) : null}
      {state.status === 'loaded' && state.profile ? (
        <ProfileCards profile={state.profile} onEdit={props.onEdit} />
      ) : null}

      <Card borderRadius="l" paddingVertical="xs" delay={240} gap="none">
        {props.onOpenSubscription ? (
          <ActionRow
            icon="card"
            iconColor="primary"
            label={t.profile.subscription}
            onPress={props.onOpenSubscription}
            trailing={
              <Chip
                tone={props.subscription?.active ? 'success' : 'muted'}
                label={props.subscription?.label ?? t.profile.subscriptionInactive}
              />
            }
          />
        ) : null}
        <ActionRow
          icon="signOut"
          iconColor="textMuted"
          label={t.common.signOut}
          onPress={props.onSignOut}
          disabled={props.deleting}
          divider={!!props.onOpenSubscription}
        />
        <ActionRow
          icon="trash"
          iconColor="danger"
          labelColor="danger"
          label={props.deleting ? t.profile.deleting : t.profile.deleteAccount}
          onPress={props.onDeleteAccount}
          disabled={props.deleting}
          divider
        />
      </Card>
      {props.deleteError ? (
        <Text variant="label" color="danger">
          {props.deleteError}
        </Text>
      ) : null}
      {props.supportEmail ? (
        <Text variant="caption">{t.profile.support(props.supportEmail)}</Text>
      ) : null}
    </ScreenScroll>
  );
}

function ProfileCards({ profile, onEdit }: { profile: PerfilProfile; onEdit?: () => void }) {
  const { target } = profile;
  return (
    <>
      <Card variant="primary" borderRadius="l" delay={80} gap="s">
        <Text variant="label" color="onPrimary">
          {t.profile.target.title}
        </Text>
        {'hold' in target ? (
          <Text variant="body" color="onPrimary">
            {target.hold}
          </Text>
        ) : (
          <>
            <Text variant="title" color="onPrimary">
              {formatKcal(target.kcal)}
            </Text>
            <Box flexDirection="row" flexWrap="wrap" gap="xs">
              <Chip tone="onPrimary" label={t.macros.protein(formatGrams(target.proteinG))} />
              <Chip tone="onPrimary" label={t.macros.carbs(formatGrams(target.carbsG))} />
              <Chip tone="onPrimary" label={t.macros.fat(formatGrams(target.fatG))} />
            </Box>
          </>
        )}
      </Card>

      <Card borderRadius="l" delay={160} paddingTop="s" paddingBottom="s" gap="none">
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text variant="h2" fontSize={17}>
            {t.profile.data.title}
          </Text>
          {onEdit ? (
            <Pressable
              onPress={onEdit}
              accessibilityRole="button"
              accessibilityLabel={t.profile.edit}
            >
              <Box minHeight={44} justifyContent="center" paddingLeft="m">
                <Text variant="bodyStrong" fontSize={14} color="primary">
                  {t.profile.editLink}
                </Text>
              </Box>
            </Pressable>
          ) : null}
        </Box>
        {profile.facts.map((fact, i) => (
          <Box
            key={fact.label}
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            gap="l"
            minHeight={36}
            paddingVertical="xs"
            borderBottomWidth={i < profile.facts.length - 1 ? 1 : 0}
            borderBottomColor="dividerSoft"
          >
            <Text variant="body" color="textMuted">
              {fact.label}
            </Text>
            <Box flexShrink={1}>
              <Text variant="bodyStrong" textAlign="right">
                {fact.value}
              </Text>
            </Box>
          </Box>
        ))}
      </Card>
    </>
  );
}

function ActionRow({
  icon,
  iconColor,
  label,
  labelColor = 'text',
  onPress,
  trailing,
  disabled,
  divider,
}: {
  icon: IconName;
  iconColor: keyof AppTheme['colors'];
  label: string;
  labelColor?: keyof AppTheme['colors'];
  onPress: () => void;
  trailing?: ReactNode;
  disabled?: boolean;
  divider?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      <Box
        flexDirection="row"
        alignItems="center"
        gap="m"
        minHeight={48}
        borderTopWidth={divider ? 1 : 0}
        borderTopColor="dividerSoft"
        opacity={disabled ? 0.6 : 1}
      >
        <Icon name={icon} color={iconColor} />
        <Box flex={1}>
          <Text variant="bodyStrong" color={labelColor}>
            {label}
          </Text>
        </Box>
        {trailing}
      </Box>
    </Pressable>
  );
}
