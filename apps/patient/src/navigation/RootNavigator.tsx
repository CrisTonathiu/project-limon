import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { AiChatScreen } from '../screens/ai/AiChatScreen';
import { ConfirmSignUpScreen } from '../screens/auth/ConfirmSignUpScreen';
import { SignInScreen } from '../screens/auth/SignInScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { InviteCodeScreen } from '../screens/invite/InviteCodeScreen';
import { MealsScreen } from '../screens/meals/MealsScreen';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { ProgressScreen } from '../screens/progress/ProgressScreen';
import { RecipesScreen } from '../screens/recipes/RecipesScreen';
import { SubscriptionScreen } from '../screens/subscription/SubscriptionScreen';
import { UnavailableScreen } from '../screens/UnavailableScreen';
import { useSession } from '../state/session-context';
import { useTenantTheme } from '../theme/theme-context';
import { t } from '../i18n/es-MX';
import { isScreenEnabled, type AppStackParamList, type AuthStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
// Chevron only: the iOS default back label ("Back") would be English.
const appScreenOptions = { headerBackButtonDisplayMode: 'minimal' } as const;
const AppStack = createNativeStackNavigator<AppStackParamList>();

export function RootNavigator() {
  const session = useSession();
  const { unavailable } = useTenantTheme();
  const canOpen = (screen: keyof AppStackParamList) => isScreenEnabled(screen, session.hasFeature);

  if (unavailable) return <UnavailableScreen />;
  if (session.status === 'awaitingConfirmation') return <ConfirmSignUpScreen email={session.email} />;
  if (session.status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {session.status === 'signedIn' && !session.hasProfile ? (
        // The questionnaire comes first, before the paywall: the meal plan needs it.
        <AppStack.Navigator screenOptions={{ headerShown: false }}>
          <AppStack.Screen name="Onboarding" component={OnboardingScreen} />
        </AppStack.Navigator>
      ) : session.status === 'signedIn' && !session.entitled ? (
        // Signed in but unpaid: the paywall is the only screen. The API enforces this too.
        <AppStack.Navigator screenOptions={appScreenOptions}>
          <AppStack.Screen name="Subscription" component={SubscriptionScreen} options={{ title: '' }} />
        </AppStack.Navigator>
      ) : session.status === 'signedIn' ? (
        <AppStack.Navigator screenOptions={appScreenOptions}>
          <AppStack.Screen name="Home" component={HomeScreen} options={{ title: '' }} />
          {/* Modules switched off for this tenant are not registered at all. */}
          {canOpen('Meals') && <AppStack.Screen name="Meals" component={MealsScreen} options={{ title: t.nav.meals }} />}
          {canOpen('Recipes') && <AppStack.Screen name="Recipes" component={RecipesScreen} options={{ title: t.nav.recipes }} />}
          {canOpen('Progress') && <AppStack.Screen name="Progress" component={ProgressScreen} options={{ title: t.nav.progress }} />}
          {canOpen('AiChat') && <AppStack.Screen name="AiChat" component={AiChatScreen} options={{ title: t.nav.aiShort }} />}
          <AppStack.Screen name="Profile" component={ProfileScreen} options={{ title: t.nav.profile }} />
          <AppStack.Screen name="Subscription" component={SubscriptionScreen} options={{ title: t.subscription.title }} />
        </AppStack.Navigator>
      ) : (
        // Invite-only tenants: "create account" goes through InviteCode first (see SignInScreen).
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="SignIn" component={SignInScreen} />
          <AuthStack.Screen name="InviteCode" component={InviteCodeScreen} />
          <AuthStack.Screen name="SignUp" component={SignUpScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
