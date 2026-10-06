import { GoalIntention, type GoalPace, type RecentWeightChange } from '@limon/types';
import type { SetGoalInput } from '@limon/validation';
import { t } from '../../i18n/es-MX';

/** What the goal flow has collected so far. Text fields stay strings until the request is built. */
export type GoalForm = {
  intention: GoalIntention | null;
  pace: GoalPace | null;
  /** "5", "7.5" or "7,5"; empty when they'd rather not say. */
  desiredKg: string;
  otherText: string;
  recentWeightChange: RecentWeightChange | null;
};

export const emptyGoalForm: GoalForm = {
  intention: null,
  pace: null,
  desiredKg: '',
  otherText: '',
  recentWeightChange: null,
};

export type GoalStep = 'intention' | 'details' | 'screening';

const WITH_DETAILS: GoalIntention[] = [
  GoalIntention.LOSE_WEIGHT,
  GoalIntention.GAIN_WEIGHT,
  GoalIntention.OTHER,
];

/** Maintaining, eating better and building muscle need no details: straight to screening. */
export function goalSteps(intention: GoalIntention | null): GoalStep[] {
  return intention && WITH_DETAILS.includes(intention)
    ? ['intention', 'details', 'screening']
    : ['intention', 'screening'];
}

const isWeightGoal = (i: GoalIntention | null) =>
  i === GoalIntention.LOSE_WEIGHT || i === GoalIntention.GAIN_WEIGHT;

/** "7,5" → 7.5; empty → null; anything else → NaN. */
export function parseDesiredKg(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : NaN;
}

/** Why the step can't continue yet, or null when it can. Picking nothing just keeps the button off. */
export function stepError(step: GoalStep, form: GoalForm): string | null {
  if (step === 'details' && isWeightGoal(form.intention)) {
    const kg = parseDesiredKg(form.desiredKg);
    if (kg !== null && (Number.isNaN(kg) || kg < 0.5 || kg > 150)) return t.goals.desiredInvalid;
  }
  return null;
}

/** Has the step got what it needs to continue? */
export function stepComplete(step: GoalStep, form: GoalForm): boolean {
  if (step === 'intention') return form.intention !== null;
  if (step === 'screening') return form.recentWeightChange !== null;
  if (form.intention === GoalIntention.OTHER) return form.otherText.trim().length > 0;
  return form.pace !== null && stepError(step, form) === null;
}

/** The PUT body. Only call once every step is complete. */
export function toGoalInput(form: GoalForm): SetGoalInput {
  if (!form.intention || !form.recentWeightChange) throw new Error('Goal form is incomplete');
  const input: SetGoalInput = {
    intention: form.intention,
    recentWeightChange: form.recentWeightChange,
  };
  if (isWeightGoal(form.intention)) {
    input.pace = form.pace ?? undefined;
    input.desiredChangeKg = parseDesiredKg(form.desiredKg) ?? undefined;
  }
  if (form.intention === GoalIntention.OTHER) input.otherText = form.otherText.trim();
  return input;
}
