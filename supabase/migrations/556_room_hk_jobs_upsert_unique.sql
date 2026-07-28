-- PostgREST upsert için oda+tarih unique constraint'ini geri getir
-- (partial index onConflict ile çalışmıyor). NULL room_id satırları
-- PG'de unique'te distinct sayılır; serbest yerler label index ile korunur.
BEGIN;

DROP INDEX IF EXISTS public.uq_room_hk_jobs_org_room_date;

ALTER TABLE public.room_housekeeping_jobs
  DROP CONSTRAINT IF EXISTS room_housekeeping_jobs_unique;

ALTER TABLE public.room_housekeeping_jobs
  ADD CONSTRAINT room_housekeeping_jobs_unique
  UNIQUE (organization_id, room_id, target_date);

COMMIT;
