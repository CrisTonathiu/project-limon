export type AuthStackParamList = {
  SignIn: undefined;
  InviteCode: undefined;
  /** `inviteCode` is set once InviteCodeScreen has checked it with the API. */
  SignUp: { inviteCode?: string } | undefined;
};
export type AppStackParamList = {
  Home: undefined;
  Meals: undefined;
  Recipes: undefined;
  Progress: undefined;
  AiChat: undefined;
  Profile: undefined;
  Subscription: undefined;
};
