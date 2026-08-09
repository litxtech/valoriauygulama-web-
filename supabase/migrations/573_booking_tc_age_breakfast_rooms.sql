-- Booking: TC + doğum tarihi, yaş grubu göstergesi, misafir kahvaltı vitrini, serbest oda ekleme

ALTER TABLE public.online_bookings
  ADD COLUMN IF NOT EXISTS guest_id_number TEXT,
  ADD COLUMN IF NOT EXISTS guest_birth_date DATE,
  ADD COLUMN IF NOT EXISTS party_guests JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.online_bookings.guest_id_number IS 'Rezervasyon yapan misafir TC / kimlik no';
COMMENT ON COLUMN public.online_bookings.guest_birth_date IS 'Rezervasyon yapan misafir doğum tarihi';
COMMENT ON COLUMN public.online_bookings.party_guests IS 'Konaklayan diğer kişiler [{full_name,id_number,birth_date}]';

-- Misafir kahvaltı vitrini (tarih bazlı, admin doldurur)
CREATE TABLE IF NOT EXISTS public.guest_breakfast_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meal_date DATE NOT NULL,
  title TEXT,
  items TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT guest_breakfast_days_unique UNIQUE (organization_id, meal_date)
);

CREATE INDEX IF NOT EXISTS idx_guest_breakfast_days_org_date
  ON public.guest_breakfast_days (organization_id, meal_date);

ALTER TABLE public.guest_breakfast_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guest_breakfast_days_staff_all ON public.guest_breakfast_days;
CREATE POLICY guest_breakfast_days_staff_all ON public.guest_breakfast_days
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true
        AND s.role IN ('admin', 'manager', 'reception')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true
        AND s.role IN ('admin', 'manager', 'reception')
    )
  );

CREATE OR REPLACE FUNCTION public.list_guest_breakfast_for_stay(
  p_check_in DATE,
  p_check_out DATE,
  p_org_slug TEXT DEFAULT 'valoria'
)
RETURNS TABLE (
  meal_date DATE,
  title TEXT,
  items TEXT,
  image_url TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.meal_date, d.title, d.items, d.image_url
  FROM public.guest_breakfast_days d
  JOIN public.organizations o ON o.id = d.organization_id
  WHERE o.slug = lower(trim(coalesce(p_org_slug, 'valoria')))
    AND d.meal_date >= p_check_in
    AND d.meal_date < p_check_out
  ORDER BY d.meal_date ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_guest_breakfast_for_stay(DATE, DATE, TEXT) TO anon, authenticated;

-- Konaklama tarihlerinde otelin yaş grubu ortalaması (tatlı gösterge için)
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
BEGIN
  SELECT o.id INTO v_org
  FROM public.organizations o
  WHERE o.slug = lower(trim(coalesce(p_org_slug, 'valoria')))
  LIMIT 1;

  WITH ages AS (
    SELECT EXTRACT(YEAR FROM age(CURRENT_DATE, b.guest_birth_date))::numeric AS age_y
    FROM public.online_bookings b
    WHERE b.guest_birth_date IS NOT NULL
      AND b.status IN ('pending', 'confirmed', 'converted')
      AND b.check_in_date < p_check_out
      AND b.check_out_date > p_check_in
      AND (v_org IS NULL OR b.organization_id = v_org)
    UNION ALL
    SELECT EXTRACT(YEAR FROM age(CURRENT_DATE, (g->>'birth_date')::date))::numeric
    FROM public.online_bookings b
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(b.party_guests, '[]'::jsonb)) g
    WHERE g->>'birth_date' IS NOT NULL
      AND b.status IN ('pending', 'confirmed', 'converted')
      AND b.check_in_date < p_check_out
      AND b.check_out_date > p_check_in
      AND (v_org IS NULL OR b.organization_id = v_org)
  )
  SELECT count(*)::int, avg(age_y)
  INTO v_count, v_avg
  FROM ages
  WHERE age_y IS NOT NULL AND age_y BETWEEN 1 AND 110;

  IF v_count IS NULL OR v_count < 1 OR v_avg IS NULL THEN
    RETURN QUERY SELECT 0, NULL::numeric, 'fresh'::text,
      'Sakin & ferah'::text,
      'Bu tarihler için henüz az kayıt var — sakin bir konaklama bekleniyor.'::text;
    RETURN;
  END IF;

  IF v_avg < 18 THEN
    v_key := 'kids'; v_label := 'Aile & çocuk enerjisi'; v_hint := 'Bu tarihlerde ortalama yaş genç; aile dostu bir atmosfer.';
  ELSIF v_avg < 28 THEN
    v_key := 'young'; v_label := 'Genç & canlı'; v_hint := 'Ortalama yaş yirmilerde — sosyal ve enerjik bir hava.';
  ELSIF v_avg < 40 THEN
    v_key := 'adult'; v_label := 'Dengeli yetişkin'; v_hint := 'Ortalama yaş otuzlarda — rahat ve dengeli bir ortam.';
  ELSIF v_avg < 55 THEN
    v_key := 'mature'; v_label := 'Olgun & huzurlu'; v_hint := 'Ortalama yaş kırk-elli; sakin ve keyifli bir tempo.';
  ELSE
    v_key := 'senior'; v_label := 'Huzurlu dinlenme'; v_hint := 'Ortalama yaş daha yüksek — dinginlik ön planda.';
  END IF;

  RETURN QUERY SELECT v_count, round(v_avg, 1), v_key, v_label, v_hint;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stay_age_vibe(DATE, DATE, TEXT) TO anon, authenticated;

