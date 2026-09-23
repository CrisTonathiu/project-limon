import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTenantTheme } from '../theme/theme-context';

export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  const { theme } = useTenantTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background, padding: theme.spacing.lg }]}>
      <Text style={{ fontSize: theme.typography.fontSize.xl, fontWeight: '700', color: theme.colors.text }}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, gap: 12 } });
