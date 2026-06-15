BEGIN;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'audio/wav',
  'audio/x-wav',
  'audio/vnd.wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-caf',
  'audio/aac',
  'application/octet-stream'
]::text[]
WHERE id = 'notification-sounds';

COMMIT;
