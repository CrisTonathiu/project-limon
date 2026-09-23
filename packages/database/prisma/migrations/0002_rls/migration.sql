-- ════════════════════════════════════════════════════════════════════════════
-- 0002_rls — Database-enforced tenant isolation
--
-- Model:
--  * The runtime role (limon_app) is NOT the table owner and has no BYPASSRLS,
--    so every query it runs is filtered by the policies below.
--  * The API sets the tenant per transaction:
--        SELECT set_config('app.tenant_id', '<uuid>', true);   -- true = tx-local
--    (see packages/database/src/tenant-client.ts). If it is not set, the
--    policies match NOTHING — failure mode is "no data", never "all data".
--  * Pre-tenant lookups (auth identity, app-key → tenant) go through narrow
--    SECURITY DEFINER functions instead of broad bypass.
--  * Platform-admin cross-tenant access will use a separate role with
--    BYPASSRLS on a separate connection (deferred; not granted to the API).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app_current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

-- ── Standard tenant-owned tables ────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_brandings','tenant_apps','tenant_lifecycle_events',
    'nutritionists','patients','recipes','foods','meal_plans','protocols',
    'conversations','messages',
    'platform_subscriptions','patient_subscriptions','payments','payment_transactions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id())', t);
  END LOOP;
END $$;

-- ── tenants: a tenant session can only see / create its own row ─────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON tenants
  USING (id = app_current_tenant_id())
  WITH CHECK (id = app_current_tenant_id());

-- ── users: tenant users only (platform admins, tenant_id NULL, are invisible) ─
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── audit_logs: tenant-scoped, append-only ──────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── Pre-tenant resolution functions (SECURITY DEFINER, minimal output) ──────

-- Auth: Cognito sub → application identity. Called before tenant context exists.
CREATE OR REPLACE FUNCTION app_resolve_identity(p_cognito_sub text)
RETURNS TABLE (user_id uuid, tenant_id uuid, role "UserRole", user_status "UserStatus", tenant_status "TenantStatus", email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT u.id, u.tenant_id, u.role, u.status, t.status, u.email
  FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
  WHERE u.cognito_user_id = p_cognito_sub AND u.deleted_at IS NULL
$$;

-- Public app bootstrap: build-time app key → tenant + runtime branding.
-- Returns only non-sensitive, already-public branding data.
CREATE OR REPLACE FUNCTION app_resolve_tenant_app(p_app_key text)
RETURNS TABLE (tenant_id uuid, tenant_status "TenantStatus", app_status "TenantAppStatus",
               app_name text, logo_key text, primary_color text, secondary_color text, support_email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.tenant_id, t.status, a.status,
         COALESCE(b.app_name, a.app_name), b.logo_key, COALESCE(b.primary_color, '#2E7D32'),
         b.secondary_color, b.support_email
  FROM tenant_apps a
  JOIN tenants t ON t.id = a.tenant_id
  LEFT JOIN tenant_brandings b ON b.tenant_id = a.tenant_id
  WHERE a.app_key = p_app_key
$$;

REVOKE ALL ON FUNCTION app_resolve_identity(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_resolve_tenant_app(text) FROM PUBLIC;

-- ── Grants for the runtime role (if present in this environment) ────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    GRANT USAGE ON SCHEMA public TO limon_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO limon_app;
    -- Append-only records
    REVOKE UPDATE, DELETE ON audit_logs, tenant_lifecycle_events FROM limon_app;
    -- Tenants are never hard-deleted by the application
    REVOKE DELETE ON tenants FROM limon_app;
    GRANT EXECUTE ON FUNCTION app_current_tenant_id() TO limon_app;
    GRANT EXECUTE ON FUNCTION app_resolve_identity(text) TO limon_app;
    GRANT EXECUTE ON FUNCTION app_resolve_tenant_app(text) TO limon_app;
  END IF;
END $$;