-- create_online_booking: TC + doğum + party (eski imzayı kaldır)
DROP FUNCTION IF EXISTS public.create_online_booking(TEXT, UUID, DATE, DATE, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT);
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

-- Admin: kafana göre vitrin odası ekle (iç numara otomatik)
CREATE OR REPLACE FUNCTION public.create_bookable_showcase_room(
  p_capacity_label TEXT,
  p_display_title TEXT DEFAULT NULL,
  p_price_per_night NUMERIC DEFAULT NULL,
  p_max_guests INTEGER DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_bed_type TEXT DEFAULT NULL,
  p_view_type TEXT DEFAULT NULL,
  p_area_sqm NUMERIC DEFAULT NULL,
  p_amenities JSONB DEFAULT '[]'::jsonb,
  p_org_slug TEXT DEFAULT 'valoria'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_org UUID;
  v_num TEXT;
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_id = v_uid AND s.is_active = true
      AND s.role IN ('admin', 'manager', 'reception')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF length(trim(coalesce(p_capacity_label, ''))) < 1 THEN
    RAISE EXCEPTION 'capacity_required';
  END IF;

  SELECT o.id INTO v_org FROM public.organizations o
  WHERE o.slug = lower(trim(coalesce(p_org_slug, 'valoria'))) LIMIT 1;
  IF v_org IS NULL THEN
    SELECT organization_id INTO v_org FROM public.staff WHERE auth_id = v_uid LIMIT 1;
  END IF;

  v_num := 'V' || to_char(now(), 'YYMMDDHH24MISS') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);

  INSERT INTO public.rooms (
    room_number, organization_id, status, bookable,
    capacity_label, display_title, price_per_night, max_guests,
    description, bed_type, view_type, area_sqm, amenities
  ) VALUES (
    v_num, v_org, 'available', true,
    trim(p_capacity_label),
    nullif(trim(coalesce(p_display_title, '')), ''),
    p_price_per_night,
    p_max_guests,
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_bed_type, '')), ''),
    nullif(trim(coalesce(p_view_type, '')), ''),
    p_area_sqm,
    coalesce(p_amenities, '[]'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_bookable_showcase_room(
  TEXT, TEXT, NUMERIC, INTEGER, TEXT, TEXT, TEXT, NUMERIC, JSONB, TEXT
) TO authenticated;
