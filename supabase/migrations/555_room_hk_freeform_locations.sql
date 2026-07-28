-- Serbest temizlik yeri: oda tablosunda olmayan yerler (koridor, lobi, extra oda…)
BEGIN;

ALTER TABLE public.room_housekeeping_jobs
  ALTER COLUMN room_id DROP NOT NULL;

ALTER TABLE public.room_housekeeping_jobs
  ADD COLUMN IF NOT EXISTS location_label text;

UPDATE public.room_housekeeping_jobs
SET location_label = coalesce(location_label, '')
WHERE location_label IS NULL AND room_id IS NULL;

ALTER TABLE public.room_housekeeping_jobs
  DROP CONSTRAINT IF EXISTS room_housekeeping_jobs_unique;

ALTER TABLE public.room_housekeeping_jobs
  DROP CONSTRAINT IF EXISTS room_housekeeping_jobs_room_or_label;

ALTER TABLE public.room_housekeeping_jobs
  ADD CONSTRAINT room_housekeeping_jobs_room_or_label CHECK (
    room_id IS NOT NULL
    OR (location_label IS NOT NULL AND length(trim(location_label)) > 0)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_room_hk_jobs_org_room_date
  ON public.room_housekeeping_jobs (organization_id, room_id, target_date)
  WHERE room_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_room_hk_jobs_org_label_date
  ON public.room_housekeeping_jobs (organization_id, lower(trim(location_label)), target_date)
  WHERE room_id IS NULL AND location_label IS NOT NULL;

COMMENT ON COLUMN public.room_housekeeping_jobs.location_label IS
  'Oda kaydı olmayan serbest temizlik yeri (örn. Lobi, Koridor A, Extra-12).';

-- room_id yoksa rooms.status senkronunu atla
CREATE OR REPLACE FUNCTION public.sync_hk_status_from_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.room_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.target_date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.room_housekeeping_status AS s (
    organization_id,
    room_id,
    status,
    started_at,
    started_by_staff_id,
    completed_at,
    completed_by_staff_id
  )
  VALUES (
    NEW.organization_id,
    NEW.room_id,
    NEW.status,
    NEW.started_at,
    NEW.started_by_staff_id,
    NEW.completed_at,
    NEW.completed_by_staff_id
  )
  ON CONFLICT (room_id) DO UPDATE
  SET
    status = EXCLUDED.status,
    started_at = EXCLUDED.started_at,
    started_by_staff_id = EXCLUDED.started_by_staff_id,
    completed_at = EXCLUDED.completed_at,
    completed_by_staff_id = EXCLUDED.completed_by_staff_id,
    updated_at = now();

  RETURN NEW;
END;
$$;

COMMIT;
