BEGIN;

CREATE TABLE IF NOT EXISTS public.room_linen_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  room_number text NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('blanket', 'pillow', 'towel', 'duvet', 'other')),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 20),
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'picked_up', 'cancelled')),
  delivered_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  picked_up_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  picked_up_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_linen_handovers_room_number_not_blank CHECK (length(trim(room_number)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_room_linen_handovers_org_status_created
  ON public.room_linen_handovers (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_linen_handovers_org_room_pending
  ON public.room_linen_handovers (organization_id, room_number, status)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.room_linen_handovers_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_linen_handovers_updated_at ON public.room_linen_handovers;
CREATE TRIGGER trg_room_linen_handovers_updated_at
  BEFORE UPDATE ON public.room_linen_handovers
  FOR EACH ROW EXECUTE FUNCTION public.room_linen_handovers_set_updated_at();

CREATE OR REPLACE FUNCTION public.room_linen_handovers_set_pickup_meta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_staff_id := public.current_staff_id();

  IF NEW.status = 'picked_up' THEN
    NEW.picked_up_at := COALESCE(NEW.picked_up_at, now());
    NEW.picked_up_by_staff_id := COALESCE(NEW.picked_up_by_staff_id, v_staff_id);
  ELSIF NEW.status = 'pending' THEN
    NEW.picked_up_at := NULL;
    NEW.picked_up_by_staff_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_linen_handovers_pickup_meta ON public.room_linen_handovers;
CREATE TRIGGER trg_room_linen_handovers_pickup_meta
  BEFORE UPDATE OF status ON public.room_linen_handovers
  FOR EACH ROW EXECUTE FUNCTION public.room_linen_handovers_set_pickup_meta();

ALTER TABLE public.room_linen_handovers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_linen_handovers_select_org ON public.room_linen_handovers;
CREATE POLICY room_linen_handovers_select_org ON public.room_linen_handovers
  FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS room_linen_handovers_insert_org ON public.room_linen_handovers;
CREATE POLICY room_linen_handovers_insert_org ON public.room_linen_handovers
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND delivered_by_staff_id = public.current_staff_id()
  );

DROP POLICY IF EXISTS room_linen_handovers_update_org ON public.room_linen_handovers;
CREATE POLICY room_linen_handovers_update_org ON public.room_linen_handovers
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_staff_organization_id())
  WITH CHECK (organization_id = public.current_staff_organization_id());

COMMIT;
