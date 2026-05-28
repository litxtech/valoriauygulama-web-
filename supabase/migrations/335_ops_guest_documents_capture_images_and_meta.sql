BEGIN;

ALTER TABLE ops.guest_documents
  ADD COLUMN IF NOT EXISTS front_image_url text,
  ADD COLUMN IF NOT EXISTS back_image_url text,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS capture_source text
    CHECK (capture_source IS NULL OR capture_source IN ('camera', 'gallery', 'mixed'));

COMMENT ON COLUMN ops.guest_documents.front_image_url IS 'Belge on yuz gorsel URL (Valoria depolama).';
COMMENT ON COLUMN ops.guest_documents.back_image_url IS 'Belge arka yuz gorsel URL (Valoria depolama).';
COMMENT ON COLUMN ops.guest_documents.captured_at IS 'Belge cekim zamani.';
COMMENT ON COLUMN ops.guest_documents.capture_source IS 'camera | gallery | mixed';

CREATE INDEX IF NOT EXISTS ops_guest_documents_captured_at_idx
  ON ops.guest_documents (hotel_id, captured_at DESC);

COMMIT;
