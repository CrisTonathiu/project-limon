import { BiologicalSex, type GoalPace } from '@limon/types';
import { GoalRulesSchema, PLATFORM_GUARDRAILS } from '@limon/validation';
import type { EnergyGuardrails } from './energy-target.js';

/**
 * The rules a clinic's patients get: the platform's guardrails, tightened by the clinic's own
 * (written by its nutritionist at onboarding). Pure, so it is unit-tested directly.
 */
export type EffectiveGoalRules = EnergyGuardrails & {
  /** Paces a patient may pick, slowest first. */
  paces: { lose: GoalPace[]; gain: GoalPace[] };
  /** Stored with every decision: "platform-1", or "clinic-3" for version 3 of the clinic's rules. */
  version: string;
};

/** A clinic's stored rules row (tenant_goal_rules), or null when it hasn't set any. */
export type ClinicGoalRules = { version: number; rules: unknown } | null;

export function effectiveGoalRules(clinic: ClinicGoalRules): EffectiveGoalRules {
  const P = PLATFORM_GUARDRAILS;
  const platform: EffectiveGoalRules = {
    minAge: P.minAge,
    floorKcal: { ...P.floorKcal },
    maxWeeklyLossShare: P.maxWeeklyLossShare,
    minBmiToLose: P.minBmiToLose,
    paces: { lose: [...P.paces.lose], gain: [...P.paces.gain] },
    version: `platform-${P.version}`,
  };
  if (!clinic) return platform;

  // The admin command validated these when it stored them. If a row is unreadable anyway, failing
  // beats quietly falling back to the platform's rules, which may be looser than the clinic's.
  const rules = GoalRulesSchema.parse(clinic.rules);
  // Each limit takes the stricter of the two, so even a row written around the schema can't loosen anything.
  return {
    minAge: Math.max(P.minAge, rules.minAge ?? P.minAge),
    floorKcal: {
      [BiologicalSex.FEMALE]: Math.max(P.floorKcal.FEMALE, rules.floorKcal?.FEMALE ?? 0),
      [BiologicalSex.MALE]: Math.max(P.floorKcal.MALE, rules.floorKcal?.MALE ?? 0),
    },
    maxWeeklyLossShare: Math.min(
      P.maxWeeklyLossShare,
      rules.maxWeeklyLossShare ?? P.maxWeeklyLossShare,
    ),
    minBmiToLose: Math.max(P.minBmiToLose, rules.minBmiToLose ?? P.minBmiToLose),
    paces: rules.paces ?? platform.paces,
    version: `clinic-${clinic.version}`,
  };
}
