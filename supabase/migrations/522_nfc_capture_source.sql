-- NFC pasaport çip okuma kaynağı
ALTER TABLE ops.guest_documents
  DROP CONSTRAINT IF EXISTS guest_documents_capture_source_check;

ALTER TABLE ops.guest_documents
  ADD CONSTRAINT guest_documents_capture_source_check
  CHECK (capture_source IS NULL OR capture_source IN ('camera', 'gallery', 'mixed', 'nfc'));

COMMENT ON COLUMN ops.guest_documents.capture_source IS 'camera | gallery | mixed | nfc';
