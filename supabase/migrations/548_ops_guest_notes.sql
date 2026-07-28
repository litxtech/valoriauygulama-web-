-- KBS müşteri notları: kimlik çekimlerinde personel notu, etiket ve öneri için.

BEGIN;

CREATE TABLE IF NOT EXISTS ops.guest_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  guest_id uuid NOT NULL REFERENCES ops.guests(id) ON DELETE CASCADE,
  guest_document_id uuid REFERENCES ops.guest_documents(id) ON DELETE SET NULL,
  document_number text,
  tag text NOT NULL DEFAULT 'info'
    CHECK (tag IN ('info', 'good', 'problematic', 'incident', 'vip')),
  body text NOT NULL,
  created_by_auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_staff_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ops_guest_notes_body_not_blank CHECK (length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS ops_guest_notes_hotel_created_idx
  ON ops.guest_notes (hotel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ops_guest_notes_guest_idx
  ON ops.guest_notes (guest_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ops_guest_notes_document_number_idx
  ON ops.guest_notes (hotel_id, lower(btrim(document_number)))
  WHERE document_number IS NOT NULL AND btrim(document_number) <> '';

CREATE INDEX IF NOT EXISTS ops_guest_notes_tag_idx
  ON ops.guest_notes (hotel_id, tag, created_at DESC);

DROP TRIGGER IF EXISTS trg_ops_guest_notes_updated ON ops.guest_notes;
CREATE TRIGGER trg_ops_guest_notes_updated
  BEFORE UPDATE ON ops.guest_notes
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

ALTER TABLE ops.guest_notes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.guest_notes TO authenticated;
GRANT ALL ON ops.guest_notes TO service_role;

DROP POLICY IF EXISTS "ops_guest_notes_select" ON ops.guest_notes;
CREATE POLICY "ops_guest_notes_select" ON ops.guest_notes
  FOR SELECT TO authenticated
  USING (
    hotel_id = ops.current_hotel_id()
    OR public.kbs_web_can_view_all_hotels()
  );

DROP POLICY IF EXISTS "ops_guest_notes_insert" ON ops.guest_notes;
CREATE POLICY "ops_guest_notes_insert" ON ops.guest_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  );

DROP POLICY IF EXISTS "ops_guest_notes_update" ON ops.guest_notes;
CREATE POLICY "ops_guest_notes_update" ON ops.guest_notes
  FOR UPDATE TO authenticated
  USING (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
    AND created_by_auth_id = auth.uid()
  )
  WITH CHECK (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
    AND created_by_auth_id = auth.uid()
  );

DROP POLICY IF EXISTS "ops_guest_notes_delete" ON ops.guest_notes;
CREATE POLICY "ops_guest_notes_delete" ON ops.guest_notes
  FOR DELETE TO authenticated
  USING (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
    AND (
      created_by_auth_id = auth.uid()
      OR COALESCE(ops.is_admin(), false)
    )
  );

COMMENT ON TABLE ops.guest_notes IS
  'KBS kimlik çekimleri: müşteri hakkında personel notları (iyi / sorunlu / olay / VIP / bilgi).';

COMMIT;
