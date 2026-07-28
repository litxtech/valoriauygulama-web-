-- Oda kapak görseli (temizlik kartı)
BEGIN;

ALTER TABLE public.room_housekeeping_status
  ADD COLUMN IF NOT EXISTS cover_image_url text;

COMMENT ON COLUMN public.room_housekeeping_status.cover_image_url IS
  'Temizlik tahtasında oda kartı kapak görseli (public URL).';

COMMIT;
