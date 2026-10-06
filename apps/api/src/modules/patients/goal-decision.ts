import {
  GoalDecisionReason,
  GoalIntention,
  GoalPace,
  RecentWeightChange,
  WeightGoal,
} from '@limon/types';
import type { SetGoalInput } from '@limon/validation';
import type { Goal } from './energy-target.js';
import type { EffectiveGoalRules } from './goal-rules.js';

/**
 * From what the patient asked for to the starting target. Pure, so it is unit-tested directly.
 *
 * The patient states an intention and, to lose or gain, picks a pace the clinic allows. They
 * never pick a calorie number. Anything that looks risky starts at maintenance with a reason
 * the app explains ("talk to your nutritionist"). The energy target still applies its own
 * holds on top (minors, pregnancy, low BMI, the calorie floor).
 */
export type GoalDecision = { goal: Goal; reason: GoalDecisionReason };

const MAINTAIN = { type: WeightGoal.MAINTAIN } as const;

/** Is the picked pace one the clinic lets patients choose? Only lose and gain have a pace. */
export function paceAllowed(input: SetGoalInput, rules: EffectiveGoalRules): boolean {
  if (!input.pace) return true;
  if (input.intention === GoalIntention.LOSE_WEIGHT) return rules.paces.lose.includes(input.pace);
  if (input.intention === GoalIntention.GAIN_WEIGHT) return rules.paces.gain.includes(input.pace);
  return false;
}

export function decideGoal(
  input: SetGoalInput,
  body: { weightKg: number; heightCm: number },
  rules: EffectiveGoalRules,
): GoalDecision {
  switch (input.intention) {
    case GoalIntention.MAINTAIN_WEIGHT:
    case GoalIntention.NUTRITION_QUALITY:
      return { goal: MAINTAIN, reason: GoalDecisionReason.MAINTAIN };

    case GoalIntention.OTHER:
      return { goal: MAINTAIN, reason: GoalDecisionReason.OTHER };

    case GoalIntention.BUILD_MUSCLE:
      // A lean gain: the smallest surplus, whatever the clinic allows for weight gain.
      return {
        goal: { type: WeightGoal.GAIN, pace: GoalPace.GENTLE },
        reason: GoalDecisionReason.LEAN_GAIN,
      };

    case GoalIntention.GAIN_WEIGHT:
      return {
        goal: { type: WeightGoal.GAIN, pace: input.pace! },
        reason: GoalDecisionReason.AS_CHOSEN,
      };

    case GoalIntention.LOSE_WEIGHT: {
      // Losing more after a big recent loss can be a sign of a problem: start at maintenance.
      if (input.recentWeightChange === RecentWeightChange.LOST) {
        return { goal: MAINTAIN, reason: GoalDecisionReason.RECENT_WEIGHT_LOSS };
      }
      if (input.desiredChangeKg !== undefined) {
        const desiredBmi = (body.weightKg - input.desiredChangeKg) / (body.heightCm / 100) ** 2;
        if (desiredBmi < rules.minBmiToLose)
          return { goal: MAINTAIN, reason: GoalDecisionReason.DESIRED_WEIGHT_TOO_LOW };
      }
      return {
        goal: { type: WeightGoal.LOSE, pace: input.pace! },
        reason: GoalDecisionReason.AS_CHOSEN,
      };
    }
  }
}
