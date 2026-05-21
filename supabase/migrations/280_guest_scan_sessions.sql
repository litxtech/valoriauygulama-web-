-- KBS misafir kimlik tarama oturumları (MRZ / kimlik OCR, aile-grup akışı)
BEGIN;

CREATE TABLE IF NOT EXISTS ops.guest_scan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  session_type text NOT NULL DEFAULT 'single'
    CHECK (session_type IN ('single', 'family', 'group')),
  room_no text,
  checkin_at timestamptz,
  checkout_at timestamptz,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'submitted', 'partial_error', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_guest_scan_sessions_hotel_idx
  ON ops.guest_scan_sessions (hotel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ops.guest_scan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES ops.guest_scan_sessions(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  guest_type text NOT NULL
    CHECK (guest_type IN ('tc_citizen', 'ykn_foreign', 'foreign')),
  document_type text NOT NULL
    CHECK (document_type IN ('tc_id', 'foreign_id', 'passport')),
  source_type text NOT NULL DEFAULT 'camera'
    CHECK (source_type IN ('camera', 'gallery')),
  first_name text,
  last_name text,
  identity_no text,
  passport_no text,
  document_serial_no text,
  birth_date date,
  gender text,
  nationality text,
  country text,
  mother_name text,
  father_name text,
  passport_expiry_date date,
  raw_mrz text,
  raw_ocr jsonb,
  confidence_score numeric(5,4),
  validation_status text NOT NULL DEFAULT 'needs_review'
    CHECK (validation_status IN ('valid', 'needs_review', 'invalid')),
  kbs_status text NOT NULL DEFAULT 'pending'
    CHECK (kbs_status IN ('pending', 'sent', 'failed')),
  kbs_error_message text,
  guest_document_id uuid REFERENCES ops.guest_documents(id) ON DELETE SET NULL,
  guest_phone text,
  plate_number text,
  usage_kind text DEFAULT 'konaklama',
  forward_dated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_guest_scan_items_session_idx
  ON ops.guest_scan_items (session_id, created_at);

CREATE TABLE IF NOT EXISTS ops.kbs_submission_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  session_id uuid REFERENCES ops.guest_scan_sessions(id) ON DELETE SET NULL,
  guest_scan_item_id uuid REFERENCES ops.guest_scan_items(id) ON DELETE SET NULL,
  guest_document_id uuid REFERENCES ops.guest_documents(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_payload jsonb,
  response_payload jsonb,
  status text NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
  error_message text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_kbs_submission_logs_session_idx
  ON ops.kbs_submission_logs (session_id, submitted_at DESC);

ALTER TABLE ops.guest_scan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.guest_scan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.kbs_submission_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_guest_scan_sessions_select ON ops.guest_scan_sessions;
CREATE POLICY ops_guest_scan_sessions_select ON ops.guest_scan_sessions
  FOR SELECT TO authenticated
  USING (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS ops_guest_scan_sessions_write ON ops.guest_scan_sessions;
CREATE POLICY ops_guest_scan_sessions_write ON ops.guest_scan_sessions
  FOR ALL TO authenticated
  USING (hotel_id = ops.current_hotel_id() AND created_by = auth.uid())
  WITH CHECK (hotel_id = ops.current_hotel_id() AND created_by = auth.uid());

DROP POLICY IF EXISTS ops_guest_scan_items_select ON ops.guest_scan_items;
CREATE POLICY ops_guest_scan_items_select ON ops.guest_scan_items
  FOR SELECT TO authenticated
  USING (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS ops_guest_scan_items_write ON ops.guest_scan_items;
CREATE POLICY ops_guest_scan_items_write ON ops.guest_scan_items
  FOR ALL TO authenticated
  USING (hotel_id = ops.current_hotel_id())
  WITH CHECK (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS ops_kbs_submission_logs_select ON ops.kbs_submission_logs;
CREATE POLICY ops_kbs_submission_logs_select ON ops.kbs_submission_logs
  FOR SELECT TO authenticated
  USING (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS ops_kbs_submission_logs_insert ON ops.kbs_submission_logs;
CREATE POLICY ops_kbs_submission_logs_insert ON ops.kbs_submission_logs
  FOR INSERT TO authenticated
  WITH CHECK (hotel_id = ops.current_hotel_id());

COMMENT ON TABLE ops.guest_scan_sessions IS 'KBS kimlik tarama oturumu (tek / aile / grup).';
COMMENT ON TABLE ops.guest_scan_items IS 'Oturumdaki okunan misafir satırı; ham fotoğraf saklanmaz.';
COMMENT ON TABLE ops.kbs_submission_logs IS 'KBS gönderim istek/yanıt özeti (hassas görüntü yok).';

COMMIT;
