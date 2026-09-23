import type { UserRole } from '@limon/types';

/**
 * Role → permission policy. Authorization checks ask for a permission, never a role,
 * so new roles (e.g. ASSISTANT, CLINIC_ADMIN) are added here without touching handlers.
 */
export const Permission = {
  TENANT_READ: 'tenant:read',
  TENANT_MANAGE: 'tenant:manage',
  BRANDING_MANAGE: 'branding:manage',
  APPS_MANAGE: 'apps:manage',
  PATIENTS_READ: 'patients:read',
  PATIENTS_WRITE: 'patients:write',
  SELF_PATIENT_READ: 'self:patient:read',
  RECIPES_READ: 'recipes:read',
  RECIPES_WRITE: 'recipes:write',
  MEAL_PLANS_WRITE: 'meal-plans:write',
  SELF_MEAL_PLANS_READ: 'self:meal-plans:read',
  AI_CHAT: 'ai:chat',
  SELF_SUBSCRIPTION_READ: 'self:subscription:read',
  PLATFORM_TENANTS_MANAGE: 'platform:tenants:manage',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const P = Permission;

const policy: Record<UserRole, ReadonlySet<Permission>> = {
  PLATFORM_ADMIN: new Set([P.PLATFORM_TENANTS_MANAGE]),
  NUTRITIONIST: new Set([
    P.TENANT_READ, P.TENANT_MANAGE, P.BRANDING_MANAGE, P.APPS_MANAGE,
    P.PATIENTS_READ, P.PATIENTS_WRITE, P.RECIPES_READ, P.RECIPES_WRITE, P.MEAL_PLANS_WRITE,
  ]),
  PATIENT: new Set([P.TENANT_READ, P.SELF_PATIENT_READ, P.SELF_SUBSCRIPTION_READ, P.RECIPES_READ, P.SELF_MEAL_PLANS_READ, P.AI_CHAT]),
};

/** Permissions that mutate state; blocked when the tenant is READ_ONLY (suspended). */
export const WRITE_PERMISSIONS: ReadonlySet<Permission> = new Set([
  P.TENANT_MANAGE, P.BRANDING_MANAGE, P.APPS_MANAGE, P.PATIENTS_WRITE, P.RECIPES_WRITE, P.MEAL_PLANS_WRITE, P.AI_CHAT,
]);

/**
 * Permissions a PATIENT may only use with an active paid subscription.
 * Deliberately excludes profile and subscription access, so an unpaid patient can
 * still sign in, see the paywall and manage/restore their purchase.
 */
export const ENTITLED_PERMISSIONS: ReadonlySet<Permission> = new Set([
  P.RECIPES_READ, P.SELF_MEAL_PLANS_READ, P.AI_CHAT,
]);

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return policy[role].has(permission);
}
