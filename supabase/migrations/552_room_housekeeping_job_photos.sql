-- Temizlik işlerine fotoğraf URL listesi
BEGIN;

ALTER TABLE public.room_housekeeping_jobs
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.room_housekeeping_jobs.photo_urls IS
  'Temizlik sonrası / sırası çekilen oda fotoğraflarının public URL listesi.';

COMMIT;
