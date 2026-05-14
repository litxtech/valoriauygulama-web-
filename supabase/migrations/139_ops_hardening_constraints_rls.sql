-- OPS hardening: data integrity + stricter RLS for production
-- Goal: under load, system may slow down but must not corrupt data or allow client-side writes bypassing business rules.

BEGIN;

-- ========== DATA INTEGRITY ==========

-- Prevent duplicate documents per hotel when document_number is present.
-- NOTE: document_number can be NULL (e.g., failed scan), so partial unique is required.
DROP INDEX IF EXISTS ops.ops_guest_documents_hotel_doc_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS ops_guest_documents_hotel_doc_uidx
  ON ops.guest_documents (hotel_id, document_type, issuing_country_code, document_number)
  WHERE document_number IS NOT NULL AND btrim(document_number) <> '';

-- One active stay per guest (assigned/checked_in/checkout_pending) per hotel.
DROP INDEX IF EXISTS ops.ops_stay_assignments_one_active_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS ops_stay_assignments_one_active_uidx
  ON ops.stay_assignments (hotel_id, guest_id)
  WHERE stay_status IN ('assigned','checked_in','checkout_pending');

-- Query performance indexes
CREATE INDEX IF NOT EXISTS ops_guest_documents_hotel_status_updated_idx
  ON ops.guest_documents (hotel_id, scan_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS ops_stay_assignments_hotel_room_status_idx
  ON ops.stay_assignments (hotel_id, room_id, stay_status);

CREATE INDEX IF NOT EXISTS ops_official_tx_hotel_status_created_idx
  ON ops.official_submission_transactions (hotel_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ops_audit_logs_hotel_action_created_idx
  ON ops.audit_logs (hotel_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS ops_audit_logs_hotel_entity_idx
  ON ops.audit_logs (hotel_id, entity_type, entity_id);

-- ========== RLS HARDENING ==========
-- We intentionally disallow direct client INSERT/UPDATE/DELETE to ops operational tables.
-- Writes must go through the KBS ops gateway (service_role) where permission + validation + audit are enforced.
-- Service-role bypasses RLS, so this does not block backend.

-- guest_documents: keep SELECT, drop/replace write policies with admin-only (optional).
DROP POLICY IF EXISTS "ops_guest_documents_insert" ON ops.guest_documents;
DROP POLICY IF EXISTS "ops_guest_documents_update" ON ops.guest_documents;

CREATE POLICY "ops_guest_documents_admin_write" ON ops.guest_documents
  FOR ALL TO authenticated
  USING (ops.is_admin() AND hotel_id = ops.current_hotel_id())
  WITH CHECK (ops.is_admin() AND hotel_id = ops.current_hotel_id());

-- stay_assignments: remove client write; admin-only if needed
DROP POLICY IF EXISTS "ops_stay_assignments_insert" ON ops.stay_assignments;
DROP POLICY IF EXISTS "ops_stay_assignments_update" ON ops.stay_assignments;

CREATE POLICY "ops_stay_assignments_admin_write" ON ops.stay_assignments
  FOR ALL TO authenticated
  USING (ops.is_admin() AND hotel_id = ops.current_hotel_id())
  WITH CHECK (ops.is_admin() AND hotel_id = ops.current_hotel_id());

-- official_submission_transactions: remove client write; admin-only if needed
DROP POLICY IF EXISTS "ops_official_tx_insert" ON ops.official_submission_transactions;
DROP POLICY IF EXISTS "ops_official_tx_update" ON ops.official_submission_transactions;

CREATE POLICY "ops_official_tx_admin_write" ON ops.official_submission_transactions
  FOR ALL TO authenticated
  USING (ops.is_admin() AND hotel_id = ops.current_hotel_id())
  WITH CHECK (ops.is_admin() AND hotel_id = ops.current_hotel_id());

-- audit_logs: remove client insert; admin-only if needed
DROP POLICY IF EXISTS "ops_audit_logs_insert" ON ops.audit_logs;

CREATE POLICY "ops_audit_logs_admin_write" ON ops.audit_logs
  FOR ALL TO authenticated
  USING (ops.is_admin() AND hotel_id = ops.current_hotel_id())
  WITH CHECK (ops.is_admin() AND hotel_id = ops.current_hotel_id());

COMMIT;

