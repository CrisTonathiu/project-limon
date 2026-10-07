import type { Prisma, TenantTx } from '@limon/database';
import type { GoalDecisionReason, GoalPace, WeightGoal } from '@limon/types';
import type { CreatePatientInput, PatientProfile, SetGoalInput } from '@limon/validation';
import type { BodyValues } from './body-logs.js';

/** Disliked foods come with their names, sorted by name. */
const profileInclude = {
  dislikedFoods: {
    select: { food: { select: { id: true, name: true } } },
    orderBy: { food: { name: 'asc' } },
  },
} satisfies Prisma.PatientProfileInclude;

const bodyLogSelect = {
  date: true,
  weightKg: true,
  waistCm: true,
  hipCm: true,
  chestCm: true,
  armCm: true,
  thighCm: true,
  bodyFatPct: true,
} satisfies Prisma.BodyLogSelect;

/**
 * Every query filters by tenantId explicitly (defence in depth on top of RLS).
 */
export const patientsRepository = {
  list: (tx: TenantTx, tenantId: string, limit = 50) =>
    tx.patient.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),

  findById: (tx: TenantTx, tenantId: string, id: string) =>
    tx.patient.findFirst({ where: { id, tenantId, deletedAt: null } }),

  findByUserId: (tx: TenantTx, tenantId: string, userId: string) =>
    tx.patient.findFirst({ where: { userId, tenantId, deletedAt: null } }),

  create: (tx: TenantTx, tenantId: string, input: CreatePatientInput) =>
    tx.patient.create({
      data: {
        tenantId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email?.toLowerCase() ?? null,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
      },
    }),

  findProfile: (tx: TenantTx, tenantId: string, patientId: string) =>
    tx.patientProfile.findFirst({ where: { patientId, tenantId }, include: profileInclude }),

  findGoal: (tx: TenantTx, tenantId: string, patientId: string) =>
    tx.patientGoal.findFirst({ where: { tenantId, patientId } }),

  /** The clinic's latest goal rules, or null when it hasn't set any. */
  latestGoalRules: (tx: TenantTx, tenantId: string) =>
    tx.tenantGoalRules.findFirst({
      where: { tenantId },
      orderBy: { version: 'desc' },
      select: { version: true, rules: true },
    }),

  /** One goal per patient: a new one replaces the old (the audit log keeps the history). */
  saveGoal: (
    tx: TenantTx,
    tenantId: string,
    patientId: string,
    input: SetGoalInput,
    decision: {
      goal: WeightGoal;
      pace: GoalPace | null;
      reason: GoalDecisionReason;
      rulesVersion: string;
      startWeightKg: number;
    },
  ) => {
    const data = {
      intention: input.intention,
      pace: input.pace ?? null,
      desiredChangeKg: input.desiredChangeKg ?? null,
      otherText: input.otherText ?? null,
      recentWeightChange: input.recentWeightChange,
      decidedGoal: decision.goal,
      decidedPace: decision.pace,
      reason: decision.reason,
      rulesVersion: decision.rulesVersion,
      startWeightKg: decision.startWeightKg,
      decidedAt: new Date(),
    };
    return tx.patientGoal.upsert({
      where: { tenantId_patientId: { tenantId, patientId } },
      create: { tenantId, patientId, ...data },
      update: data,
    });
  },

  /** Every weigh-in and measurement of the patient, oldest first. */
  bodyLogs: (tx: TenantTx, tenantId: string, patientId: string) =>
    tx.bodyLog.findMany({ where: { tenantId, patientId }, orderBy: { date: 'asc' }, select: bodyLogSelect }),

  /** The newest days first, for the history list. */
  recentBodyLogs: (tx: TenantTx, tenantId: string, patientId: string, limit: number) =>
    tx.bodyLog.findMany({
      where: { tenantId, patientId },
      orderBy: { date: 'desc' },
      take: limit,
      select: bodyLogSelect,
    }),

  findBodyLog: (tx: TenantTx, tenantId: string, patientId: string, date: Date) =>
    tx.bodyLog.findUnique({
      where: { tenantId_patientId_date: { tenantId, patientId, date } },
      select: bodyLogSelect,
    }),

  saveBodyLog: (tx: TenantTx, tenantId: string, patientId: string, date: Date, values: BodyValues) =>
    tx.bodyLog.upsert({
      where: { tenantId_patientId_date: { tenantId, patientId, date } },
      create: { tenantId, patientId, date, ...values },
      update: values,
      select: bodyLogSelect,
    }),

  /** Idempotent. */
  deleteBodyLog: (tx: TenantTx, tenantId: string, patientId: string, date: Date) =>
    tx.bodyLog.deleteMany({ where: { tenantId, patientId, date } }),

  /** The weight of the most recent day that has one, or null. */
  latestWeightKg: async (tx: TenantTx, tenantId: string, patientId: string) =>
    (
      await tx.bodyLog.findFirst({
        where: { tenantId, patientId, weightKg: { not: null } },
        orderBy: { date: 'desc' },
        select: { weightKg: true },
      })
    )?.weightKg ?? null,

  setProfileWeight: (tx: TenantTx, tenantId: string, patientId: string, weightKg: number) =>
    tx.patientProfile.update({ where: { tenantId_patientId: { tenantId, patientId } }, data: { weightKg } }),

  /** How many of these ids are foods in the catalog. */
  countFoods: (tx: TenantTx, ids: string[]) => tx.food.count({ where: { id: { in: ids } } }),

  /**
   * Birth date is stored on the patient row, disliked foods on patient_disliked_foods,
   * everything else on patient_profiles. The disliked foods are replaced as a whole.
   */
  saveProfile: async (tx: TenantTx, tenantId: string, patientId: string, input: PatientProfile) => {
    const { dateOfBirth, dislikedFoodIds, ...fields } = input;
    await tx.patient.update({
      where: { tenantId_id: { tenantId, id: patientId } },
      data: { dateOfBirth: new Date(dateOfBirth) },
    });
    await tx.patientProfile.upsert({
      where: { tenantId_patientId: { tenantId, patientId } },
      create: { tenantId, patientId, ...fields },
      update: fields,
    });
    await tx.patientDislikedFood.deleteMany({ where: { tenantId, patientId } });
    await tx.patientDislikedFood.createMany({
      data: dislikedFoodIds.map((foodId) => ({ tenantId, patientId, foodId })),
    });
    return tx.patientProfile.findFirstOrThrow({
      where: { patientId, tenantId },
      include: profileInclude,
    });
  },

  /**
   * Account deletion: erases the health data and anonymizes what has to stay. The patient
   * row itself is kept because consents and subscriptions reference it (legal and financial
   * records). The user's email and Cognito id are replaced, so the same email can sign up again.
   */
  deleteAccount: async (tx: TenantTx, tenantId: string, patientId: string, userId: string) => {
    const now = new Date();
    await tx.patientProfile.deleteMany({ where: { tenantId, patientId } });
    await tx.patientGoal.deleteMany({ where: { tenantId, patientId } });
    await tx.bodyLog.deleteMany({ where: { tenantId, patientId } });
    await tx.waterIntake.deleteMany({ where: { tenantId, patientId } });
    await tx.waterSettings.deleteMany({ where: { tenantId, patientId } });
    await tx.mealPlan.deleteMany({ where: { tenantId, patientId } }); // meals cascade
    await tx.mealFeedback.deleteMany({ where: { tenantId, patientId } });
    await tx.shoppingListCheck.deleteMany({ where: { tenantId, patientId } });
    await tx.conversation.deleteMany({ where: { tenantId, patientId } }); // messages cascade
    await tx.tenantInviteCode.updateMany({
      where: { tenantId, patientId },
      data: { active: false },
    });
    await tx.patientConsent.updateMany({
      where: { tenantId, patientId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.patient.update({
      where: { tenantId_id: { tenantId, id: patientId } },
      data: { firstName: '', lastName: '', email: null, dateOfBirth: null, deletedAt: now },
    });
    await tx.user.update({
      where: { tenantId_id: { tenantId, id: userId } },
      data: {
        email: `deleted+${userId}@deleted.invalid`,
        cognitoUserId: `deleted:${userId}`,
        status: 'DISABLED',
        deletedAt: now,
      },
    });
  },
};
