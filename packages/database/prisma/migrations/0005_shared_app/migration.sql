-- CreateTable
CREATE TABLE "platform_apps" (
    "id" UUID NOT NULL,
    "platform" "AppPlatform" NOT NULL,
    "app_key" TEXT NOT NULL,
    "app_name" TEXT NOT NULL,
    "bundle_id" TEXT,
    "package_name" TEXT,
    "status" "TenantAppStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_invite_codes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_apps_app_key_key" ON "platform_apps"("app_key");

-- CreateIndex
CREATE UNIQUE INDEX "platform_apps_bundle_id_key" ON "platform_apps"("bundle_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_apps_package_name_key" ON "platform_apps"("package_name");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_invite_codes_code_key" ON "tenant_invite_codes"("code");

-- CreateIndex
CREATE INDEX "tenant_invite_codes_tenant_id_idx" ON "tenant_invite_codes"("tenant_id");

-- AddForeignKey
ALTER TABLE "tenant_invite_codes" ADD CONSTRAINT "tenant_invite_codes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- Shared (platform) app + invite codes. Same RLS model as 0002_rls.
--
--  * platform_apps is not tenant-owned. The runtime role gets NO table access;
--    it is read only through app_resolve_app().
--  * tenant_invite_codes is tenant-owned (a tenant manages its own codes), but a
--    patient looks a code up BEFORE any tenant context exists, so that lookup goes
--    through app_resolve_invite_code(): exact match only, never a listing.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE platform_apps ENABLE ROW LEVEL SECURITY;  -- no policy: invisible to limon_app

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_invite_codes'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id())', t);
  END LOOP;
END $$;

-- App key → which app is calling. Replaces app_resolve_tenant_app():
--   kind = 'TENANT' → a tenant's own branded app (tenant_id + that tenant's branding)
--   kind = 'SHARED' → the platform app (tenant_id NULL, platform branding)
DROP FUNCTION IF EXISTS app_resolve_tenant_app(text);

CREATE OR REPLACE FUNCTION app_resolve_app(p_app_key text)
RETURNS TABLE (kind text, tenant_id uuid, tenant_status "TenantStatus", app_status "TenantAppStatus",
               app_name text, logo_key text, primary_color text, secondary_color text, support_email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 'TENANT', a.tenant_id, t.status, a.status,
         COALESCE(b.app_name, a.app_name), b.logo_key, COALESCE(b.primary_color, '#2E7D32'),
         b.secondary_color, b.support_email
  FROM tenant_apps a
  JOIN tenants t ON t.id = a.tenant_id
  LEFT JOIN tenant_brandings b ON b.tenant_id = a.tenant_id
  WHERE a.app_key = p_app_key
  UNION ALL
  SELECT 'SHARED', NULL, NULL, p.status,
         p.app_name, NULL, '#2E7D32', NULL, NULL
  FROM platform_apps p
  WHERE p.app_key = p_app_key
$$;

-- Invite code → tenant + public branding. Only active, unexpired codes resolve.
-- Timestamps are stored as UTC without time zone (Prisma), hence the AT TIME ZONE.
CREATE OR REPLACE FUNCTION app_resolve_invite_code(p_code text)
RETURNS TABLE (tenant_id uuid, tenant_status "TenantStatus", app_name text, logo_key text,
               primary_color text, secondary_color text, support_email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.tenant_id, t.status, COALESCE(b.app_name, t.name), b.logo_key,
         COALESCE(b.primary_color, '#2E7D32'), b.secondary_color, b.support_email
  FROM tenant_invite_codes c
  JOIN tenants t ON t.id = c.tenant_id
  LEFT JOIN tenant_brandings b ON b.tenant_id = c.tenant_id
  WHERE c.code = upper(btrim(p_code))
    AND c.active
    AND (c.expires_at IS NULL OR c.expires_at > (now() AT TIME ZONE 'UTC'))
    AND t.deleted_at IS NULL
$$;

REVOKE ALL ON FUNCTION app_resolve_app(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_resolve_invite_code(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_invite_codes TO limon_app;
    REVOKE ALL ON platform_apps FROM limon_app;
    GRANT EXECUTE ON FUNCTION app_resolve_app(text) TO limon_app;
    GRANT EXECUTE ON FUNCTION app_resolve_invite_code(text) TO limon_app;
  END IF;
END $$;
