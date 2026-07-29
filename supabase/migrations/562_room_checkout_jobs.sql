-- Çıkış odaları planı (temizlik jobs ile aynı mantık)
BEGIN;

CREATE TABLE IF NOT EXISTS public.room_checkout_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  room_id uuid REFERENCES public.rooms(id) ON DELETE CASCADE,
  location_label text,
  target_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done')),
  note text,
  is_priority boolean NOT NULL DEFAULT false,
  scheduled_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  completed_at timestamptz,
  completed_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_checkout_jobs_room_or_label CHECK (
    room_id IS NOT NULL
    OR (location_label IS NOT NULL AND length(trim(location_label)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_room_co_jobs_org_room_date
  ON public.room_checkout_jobs (organization_id, room_id, target_date)
  WHERE room_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_room_co_jobs_org_label_date
  ON public.room_checkout_jobs (organization_id, lower(trim(location_label)), target_date)
  WHERE room_id IS NULL AND location_label IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_room_co_jobs_org_date_status
  ON public.room_checkout_jobs (organization_id, target_date, status);

COMMENT ON TABLE public.room_checkout_jobs IS
  'Resepsiyon yarın/bugün çıkacak odaları planlar; sabah listeden çıkış yapar.';

CREATE OR REPLACE FUNCTION public.room_checkout_jobs_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_co_jobs_updated_at ON public.room_checkout_jobs;
CREATE TRIGGER trg_room_co_jobs_updated_at
  BEFORE UPDATE ON public.room_checkout_jobs
  FOR EACH ROW EXECUTE FUNCTION public.room_checkout_jobs_set_updated_at();

ALTER TABLE public.room_checkout_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_co_jobs_select_org ON public.room_checkout_jobs;
CREATE POLICY room_co_jobs_select_org ON public.room_checkout_jobs
  FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS room_co_jobs_insert_org ON public.room_checkout_jobs;
CREATE POLICY room_co_jobs_insert_org ON public.room_checkout_jobs
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS room_co_jobs_update_org ON public.room_checkout_jobs;
CREATE POLICY room_co_jobs_update_org ON public.room_checkout_jobs
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_staff_organization_id())
  WITH CHECK (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS room_co_jobs_delete_org ON public.room_checkout_jobs;
CREATE POLICY room_co_jobs_delete_org ON public.room_checkout_jobs
  FOR DELETE TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'room_checkout_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_checkout_jobs;
  END IF;
END $$;

COMMIT;
