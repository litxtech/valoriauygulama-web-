BEGIN;

ALTER TABLE public.security_blacklist_entries
  ADD COLUMN IF NOT EXISTS hotel_note text,
  ADD COLUMN IF NOT EXISTS family_note text;

COMMENT ON COLUMN public.security_blacklist_entries.hotel_note IS
  'Otel güvenliği / tesis için kara liste notu';
COMMENT ON COLUMN public.security_blacklist_entries.family_note IS
  'Aile / yakın çevre güvenliği için kara liste notu';

COMMIT;
