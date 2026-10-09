import { withTenant, writeAudit } from '@limon/database';
import type { TenantContext } from '@limon/tenant';
import type { TenantTx } from '@limon/database';
import {
  FeatureKey,
  WeightGoal,
  type Allergen,
  type BodyLogDto,
  type BodyLogListResponse,
  type ProgressPeriod,
  type ProgressResponse,
  type MyGoalResponse,
  type PatientDto,
  type PatientGoalDto,
  type PatientProfileDto,
  type PatientProfileResponse,
  type SetGoalResponse,
} from '@limon/types';
import type { BodyLog, CreatePatientInput, PatientProfile, SetGoalInput } from '@limon/validation';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';
import { localToday } from '../meal-plans/week.js';
import { createTenantsService } from '../tenants/tenants.service.js';
import { buildProgress, isEmptyLog, mergeBodyLog, type BodyValues } from './body-logs.js';
import { energyTarget, type Goal } from './energy-target.js';
import { decideGoal, paceAllowed } from './goal-decision.js';
import { effectiveGoalRules, type EffectiveGoalRules } from './goal-rules.js';
import { patientsRepository } from './patients.repository.js';

type PatientRow = NonNullable<Awaited<ReturnType<typeof patientsRepository.findById>>>;
const toDto = (p: PatientRow): PatientDto => ({
  id: p.id,
  tenantId: p.tenantId,
  firstName: p.firstName,
  lastName: p.lastName,
  email: p.email,
  createdAt: p.createdAt.toISOString(),
});

type GoalRow = NonNullable<Awaited<ReturnType<typeof patientsRepository.findGoal>>>;
const toGoalDto = (g: GoalRow): PatientGoalDto => ({
  intention: g.intention,
  pace: g.pace,
  desiredChangeKg: g.desiredChangeKg,
  otherText: g.otherText,
  recentWeightChange: g.recentWeightChange,
  decision: { goal: g.decidedGoal, pace: g.decidedPace, reason: g.reason },
  rulesVersion: g.rulesVersion,
  decidedAt: g.decidedAt.toISOString(),
});

type BodyLogRow = NonNullable<Awaited<ReturnType<typeof patientsRepository.findBodyLog>>>;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const toBodyLogDto = ({ date, ...values }: BodyLogRow): BodyLogDto => ({ date: isoDay(date), ...values });
const valuesOf = (row: BodyLogRow | null): BodyValues | null => (row ? toBodyLogDto(row) : null);

/** The stored decision as the energy target's goal. A pace always comes with LOSE and GAIN (DB check). */
const storedGoal = (g: GoalRow | null): Goal =>
  g && g.decidedGoal !== WeightGoal.MAINTAIN && g.decidedPace
    ? { type: g.decidedGoal, pace: g.decidedPace }
    : { type: WeightGoal.MAINTAIN };

/** What the energy target is computed with: the patient's goal and the clinic's rules. */
type EnergyBasis = { goal: Goal; rules: EffectiveGoalRules };

type ProfileRow = NonNullable<Awaited<ReturnType<typeof patientsRepository.findProfile>>>;
const toProfileDto = (p: ProfileRow, dateOfBirth: Date, basis: EnergyBasis): PatientProfileDto => {
  const isoDateOfBirth = dateOfBirth.toISOString().slice(0, 10);
  return {
    sex: p.sex,
    dateOfBirth: isoDateOfBirth,
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    activityLevel: p.activityLevel,
    mealsPerDay: p.mealsPerDay,
    pregnantOrBreastfeeding: p.pregnantOrBreastfeeding,
    allergies: p.allergies as Allergen[],
    dislikedFoods: p.dislikedFoods.map((d) => d.food),
    energyTarget: energyTarget(
      { ...p, dateOfBirth: isoDateOfBirth },
      basis.goal,
      undefined,
      basis.rules,
    ),
    updatedAt: p.updatedAt.toISOString(),
  };
};

