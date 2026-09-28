/**
 * Local development seed: two tenants so isolation is visible from day one.
 * Runs as the owner role (DATABASE_MIGRATION_URL), which is not subject to RLS.
 */
import { PrismaClient } from '../generated/client/index.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_MIGRATION_URL! } } });

const tenants = [
  { id: '11111111-1111-4111-8111-111111111111', slug: 'maria-nutrition', name: 'Maria Nutrition', color: '#2E7D32', inviteCode: 'MARIA-DEV1' },
  { id: '22222222-2222-4222-8222-222222222222', slug: 'carlos-nutrition', name: 'Carlos Nutrition', color: '#1565C0', inviteCode: 'CARLOS-DEV1' },
];

async function main() {
  // The shared platform app (APP_TENANT=limon): patients of every tenant join it with an invite code.
  for (const platform of ['IOS', 'ANDROID'] as const) {
    const appKey = `limon-${platform.toLowerCase()}`;
    await prisma.platformApp.upsert({
      where: { appKey },
      update: {},
      create: {
        platform, appKey, appName: 'Limon', status: 'PUBLISHED',
        ...(platform === 'IOS' ? { bundleId: 'com.limon.app' } : { packageName: 'com.limon.app' }),
      },
    });
  }

  for (const t of tenants) {
    await prisma.tenant.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id, slug: t.slug, name: t.name, status: 'ACTIVE',
        branding: { create: { appName: t.name, primaryColor: t.color } },
        apps: {
          create: [
            { platform: 'IOS', appKey: `${t.slug}-ios`, appName: t.name, bundleId: `com.limon.${t.slug.replace(/-/g, '')}` },
            { platform: 'ANDROID', appKey: `${t.slug}-android`, appName: t.name, packageName: `com.limon.${t.slug.replace(/-/g, '')}` },
          ],
        },
      },
    });
    const user = await prisma.user.upsert({
      where: { cognitoUserId: `dev|nutritionist|${t.slug}` },
      update: {},
      create: { cognitoUserId: `dev|nutritionist|${t.slug}`, tenantId: t.id, email: `owner@${t.slug}.test`, role: 'NUTRITIONIST' },
    });
    await prisma.nutritionist.upsert({
      where: { userId: user.id },
      update: {},
      create: { tenantId: t.id, userId: user.id, firstName: t.name.split(' ')[0]!, lastName: 'Owner', isOwner: true },
    });
    const patientUser = await prisma.user.upsert({
      where: { cognitoUserId: `dev|patient|${t.slug}` },
      update: {},
      create: { cognitoUserId: `dev|patient|${t.slug}`, tenantId: t.id, email: `patient@${t.slug}.test`, role: 'PATIENT' },
    });
    await prisma.patient.upsert({
      where: { userId: patientUser.id },
      update: {},
      create: { tenantId: t.id, userId: patientUser.id, firstName: 'Demo', lastName: 'Patient', email: patientUser.email },
    });
    // Fixed, guessable codes are for local development only; real codes come from generateInviteCode().
    await prisma.tenantInviteCode.upsert({
      where: { code: t.inviteCode },
      update: {},
      create: { tenantId: t.id, code: t.inviteCode },
    });
  }
  console.log('Seeded tenants:', tenants.map((t) => `${t.slug} (invite ${t.inviteCode})`).join(', '));
  console.log('Seeded shared app keys: limon-ios, limon-android');
}

main().finally(() => prisma.$disconnect());
