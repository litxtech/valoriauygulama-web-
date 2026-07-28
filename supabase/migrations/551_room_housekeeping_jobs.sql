-- Tarih bazlı temizlik işleri (resepsiyon planı + canlı takip)
BEGIN;

CREATE TABLE IF NOT EXISTS public.room_housekeeping_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  target_date date NOT NULL,
  status text NOT NULL DEFAULT 'dirty'
    CHECK (status IN ('dirty', 'cleaning', 'clean')),
  note text,
  scheduled_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  started_at timestamptz,
  started_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  completed_at timestamptz,
  completed_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_housekeeping_jobs_unique UNIQUE (organization_id, room_id, target_date)
);

CREATE INDEX IF NOT EXISTS idx_room_hk_jobs_org_date_status
  ON public.room_housekeeping_jobs (organization_id, target_date, status);

CREATE INDEX IF NOT EXISTS idx_room_hk_jobs_room_date
  ON public.room_housekeeping_jobs (room_id, target_date DESC);

COMMENT ON TABLE public.room_housekeeping_jobs IS
  'Resepsiyonun tarih + oda bazlı temizlenecek listesi; temizlikçi canlı ilerler.';

CREATE OR REPLACE FUNCTION public.room_housekeeping_jobs_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_hk_jobs_updated_at ON public.room_housekeeping_jobs;
CREATE TRIGGER trg_room_hk_jobs_updated_at
  BEFORE UPDATE ON public.room_housekeeping_jobs
  FOR EACH ROW EXECUTE FUNCTION public.room_housekeeping_jobs_set_updated_at();

-- Bugünkü iş değişince canlı oda durumunu da senkronla
CREATE OR REPLACE FUNCTION public.sync_hk_status_from_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_room_hk_jobs_sync_status ON public.room_housekeeping_jobs;
CREATE TRIGGER trg_room_hk_jobs_sync_status
  AFTER INSERT OR UPDATE OF status, started_at, started_by_staff_id, completed_at, completed_by_staff_id
  ON public.room_housekeeping_jobs
  FOR EACH ROW EXECUTE FUNCTION public.sync_hk_status_from_job();

ALTER TABLE public.room_housekeeping_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_hk_jobs_select_org ON public.room_housekeeping_jobs;
CREATE POLICY room_hk_jobs_select_org ON public.room_housekeeping_jobs
  FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS room_hk_jobs_insert_org ON public.room_housekeeping_jobs;
CREATE POLICY room_hk_jobs_insert_org ON public.room_housekeeping_jobs
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS room_hk_jobs_update_org ON public.room_housekeeping_jobs;
CREATE POLICY room_hk_jobs_update_org ON public.room_housekeeping_jobs
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_staff_organization_id())
  WITH CHECK (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS room_hk_jobs_delete_org ON public.room_housekeeping_jobs;
CREATE POLICY room_hk_jobs_delete_org ON public.room_housekeeping_jobs
  FOR DELETE TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'room_housekeeping_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_housekeeping_jobs;
  END IF;
END $$;

COMMIT;