export function createPatientsService(c: Container) {
  const tenants = createTenantsService(c);
  const scoped = async <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) =>
    withTenant(c.db, await c.registry.getPlacement(ctx.tenantId), fn);

  const rulesOf = async (tx: TenantTx, tenantId: string) =>
    effectiveGoalRules(await patientsRepository.latestGoalRules(tx, tenantId));

  /**
   * The clinic's rules always apply (they can only tighten the guardrails). The patient's goal
   * only counts while the clinic has the goal tracker on; otherwise everyone maintains.
   */
  const energyBasis = async (
    tx: TenantTx,
    tenantId: string,
    patientId: string,
    goalTracker: boolean,
  ): Promise<EnergyBasis> => ({
    goal: goalTracker
      ? storedGoal(await patientsRepository.findGoal(tx, tenantId, patientId))
      : { type: WeightGoal.MAINTAIN },
    rules: await rulesOf(tx, tenantId),
  });
  const hasGoalTracker = async (tenantId: string) =>
    (await tenants.features(tenantId)).includes(FeatureKey.GOAL_TRACKER);

  /** The signed-in patient and their profile; trackers need onboarding to be finished. */
  const patientWithProfile = async (tx: TenantTx, ctx: TenantContext) => {
    const p = await patientsRepository.findByUserId(tx, ctx.tenantId, ctx.userId);
    if (!p) throw Errors.notFound('Patient');
    const profile = await patientsRepository.findProfile(tx, ctx.tenantId, p.id);
    if (!profile || !p.dateOfBirth) throw Errors.conflict('Finish the onboarding questionnaire first.');
    return { patient: p, profile };
  };

  /** Merges values into a day's log; a day left with nothing is deleted. Returns the day, or null. */
  const writeBodyLog = async (tx: TenantTx, tenantId: string, patientId: string, date: string, input: BodyLog) => {
    const day = new Date(date);
    const merged = mergeBodyLog(valuesOf(await patientsRepository.findBodyLog(tx, tenantId, patientId, day)), input);
    if (isEmptyLog(merged)) {
      await patientsRepository.deleteBodyLog(tx, tenantId, patientId, day);
      return null;
    }
    return toBodyLogDto(await patientsRepository.saveBodyLog(tx, tenantId, patientId, day, merged));
  };

  /** The profile's weight follows the latest weigh-in (energy target, water target, BMI checks). */
  const syncProfileWeight = async (tx: TenantTx, tenantId: string, patientId: string, profileWeightKg: number) => {
    const latest = await patientsRepository.latestWeightKg(tx, tenantId, patientId);
    if (latest !== null && latest !== profileWeightKg) {
      await patientsRepository.setProfileWeight(tx, tenantId, patientId, latest);
    }
  };

  return {
    list: (ctx: TenantContext) =>
      scoped(ctx, async (tx) => ({
        items: (await patientsRepository.list(tx, ctx.tenantId)).map(toDto),
      })),

    get: (ctx: TenantContext, id: string) =>
      scoped(ctx, async (tx) => {
        const p = await patientsRepository.findById(tx, ctx.tenantId, id);
        // Another tenant's patient is indistinguishable from a non-existent one (no enumeration).
        if (!p) throw Errors.notFound('Patient');
        return toDto(p);
      }),

    me: (ctx: TenantContext) =>
      scoped(ctx, async (tx) => {
        const p = await patientsRepository.findByUserId(tx, ctx.tenantId, ctx.userId);
        if (!p) throw Errors.notFound('Patient');
        return toDto(p);
      }),

    /** `profile: null` until the patient finishes onboarding. */
    myProfile: async (ctx: TenantContext): Promise<PatientProfileResponse> => {
      const goalTracker = await hasGoalTracker(ctx.tenantId);
      return scoped(ctx, async (tx) => {
        const p = await patientsRepository.findByUserId(tx, ctx.tenantId, ctx.userId);
        if (!p) throw Errors.notFound('Patient');
        const profile = await patientsRepository.findProfile(tx, ctx.tenantId, p.id);
        // A profile always gets a birth date with it (saveProfile), so the guard only satisfies the types.
        if (!profile || !p.dateOfBirth) return { profile: null };
        return {
          profile: toProfileDto(
            profile,
            p.dateOfBirth,
            await energyBasis(tx, ctx.tenantId, p.id, goalTracker),
          ),
        };
      });
    },

    saveMyProfile: async (
      ctx: TenantContext,
      input: PatientProfile,
    ): Promise<PatientProfileResponse> => {
      const goalTracker = await hasGoalTracker(ctx.tenantId);
      return scoped(ctx, async (tx) => {
        const p = await patientsRepository.findByUserId(tx, ctx.tenantId, ctx.userId);
        if (!p) throw Errors.notFound('Patient');
        if (
          (await patientsRepository.countFoods(tx, input.dislikedFoodIds)) !==
          input.dislikedFoodIds.length
        ) {
          throw Errors.validation('dislikedFoodIds: unknown food');
        }
        const before = await patientsRepository.findProfile(tx, ctx.tenantId, p.id);
        const profile = await patientsRepository.saveProfile(tx, ctx.tenantId, p.id, input);
        // A new or changed weight is today's weigh-in, so the chart starts at onboarding.
        if (before?.weightKg !== input.weightKg) {
          await writeBodyLog(tx, ctx.tenantId, p.id, localToday(new Date()), { weightKg: input.weightKg });
        }
        // Health data: the audit row records that the profile changed, never the values.
        await writeAudit(tx, ctx, {
          action: 'PatientProfileSaved',
          resourceType: 'PatientProfile',
          resourceId: p.id,
        });
        const basis = await energyBasis(tx, ctx.tenantId, p.id, goalTracker);
        return { profile: toProfileDto(profile, new Date(input.dateOfBirth), basis) };
      });
    },

    /** GET /patients/me/goal: the patient's goal, and the paces their clinic lets them pick. */
    myGoal: (ctx: TenantContext): Promise<MyGoalResponse> =>
      scoped(ctx, async (tx) => {
        const p = await patientsRepository.findByUserId(tx, ctx.tenantId, ctx.userId);
        if (!p) throw Errors.notFound('Patient');
        const goal = await patientsRepository.findGoal(tx, ctx.tenantId, p.id);
        const rules = await rulesOf(tx, ctx.tenantId);
        return { goal: goal ? toGoalDto(goal) : null, options: rules.paces };
      }),

    /**
     * PUT /patients/me/goal. The patient states an intention (and, to lose or gain, a pace their
     * clinic allows); the clinic's rules decide the starting target, stored with its reason and
     * the rules version. Meal plans aim at the new target from the next week they generate.
     */
    setMyGoal: (ctx: TenantContext, input: SetGoalInput): Promise<SetGoalResponse> =>
      scoped(ctx, async (tx) => {
        const p = await patientsRepository.findByUserId(tx, ctx.tenantId, ctx.userId);
        if (!p) throw Errors.notFound('Patient');
        const profile = await patientsRepository.findProfile(tx, ctx.tenantId, p.id);
        if (!profile || !p.dateOfBirth)
          throw Errors.conflict('Finish the onboarding questionnaire first.');
        const rules = await rulesOf(tx, ctx.tenantId);
        if (!paceAllowed(input, rules)) throw Errors.validation('pace: not one this clinic offers');

        const decision = decideGoal(input, profile, rules);
        const goal = await patientsRepository.saveGoal(tx, ctx.tenantId, p.id, input, {
          goal: decision.goal.type,
          pace: decision.goal.type === WeightGoal.MAINTAIN ? null : decision.goal.pace,
          reason: decision.reason,
          rulesVersion: rules.version,
          startWeightKg: profile.weightKg,
        });
        // Health data: the audit row records which rules decided, never the goal or the reason (which can reveal health details).
        await writeAudit(tx, ctx, {
          action: 'PatientGoalSaved',
          resourceType: 'PatientGoal',
          resourceId: goal.id,
          metadata: { rulesVersion: rules.version },
        });
        const { energyTarget: target } = toProfileDto(profile, p.dateOfBirth, {
          goal: decision.goal,
          rules,
        });
        return { goal: toGoalDto(goal), options: rules.paces, energyTarget: target };
      }),

    /** GET /patients/me/progress: the weight chart for the period, measurements and the weight goal. */
    myProgress: (ctx: TenantContext, period: ProgressPeriod): Promise<ProgressResponse> =>
      scoped(ctx, async (tx) => {
        const { patient, profile } = await patientWithProfile(tx, ctx);
        const logs = await patientsRepository.bodyLogs(tx, ctx.tenantId, patient.id);
        const goal = await patientsRepository.findGoal(tx, ctx.tenantId, patient.id);
        return buildProgress(logs.map(toBodyLogDto), {
          currentWeightKg: profile.weightKg,
          period,
          today: localToday(new Date()),
          goal: goal && { ...goal, startedOn: localToday(goal.decidedAt) },
        });
      }),

    /** GET /patients/me/body-logs: the latest days, newest first. */
    myBodyLogs: (ctx: TenantContext, limit = 100): Promise<BodyLogListResponse> =>
      scoped(ctx, async (tx) => {
        const { patient } = await patientWithProfile(tx, ctx);
        const rows = await patientsRepository.recentBodyLogs(tx, ctx.tenantId, patient.id, limit);
        return { items: rows.map(toBodyLogDto) };
      }),

    /**
     * PUT /patients/me/body-logs/:date: merges a weigh-in and/or measurements into that day
     * (today or earlier). A new latest weight becomes the profile's weight.
     */
    saveMyBodyLog: (ctx: TenantContext, date: string, input: BodyLog): Promise<{ log: BodyLogDto | null }> =>
      scoped(ctx, async (tx) => {
        if (date > localToday(new Date())) throw Errors.validation("date: can't be in the future");
        const { patient, profile } = await patientWithProfile(tx, ctx);
        const log = await writeBodyLog(tx, ctx.tenantId, patient.id, date, input);
        if (input.weightKg !== undefined) await syncProfileWeight(tx, ctx.tenantId, patient.id, profile.weightKg);
        // Health data: the audit row records that a log changed, never the values.
        await writeAudit(tx, ctx, { action: 'BodyLogSaved', resourceType: 'BodyLog', resourceId: patient.id });
        return { log };
      }),

    /** DELETE /patients/me/body-logs/:date. Idempotent. The profile keeps the latest weight left. */
    deleteMyBodyLog: (ctx: TenantContext, date: string): Promise<void> =>
      scoped(ctx, async (tx) => {
        const { patient, profile } = await patientWithProfile(tx, ctx);
        await patientsRepository.deleteBodyLog(tx, ctx.tenantId, patient.id, new Date(date));
        await syncProfileWeight(tx, ctx.tenantId, patient.id, profile.weightKg);
        await writeAudit(tx, ctx, { action: 'BodyLogDeleted', resourceType: 'BodyLog', resourceId: patient.id });
      }),

    /** The signed-in patient's id and current weight (e.g. for the default water target). Needs onboarding. */
    currentWeight: (ctx: TenantContext): Promise<{ patientId: string; weightKg: number }> =>
      scoped(ctx, async (tx) => {
        const { patient, profile } = await patientWithProfile(tx, ctx);
        return { patientId: patient.id, weightKg: profile.weightKg };
      }),

    /**
     * The patient deletes their own account, login included. The Identity Platform login is
     * deleted last, inside the transaction: if that call fails, nothing is erased and the
     * patient can retry; once it commits, nothing is left to sign in with.
     * TODO(week 7, see docs/roadmap/mvp-roadmap.md): cancel the patient's Stripe subscription.
     */
    deleteMyAccount: (ctx: TenantContext): Promise<void> =>
      scoped(ctx, async (tx) => {
        const p = await patientsRepository.findByUserId(tx, ctx.tenantId, ctx.userId);
        if (!p) throw Errors.notFound('Patient');
        const login = await patientsRepository.findLogin(tx, ctx.tenantId, ctx.userId);
        await patientsRepository.deleteAccount(tx, ctx.tenantId, p.id, ctx.userId);
        await writeAudit(tx, ctx, {
          action: 'PatientDeleted',
          resourceType: 'Patient',
          resourceId: p.id,
        });
        if (c.identityAdmin && login.identityTenantId) await c.identityAdmin.deleteUser(login.identityTenantId, login.authUserId);
      }),

    /**
     * What the meal plan generator needs from a patient: null when the patient doesn't exist
     * (or deleted their account) or hasn't finished onboarding. Takes a tenant id rather than
     * a TenantContext because the weekly job and the admin command run with no user signed in.
     */
    planningProfile: async (tenantId: string, patientId: string) => {
      const goalTracker = await hasGoalTracker(tenantId);
      return withTenant(c.db, await c.registry.getPlacement(tenantId), async (tx) => {
        const p = await patientsRepository.findById(tx, tenantId, patientId);
        const profile = p && (await patientsRepository.findProfile(tx, tenantId, p.id));
        if (!profile || !p.dateOfBirth) return null;
        const dto = toProfileDto(
          profile,
          p.dateOfBirth,
          await energyBasis(tx, tenantId, p.id, goalTracker),
        );
        return {
          mealsPerDay: dto.mealsPerDay,
          allergies: dto.allergies,
          dislikedFoodIds: dto.dislikedFoods.map((f) => f.id),
          energyTarget: dto.energyTarget,
        };
      });
    },

    create: (ctx: TenantContext, input: CreatePatientInput) =>
      scoped(ctx, async (tx) => {
        const p = await patientsRepository.create(tx, ctx.tenantId, input);
        await writeAudit(tx, ctx, {
          action: 'PatientCreated',
          resourceType: 'Patient',
          resourceId: p.id,
        });
        return toDto(p);
      }),
  };
}
