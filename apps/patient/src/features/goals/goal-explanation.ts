import {
  GoalDecisionReason,
  GoalIntention,
  type EnergyTargetDto,
  type PatientGoalDto,
} from '@limon/types';
import { t } from '../../i18n/es-MX';
import { formatKcal, formatKg } from '../../i18n/format';

/**
 * What the patient reads after setting a goal: what they asked for, the starting target the
 * rules chose, and why. One string per paragraph.
 */
export function explainGoal(goal: PatientGoalDto, target: EnergyTargetDto): string[] {
  // The profile's own holds (minors, pregnancy, low BMI, calorie floor) come before any goal.
  if (target.status !== 'READY') return [t.profile.target.hold[target.reason]];

  const e = t.goals.explain;
  const kcal = formatKcal(target.targetKcal);
  const { decision } = goal;
  switch (decision.reason) {
    case GoalDecisionReason.AS_CHOSEN: {
      const losing = decision.goal === 'LOSE';
      const pace = e.paceAdjectives[decision.pace ?? 'GENTLE'];
      return [
        [
          goal.desiredChangeKg
            ? (losing ? e.wantsLose : e.wantsGain)(formatKg(goal.desiredChangeKg))
            : null,
          (losing ? e.lose : e.gain)(pace, kcal),
        ]
          .filter(Boolean)
          .join(' '),
        e.nextWeek,
      ];
    }
    case GoalDecisionReason.MAINTAIN:
      return [
        goal.intention === GoalIntention.NUTRITION_QUALITY ? e.quality(kcal) : e.maintain(kcal),
        e.nextWeek,
      ];
    case GoalDecisionReason.LEAN_GAIN:
      return [e.leanGain(kcal), e.nextWeek];
    case GoalDecisionReason.OTHER:
      return [e.other(kcal)];
    case GoalDecisionReason.RECENT_WEIGHT_LOSS:
      return [e.recentLoss(kcal)];
    case GoalDecisionReason.DESIRED_WEIGHT_TOO_LOW:
      return [e.tooLow(kcal)];
  }
}
