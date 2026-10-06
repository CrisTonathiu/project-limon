import { FeatureKey, type PatientProfileDto } from '@limon/types';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type AuthStackParamList = {
  SignIn: undefined;
  InviteCode: undefined;
  /** `inviteCode` is set once InviteCodeScreen has checked it with the API. */
  SignUp: { inviteCode?: string } | undefined;
};
/** The bottom tabs of the paid app (docs/ui/UI-BRIEF.md, Navigation). */
export type TabParamList = {
  Home: undefined;
  Meals: undefined;
  Recipes: undefined;
  Progress: undefined;
  Profile: undefined;
};

/** Detail screens open on top of the tabs, in this stack. */
export type AppStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  /** One meal of this week's plan. `title` (the recipe's) shows in the header while it loads. */
  MealDetail: { mealId: string; title: string };
  ShoppingList: undefined;
  /** `title` shows in the header while the recipe loads. */
  RecipeDetail: { recipeId: string; title: string };
  AiChat: undefined;
  /** On the paywall only; in the paid app, Profile is a tab. */
  Profile: undefined;
  ProfileEdit: { profile: PatientProfileDto };
  Subscription: undefined;
};

/** A tab screen, which can also open the stack's detail screens. */
export type TabScreenProps<K extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, K>,
  NativeStackScreenProps<AppStackParamList>
>;

type ScreenName = keyof AppStackParamList | keyof TabParamList;

/** Screens that belong to a module. They are hidden (and not registered) when the tenant has the module off. */
export const SCREEN_FEATURE: Partial<Record<ScreenName, FeatureKey>> = {
  Meals: FeatureKey.MEAL_PLAN,
  MealDetail: FeatureKey.MEAL_PLAN,
  ShoppingList: FeatureKey.SHOPPING_LIST,
  Recipes: FeatureKey.RECIPES,
  RecipeDetail: FeatureKey.RECIPES,
  Progress: FeatureKey.GOAL_TRACKER,
  AiChat: FeatureKey.AI_ASSISTANT,
};

export function isScreenEnabled(screen: ScreenName, hasFeature: (feature: FeatureKey) => boolean): boolean {
  const feature = SCREEN_FEATURE[screen];
  return !feature || hasFeature(feature);
}
