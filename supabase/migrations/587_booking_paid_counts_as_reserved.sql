-- Ödeme yapılmadan rezervasyon sayılmasın.
-- Doluluk / müsaitlik: yalnızca confirmed|converted (+ kısa ödeme soft-hold).
-- Yaş vibe / doluluk metni: yalnızca confirmed|converted (ödenmiş rezervasyon).

CREATE OR REPLACE FUNCTION public.online_booking_blocks_room(
  p_status TEXT,
  p_payment_request_id UUID,
  p_updated_at TIMESTAMPTZ,
  p_created_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    p_status IN ('confirmed', 'converted')
    OR (
      p_status = 'pending'
      AND p_payment_request_id IS NOT NULL
      AND coalesce(p_updated_at, p_created_at) > (now() - interval '45 minutes')
    );
$$;

COMMENT ON FUNCTION public.online_booking_blocks_room(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Oda tutar: onaylı/dönüştürülmüş rezervasyon veya aktif ödeme oturumu (45 dk soft-hold). Ödemesiz pending sayılmaz.';

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
    AND public.online_booking_blocks_room(b.status, b.payment_request_id, b.updated_at, b.created_at)
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
        AND public.online_booking_blocks_room(b.status, b.payment_request_id, b.updated_at, b.created_at)
        AND b.check_in_date < p_check_out
        AND b.check_out_date > p_check_in
    );
$$;

DROP FUNCTION IF EXISTS public.list_bookable_rooms_for_stay(DATE, DATE, TEXT);
CREATE FUNCTION public.list_bookable_rooms_for_stay(
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
  is_available_for_stay BOOLEAN,
  sold_count BIGINT
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
          AND public.online_booking_blocks_room(b.status, b.payment_request_id, b.updated_at, b.created_at)
          AND b.check_in_date < p_check_out
          AND b.check_out_date > p_check_in
      ) THEN false
      ELSE true
    END AS is_available_for_stay,
    (
      SELECT COUNT(*)::BIGINT
      FROM public.online_bookings b
      WHERE b.room_id = r.id
        AND b.status IN ('confirmed', 'converted')
    ) AS sold_count
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
            AND public.online_booking_blocks_room(b.status, b.payment_request_id, b.updated_at, b.created_at)
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

-- create_online_booking: çakışma yalnızca gerçek rezervasyon / aktif ödeme soft-hold
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
  p_party_guests JSONB DEFAULT '[]'::jsonb,
  p_campaign_code TEXT DEFAULT NULL,
  p_is_student_party BOOLEAN DEFAULT false,
  p_is_group BOOLEAN DEFAULT false
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
  v_list NUMERIC;
  v_disc NUMERIC := 0;
  v_pay NUMERIC;
  v_campaign public.booking_campaigns%ROWTYPE;
  v_members INT;
  v_students INT;
  v_quote RECORD;
  v_has_campaign BOOLEAN := false;
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

  IF EXISTS (
    SELECT 1
    FROM public.online_bookings b
    WHERE b.room_id = p_room_id
      AND public.online_booking_blocks_room(b.status, b.payment_request_id, b.updated_at, b.created_at)
      AND b.check_in_date < p_check_out
      AND b.check_out_date > p_check_in
  ) THEN
    RAISE EXCEPTION 'room_unavailable';
  END IF;

  v_nights := GREATEST(1, (p_check_out - p_check_in));
  v_label := COALESCE(NULLIF(btrim(v_room.capacity_label), ''), NULLIF(btrim(v_room.display_title), ''), 'Standart');

  v_members := 1 + COALESCE(jsonb_array_length(coalesce(p_party_guests, '[]'::jsonb)), 0);
  v_students := COALESCE((
    SELECT COUNT(*)::INT
    FROM jsonb_array_elements(coalesce(p_party_guests, '[]'::jsonb)) g
    WHERE coalesce((g->>'is_student')::boolean, false)
  ), 0);
  IF p_is_student_party THEN
    v_students := GREATEST(v_students, 1);
  END IF;

  v_list := CASE
    WHEN v_room.price_per_night IS NULL THEN NULL
    ELSE v_room.price_per_night * v_nights
  END;

  IF nullif(trim(coalesce(p_campaign_code, '')), '') IS NOT NULL THEN
    SELECT * INTO v_campaign
    FROM public.booking_campaigns c
    WHERE c.organization_id = v_org_id
      AND lower(c.code) = lower(trim(p_campaign_code))
      AND c.is_active = true
      AND (c.starts_at IS NULL OR c.starts_at <= now())
      AND (c.ends_at IS NULL OR c.ends_at >= now())
    LIMIT 1;
    v_has_campaign := FOUND;
  END IF;

  SELECT * INTO v_quote
  FROM public.compute_booking_quote(
    v_list,
    v_nights,
    v_members,
    v_students,
    coalesce(p_is_student_party, false),
    v_has_campaign,
    v_campaign.discount_type,
    v_campaign.discount_value,
    v_campaign.audience,
    v_campaign.min_nights,
    v_campaign.min_members,
    v_campaign.student_extra_percent
  );
  v_disc := coalesce(v_quote.discount_amount, 0);
  v_pay := coalesce(v_quote.payable, v_list);

  INSERT INTO public.online_bookings (
    organization_id, room_id, room_number, room_label, capacity_label, display_title,
    check_in_date, check_out_date, nights_count, adults, children,
    guest_full_name, guest_phone, guest_email, guest_note, extras,
    quoted_price_per_night, quoted_total, source,
    guest_id_number, guest_birth_date, party_guests,
    is_group, is_student_party, student_count,
    campaign_id, campaign_code, list_total, discount_amount
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
    v_pay,
    v_source,
    nullif(v_tc, ''),
    p_guest_birth_date,
    coalesce(p_party_guests, '[]'::jsonb),
    coalesce(p_is_group, false) OR v_members >= 2,
    coalesce(p_is_student_party, false),
    v_students,
    CASE WHEN v_has_campaign THEN v_campaign.id ELSE NULL END,
    CASE WHEN v_has_campaign THEN upper(trim(p_campaign_code)) ELSE NULL END,
    v_list,
    v_disc
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_online_booking(
  TEXT, UUID, DATE, DATE, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, DATE, JSONB, TEXT, BOOLEAN, BOOLEAN
) TO anon, authenticated;

-- Yaş vibe: yalnızca ödenmiş / onaylı rezervasyonlar
CREATE OR REPLACE FUNCTION public.get_stay_age_vibe(
  p_check_in DATE,
  p_check_out DATE,
  p_org_slug TEXT DEFAULT 'valoria'
)
RETURNS TABLE (
  sample_count INTEGER,
  avg_age NUMERIC,
  vibe_key TEXT,
  vibe_label TEXT,
  vibe_hint TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_avg NUMERIC;
  v_count INTEGER;
  v_key TEXT;
  v_label TEXT;
  v_hint TEXT;
  v_rooms INTEGER;
  v_booked INTEGER;
  v_fill NUMERIC;
  v_occ TEXT;
BEGIN
  SELECT o.id INTO v_org
  FROM public.organizations o
  WHERE o.slug = lower(trim(coalesce(p_org_slug, 'valoria')))
  LIMIT 1;

  SELECT count(*)::int INTO v_rooms
  FROM public.rooms r
  WHERE (v_org IS NULL OR r.organization_id = v_org)
    AND coalesce(r.bookable, true) = true
    AND coalesce(r.status, 'available') NOT IN ('maintenance', 'out_of_service', 'closed');

  IF v_rooms IS NULL OR v_rooms < 1 THEN
    SELECT count(*)::int INTO v_rooms
    FROM public.rooms r
    WHERE (v_org IS NULL OR r.organization_id = v_org);
  END IF;
  v_rooms := GREATEST(coalesce(v_rooms, 1), 1);

  SELECT count(*)::int INTO v_booked
  FROM public.online_bookings b
  WHERE b.status IN ('confirmed', 'converted')
    AND b.check_in_date < p_check_out
    AND b.check_out_date > p_check_in
    AND (v_org IS NULL OR b.organization_id = v_org);

  v_fill := LEAST(1.0, coalesce(v_booked, 0)::numeric / v_rooms::numeric);

  IF v_fill < 0.15 THEN
    v_occ := 'Bu tarihte otel genellikle sakin';
  ELSIF v_fill < 0.35 THEN
    v_occ := 'Konaklayacağınız tarihte otelin yaklaşık çeyreği dolu';
  ELSIF v_fill < 0.65 THEN
    v_occ := 'Konaklayacağınız tarihte otelin yaklaşık yarısı dolu';
  ELSIF v_fill < 0.85 THEN
    v_occ := 'Konaklayacağınız tarihte otelin büyük kısmı dolu';
  ELSE
    v_occ := 'Konaklayacağınız tarihte otel neredeyse tamamı dolu';
  END IF;

  WITH ages AS (
    SELECT EXTRACT(YEAR FROM age(CURRENT_DATE, b.guest_birth_date))::numeric AS age_y
    FROM public.online_bookings b
    WHERE b.guest_birth_date IS NOT NULL
      AND b.status IN ('confirmed', 'converted')
      AND b.check_in_date < p_check_out
      AND b.check_out_date > p_check_in
      AND (v_org IS NULL OR b.organization_id = v_org)
    UNION ALL
    SELECT EXTRACT(YEAR FROM age(CURRENT_DATE, (g->>'birth_date')::date))::numeric
    FROM public.online_bookings b
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(b.party_guests, '[]'::jsonb)) g
    WHERE g->>'birth_date' IS NOT NULL
      AND b.status IN ('confirmed', 'converted')
      AND b.check_in_date < p_check_out
      AND b.check_out_date > p_check_in
      AND (v_org IS NULL OR b.organization_id = v_org)
  )
  SELECT count(*)::int, avg(age_y)
  INTO v_count, v_avg
  FROM ages
  WHERE age_y IS NOT NULL AND age_y BETWEEN 1 AND 110;

  IF v_count IS NULL OR v_count < 1 OR v_avg IS NULL THEN
    RETURN QUERY SELECT
      0,
      NULL::numeric,
      'fresh'::text,
      'Yaş grubu henüz net değil'::text,
      (v_occ || '. İlk rezervasyonlardan biri olabilirsiniz.')::text;
    RETURN;
  END IF;

  IF v_avg < 18 THEN
    v_key := 'kids';
    v_label := 'Yaş grubu · Aile';
  ELSIF v_avg < 32 THEN
    v_key := 'young';
    v_label := 'Yaş grubu · Genç';
  ELSIF v_avg < 48 THEN
    v_key := 'adult';
    v_label := 'Yaş grubu · Yetişkin';
  ELSIF v_avg < 62 THEN
    v_key := 'mature';
    v_label := 'Yaş grubu · Olgun';
  ELSE
    v_key := 'senior';
    v_label := 'Yaş grubu · Dinlenme';
  END IF;

  v_hint := v_occ || '.';

  RETURN QUERY SELECT v_count, round(v_avg, 0), v_key, v_label, v_hint;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stay_age_vibe(DATE, DATE, TEXT) TO anon, authenticated;
