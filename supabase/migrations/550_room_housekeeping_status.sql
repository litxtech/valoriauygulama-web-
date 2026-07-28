-- Canlı oda temizlik durumu: dirty → cleaning → clean
-- Eski room_cleaning_plans* tabloları korunur; UI bu tabloya geçer.

BEGIN;

CREATE TABLE IF NOT EXISTS public.room_housekeeping_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'clean'
    CHECK (status IN ('dirty', 'cleaning', 'clean')),
  started_at timestamptz,
  started_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  completed_at timestamptz,
  completed_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_housekeeping_status_room_unique UNIQUE (room_id)
);

CREATE INDEX IF NOT EXISTS idx_room_hk_status_org_status
  ON public.room_housekeeping_status (organization_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_hk_status_org_room
  ON public.room_housekeeping_status (organization_id, room_id);

COMMENT ON TABLE public.room_housekeeping_status IS
  'Oda bazlı canlı temizlik aşaması (kirli / temizleniyor / temiz). Resepsiyon ve personel canlı takip eder.';

CREATE OR REPLACE FUNCTION public.room_housekeeping_status_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_hk_status_updated_at ON public.room_housekeeping_status;
CREATE TRIGGER trg_room_hk_status_updated_at
  BEFORE UPDATE ON public.room_housekeeping_status
  FOR EACH ROW EXECUTE FUNCTION public.room_housekeeping_status_set_updated_at();

-- HK status → rooms.status senkronu
CREATE OR REPLACE FUNCTION public.sync_rooms_status_from_housekeeping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_guest boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cleaning' THEN
    UPDATE public.rooms
    SET status = 'cleaning', updated_at = now()
    WHERE id = NEW.room_id
      AND status IS DISTINCT FROM 'out_of_order'
      AND status IS DISTINCT FROM 'maintenance';
    RETURN NEW;
  END IF;

  IF NEW.status = 'clean' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.guests g
      WHERE g.room_id = NEW.room_id
        AND g.status = 'checked_in'
    ) INTO v_has_guest;

    UPDATE public.rooms
    SET
      status = CASE WHEN v_has_guest THEN 'occupied' ELSE 'available' END,
      updated_at = now()
    WHERE id = NEW.room_id
      AND status IS DISTINCT FROM 'out_of_order'
      AND status IS DISTINCT FROM 'maintenance';
    RETURN NEW;
  END IF;

  -- dirty: oda boşsa available bırak (checkout zaten available yazar); doluysa occupied
  IF NEW.status = 'dirty' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.guests g
      WHERE g.room_id = NEW.room_id
        AND g.status = 'checked_in'
    ) INTO v_has_guest;

    UPDATE public.rooms
    SET
      status = CASE
        WHEN status IN ('out_of_order', 'maintenance') THEN status
        WHEN v_has_guest THEN 'occupied'
        WHEN status = 'cleaning' THEN 'available'
        ELSE status
      END,
      updated_at = now()
    WHERE id = NEW.room_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_hk_sync_rooms_status ON public.room_housekeeping_status;
CREATE TRIGGER trg_room_hk_sync_rooms_status
  AFTER INSERT OR UPDATE OF status ON public.room_housekeeping_status
  FOR EACH ROW EXECUTE FUNCTION public.sync_rooms_status_from_housekeeping();

-- Mevcut odaları seed et
INSERT INTO public.room_housekeeping_status (organization_id, room_id, status)
SELECT
  COALESCE(
    r.organization_id,
    (SELECT id FROM public.organizations WHERE slug = 'valoria' LIMIT 1)
  ),
  r.id,
  CASE
    WHEN r.status = 'cleaning' THEN 'cleaning'
    ELSE 'clean'
  END
FROM public.rooms r
WHERE COALESCE(
  r.organization_id,
  (SELECT id FROM public.organizations WHERE slug = 'valoria' LIMIT 1)
) IS NOT NULL
ON CONFLICT (room_id) DO NOTHING;

ALTER TABLE public.room_housekeeping_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_hk_status_select_org ON public.room_housekeeping_status;
CREATE POLICY room_hk_status_select_org ON public.room_housekeeping_status
  FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS room_hk_status_insert_org ON public.room_housekeeping_status;
CREATE POLICY room_hk_status_insert_org ON public.room_housekeeping_status
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS room_hk_status_update_org ON public.room_housekeeping_status;
CREATE POLICY room_hk_status_update_org ON public.room_housekeeping_status
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_staff_organization_id())
  WITH CHECK (organization_id = public.current_staff_organization_id());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'room_housekeeping_status'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_housekeeping_status;
  END IF;
END $$;

COMMIT;
