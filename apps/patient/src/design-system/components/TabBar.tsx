import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../restyle';
import { Icon, type IconName } from './Icon';

export type TabItem<K extends string = string> = { key: K; label: string; icon: IconName };

export type TabBarProps<K extends string> = {
  tabs: TabItem<K>[];
  active: K;
  onSelect: (key: K) => void;
};

/** The bottom tab bar: icon over label, the active tab in the brand color. */
export function TabBar<K extends string>({ tabs, active, onSelect }: TabBarProps<K>) {
  const insets = useSafeAreaInsets();
  return (
    <Box
      flexDirection="row"
      justifyContent="space-around"
      alignItems="flex-start"
      backgroundColor="surface"
      borderTopWidth={1}
      borderTopColor="divider"
      paddingTop="s"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      accessibilityRole="tablist"
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        const color = selected ? 'primary' : 'textMuted';
        return (
          <Pressable
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            style={{ minWidth: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Box alignItems="center" gap="xs">
              <Icon name={tab.icon} color={color} />
              <Text variant="tab" color={color}>
                {tab.label}
              </Text>
            </Box>
          </Pressable>
        );
      })}
    </Box>
  );
}
