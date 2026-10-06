import { useState, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { t } from '../../i18n/es-MX';
import { TabBar, type TabItem } from '../components/TabBar';
import { Box } from '../restyle';

const tabs: TabItem[] = [
  { key: 'home', label: t.nav.home, icon: 'home' },
  { key: 'meals', label: t.nav.meals, icon: 'meals' },
  { key: 'recipes', label: t.nav.recipes, icon: 'recipes' },
  { key: 'progress', label: t.nav.progress, icon: 'progress' },
  { key: 'profile', label: t.nav.profile, icon: 'profile' },
];

export type TabKey = 'home' | 'meals' | 'recipes' | 'progress' | 'profile';

/** A screen story as a patient sees it: the screen filling the phone, above the tab bar (leave `tab` out for detail screens). */
export function PhoneFrame({ tab, children }: { tab?: TabKey; children: ReactNode }) {
  const { height } = useWindowDimensions();
  const [active, setActive] = useState<string>(tab ?? 'home');
  return (
    <Box height={height}>
      <Box flex={1}>{children}</Box>
      {tab ? <TabBar tabs={tabs} active={active} onSelect={setActive} /> : null}
    </Box>
  );
}
