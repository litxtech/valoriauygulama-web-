-- KBS operasyon paneli: anlık konaklayanlar, çıkış, düzeltme, loglar (280 sonrası)
BEGIN;

ALTER TABLE ops.guest_scan_items
  ADD COLUMN IF NOT EXISTS kbs_reference_no text,
  ADD COLUMN IF NOT EXISTS kbs_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS kbs_submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS ops.guest_stays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  room_no text NOT NULL,
  group_id uuid,
  scan_session_id uuid REFERENCES ops.guest_scan_sessions(id) ON DELETE SET NULL,
  guest_scan_item_id uuid REFERENCES ops.guest_scan_items(id) ON DELETE SET NULL,
  guest_document_id uuid REFERENCES ops.guest_documents(id) ON DELETE SET NULL,
  stay_assignment_id uuid REFERENCES ops.stay_assignments(id) ON DELETE SET NULL,

  first_name text,
  last_name text,
  guest_type text CHECK (guest_type IN ('tc_citizen', 'ykn_foreign', 'foreign')),
  document_type text CHECK (document_type IN ('tc_id', 'foreign_id', 'passport')),
  nationality text,
  identity_no_masked text,
  passport_no_masked text,

  checkin_at timestamptz NOT NULL DEFAULT now(),
  checkout_at timestamptz,

  stay_status text NOT NULL DEFAULT 'checked_in'
    CHECK (stay_status IN (
      'draft',
      'checked_in',
      'checkout_pending',
      'checked_out',
      'checkout_failed',
      'correction_required',
      'delete_pending',
      'deleted_from_kbs',
      'delete_failed',
      're_submitted',
      'cancelled'
    )),

  kbs_checkin_status text NOT NULL DEFAULT 'pending'
    CHECK (kbs_checkin_status IN ('pending', 'sent', 'failed')),

  kbs_checkout_status text
    CHECK (kbs_checkout_status IN ('pending', 'sent', 'failed')),

  kbs_delete_status text
    CHECK (kbs_delete_status IN ('pending', 'sent', 'failed')),

  kbs_reference_no text,
  kbs_error_message text,
  kbs_checkout_error_message text,
  kbs_delete_error_message text,

  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  checkout_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  corrected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  checkout_type text
    CHECK (checkout_type IN ('single', 'room', 'group', 'selected_bulk')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_guest_stays_hotel_status_idx
  ON ops.guest_stays (hotel_id, stay_status, created_at DESC);

CREATE INDEX IF NOT EXISTS ops_guest_stays_room_idx
  ON ops.guest_stays (hotel_id, room_no, stay_status);

CREATE INDEX IF NOT EXISTS ops_guest_stays_group_idx
  ON ops.guest_stays (hotel_id, group_id);

CREATE INDEX IF NOT EXISTS ops_guest_stays_session_idx
  ON ops.guest_stays (hotel_id, scan_session_id);

ALTER TABLE ops.kbs_submission_logs
  ADD COLUMN IF NOT EXISTS guest_stay_id uuid REFERENCES ops.guest_stays(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action_type text
    CHECK (action_type IS NULL OR action_type IN ('checkin', 'checkout', 'delete', 'resubmit', 'correction')),
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ops_kbs_submission_logs_stay_idx
  ON ops.kbs_submission_logs (guest_stay_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS ops_kbs_submission_logs_action_idx
  ON ops.kbs_submission_logs (hotel_id, action_type, submitted_at DESC);

CREATE TABLE IF NOT EXISTS ops.guest_correction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  guest_stay_id uuid NOT NULL REFERENCES ops.guest_stays(id) ON DELETE CASCADE,
  old_data jsonb,
  new_data jsonb,
  correction_reason text,
  correction_type text NOT NULL
    CHECK (correction_type IN ('local_edit', 'delete_and_resubmit')),
  corrected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_guest_correction_history_stay_idx
  ON ops.guest_correction_history (guest_stay_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_ops_guest_stays_updated ON ops.guest_stays;
CREATE TRIGGER trg_ops_guest_stays_updated
  BEFORE UPDATE ON ops.guest_stays
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

ALTER TABLE ops.guest_stays ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.guest_correction_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_guest_stays_select ON ops.guest_stays;
CREATE POLICY ops_guest_stays_select ON ops.guest_stays
  FOR SELECT TO authenticated
  USING (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS ops_guest_stays_write ON ops.guest_stays;
CREATE POLICY ops_guest_stays_write ON ops.guest_stays
  FOR ALL TO authenticated
  USING (hotel_id = ops.current_hotel_id())
  WITH CHECK (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS ops_guest_correction_history_select ON ops.guest_correction_history;
CREATE POLICY ops_guest_correction_history_select ON ops.guest_correction_history
  FOR SELECT TO authenticated
  USING (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS ops_guest_correction_history_insert ON ops.guest_correction_history;
CREATE POLICY ops_guest_correction_history_insert ON ops.guest_correction_history
  FOR INSERT TO authenticated
  WITH CHECK (hotel_id = ops.current_hotel_id());

COMMENT ON TABLE ops.guest_stays IS 'KBS’ye bildirilen aktif/geçmiş konaklayan misafir kayıtları.';
COMMENT ON TABLE ops.guest_correction_history IS 'KBS bildirimi sonrası düzeltme / sil-yeniden bildir geçmişi.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'ops' AND tablename = 'guest_stays'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ops.guest_stays;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'ops' AND tablename = 'kbs_submission_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ops.kbs_submission_logs;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'ops' AND tablename = 'guest_scan_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ops.guest_scan_sessions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'ops' AND tablename = 'guest_scan_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ops.guest_scan_items;
  END IF;
END $$;

COMMIT;
