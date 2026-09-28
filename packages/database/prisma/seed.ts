/**
 * Local development seed: two tenants so isolation is visible from day one.
 * Runs as the owner role (DATABASE_MIGRATION_URL), which is not subject to RLS.
 */
import { PrismaClient } from '../generated/client/index.js';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_MIGRATION_URL! } } });

const tenants = [
  // Maria is OPEN (anyone with her app can sign up); Carlos is INVITE ONLY.
  { id: '11111111-1111-4111-8111-111111111111', slug: 'maria-nutrition', name: 'Maria Nutrition', color: '#2E7D32', inviteOnly: false, inviteCode: 'MARIA-DEV1' },
  { id: '22222222-2222-4222-8222-222222222222', slug: 'carlos-nutrition', name: 'Carlos Nutrition', color: '#1565C0', inviteOnly: true, inviteCode: 'CARLOS-DEV1' },
];

async function main() {
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
    await prisma.tenantFeature.upsert({
      where: { tenantId_featureKey: { tenantId: t.id, featureKey: 'invite_only' } },
      update: { enabled: t.inviteOnly },
      create: { tenantId: t.id, featureKey: 'invite_only', enabled: t.inviteOnly },
    });
    // A patient the nutritionist pre-registered, with their single-use invite code.
    // Fixed, guessable codes are for local development only; real ones come from `pnpm admin invite`.
    // Re-seeding makes the code usable again unless the patient already signed up.
    const invited = await prisma.patient.upsert({
      where: { tenantId_email: { tenantId: t.id, email: `invitada@${t.slug}.test` } },
      update: {},
      create: { tenantId: t.id, firstName: 'Invitada', lastName: 'Demo', email: `invitada@${t.slug}.test` },
    });
    await prisma.tenantInviteCode.upsert({
      where: { code: t.inviteCode },
      update: invited.userId ? {} : { active: true, redeemedAt: null, expiresAt: null },
      create: { tenantId: t.id, patientId: invited.id, code: t.inviteCode },
    });
  }
  for (const t of tenants) {
    console.log(`Seeded ${t.slug}: ${t.inviteOnly ? 'INVITE ONLY' : 'OPEN'}, invite code ${t.inviteCode}`);
  }
}

main().finally(() => prisma.$disconnect());
