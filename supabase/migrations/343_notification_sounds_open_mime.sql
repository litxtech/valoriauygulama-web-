BEGIN;

UPDATE storage.buckets
SET
  file_size_limit = 2097152,
  allowed_mime_types = NULL
WHERE id = 'notification-sounds';

COMMIT;
