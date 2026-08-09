-- Group booking members, campaigns/student discounts, monthly price stats

ALTER TABLE public.online_bookings
  ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_student_party BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS student_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS campaign_id UUID,
  ADD COLUMN IF NOT EXISTS campaign_code TEXT,
  ADD COLUMN IF NOT EXISTS list_total NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2);

CREATE TABLE IF NOT EXISTS public.booking_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value >= 0),
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'student', 'group')),
  min_nights INTEGER NOT NULL DEFAULT 1,
  min_members INTEGER NOT NULL DEFAULT 1,
  student_extra_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_booking_campaigns_org_active
  ON public.booking_campaigns (organization_id, is_active, code);

ALTER TABLE public.booking_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_campaigns_staff_all ON public.booking_campaigns;
CREATE POLICY booking_campaigns_staff_all ON public.booking_campaigns
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'online_bookings_campaign_id_fkey'
  ) THEN
    ALTER TABLE public.online_bookings
      ADD CONSTRAINT online_bookings_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES public.booking_campaigns(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Aylık fiyat / indirim / ödeme özeti
CREATE OR REPLACE VIEW public.booking_monthly_price_stats AS
SELECT
  b.organization_id,
  to_char(date_trunc('month', b.created_at), 'YYYY-MM') AS year_month,
  COUNT(*)::INT AS bookings_count,
  COUNT(*) FILTER (WHERE b.status IN ('confirmed', 'converted'))::INT AS confirmed_count,
  COUNT(*) FILTER (WHERE b.is_group)::INT AS group_bookings,
  COUNT(*) FILTER (WHERE b.is_student_party)::INT AS student_bookings,
  COALESCE(SUM(b.nights_count), 0)::INT AS nights_sum,
  COALESCE(SUM(COALESCE(b.list_total, b.quoted_total, 0)), 0)::NUMERIC(14,2) AS list_total_sum,
  COALESCE(SUM(COALESCE(b.discount_amount, 0)), 0)::NUMERIC(14,2) AS discount_given_sum,
  COALESCE(SUM(
    CASE
      WHEN b.paid_at IS NOT NULL THEN COALESCE(b.paid_amount, b.quoted_total, 0)
      ELSE 0
    END
  ), 0)::NUMERIC(14,2) AS paid_sum,
  COALESCE(SUM(COALESCE(b.quoted_total, 0)), 0)::NUMERIC(14,2) AS quoted_sum
FROM public.online_bookings b
GROUP BY b.organization_id, date_trunc('month', b.created_at);

GRANT SELECT ON public.booking_monthly_price_stats TO authenticated;

CREATE OR REPLACE FUNCTION public.list_active_booking_campaigns(
  p_org_slug TEXT DEFAULT 'valoria'
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  name TEXT,
  discount_type TEXT,
  discount_value NUMERIC,
  audience TEXT,
  min_nights INTEGER,
  min_members INTEGER,
  student_extra_percent NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id, c.code, c.name, c.discount_type, c.discount_value,
    c.audience, c.min_nights, c.min_members, c.student_extra_percent
  FROM public.booking_campaigns c
  JOIN public.organizations o ON o.id = c.organization_id
  WHERE o.slug = lower(trim(coalesce(p_org_slug, 'valoria')))
    AND c.is_active = true
    AND (c.starts_at IS NULL OR c.starts_at <= now())
    AND (c.ends_at IS NULL OR c.ends_at >= now())
  ORDER BY c.discount_value DESC, c.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_active_booking_campaigns(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_booking_monthly_price_stats(
  p_org_slug TEXT DEFAULT 'valoria',
  p_months INTEGER DEFAULT 12
)
RETURNS TABLE (
  year_month TEXT,
  bookings_count INTEGER,
  confirmed_count INTEGER,
  group_bookings INTEGER,
  student_bookings INTEGER,
  nights_sum INTEGER,
  list_total_sum NUMERIC,
  discount_given_sum NUMERIC,
  paid_sum NUMERIC,
  quoted_sum NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.year_month,
    s.bookings_count,
    s.confirmed_count,
    s.group_bookings,
    s.student_bookings,
    s.nights_sum,
    s.list_total_sum,
    s.discount_given_sum,
    s.paid_sum,
    s.quoted_sum
  FROM public.booking_monthly_price_stats s
  JOIN public.organizations o ON o.id = s.organization_id
  WHERE o.slug = lower(trim(coalesce(p_org_slug, 'valoria')))
  ORDER BY s.year_month DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_months, 12), 36));
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_monthly_price_stats(TEXT, INTEGER) TO authenticated;

-- Quote helper used by create_online_booking
CREATE OR REPLACE FUNCTION public.compute_booking_quote(
  p_list_total NUMERIC,
  p_nights INTEGER,
  p_member_count INTEGER,
  p_student_count INTEGER,
  p_is_student_party BOOLEAN,
  p_has_campaign BOOLEAN DEFAULT false,
  p_discount_type TEXT DEFAULT NULL,
  p_discount_value NUMERIC DEFAULT NULL,
  p_audience TEXT DEFAULT NULL,
  p_min_nights INTEGER DEFAULT 1,
  p_min_members INTEGER DEFAULT 1,
  p_student_extra_percent NUMERIC DEFAULT 0
)
RETURNS TABLE (discount_amount NUMERIC, payable NUMERIC)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_disc NUMERIC := 0;
  v_extra NUMERIC := 0;
  v_ok BOOLEAN := true;
BEGIN
  IF p_list_total IS NULL OR p_list_total <= 0 THEN
    RETURN QUERY SELECT 0::NUMERIC, COALESCE(p_list_total, 0);
    RETURN;
  END IF;

  IF p_has_campaign THEN
    IF p_nights < coalesce(p_min_nights, 1) THEN v_ok := false; END IF;
    IF p_member_count < coalesce(p_min_members, 1) THEN v_ok := false; END IF;
    IF p_audience = 'student' AND NOT p_is_student_party AND coalesce(p_student_count, 0) < 1 THEN
      v_ok := false;
    END IF;
    IF p_audience = 'group' AND p_member_count < 2 THEN v_ok := false; END IF;

    IF v_ok THEN
      IF p_discount_type = 'percent' THEN
        v_disc := round(p_list_total * (coalesce(p_discount_value, 0) / 100.0), 2);
      ELSE
        v_disc := least(p_list_total, coalesce(p_discount_value, 0));
      END IF;
      IF coalesce(p_student_extra_percent, 0) > 0
         AND (p_is_student_party OR coalesce(p_student_count, 0) > 0) THEN
        v_extra := round(p_list_total * (p_student_extra_percent / 100.0), 2);
        v_disc := v_disc + v_extra;
      END IF;
    END IF;
  ELSIF p_is_student_party OR coalesce(p_student_count, 0) > 0 THEN
    -- Varsayılan öğrenci indirimi %10 (kampanya yoksa)
    v_disc := round(p_list_total * 0.10, 2);
  END IF;

  v_disc := least(coalesce(p_list_total, 0), greatest(0, v_disc));
  RETURN QUERY SELECT v_disc, greatest(0, coalesce(p_list_total, 0) - v_disc);
END;
$$;

DROP FUNCTION IF EXISTS public.create_online_booking(
  TEXT, UUID, DATE, DATE, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, DATE, JSONB
);

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
      AND b.status IN ('pending', 'confirmed', 'converted')
      AND b.check_in_date < p_check_out
      AND b.check_out_date > p_check_in
  ) THEN
    RAISE EXCEPTION 'room_unavailable';
  END IF;

  v_nights := GREATEST(1, (p_check_out - p_check_in));
  v_label := COALESCE(NULLIF(btrim(v_room.capacity_label), ''), NULLIF(btrim(v_room.display_title), ''), 'Standart');

  -- booker + party = üye sayısı
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

-- Seed örnek kampanyalar (yoksa)
INSERT INTO public.booking_campaigns (
  organization_id, code, name, discount_type, discount_value, audience,
  min_nights, min_members, student_extra_percent, is_active
)
SELECT o.id, 'OGRENCI10', 'Öğrenci %10', 'percent', 10, 'student', 1, 1, 0, true
FROM public.organizations o
WHERE o.slug = 'valoria'
  AND NOT EXISTS (
    SELECT 1 FROM public.booking_campaigns c
    WHERE c.organization_id = o.id AND c.code = 'OGRENCI10'
  );

INSERT INTO public.booking_campaigns (
  organization_id, code, name, discount_type, discount_value, audience,
  min_nights, min_members, student_extra_percent, is_active
)
SELECT o.id, 'GRUP15', 'Grup %15 (3+ kişi)', 'percent', 15, 'group', 1, 3, 0, true
FROM public.organizations o
WHERE o.slug = 'valoria'
  AND NOT EXISTS (
    SELECT 1 FROM public.booking_campaigns c
    WHERE c.organization_id = o.id AND c.code = 'GRUP15'
  );
