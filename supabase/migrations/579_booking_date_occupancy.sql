-- Tarih bazlı oda doluluk: rezervasyon süresince dolu, çıkışta otomatik satışa açılır
-- (ayrıca cron yok — örtüşme hesabı check_out_date ile biter)

CREATE OR REPLACE FUNCTION public.get_booking_stay_occupancy(
  p_check_in DATE,
  p_check_out DATE,
  p_org_slug TEXT DEFAULT 'valoria'
)
RETURNS TABLE (
  total_rooms INTEGER,
  reserved_rooms INTEGER,
  available_rooms INTEGER,
  is_full BOOLEAN,
  fill_ratio NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_total INTEGER;
  v_reserved INTEGER;
BEGIN
  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_out <= p_check_in THEN
    RETURN QUERY SELECT 0, 0, 0, true, 0::numeric;
    RETURN;
  END IF;

  SELECT o.id INTO v_org
  FROM public.organizations o
  WHERE o.slug = lower(trim(coalesce(p_org_slug, 'valoria')))
  LIMIT 1;

  SELECT count(*)::int INTO v_total
  FROM public.rooms r
  WHERE coalesce(r.bookable, true) = true
    AND r.status IN ('available', 'cleaning')
    AND (v_org IS NULL OR r.organization_id = v_org OR r.organization_id IS NULL);

  v_total := GREATEST(coalesce(v_total, 0), 0);

  SELECT count(DISTINCT b.room_id)::int INTO v_reserved
  FROM public.online_bookings b
  WHERE b.room_id IS NOT NULL
    AND b.status IN ('pending', 'confirmed', 'converted')
    AND b.check_in_date < p_check_out
    AND b.check_out_date > p_check_in
    AND (v_org IS NULL OR b.organization_id = v_org);

  v_reserved := LEAST(coalesce(v_reserved, 0), v_total);

  RETURN QUERY SELECT
    v_total,
    v_reserved,
    GREATEST(v_total - v_reserved, 0),
    (v_total > 0 AND v_reserved >= v_total),
    CASE WHEN v_total > 0 THEN round((v_reserved::numeric / v_total::numeric), 2) ELSE 0 END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_stay_occupancy(DATE, DATE, TEXT) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.list_bookable_rooms_for_stay(DATE, DATE, TEXT);
CREATE OR REPLACE FUNCTION public.list_bookable_rooms_for_stay(
  p_check_in DATE,
  p_check_out DATE,
  p_org_slug TEXT DEFAULT 'valoria'
)
RETURNS TABLE (
  id UUID,
  capacity_label TEXT,
  display_title TEXT,
  max_guests INTEGER,
  floor INTEGER,
  view_type TEXT,
  area_sqm NUMERIC,
  bed_type TEXT,
  price_per_night NUMERIC,
  status TEXT,
  description TEXT,
  video_url TEXT,
  amenities JSONB,
  cover_image_url TEXT,
  is_available_for_stay BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    COALESCE(NULLIF(btrim(r.capacity_label), ''), 'Standart') AS capacity_label,
    r.display_title,
    r.max_guests,
    r.floor,
    r.view_type,
    r.area_sqm,
    r.bed_type,
    r.price_per_night,
    r.status,
    r.description,
    r.video_url,
    r.amenities,
    (
      SELECT ri.url
      FROM public.room_images ri
      WHERE ri.room_id = r.id
        AND coalesce(ri.media_kind, 'image') = 'image'
      ORDER BY ri.sort_order ASC NULLS LAST, ri.created_at ASC
      LIMIT 1
    ) AS cover_image_url,
    CASE
      WHEN p_check_in IS NULL OR p_check_out IS NULL OR p_check_out <= p_check_in THEN false
      WHEN EXISTS (
        SELECT 1
        FROM public.online_bookings b
        WHERE b.room_id = r.id
          AND b.status IN ('pending', 'confirmed', 'converted')
          AND b.check_in_date < p_check_out
          AND b.check_out_date > p_check_in
      ) THEN false
      ELSE true
    END AS is_available_for_stay
  FROM public.rooms r
  LEFT JOIN public.organizations o ON o.id = r.organization_id
  WHERE coalesce(r.bookable, true) = true
    AND r.status IN ('available', 'cleaning')
    AND (
      o.slug IS NOT DISTINCT FROM lower(trim(p_org_slug))
      OR r.organization_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.organizations ox WHERE ox.slug = lower(trim(p_org_slug)))
    )
  ORDER BY
    CASE
      WHEN p_check_in IS NOT NULL AND p_check_out IS NOT NULL AND p_check_out > p_check_in
        AND NOT EXISTS (
          SELECT 1 FROM public.online_bookings b
          WHERE b.room_id = r.id
            AND b.status IN ('pending', 'confirmed', 'converted')
            AND b.check_in_date < p_check_out
            AND b.check_out_date > p_check_in
        ) THEN 0
      ELSE 1
    END,
    COALESCE(r.max_guests, 99),
    r.capacity_label,
    r.room_number;
$$;

GRANT EXECUTE ON FUNCTION public.list_bookable_rooms_for_stay(DATE, DATE, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_room_available_for_stay(
  p_room_id UUID,
  p_check_in DATE,
  p_check_out DATE
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    p_room_id IS NOT NULL
    AND p_check_in IS NOT NULL
    AND p_check_out IS NOT NULL
    AND p_check_out > p_check_in
    AND NOT EXISTS (
      SELECT 1
      FROM public.online_bookings b
      WHERE b.room_id = p_room_id
        AND b.status IN ('pending', 'confirmed', 'converted')
        AND b.check_in_date < p_check_out
        AND b.check_out_date > p_check_in
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_room_available_for_stay(UUID, DATE, DATE) TO anon, authenticated;

-- create_online_booking: aynı oda + örtüşen tarihte engelle
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
  p_source TEXT DEFAULT 'web',
  p_guest_id_number TEXT DEFAULT NULL,
  p_guest_birth_date DATE DEFAULT NULL,
  p_party_guests JSONB DEFAULT '[]'::jsonb
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
  v_label TEXT;
  v_tc TEXT;
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

  v_tc := regexp_replace(trim(coalesce(p_guest_id_number, '')), '[^0-9]', '', 'g');
  IF length(v_tc) > 0 AND length(v_tc) <> 11 THEN
    RAISE EXCEPTION 'invalid_tc';
  END IF;
  IF p_guest_birth_date IS NULL THEN
    RAISE EXCEPTION 'invalid_birth_date';
  END IF;
  IF p_guest_birth_date > CURRENT_DATE - INTERVAL '1 year'
     OR p_guest_birth_date < CURRENT_DATE - INTERVAL '110 years' THEN
    RAISE EXCEPTION 'invalid_birth_date';
  END IF;

  v_source := CASE WHEN p_source IN ('web', 'app', 'lobby') THEN p_source ELSE 'web' END;

  SELECT o.id INTO v_org_id
  FROM public.organizations o
  WHERE o.slug = lower(trim(coalesce(p_org_slug, 'valoria')))
  LIMIT 1;
  IF v_org_id IS NULL THEN
    SELECT o.id INTO v_org_id FROM public.organizations o ORDER BY o.created_at ASC LIMIT 1;
  END IF;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'org_not_found'; END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
  IF coalesce(v_room.bookable, true) = false THEN
    RAISE EXCEPTION 'room_unavailable';
  END IF;

  -- Çıkış tarihinden sonra otomatik açılır; sadece örtüşen aralık dolu sayılır
  IF EXISTS (
    SELECT 1
    FROM public.online_bookings b
    WHERE b.room_id = p_room_id
      AND b.status IN ('pending', 'confirmed', 'converted')
      AND b.check_in_date < p_check_out
      AND b.check_out_date > p_check_in
  ) THEN
    RAISE EXCEPTION 'room_unavailable';
  END IF;

  v_nights := GREATEST(1, (p_check_out - p_check_in));
  v_label := COALESCE(NULLIF(btrim(v_room.capacity_label), ''), NULLIF(btrim(v_room.display_title), ''), 'Standart');

  INSERT INTO public.online_bookings (
    organization_id, room_id, room_number, room_label, capacity_label, display_title,
    check_in_date, check_out_date, nights_count, adults, children,
    guest_full_name, guest_phone, guest_email, guest_note, extras,
    quoted_price_per_night, quoted_total, source,
    guest_id_number, guest_birth_date, party_guests
  ) VALUES (
    v_org_id, v_room.id, v_room.room_number, v_label, v_label, v_room.display_title,
    p_check_in, p_check_out, v_nights,
    least(greatest(coalesce(p_adults, 1), 1), 12),
    least(greatest(coalesce(p_children, 0), 0), 12),
    trim(p_guest_full_name), trim(p_guest_phone),
    nullif(trim(coalesce(p_guest_email, '')), ''),
    nullif(trim(coalesce(p_guest_note, '')), ''),
    coalesce(p_extras, '[]'::jsonb),
    v_room.price_per_night,
    CASE WHEN v_room.price_per_night IS NULL THEN NULL ELSE v_room.price_per_night * v_nights END,
    v_source,
    nullif(v_tc, ''),
    p_guest_birth_date,
    coalesce(p_party_guests, '[]'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_online_booking(
  TEXT, UUID, DATE, DATE, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, DATE, JSONB
) TO anon, authenticated;
