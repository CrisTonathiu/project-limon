import type { Prisma, TenantTx } from '@limon/database';
import type { CreatePatientInput, PatientProfile } from '@limon/validation';

/** Disliked foods come with their names, sorted by name. */
const profileInclude = {
  dislikedFoods: { select: { food: { select: { id: true, name: true } } }, orderBy: { food: { name: 'asc' } } },
} satisfies Prisma.PatientProfileInclude;

/**
 * Every query filters by tenantId explicitly (defence in depth on top of RLS).
 */
export const patientsRepository = {
  list: (tx: TenantTx, tenantId: string, limit = 50) =>
    tx.patient.findMany({ where: { tenantId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: limit }),

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

  /** How many of these ids are foods in the catalog. */
  countFoods: (tx: TenantTx, ids: string[]) => tx.food.count({ where: { id: { in: ids } } }),

  /**
   * Birth date is stored on the patient row, disliked foods on patient_disliked_foods,
   * everything else on patient_profiles. The disliked foods are replaced as a whole.
   */
  saveProfile: async (tx: TenantTx, tenantId: string, patientId: string, input: PatientProfile) => {
    const { dateOfBirth, dislikedFoodIds, ...fields } = input;
    await tx.patient.update({ where: { tenantId_id: { tenantId, id: patientId } }, data: { dateOfBirth: new Date(dateOfBirth) } });
    await tx.patientProfile.upsert({
      where: { tenantId_patientId: { tenantId, patientId } },
      create: { tenantId, patientId, ...fields },
      update: fields,
    });
    await tx.patientDislikedFood.deleteMany({ where: { tenantId, patientId } });
    await tx.patientDislikedFood.createMany({ data: dislikedFoodIds.map((foodId) => ({ tenantId, patientId, foodId })) });
    return tx.patientProfile.findFirstOrThrow({ where: { patientId, tenantId }, include: profileInclude });
  },

  /**
   * Account deletion: erases the health data and anonymizes what has to stay. The patient
   * row itself is kept because consents and subscriptions reference it (legal and financial
   * records). The user's email and Cognito id are replaced, so the same email can sign up again.
   */
  deleteAccount: async (tx: TenantTx, tenantId: string, patientId: string, userId: string) => {
    const now = new Date();
    await tx.patientProfile.deleteMany({ where: { tenantId, patientId } });
    await tx.mealPlan.deleteMany({ where: { tenantId, patientId } });
    await tx.conversation.deleteMany({ where: { tenantId, patientId } }); // messages cascade
    await tx.tenantInviteCode.updateMany({ where: { tenantId, patientId }, data: { active: false } });
    await tx.patientConsent.updateMany({ where: { tenantId, patientId, revokedAt: null }, data: { revokedAt: now } });
    await tx.patient.update({
      where: { tenantId_id: { tenantId, id: patientId } },
      data: { firstName: '', lastName: '', email: null, dateOfBirth: null, deletedAt: now },
    });
    await tx.user.update({
      where: { tenantId_id: { tenantId, id: userId } },
      data: { email: `deleted+${userId}@deleted.invalid`, cognitoUserId: `deleted:${userId}`, status: 'DISABLED', deletedAt: now },
    });
  },
};
