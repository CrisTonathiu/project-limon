import { Pressable, Text } from 'react-native';
import { useTenantTheme } from '../theme/theme-context';

/** A selectable option row: single choice (`radio`) or multiple (`checkbox`). */
export function Choice({
  label, hint, selected, onPress, role = 'radio',
}: { label: string; hint?: string; selected: boolean; onPress: () => void; role?: 'radio' | 'checkbox' }) {
  const { theme } = useTenantTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        backgroundColor: selected ? theme.colors.surface : theme.colors.background,
      }}
    >
      <Text style={{ color: theme.colors.text, fontWeight: selected ? '600' : '400' }}>{label}</Text>
      {hint ? <Text style={{ color: theme.colors.textMuted, marginTop: theme.spacing.xs }}>{hint}</Text> : null}
    </Pressable>
  );
}
