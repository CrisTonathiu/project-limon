import type { TenantTx } from '@limon/database';

export const authRepository = {
  createTenantGraph(
    tx: TenantTx,
    data: { tenantId: string; cognitoUserId: string; email: string; firstName: string; lastName: string; businessName: string; slug: string },
  ) {
    return (async () => {
      const tenant = await tx.tenant.create({
        data: { id: data.tenantId, name: data.businessName, slug: data.slug, status: 'TRIAL' },
      });
      await tx.tenantBranding.create({ data: { tenantId: tenant.id, appName: data.businessName } });
      const user = await tx.user.create({
        data: { tenantId: tenant.id, cognitoUserId: data.cognitoUserId, email: data.email, role: 'NUTRITIONIST' },
      });
      const nutritionist = await tx.nutritionist.create({
        data: { tenantId: tenant.id, userId: user.id, firstName: data.firstName, lastName: data.lastName, isOwner: true },
      });
      // One TenantApp per store. appKey is public & opaque; bundle IDs are assigned at provisioning time.
      const apps = await Promise.all(
        (['IOS', 'ANDROID'] as const).map((platform) =>
          tx.tenantApp.create({
            data: { tenantId: tenant.id, platform, appName: data.businessName, appKey: `${data.slug}-${platform.toLowerCase()}-${tenant.id.slice(0, 8)}` },
          }),
        ),
      );
      return { tenant, user, nutritionist, apps };
    })();
  },

  /**
   * Patient self-signup. If the nutritionist pre-created the patient with the same
   * email, the existing record is claimed instead of creating a duplicate — the
   * patient keeps any history the nutritionist already entered.
   */
  async createPatientAccount(
    tx: TenantTx,
    data: {
      tenantId: string;
      cognitoUserId: string;
      email: string;
      firstName: string;
      lastName: string;
      dateOfBirth?: string;
      consents: { kind: 'PRIVACY_NOTICE' | 'SENSITIVE_DATA' | 'TERMS_OF_SERVICE'; documentVersion: string }[];
    },
  ) {
    const user = await tx.user.create({
      data: { tenantId: data.tenantId, cognitoUserId: data.cognitoUserId, email: data.email, role: 'PATIENT' },
    });
    const existing = await tx.patient.findFirst({
      where: { tenantId: data.tenantId, email: data.email, userId: null, deletedAt: null },
    });
    const patient = existing
      ? await tx.patient.update({ where: { id: existing.id }, data: { userId: user.id } })
      : await tx.patient.create({
          data: {
            tenantId: data.tenantId,
            userId: user.id,
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          },
        });
    await tx.patientConsent.createMany({
      data: data.consents.map((c) => ({ tenantId: data.tenantId, patientId: patient.id, kind: c.kind, documentVersion: c.documentVersion })),
    });
    return { user, patient };
  },

  findTenantSummary(tx: TenantTx, tenantId: string) {
    return tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true, status: true } });
  },
};
