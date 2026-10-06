import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable } from 'react-native';
import { TabBar, Text, type IconName } from '../design-system';
import { t } from '../i18n/es-MX';
import { HomeScreen } from '../screens/home/HomeScreen';
import { MealsScreen } from '../screens/meals/MealsScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { ProgressScreen } from '../screens/progress/ProgressScreen';
import { RecipesScreen } from '../screens/recipes/RecipesScreen';
import { useSession } from '../state/session-context';
import { isScreenEnabled, type AppStackParamList, type TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<keyof TabParamList, IconName> = {
  Home: 'home',
  Meals: 'meals',
  Recipes: 'recipes',
  Progress: 'progress',
  Profile: 'profile',
};

/** Inicio, Comidas, Recetas, Progreso and Perfil. Tabs for modules the tenant has off are left out. */
export function AppTabs() {
  const session = useSession();
  const canOpen = (screen: keyof TabParamList | keyof AppStackParamList) =>
    isScreenEnabled(screen, session.hasFeature);
  return (
    <Tab.Navigator tabBar={(props) => <AppTabBar {...props} />}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: t.nav.home, headerShown: false }} />
      {canOpen('Meals') && (
        <Tab.Screen
          name="Meals"
          component={MealsScreen}
          options={{
            title: t.nav.meals,
            headerRight: canOpen('ShoppingList') ? () => <ShoppingListLink /> : undefined,
          }}
        />
      )}
      {canOpen('Recipes') && <Tab.Screen name="Recipes" component={RecipesScreen} options={{ title: t.nav.recipes }} />}
      {canOpen('Progress') && <Tab.Screen name="Progress" component={ProgressScreen} options={{ title: t.nav.progress }} />}
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: t.nav.profile }} />
    </Tab.Navigator>
  );
}

/** The design system's TabBar, driven by the navigator (tabPress is emitted so a second tap pops to the top). */
function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const active = state.routes[state.index]!.name;
  return (
    <TabBar
      tabs={state.routes.map((route) => ({
        key: route.name,
        label: descriptors[route.key]?.options.title ?? route.name,
        icon: ICONS[route.name as keyof TabParamList],
      }))}
      active={active}
      onSelect={(name) => {
        const route = state.routes.find((r) => r.name === name)!;
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (name !== active && !event.defaultPrevented) navigation.navigate(route.name, route.params);
      }}
    />
  );
}

/** Until Comidas is redesigned, the week's shopping list opens from its header. */
function ShoppingListLink() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  return (
    <Pressable
      onPress={() => navigation.navigate('ShoppingList')}
      accessibilityRole="button"
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }}
    >
      <Text variant="bodyStrong" color="primary">
        {t.nav.shoppingList}
      </Text>
    </Pressable>
  );
}
