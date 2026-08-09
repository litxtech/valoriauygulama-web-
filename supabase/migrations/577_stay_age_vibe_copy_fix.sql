-- get_stay_age_vibe: initcap yerine yalnızca ilk harf büyük (TR metin)

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
  WHERE b.status IN ('pending', 'confirmed', 'converted')
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
