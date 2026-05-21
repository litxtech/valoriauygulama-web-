-- PostgREST / Data API: ops şeması expose edildikten sonra REST rollerinin erişimi.
-- Dashboard: Data API → Settings → Exposed schemas → public + ops

BEGIN;

GRANT USAGE ON SCHEMA ops TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ops TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA ops TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA ops TO anon;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ops TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ops TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ops TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ops
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ops
  GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ops
  GRANT EXECUTE ON FUNCTIONS TO service_role;

COMMIT;
