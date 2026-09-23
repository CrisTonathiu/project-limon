import fs from 'node:fs';
import path from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import type { TenantBuildConfig } from './tenants/schema';

/**
 * One codebase → N store apps.
 *   APP_TENANT=maria-nutrition eas build --profile production
 * selects tenants/maria-nutrition/tenant.json and produces "Maria Nutrition"
 * with its own bundle id / package / icon / splash.
 *
 * Only BUILD-TIME identity lives here. Runtime branding comes from the API.
 */
const tenantSlug = process.env.APP_TENANT ?? 'dev-tenant';
const tenantDir = path.join(__dirname, 'tenants', tenantSlug);
const file = path.join(tenantDir, 'tenant.json');
if (!fs.existsSync(file)) throw new Error(`Unknown APP_TENANT "${tenantSlug}" (missing ${file})`);
const tenant = JSON.parse(fs.readFileSync(file, 'utf8')) as TenantBuildConfig;
const asset = (p: string) => path.join('tenants', tenantSlug, p);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: tenant.appName,
  slug: `limon-${tenant.slug}`,
  scheme: tenant.scheme,
  version: tenant.version,
  orientation: 'portrait',
  icon: asset(tenant.assets.icon),
  ios: { bundleIdentifier: tenant.ios.bundleIdentifier, buildNumber: String(tenant.buildNumber), supportsTablet: false },
  android: { package: tenant.android.package, versionCode: tenant.buildNumber },
  plugins: [
    'expo-secure-store',
    'expo-status-bar',
    ['expo-splash-screen', { image: asset(tenant.assets.splash), imageWidth: 200, resizeMode: 'contain', backgroundColor: tenant.splashBackgroundColor }],
  ],
  extra: {
    // Exposed to JS via expo-constants. Public values only.
    tenantSlug: tenant.slug,
    tenantId: tenant.tenantId,
    appKeys: tenant.appKeys,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000',
    ...(tenant.easProjectId ? { eas: { projectId: tenant.easProjectId } } : {}),
  },
});
