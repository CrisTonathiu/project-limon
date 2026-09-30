import { FEATURE_DEPENDENCIES, FeatureKey } from '@limon/types';

const KNOWN = new Set<string>(Object.values(FeatureKey));

/**
 * Enabled `tenant_features` keys → the features that actually take effect.
 * Unknown keys are dropped, and a feature whose dependency is off is off too
 * (e.g. `shopping_list` without `meal_plan`), so the API and the app agree.
 */
export function effectiveFeatures(enabledKeys: Iterable<string>): FeatureKey[] {
  const enabled = new Set([...enabledKeys].filter((k): k is FeatureKey => KNOWN.has(k)));
  return [...enabled].filter((k) => (FEATURE_DEPENDENCIES[k] ?? []).every((dep) => enabled.has(dep))).sort();
}
