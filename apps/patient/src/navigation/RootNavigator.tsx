import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { AiChatScreen } from '../screens/ai/AiChatScreen';
import { ConfirmSignUpScreen } from '../screens/auth/ConfirmSignUpScreen';
import { SignInScreen } from '../screens/auth/SignInScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { MealsScreen } from '../screens/meals/MealsScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { ProgressScreen } from '../screens/progress/ProgressScreen';
import { RecipesScreen } from '../screens/recipes/RecipesScreen';
import { SubscriptionScreen } from '../screens/subscription/SubscriptionScreen';
import { UnavailableScreen } from '../screens/UnavailableScreen';
import { useSession } from '../state/session-context';
import { useTenantTheme } from '../theme/theme-context';
import type { AppStackParamList, AuthStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

export function RootNavigator() {
  const session = useSession();
  const { unavailable } = useTenantTheme();

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
      {session.status === 'signedIn' && !session.entitled ? (
        // Signed in but unpaid: the paywall is the only screen. The API enforces this too.
        <AppStack.Navigator>
          <AppStack.Screen name="Subscription" component={SubscriptionScreen} options={{ title: '' }} />
        </AppStack.Navigator>
      ) : session.status === 'signedIn' ? (
        <AppStack.Navigator>
          <AppStack.Screen name="Home" component={HomeScreen} options={{ title: '' }} />
          <AppStack.Screen name="Meals" component={MealsScreen} />
          <AppStack.Screen name="Recipes" component={RecipesScreen} />
          <AppStack.Screen name="Progress" component={ProgressScreen} />
          <AppStack.Screen name="AiChat" component={AiChatScreen} options={{ title: 'AI' }} />
          <AppStack.Screen name="Profile" component={ProfileScreen} />
          <AppStack.Screen name="Subscription" component={SubscriptionScreen} />
        </AppStack.Navigator>
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="SignIn" component={SignInScreen} />
          <AuthStack.Screen name="SignUp" component={SignUpScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
