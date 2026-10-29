import { writeAudit } from './audit.js';
import { copyDefaultRecipes } from './recipes.js';
import type { TenantTx } from './tenant-client.js';

export type CreatePracticeData = {
  tenantId: string;
  /** The owner's project-level Identity Platform uid (a `dev|…` subject with dev auth). */
  authUserId: string;
  /** Where the practice's patients sign in; null with dev auth. */
  identityTenantId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  businessName: string;
  slug: string;
  passwordChangeRequired: boolean;
  requestId: string;
};

/**
 * A new practice: Tenant + TenantBranding + owner User and Nutritionist + one TenantApp per
 * store, its own copy of the default recipe library, and the audit entries, all in the
 * caller's transaction — a nutritionist never exists without a tenant. Only the platform
 * team creates practices (`admin create-tenant`); nutritionists don't sign up themselves.
 */
export async function createPractice(tx: TenantTx, data: CreatePracticeData) {
  const tenant = await tx.tenant.create({
    data: { id: data.tenantId, name: data.businessName, slug: data.slug, status: 'TRIAL', identityTenantId: data.identityTenantId },
  });
  await tx.tenantBranding.create({ data: { tenantId: tenant.id, appName: data.businessName } });
  const user = await tx.user.create({
    data: {
      tenantId: tenant.id, authUserId: data.authUserId, email: data.email, role: 'NUTRITIONIST',
      passwordChangeRequired: data.passwordChangeRequired,
    },
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

  // No signed-in user started this: the platform team did.
  const ctx = { tenantId: tenant.id, userId: null, requestId: data.requestId };
  await writeAudit(tx, ctx, { action: 'TenantCreated', resourceType: 'Tenant', resourceId: tenant.id });
  await writeAudit(tx, ctx, {
    action: 'NutritionistRegistered', resourceType: 'Nutritionist', resourceId: nutritionist.id,
    metadata: { passwordChangeRequired: data.passwordChangeRequired },
  });
  const recipesCopied = await copyDefaultRecipes(tx, tenant.id);
  await writeAudit(tx, ctx, { action: 'DefaultRecipesCopied', resourceType: 'Tenant', resourceId: tenant.id, metadata: { recipesCopied } });
  return { tenant, user, nutritionist, apps, recipesCopied };
}
