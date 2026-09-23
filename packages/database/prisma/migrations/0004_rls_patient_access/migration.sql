-- RLS for tables added in 0003. Same model as 0002_rls.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_store_accounts','patient_consents'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id())', t);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO limon_app;
    REVOKE UPDATE, DELETE ON audit_logs, tenant_lifecycle_events FROM limon_app;
    -- Consent is a legal record: the application may add and revoke, never delete.
    REVOKE DELETE ON patient_consents FROM limon_app;
    REVOKE DELETE ON tenants FROM limon_app;
  END IF;
END $$;
