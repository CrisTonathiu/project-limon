-- ════════════════════════════════════════════════════════════════════════════
-- 0006_admission_modes — every tenant ships its own branded app (ADR-009), so the
-- shared platform app from 0005 goes away. Replaces it with:
--  * tenant_features: per-tenant feature flags. `invite_only` decides admission:
--      off → OPEN: anyone with the tenant's app can sign up;
--      on  → INVITE_ONLY: sign-up needs a code issued to that specific patient.
--  * tenant_invite_codes becomes per-patient and single-use.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS app_resolve_app(text);
DROP FUNCTION IF EXISTS app_resolve_invite_code(text);

-- 0005 codes were tenant-wide and only ever seeded for local development; they have
-- no patient to belong to.
DELETE FROM tenant_invite_codes;

-- DropIndex
DROP INDEX "tenant_invite_codes_tenant_id_idx";

-- AlterTable
ALTER TABLE "tenant_invite_codes" ADD COLUMN     "patient_id" UUID NOT NULL,
ADD COLUMN     "redeemed_at" TIMESTAMP(3);

-- DropTable
DROP TABLE "platform_apps";

-- CreateTable
CREATE TABLE "tenant_features" (
    "tenant_id" UUID NOT NULL,
    "feature_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_features_pkey" PRIMARY KEY ("tenant_id","feature_key")
);

-- CreateIndex
CREATE INDEX "tenant_invite_codes_tenant_id_patient_id_idx" ON "tenant_invite_codes"("tenant_id", "patient_id");

-- AddForeignKey
ALTER TABLE "tenant_features" ADD CONSTRAINT "tenant_features_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invite_codes" ADD CONSTRAINT "tenant_invite_codes_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── RLS (same model as 0002_rls) ────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_features'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id())', t);
  END LOOP;
END $$;

-- ── Pre-tenant lookups (SECURITY DEFINER, minimal output) ──────────────────

-- Public app bootstrap: build-time app key → tenant + runtime branding + admission mode.
CREATE OR REPLACE FUNCTION app_resolve_tenant_app(p_app_key text)
RETURNS TABLE (tenant_id uuid, tenant_status "TenantStatus", app_status "TenantAppStatus",
               app_name text, logo_key text, primary_color text, secondary_color text, support_email text,
               invite_only boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.tenant_id, t.status, a.status,
         COALESCE(b.app_name, a.app_name), b.logo_key, COALESCE(b.primary_color, '#2E7D32'),
         b.secondary_color, b.support_email,
         COALESCE(f.enabled, false)
  FROM tenant_apps a
  JOIN tenants t ON t.id = a.tenant_id
  LEFT JOIN tenant_brandings b ON b.tenant_id = a.tenant_id
  LEFT JOIN tenant_features f ON f.tenant_id = a.tenant_id AND f.feature_key = 'invite_only'
  WHERE a.app_key = p_app_key
$$;

-- Before sign-up: is this an unused, unexpired code of THIS tenant? Yes/no only —
-- nothing about the patient it belongs to is revealed.
-- Timestamps are stored as UTC without time zone (Prisma), hence the AT TIME ZONE.
CREATE OR REPLACE FUNCTION app_invite_code_is_valid(p_tenant_id uuid, p_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_invite_codes c
    WHERE c.tenant_id = p_tenant_id
      AND c.code = upper(btrim(p_code))
      AND c.active
      AND c.redeemed_at IS NULL
      AND (c.expires_at IS NULL OR c.expires_at > (now() AT TIME ZONE 'UTC'))
  )
$$;

REVOKE ALL ON FUNCTION app_resolve_tenant_app(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_invite_code_is_valid(uuid, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_features TO limon_app;
    GRANT EXECUTE ON FUNCTION app_resolve_tenant_app(text) TO limon_app;
    GRANT EXECUTE ON FUNCTION app_invite_code_is_valid(uuid, text) TO limon_app;
  END IF;
END $$;
