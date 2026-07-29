-- Public online booking (lobby / valoria.tr → /booking)
-- Misafir lobiden rezervasyon sistemine girer; talepler buraya düşer.

CREATE TABLE IF NOT EXISTS public.online_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  room_number TEXT,
  room_label TEXT,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  nights_count INTEGER NOT NULL CHECK (nights_count >= 1),
  adults INTEGER NOT NULL DEFAULT 1 CHECK (adults >= 1 AND adults <= 12),
  children INTEGER NOT NULL DEFAULT 0 CHECK (children >= 0 AND children <= 12),
  guest_full_name TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  guest_email TEXT,
  guest_note TEXT,
  extras JSONB NOT NULL DEFAULT '[]'::jsonb,
  quoted_price_per_night NUMERIC(12,2),
  quoted_total NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'TRY',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'confirmed', 'cancelled', 'expired', 'converted')
  ),
  source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'app', 'lobby')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT online_bookings_dates_ok CHECK (check_out_date > check_in_date)
);

CREATE INDEX IF NOT EXISTS idx_online_bookings_org_created
  ON public.online_bookings(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_bookings_status
  ON public.online_bookings(status, created_at DESC);

ALTER TABLE public.online_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS online_bookings_staff_select ON public.online_bookings;
CREATE POLICY online_bookings_staff_select ON public.online_bookings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND (
          s.role IN ('admin', 'manager', 'reception')
          OR s.organization_id = online_bookings.organization_id
        )
    )
  );

DROP POLICY IF EXISTS online_bookings_staff_update ON public.online_bookings;
CREATE POLICY online_bookings_staff_update ON public.online_bookings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.role IN ('admin', 'manager', 'reception')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.role IN ('admin', 'manager', 'reception')
    )
  );

-- Public room catalog (anon + authenticated)
CREATE OR REPLACE FUNCTION public.list_bookable_rooms(p_org_slug TEXT DEFAULT 'valoria')
RETURNS TABLE (
  id UUID,
  room_number TEXT,
  floor INTEGER,
  view_type TEXT,
  area_sqm NUMERIC,
  bed_type TEXT,
  price_per_night NUMERIC,
  status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.room_number,
    r.floor,
    r.view_type,
    r.area_sqm,
    r.bed_type,
    r.price_per_night,
    r.status
  FROM public.rooms r
  LEFT JOIN public.organizations o ON o.id = r.organization_id
  WHERE r.status IN ('available', 'cleaning')
    AND (
      o.slug IS NOT DISTINCT FROM lower(trim(p_org_slug))
      OR r.organization_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.organizations ox WHERE ox.slug = lower(trim(p_org_slug)))
    )
  ORDER BY r.room_number;
$$;

GRANT EXECUTE ON FUNCTION public.list_bookable_rooms(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_online_booking(
  p_org_slug TEXT,
  p_room_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_adults INTEGER,
  p_children INTEGER,
  p_guest_full_name TEXT,
  p_guest_phone TEXT,
  p_guest_email TEXT DEFAULT NULL,
  p_guest_note TEXT DEFAULT NULL,
  p_extras JSONB DEFAULT '[]'::jsonb,
  p_source TEXT DEFAULT 'web'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_room public.rooms%ROWTYPE;
  v_nights INTEGER;
  v_id UUID;
  v_source TEXT;
BEGIN
  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'invalid_dates';
  END IF;
  IF coalesce(p_adults, 0) < 1 THEN
    RAISE EXCEPTION 'invalid_adults';
  END IF;
  IF length(trim(coalesce(p_guest_full_name, ''))) < 2 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF length(trim(coalesce(p_guest_phone, ''))) < 7 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;

  v_source := CASE
    WHEN p_source IN ('web', 'app', 'lobby') THEN p_source
    ELSE 'web'
  END;

  SELECT o.id INTO v_org_id
  FROM public.organizations o
  WHERE o.slug = lower(trim(coalesce(p_org_slug, 'valoria')))
  LIMIT 1;

  IF v_org_id IS NULL THEN
    SELECT o.id INTO v_org_id
    FROM public.organizations o
    ORDER BY o.created_at ASC
    LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'org_not_found';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found';
  END IF;

  v_nights := GREATEST(1, (p_check_out - p_check_in));

  INSERT INTO public.online_bookings (
    organization_id,
    room_id,
    room_number,
    room_label,
    check_in_date,
    check_out_date,
    nights_count,
    adults,
    children,
    guest_full_name,
    guest_phone,
    guest_email,
    guest_note,
    extras,
    quoted_price_per_night,
    quoted_total,
    source
  ) VALUES (
    v_org_id,
    v_room.id,
    v_room.room_number,
    coalesce(v_room.bed_type, v_room.view_type, 'Oda ' || v_room.room_number),
    p_check_in,
    p_check_out,
    v_nights,
    least(greatest(coalesce(p_adults, 1), 1), 12),
    least(greatest(coalesce(p_children, 0), 0), 12),
    trim(p_guest_full_name),
    trim(p_guest_phone),
    nullif(trim(coalesce(p_guest_email, '')), ''),
    nullif(trim(coalesce(p_guest_note, '')), ''),
    coalesce(p_extras, '[]'::jsonb),
    v_room.price_per_night,
    CASE
      WHEN v_room.price_per_night IS NULL THEN NULL
      ELSE v_room.price_per_night * v_nights
    END,
    v_source
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_online_booking(
  TEXT, UUID, DATE, DATE, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT
) TO anon, authenticated;
