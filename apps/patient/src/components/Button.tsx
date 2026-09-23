import { Pressable, Text } from 'react-native';
import { useTenantTheme } from '../theme/theme-context';

export function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { theme } = useTenantTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={{ backgroundColor: theme.colors.primary, padding: theme.spacing.md, borderRadius: theme.radius.md, opacity: disabled ? 0.6 : 1 }}
    >
      <Text style={{ color: theme.colors.onPrimary, textAlign: 'center', fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
