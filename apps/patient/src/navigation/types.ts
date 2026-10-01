import { FeatureKey } from '@limon/types';

export type AuthStackParamList = {
  SignIn: undefined;
  InviteCode: undefined;
  /** `inviteCode` is set once InviteCodeScreen has checked it with the API. */
  SignUp: { inviteCode?: string } | undefined;
};
export type AppStackParamList = {
  Onboarding: undefined;
  Home: undefined;
  Meals: undefined;
  Recipes: undefined;
  Progress: undefined;
  AiChat: undefined;
  Profile: undefined;
  Subscription: undefined;
};

/** Screens that belong to a module. They are hidden (and not registered) when the tenant has the module off. */
export const SCREEN_FEATURE: Partial<Record<keyof AppStackParamList, FeatureKey>> = {
  Meals: FeatureKey.MEAL_PLAN,
  Recipes: FeatureKey.RECIPES,
  Progress: FeatureKey.GOAL_TRACKER,
  AiChat: FeatureKey.AI_ASSISTANT,
};

export function isScreenEnabled(screen: keyof AppStackParamList, hasFeature: (feature: FeatureKey) => boolean): boolean {
  const feature = SCREEN_FEATURE[screen];
  return !feature || hasFeature(feature);
}
