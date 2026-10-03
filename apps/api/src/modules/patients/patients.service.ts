import { withTenant, writeAudit } from '@limon/database';
import type { TenantContext } from '@limon/tenant';
import type { Allergen, PatientDto, PatientProfileDto, PatientProfileResponse } from '@limon/types';
import type { CreatePatientInput, PatientProfile } from '@limon/validation';
import type { Container } from '../../infrastructure/container.js';
import { Errors } from '../../lib/errors.js';
import { energyTarget } from './energy-target.js';
import { patientsRepository } from './patients.repository.js';

type PatientRow = NonNullable<Awaited<ReturnType<typeof patientsRepository.findById>>>;
const toDto = (p: PatientRow): PatientDto => ({
  id: p.id, tenantId: p.tenantId, firstName: p.firstName, lastName: p.lastName, email: p.email, createdAt: p.createdAt.toISOString(),
});

type ProfileRow = NonNullable<Awaited<ReturnType<typeof patientsRepository.findProfile>>>;
const toProfileDto = (p: ProfileRow, dateOfBirth: Date): PatientProfileDto => {
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
    energyTarget: energyTarget({ ...p, dateOfBirth: isoDateOfBirth }),
    updatedAt: p.updatedAt.toISOString(),
  };
};

export function createPatientsService(c: Container) {
  const scoped = async <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) =>
    withTenant(c.db, await c.registry.getPlacement(ctx.tenantId), fn);

  return {
    list: (ctx: TenantContext) => scoped(ctx, async (tx) => ({ items: (await patientsRepository.list(tx, ctx.tenantId)).map(toDto) })),

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
    myProfile: (ctx: TenantContext): Promise<PatientProfileResponse> =>
      scoped(ctx, async (tx) => {
        const p = await patientsRepository.findByUserId(tx, ctx.tenantId, ctx.userId);
        if (!p) throw Errors.notFound('Patient');
        const profile = await patientsRepository.findProfile(tx, ctx.tenantId, p.id);
        // A profile always gets a birth date with it (saveProfile), so the guard only satisfies the types.
        return { profile: profile && p.dateOfBirth ? toProfileDto(profile, p.dateOfBirth) : null };
      }),

    saveMyProfile: (ctx: TenantContext, input: PatientProfile): Promise<PatientProfileResponse> =>
      scoped(ctx, async (tx) => {
        const p = await patientsRepository.findByUserId(tx, ctx.tenantId, ctx.userId);
        if (!p) throw Errors.notFound('Patient');
        if ((await patientsRepository.countFoods(tx, input.dislikedFoodIds)) !== input.dislikedFoodIds.length) {
          throw Errors.validation('dislikedFoodIds: unknown food');
        }
        const profile = await patientsRepository.saveProfile(tx, ctx.tenantId, p.id, input);
        // Health data: the audit row records that the profile changed, never the values.
        await writeAudit(tx, ctx, { action: 'PatientProfileSaved', resourceType: 'PatientProfile', resourceId: p.id });
        return { profile: toProfileDto(profile, new Date(input.dateOfBirth)) };
      }),

    /**
     * The patient deletes their own account. The app deletes the Cognito user afterwards
     * with the patient's own token; once this commits, that login resolves to no one.
     * TODO(week 7, see docs/roadmap/mvp-roadmap.md): cancel the patient's Stripe subscription.
     */
    deleteMyAccount: (ctx: TenantContext): Promise<void> =>
      scoped(ctx, async (tx) => {
        const p = await patientsRepository.findByUserId(tx, ctx.tenantId, ctx.userId);
        if (!p) throw Errors.notFound('Patient');
        await patientsRepository.deleteAccount(tx, ctx.tenantId, p.id, ctx.userId);
        await writeAudit(tx, ctx, { action: 'PatientDeleted', resourceType: 'Patient', resourceId: p.id });
      }),

    /**
     * What the meal plan generator needs from a patient: null when the patient doesn't exist
     * (or deleted their account) or hasn't finished onboarding. Takes a tenant id rather than
     * a TenantContext because the weekly job and the admin command run with no user signed in.
     */
    planningProfile: async (tenantId: string, patientId: string) =>
      withTenant(c.db, await c.registry.getPlacement(tenantId), async (tx) => {
        const p = await patientsRepository.findById(tx, tenantId, patientId);
        const profile = p && (await patientsRepository.findProfile(tx, tenantId, p.id));
        if (!profile || !p.dateOfBirth) return null;
        const dto = toProfileDto(profile, p.dateOfBirth);
        return { mealsPerDay: dto.mealsPerDay, allergies: dto.allergies, dislikedFoodIds: dto.dislikedFoods.map((f) => f.id), energyTarget: dto.energyTarget };
      }),

    create: (ctx: TenantContext, input: CreatePatientInput) =>
      scoped(ctx, async (tx) => {
        const p = await patientsRepository.create(tx, ctx.tenantId, input);
        await writeAudit(tx, ctx, { action: 'PatientCreated', resourceType: 'Patient', resourceId: p.id });
        return toDto(p);
      }),
  };
}
