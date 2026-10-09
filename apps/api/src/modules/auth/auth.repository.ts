import type { TenantTx } from '@limon/database';

export const authRepository = {
  createTenantGraph(
    tx: TenantTx,
    data: {
      tenantId: string; authUserId: string; identityTenantId: string | null;
      email: string; firstName: string; lastName: string; businessName: string; slug: string;
    },
  ) {
    return (async () => {
      const tenant = await tx.tenant.create({
        data: { id: data.tenantId, name: data.businessName, slug: data.slug, status: 'TRIAL', identityTenantId: data.identityTenantId },
      });
      await tx.tenantBranding.create({ data: { tenantId: tenant.id, appName: data.businessName } });
      const user = await tx.user.create({
        data: { tenantId: tenant.id, authUserId: data.authUserId, email: data.email, role: 'NUTRITIONIST' },
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
   * Marks an invite code as used and returns the pre-registered patient it activates,
   * or null if the code is unknown, inactive, expired or already used. The conditional
   * update makes redemption single-use even under concurrent sign-ups.
   */
  async redeemInviteCode(tx: TenantTx, tenantId: string, code: string): Promise<string | null> {
    const now = new Date();
    const invite = await tx.tenantInviteCode.findFirst({
      where: { tenantId, code, active: true, redeemedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { id: true, patientId: true },
    });
    if (!invite) return null;
    const claimed = await tx.tenantInviteCode.updateMany({ where: { id: invite.id, redeemedAt: null }, data: { redeemedAt: now } });
    return claimed.count === 1 ? invite.patientId : null;
  },

  /**
   * Patient self-signup.
   * - With an invite (`invitedPatientId`): activates the patient the nutritionist
   *   pre-registered, with the name and email the patient entered. Returns null if that
   *   patient is gone or already has an account.
   * - Without: if the nutritionist pre-created the patient with the same email, that
   *   record is claimed instead of creating a duplicate — the patient keeps any history
   *   the nutritionist already entered.
   */
  async createPatientAccount(
    tx: TenantTx,
    data: {
      tenantId: string;
      authUserId: string;
      email: string;
      firstName: string;
      lastName: string;
      dateOfBirth?: string;
      invitedPatientId?: string;
      consents: { kind: 'PRIVACY_NOTICE' | 'SENSITIVE_DATA' | 'TERMS_OF_SERVICE'; documentVersion: string }[];
    },
  ) {
    const existing = data.invitedPatientId
      ? await tx.patient.findFirst({ where: { tenantId: data.tenantId, id: data.invitedPatientId, userId: null, deletedAt: null } })
      : await tx.patient.findFirst({ where: { tenantId: data.tenantId, email: data.email, userId: null, deletedAt: null } });
    if (data.invitedPatientId && !existing) return null;

    const user = await tx.user.create({
      data: { tenantId: data.tenantId, authUserId: data.authUserId, email: data.email, role: 'PATIENT' },
    });
    const patient = existing
      ? await tx.patient.update({
          where: { id: existing.id },
          data: data.invitedPatientId
            ? {
                userId: user.id,
                email: data.email,
                firstName: data.firstName,
                lastName: data.lastName,
                ...(data.dateOfBirth ? { dateOfBirth: new Date(data.dateOfBirth) } : {}),
              }
            : { userId: user.id },
        })
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
