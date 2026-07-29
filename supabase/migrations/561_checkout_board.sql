-- Çıkış Odaları panosu: planlanan çıkış + olay günlüğü
BEGIN;

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS planned_check_out_at timestamptz;

COMMENT ON COLUMN public.guests.planned_check_out_at IS
  'Planlanan çıkış tarihi; fiili check_out_at ile karışmaz. Çıkışta silinmez.';

CREATE INDEX IF NOT EXISTS idx_guests_planned_check_out_at
  ON public.guests (organization_id, planned_check_out_at)
  WHERE planned_check_out_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_guests_org_status_planned
  ON public.guests (organization_id, status, planned_check_out_at)
  WHERE status = 'checked_in';

-- Backfill: hâlâ odada olanlarda planlanan = mevcut check_out_at
UPDATE public.guests
SET planned_check_out_at = check_out_at
WHERE status = 'checked_in'
  AND check_out_at IS NOT NULL
  AND planned_check_out_at IS NULL;

CREATE TABLE IF NOT EXISTS public.occupancy_stay_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('note', 'extend', 'room_change', 'checkout')),
  note text,
  from_room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  to_room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  from_planned_check_out_at timestamptz,
  to_planned_check_out_at timestamptz,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_occupancy_stay_events_guest_created
  ON public.occupancy_stay_events (guest_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_occupancy_stay_events_org_kind_created
  ON public.occupancy_stay_events (organization_id, kind, created_at DESC);

COMMENT ON TABLE public.occupancy_stay_events IS
  'Çıkış panosu olayları: not, uzatma, oda değişimi, çıkış.';

ALTER TABLE public.occupancy_stay_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS occupancy_stay_events_select_org ON public.occupancy_stay_events;
CREATE POLICY occupancy_stay_events_select_org ON public.occupancy_stay_events
  FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS occupancy_stay_events_insert_org ON public.occupancy_stay_events;
CREATE POLICY occupancy_stay_events_insert_org ON public.occupancy_stay_events
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS occupancy_stay_events_update_org ON public.occupancy_stay_events;
CREATE POLICY occupancy_stay_events_update_org ON public.occupancy_stay_events
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_staff_organization_id())
  WITH CHECK (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS occupancy_stay_events_delete_org ON public.occupancy_stay_events;
CREATE POLICY occupancy_stay_events_delete_org ON public.occupancy_stay_events
  FOR DELETE TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'occupancy_stay_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.occupancy_stay_events;
  END IF;
END $$;

-- Giriş/sözleşmede check_out_at yazılınca planned boşsa doldur
CREATE OR REPLACE FUNCTION public.guests_sync_planned_check_out()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.check_out_at IS NOT NULL
     AND (NEW.planned_check_out_at IS NULL OR TG_OP = 'INSERT')
     AND (NEW.status IS DISTINCT FROM 'checked_out')
  THEN
    -- INSERT veya planned boşken check_out_at güncellenirse planlananı senkronla
    IF TG_OP = 'INSERT' THEN
      IF NEW.planned_check_out_at IS NULL THEN
        NEW.planned_check_out_at := NEW.check_out_at;
      END IF;
    ELSIF OLD.check_out_at IS DISTINCT FROM NEW.check_out_at
          AND NEW.planned_check_out_at IS NULL
          AND NEW.status IN ('pending', 'checked_in') THEN
      NEW.planned_check_out_at := NEW.check_out_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guests_sync_planned_check_out ON public.guests;
CREATE TRIGGER trg_guests_sync_planned_check_out
  BEFORE INSERT OR UPDATE OF check_out_at, planned_check_out_at, status
  ON public.guests
  FOR EACH ROW EXECUTE FUNCTION public.guests_sync_planned_check_out();

COMMIT;
