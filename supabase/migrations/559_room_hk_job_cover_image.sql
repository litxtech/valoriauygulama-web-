-- Serbest temizlik yerleri için iş satırında kapak görseli
BEGIN;

ALTER TABLE public.room_housekeeping_jobs
  ADD COLUMN IF NOT EXISTS cover_image_url text;

COMMENT ON COLUMN public.room_housekeeping_jobs.cover_image_url IS
  'Serbest yer / oda kartı kapak görseli (özellikle room_id null kayıtlar).';

COMMIT;
