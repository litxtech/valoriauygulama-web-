-- Bookable room lists: sold_count for "en çok satılan" sort/filter

DROP FUNCTION IF EXISTS public.list_bookable_rooms(TEXT);
CREATE FUNCTION public.list_bookable_rooms(p_org_slug TEXT DEFAULT 'valoria')
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
  ORDER BY COALESCE(r.max_guests, 99), r.capacity_label, r.room_number;
$$;

GRANT EXECUTE ON FUNCTION public.list_bookable_rooms(TEXT) TO anon, authenticated;

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
          AND b.status IN ('pending', 'confirmed', 'converted')
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
