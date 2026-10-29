-- Nutritionist logins created by the team (`admin create-tenant`) start with a temporary
-- password and must choose their own before anything else (admin dashboard roadmap, 6.2).
ALTER TABLE "users" ADD COLUMN "password_change_required" BOOLEAN NOT NULL DEFAULT false;

-- app_resolve_identity also returns the flag, so the API checks it on every request. The
-- return type changes, so the function is dropped and created again (same body otherwise).
DROP FUNCTION app_resolve_identity(text);
CREATE FUNCTION app_resolve_identity(p_auth_user_id text)
RETURNS TABLE (user_id uuid, tenant_id uuid, role "UserRole", user_status "UserStatus", tenant_status "TenantStatus",
               email text, identity_tenant_id text, password_change_required boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT u.id, u.tenant_id, u.role, u.status, t.status, u.email, t.identity_tenant_id, u.password_change_required
  FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
  WHERE u.auth_user_id = p_auth_user_id AND u.deleted_at IS NULL
$$;
REVOKE ALL ON FUNCTION app_resolve_identity(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    GRANT EXECUTE ON FUNCTION app_resolve_identity(text) TO limon_app;
  END IF;
END $$;
