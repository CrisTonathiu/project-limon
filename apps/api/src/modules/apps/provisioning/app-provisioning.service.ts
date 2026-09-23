/**
 * App Provisioning Service — ARCHITECTURAL BOUNDARY ONLY (not implemented).
 * See docs/architecture/mobile-white-label.md.
 *
 * Responsibilities (future):
 *  - Create tenant app configuration (TenantApp rows — done at signup today)
 *  - Generate build configuration  → apps/patient/tenants/<slug>/app.json
 *  - Generate branding assets      → icon/splash from tenants/{id}/branding/ in S3
 *  - Trigger mobile build          → EAS Build / GitHub Actions (mobile-build workflow)
 *  - Track build status            → TenantApp.status BUILDING
 *  - Track App Store submission    → SUBMITTED (App Store Connect API)
 *  - Track Google Play submission  → SUBMITTED (Play Developer API)
 *  - Track published version       → PUBLISHED + version/buildNumber
 *
 * Status transitions of TenantApp are INDEPENDENT of Tenant.status.
 */
import type { TenantContext } from '@limon/tenant';
import type { AppPlatform } from '@limon/types';

export type BuildConfiguration = {
  tenantId: string;
  appKey: string;
  platform: AppPlatform;
  appName: string;
  bundleId?: string;
  packageName?: string;
  iconKey: string;
  splashKey: string;
  version: string;
  buildNumber: number;
};

export interface AppProvisioningService {
  generateBuildConfiguration(ctx: TenantContext, tenantAppId: string): Promise<BuildConfiguration>;
  triggerBuild(ctx: TenantContext, tenantAppId: string): Promise<{ buildId: string }>;
  recordBuildStatus(tenantAppId: string, status: 'BUILDING' | 'SUBMITTED' | 'PUBLISHED' | 'DISABLED' | 'REMOVED', details?: { version?: string; buildNumber?: number }): Promise<void>;
}

export function createAppProvisioningService(): AppProvisioningService {
  const notYet = () => {
    throw new Error('App provisioning is not implemented in the foundation phase');
  };
  return { generateBuildConfiguration: notYet, triggerBuild: notYet, recordBuildStatus: notYet };
}
