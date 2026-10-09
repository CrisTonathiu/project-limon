-- Cognito → Identity Platform (docs/roadmap/gcp-migration.md, phase 4).
-- Each nutritionist's patients sign in through their own Identity Platform tenant (ADR-006).

-- The login's uid, whatever the provider: the token `sub`.
ALTER TABLE "users" RENAME COLUMN "cognito_user_id" TO "auth_user_id";
ALTER INDEX "users_cognito_user_id_key" RENAME TO "users_auth_user_id_key";

-- The practice's Identity Platform tenant. Null until provisioned (and always with dev auth).
ALTER TABLE "tenants" ADD COLUMN "identity_tenant_id" TEXT;
CREATE UNIQUE INDEX "tenants_identity_tenant_id_key" ON "tenants"("identity_tenant_id");

-- ── Pre-tenant lookups (SECURITY DEFINER, minimal output) ──────────────────
-- Both now also return the tenant's identity tenant, so the API can reject a token
-- issued by another practice's identity tenant. The return types change, hence DROP.

DROP FUNCTION IF EXISTS app_resolve_identity(text);
CREATE FUNCTION app_resolve_identity(p_auth_user_id text)
RETURNS TABLE (user_id uuid, tenant_id uuid, role "UserRole", user_status "UserStatus", tenant_status "TenantStatus",
               email text, identity_tenant_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT u.id, u.tenant_id, u.role, u.status, t.status, u.email, t.identity_tenant_id
  FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
  WHERE u.auth_user_id = p_auth_user_id AND u.deleted_at IS NULL
$$;

DROP FUNCTION IF EXISTS app_resolve_tenant_app(text);
CREATE FUNCTION app_resolve_tenant_app(p_app_key text)
RETURNS TABLE (tenant_id uuid, tenant_status "TenantStatus", app_status "TenantAppStatus",
               app_name text, logo_key text, primary_color text, secondary_color text, support_email text,
               invite_only boolean, identity_tenant_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.tenant_id, t.status, a.status,
         COALESCE(b.app_name, a.app_name), b.logo_key, COALESCE(b.primary_color, '#2E7D32'),
         b.secondary_color, b.support_email,
         COALESCE(f.enabled, false), t.identity_tenant_id
  FROM tenant_apps a
  JOIN tenants t ON t.id = a.tenant_id
  LEFT JOIN tenant_brandings b ON b.tenant_id = a.tenant_id
  LEFT JOIN tenant_features f ON f.tenant_id = a.tenant_id AND f.feature_key = 'invite_only'
  WHERE a.app_key = p_app_key
$$;

REVOKE ALL ON FUNCTION app_resolve_identity(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_resolve_tenant_app(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    GRANT EXECUTE ON FUNCTION app_resolve_identity(text) TO limon_app;
    GRANT EXECUTE ON FUNCTION app_resolve_tenant_app(text) TO limon_app;
  END IF;
END $$;
