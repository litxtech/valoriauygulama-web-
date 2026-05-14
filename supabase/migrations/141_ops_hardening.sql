-- OPS hardening: enforce idempotency + block client writes via RLS
-- Goal:
-- - Add unique/partial indexes required by backend idempotency (idempotent upsert + single active stay).
-- - Tighten RLS: authenticated clients can read scoped data, but cannot write ops core tables.
--   Writes are expected via backend using service_role (RLS-bypass) only.

BEGIN;

-- ========== IDENTITY / IDEMPOTENCY INDEXES ==========

-- guest_documents: prevent duplicates per hotel for same document identity when document_number exists.
-- Allow multiple null/blank document_number rows (draft scans).
CREATE UNIQUE INDEX IF NOT EXISTS ops_guest_documents_identity_uidx
  ON ops.guest_documents (hotel_id, document_type, lower(btrim(document_number)))
  WHERE document_number IS NOT NULL AND btrim(document_number) <> '';

-- stay_assignments: a guest can have at most one active stay in a hotel.
CREATE UNIQUE INDEX IF NOT EXISTS ops_stay_assignments_one_active_uidx
  ON ops.stay_assignments (hotel_id, guest_id)
  WHERE stay_status IN ('assigned', 'checked_in', 'checkout_pending');

-- jobs: optional de-dup guard for same payload (best-effort); keep it light.
CREATE INDEX IF NOT EXISTS ops_jobs_status_locked_idx
  ON ops.jobs (status, locked_at);

-- ========== RLS: BLOCK WRITES FOR AUTHENTICATED ==========

-- arrival_groups: allow SELECT only; block all mutations from authenticated clients.
DROP POLICY IF EXISTS "ops_arrival_groups_insert" ON ops.arrival_groups;
DROP POLICY IF EXISTS "ops_arrival_groups_update" ON ops.arrival_groups;
DROP POLICY IF EXISTS "ops_arrival_groups_delete" ON ops.arrival_groups;
DROP POLICY IF EXISTS "ops_arrival_groups_deny_write" ON ops.arrival_groups;
CREATE POLICY "ops_arrival_groups_deny_write" ON ops.arrival_groups
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- guests
DROP POLICY IF EXISTS "ops_guests_insert" ON ops.guests;
DROP POLICY IF EXISTS "ops_guests_update" ON ops.guests;
DROP POLICY IF EXISTS "ops_guests_delete" ON ops.guests;
DROP POLICY IF EXISTS "ops_guests_deny_write" ON ops.guests;
CREATE POLICY "ops_guests_deny_write" ON ops.guests
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- guest_documents
DROP POLICY IF EXISTS "ops_guest_documents_insert" ON ops.guest_documents;
DROP POLICY IF EXISTS "ops_guest_documents_update" ON ops.guest_documents;
DROP POLICY IF EXISTS "ops_guest_documents_delete" ON ops.guest_documents;
DROP POLICY IF EXISTS "ops_guest_documents_deny_write" ON ops.guest_documents;
CREATE POLICY "ops_guest_documents_deny_write" ON ops.guest_documents
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- stay_assignments
DROP POLICY IF EXISTS "ops_stay_assignments_insert" ON ops.stay_assignments;
DROP POLICY IF EXISTS "ops_stay_assignments_update" ON ops.stay_assignments;
DROP POLICY IF EXISTS "ops_stay_assignments_delete" ON ops.stay_assignments;
DROP POLICY IF EXISTS "ops_stay_assignments_deny_write" ON ops.stay_assignments;
CREATE POLICY "ops_stay_assignments_deny_write" ON ops.stay_assignments
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- official_submission_transactions: keep SELECT policy (permission-based), block mutations
DROP POLICY IF EXISTS "ops_official_tx_insert" ON ops.official_submission_transactions;
DROP POLICY IF EXISTS "ops_official_tx_update" ON ops.official_submission_transactions;
DROP POLICY IF EXISTS "ops_official_tx_delete" ON ops.official_submission_transactions;
DROP POLICY IF EXISTS "ops_official_tx_deny_write" ON ops.official_submission_transactions;
CREATE POLICY "ops_official_tx_deny_write" ON ops.official_submission_transactions
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- audit_logs: allow SELECT (permission-based) but block client inserts; backend will write.
DROP POLICY IF EXISTS "ops_audit_logs_insert" ON ops.audit_logs;
DROP POLICY IF EXISTS "ops_audit_logs_update" ON ops.audit_logs;
DROP POLICY IF EXISTS "ops_audit_logs_delete" ON ops.audit_logs;
DROP POLICY IF EXISTS "ops_audit_logs_deny_write" ON ops.audit_logs;
CREATE POLICY "ops_audit_logs_deny_write" ON ops.audit_logs
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- rooms: remove admin client writes; keep SELECT only.
DROP POLICY IF EXISTS "ops_rooms_admin_write" ON ops.rooms;
DROP POLICY IF EXISTS "ops_rooms_deny_write" ON ops.rooms;
CREATE POLICY "ops_rooms_deny_write" ON ops.rooms
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- jobs: already blocked by policy in 140, keep as-is.

COMMIT;

