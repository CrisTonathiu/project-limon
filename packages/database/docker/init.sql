-- Local only. In AWS these roles are created by the migration bootstrap using Secrets Manager credentials.
-- limon_owner  : owns schema, runs migrations (container superuser locally).
-- limon_app    : runtime role used by API/workers. NOT owner, NOT BYPASSRLS → RLS always applies.
CREATE ROLE limon_app LOGIN PASSWORD 'limon_app' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE limon TO limon_app;
GRANT USAGE ON SCHEMA public TO limon_app;
ALTER DEFAULT PRIVILEGES FOR ROLE limon_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO limon_app;
ALTER DEFAULT PRIVILEGES FOR ROLE limon_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO limon_app;
