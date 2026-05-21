-- MRZ/KBS tarama: authenticated kullanıcıların ops.guest_scan_* tablolarına yazması (RLS ile sınırlı).
-- Önkoşul: Dashboard → Data API → Exposed schemas → public + ops (yoksa REST 406 PGRST106).

BEGIN;

GRANT INSERT, UPDATE, DELETE ON ops.guest_scan_sessions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON ops.guest_scan_items TO authenticated;
GRANT INSERT ON ops.kbs_submission_logs TO authenticated;

COMMIT;
